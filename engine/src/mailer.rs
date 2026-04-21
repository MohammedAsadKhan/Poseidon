use crate::campaign::{CampaignService, EventType, Target};
use crate::generator::{CampaignContext, GeneratedEmail, GeneratorService};
use crate::tracker::TrackerService;
use anyhow::Result;
use lettre::{
    message::{header::ContentType, Mailbox, Message, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{error, info, warn};
use uuid::Uuid;

// ─────────────────────────────────────────
// SMTP configuration
// ─────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
}

// ─────────────────────────────────────────
// Result of sending to a single target
// ─────────────────────────────────────────
#[derive(Debug)]
pub struct SendResult {
    pub target_id: Uuid,
    pub email: String,
    pub success: bool,
    pub error: Option<String>,
}

// ─────────────────────────────────────────
// Mailer service
// Orchestrates generation, tracking link
// injection and SMTP delivery for every
// target in a campaign
// ─────────────────────────────────────────
pub struct MailerService {
    db: PgPool,
    smtp_config: SmtpConfig,
    generator: Arc<GeneratorService>,
    tracker: Arc<TrackerService>,
    campaigns: Arc<CampaignService>,
}

impl MailerService {
    pub fn new(
        db: PgPool,
        smtp_config: SmtpConfig,
        generator: Arc<GeneratorService>,
        tracker: Arc<TrackerService>,
        campaigns: Arc<CampaignService>,
    ) -> Self {
        Self {
            db,
            smtp_config,
            generator,
            tracker,
            campaigns,
        }
    }

    // Fire a full campaign - generates and sends one email per target
    // Runs concurrently with a semaphore to avoid overwhelming the SMTP relay
    pub async fn fire_campaign(
        &self,
        campaign_id: Uuid,
        context: CampaignContext,
    ) -> Result<Vec<SendResult>> {
        // Pull the campaign to get target group
        let campaign = self
            .campaigns
            .get(campaign_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("campaign not found: {}", campaign_id))?;

        // Pull all targets for this campaign's group
        let targets = self.get_targets(campaign.target_group_id).await?;

        info!(
            campaign_id = %campaign_id,
            target_count = targets.len(),
            "firing campaign"
        );

        // Build SMTP transport once and reuse across all sends
        let transport = self.build_transport()?;

        // Semaphore limits concurrent sends to avoid hammering the relay
        let semaphore = Arc::new(tokio::sync::Semaphore::new(10));
        let mut handles = Vec::new();

        for target in targets {
            let permit = semaphore.clone().acquire_owned().await?;
            let transport = transport.clone();
            let generator = self.generator.clone();
            let tracker = self.tracker.clone();
            let campaigns = self.campaigns.clone();
            let context = context.clone();
            let smtp_config = self.smtp_config.clone();

            let handle = tokio::spawn(async move {
                let result = send_to_target(
                    &target,
                    campaign_id,
                    &context,
                    &generator,
                    &tracker,
                    &campaigns,
                    &transport,
                    &smtp_config,
                )
                .await;

                drop(permit); // release semaphore slot

                match result {
                    Ok(r) => r,
                    Err(e) => SendResult {
                        target_id: target.id,
                        email: target.email.clone(),
                        success: false,
                        error: Some(e.to_string()),
                    },
                }
            });

            handles.push(handle);
        }

        // Collect results
        let mut results = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(result) => results.push(result),
                Err(e) => error!(error = %e, "task panicked during send"),
            }
        }

        let success_count = results.iter().filter(|r| r.success).count();
        let fail_count = results.iter().filter(|r| !r.success).count();

        info!(
            campaign_id = %campaign_id,
            success = success_count,
            failed = fail_count,
            "campaign send complete"
        );

        Ok(results)
    }

    // Fetch all targets belonging to a group
    async fn get_targets(&self, group_id: Uuid) -> Result<Vec<Target>> {
        let targets = sqlx::query_as!(
            Target,
            r#"SELECT * FROM targets WHERE group_id = $1 ORDER BY email ASC"#,
            group_id
        )
        .fetch_all(&self.db)
        .await?;

        Ok(targets)
    }

    // Build the async SMTP transport
    fn build_transport(&self) -> Result<AsyncSmtpTransport<Tokio1Executor>> {
        let creds = Credentials::new(
            self.smtp_config.username.clone(),
            self.smtp_config.password.clone(),
        );

        let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(
            &self.smtp_config.host,
        )?
        .port(self.smtp_config.port)
        .credentials(creds)
        .build();

        Ok(transport)
    }
}

// ─────────────────────────────────────────
// Send one email to one target
// Separated from the service so it can run
// cleanly inside a tokio::spawn task
// ─────────────────────────────────────────
async fn send_to_target(
    target: &Target,
    campaign_id: Uuid,
    context: &CampaignContext,
    generator: &GeneratorService,
    tracker: &TrackerService,
    campaigns: &CampaignService,
    transport: &AsyncSmtpTransport<Tokio1Executor>,
    smtp_config: &SmtpConfig,
) -> Result<SendResult> {
    // Store the tracking token so we can resolve it when the target clicks
    let tracking_urls = tracker.tracking_urls(campaign_id, target.id);
    tracker
        .store_token(&tracking_urls.token, campaign_id, target.id)
        .await?;

    // Generate the AI-personalized email
    let mut generated = generator.generate(target, context).await?;

    // Inject tracking links into the email body
    generated = inject_tracking(generated, &tracking_urls.open_pixel, &tracking_urls.click_link);

    // Build the MIME message
    let email = build_message(target, context, &generated, smtp_config)?;

    // Send via SMTP
    match transport.send(email).await {
        Ok(_) => {
            // Log the send event
            campaigns
                .log_event(
                    campaign_id,
                    target.id,
                    EventType::EmailSent,
                    None,
                    None,
                    None,
                )
                .await?;

            info!(
                campaign_id = %campaign_id,
                target_email = %target.email,
                "email sent"
            );

            Ok(SendResult {
                target_id: target.id,
                email: target.email.clone(),
                success: true,
                error: None,
            })
        }
        Err(e) => {
            warn!(
                campaign_id = %campaign_id,
                target_email = %target.email,
                error = %e,
                "failed to send email"
            );

            Ok(SendResult {
                target_id: target.id,
                email: target.email.clone(),
                success: false,
                error: Some(e.to_string()),
            })
        }
    }
}

// ─────────────────────────────────────────
// Inject tracking links into the generated email
//
// The open pixel is appended to the HTML body.
// The click link replaces the placeholder URL
// the AI was told to use in the prompt.
// ─────────────────────────────────────────
fn inject_tracking(
    mut email: GeneratedEmail,
    open_pixel_url: &str,
    click_url: &str,
) -> GeneratedEmail {
    // Replace the redirect URL placeholder with the real tracking link
    email.body_html = email
        .body_html
        .replace(&email.body_text.lines().next().unwrap_or(""), &email.body_html);

    // Swap any href pointing to the original redirect with the click tracker
    // The generator was told to use context.redirect_url in all links
    email.body_html = email.body_html.replace(
        "{{CLICK_URL}}",
        click_url,
    );

    email.body_text = email.body_text.replace(
        "{{CLICK_URL}}",
        click_url,
    );

    // Append 1x1 open tracking pixel at the end of the HTML body
    let pixel = format!(
        r#"<img src="{}" width="1" height="1" style="display:none;" alt="" />"#,
        open_pixel_url
    );

    email.body_html = email.body_html.replace("</body>", &format!("{}</body>", pixel));

    // If no </body> tag, just append
    if !email.body_html.contains(&pixel) {
        email.body_html.push_str(&pixel);
    }

    email
}

// ─────────────────────────────────────────
// Build a proper MIME multipart email message
// Both HTML and plain text parts included for
// maximum deliverability and compatibility
// ─────────────────────────────────────────
fn build_message(
    target: &Target,
    context: &CampaignContext,
    generated: &GeneratedEmail,
    smtp_config: &SmtpConfig,
) -> Result<Message> {
    let from: Mailbox = format!("{} <{}>", context.from_name, context.from_email)
        .parse()
        .map_err(|e| anyhow::anyhow!("invalid from address: {}", e))?;

    let to: Mailbox = match (&target.first_name, &target.last_name) {
        (Some(f), Some(l)) => format!("{} {} <{}>", f, l, target.email),
        (Some(f), None) => format!("{} <{}>", f, target.email),
        _ => target.email.clone(),
    }
    .parse()
    .map_err(|e| anyhow::anyhow!("invalid to address: {}", e))?;

    let message = Message::builder()
        .from(from)
        .to(to)
        .subject(&generated.subject)
        .multipart(
            MultiPart::alternative()
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_PLAIN)
                        .body(generated.body_text.clone()),
                )
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_HTML)
                        .body(generated.body_html.clone()),
                ),
        )?;

    Ok(message)
}
