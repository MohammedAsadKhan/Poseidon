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

#[derive(Debug, Clone)]
pub struct SmtpConfig {
    pub host:     String,
    pub port:     u16,
    pub username: String,
    pub password: String,
}

#[derive(Debug)]
pub struct SendResult {
    pub target_id: Uuid,
    pub email:     String,
    pub success:   bool,
    pub error:     Option<String>,
}

pub struct MailerService {
    db:          PgPool,
    smtp_config: SmtpConfig,
    generator:   Arc<GeneratorService>,
    tracker:     Arc<TrackerService>,
    campaigns:   Arc<CampaignService>,
}

impl MailerService {
    pub fn new(
        db:          PgPool,
        smtp_config: SmtpConfig,
        generator:   Arc<GeneratorService>,
        tracker:     Arc<TrackerService>,
        campaigns:   Arc<CampaignService>,
    ) -> Self {
        Self { db, smtp_config, generator, tracker, campaigns }
    }

    pub async fn fire_campaign(
        &self,
        campaign_id: Uuid,
        context:     CampaignContext,
    ) -> Result<Vec<SendResult>> {
        let campaign = self.campaigns.get(campaign_id).await?
            .ok_or_else(|| anyhow::anyhow!("campaign not found: {}", campaign_id))?;

        let targets = self.get_targets(campaign.target_group_id).await?;

        info!(campaign_id = %campaign_id, target_count = targets.len(), "firing campaign");

        let transport = self.build_transport()?;
        let semaphore = Arc::new(tokio::sync::Semaphore::new(10));
        let mut handles = Vec::new();

        for target in targets {
            let permit      = semaphore.clone().acquire_owned().await?;
            let transport   = transport.clone();
            let generator   = self.generator.clone();
            let tracker     = self.tracker.clone();
            let campaigns   = self.campaigns.clone();
            let context     = context.clone();
            let smtp_config = self.smtp_config.clone();

            let handle = tokio::spawn(async move {
                let result = send_to_target(
                    &target, campaign_id, &context,
                    &generator, &tracker, &campaigns,
                    &transport, &smtp_config,
                ).await;
                drop(permit);
                match result {
                    Ok(r)  => r,
                    Err(e) => SendResult {
                        target_id: target.id,
                        email:     target.email.clone(),
                        success:   false,
                        error:     Some(e.to_string()),
                    },
                }
            });

            handles.push(handle);
        }

        let mut results = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(r)  => results.push(r),
                Err(e) => error!(error = %e, "task panicked during send"),
            }
        }

        let sent   = results.iter().filter(|r|  r.success).count();
        let failed = results.iter().filter(|r| !r.success).count();
        info!(campaign_id = %campaign_id, success = sent, failed, "campaign send complete");

        Ok(results)
    }

    async fn get_targets(&self, group_id: Uuid) -> Result<Vec<Target>> {
        let targets = sqlx::query_as::<_, Target>(
            "SELECT * FROM targets WHERE group_id = $1 ORDER BY email ASC"
        )
        .bind(group_id)
        .fetch_all(&self.db)
        .await?;
        Ok(targets)
    }

    fn build_transport(&self) -> Result<AsyncSmtpTransport<Tokio1Executor>> {
        let creds = Credentials::new(
            self.smtp_config.username.clone(),
            self.smtp_config.password.clone(),
        );
        let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&self.smtp_config.host)?
            .port(self.smtp_config.port)
            .credentials(creds)
            .build();
        Ok(transport)
    }
}

async fn send_to_target(
    target:      &Target,
    campaign_id: Uuid,
    context:     &CampaignContext,
    generator:   &GeneratorService,
    tracker:     &TrackerService,
    campaigns:   &CampaignService,
    transport:   &AsyncSmtpTransport<Tokio1Executor>,
    _smtp_config: &SmtpConfig,
) -> Result<SendResult> {
    let tracking_urls = tracker.tracking_urls(campaign_id, target.id);
    tracker.store_token(&tracking_urls.token, campaign_id, target.id).await?;

    let mut generated = generator.generate(target, context).await?;
    generated = inject_tracking(generated, &tracking_urls.open_pixel, &tracking_urls.click_link);

    let email = build_message(target, context, &generated)?;

    match transport.send(email).await {
        Ok(_) => {
            campaigns.log_event(
                campaign_id, target.id, EventType::EmailSent,
                None, None, None,
            ).await?;
            info!(campaign_id = %campaign_id, target_email = %target.email, "email sent");
            Ok(SendResult { target_id: target.id, email: target.email.clone(), success: true, error: None })
        }
        Err(e) => {
            warn!(campaign_id = %campaign_id, target_email = %target.email, error = %e, "send failed");
            Ok(SendResult { target_id: target.id, email: target.email.clone(), success: false, error: Some(e.to_string()) })
        }
    }
}

fn inject_tracking(mut email: GeneratedEmail, open_pixel_url: &str, click_url: &str) -> GeneratedEmail {
    email.body_html = email.body_html.replace("{{CLICK_URL}}", click_url);
    email.body_text = email.body_text.replace("{{CLICK_URL}}", click_url);

    let pixel = format!(
        r#"<img src="{}" width="1" height="1" style="display:none;" alt="" />"#,
        open_pixel_url
    );

    if email.body_html.contains("</body>") {
        email.body_html = email.body_html.replace("</body>", &format!("{}</body>", pixel));
    } else {
        email.body_html.push_str(&pixel);
    }

    email
}

fn build_message(target: &Target, context: &CampaignContext, generated: &GeneratedEmail) -> Result<Message> {
    let from: Mailbox = format!("{} <{}>", context.from_name, context.from_email)
        .parse()
        .map_err(|e| anyhow::anyhow!("invalid from address: {}", e))?;

    let to: Mailbox = match (&target.first_name, &target.last_name) {
        (Some(f), Some(l)) => format!("{} {} <{}>", f, l, target.email),
        (Some(f), None)    => format!("{} <{}>", f, target.email),
        _                  => target.email.clone(),
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
