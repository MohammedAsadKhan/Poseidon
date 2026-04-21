use crate::campaign::Target;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

// ─────────────────────────────────────────
// Generated email content
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedEmail {
    pub subject: String,
    pub body_html: String,
    pub body_text: String,
    pub lure_type: LureType,
}

// ─────────────────────────────────────────
// Lure types - what kind of phishing email
// The AI picks the most convincing one based
// on the target's role and department
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LureType {
    CredentialHarvest,   // fake login page
    MaliciousLink,       // click to "view document"
    Attachment,          // open this file
    Urgency,             // account suspended, act now
    Spear,               // hyper personalized
}

// ─────────────────────────────────────────
// Campaign context fed to the AI
// ─────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct CampaignContext {
    pub campaign_name: String,
    pub from_name: String,
    pub from_email: String,
    pub theme: String,          // "IT password reset", "HR benefits", etc.
    pub redirect_url: String,   // where target lands after clicking
}

// ─────────────────────────────────────────
// Ollama API request/response shapes
// ─────────────────────────────────────────
#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    format: String,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

// ─────────────────────────────────────────
// AI response structure we ask the model to return
// ─────────────────────────────────────────
#[derive(Deserialize)]
struct AiEmailResponse {
    subject: String,
    body_html: String,
    body_text: String,
    lure_type: String,
}

// ─────────────────────────────────────────
// Generator service
// ─────────────────────────────────────────
pub struct GeneratorService {
    client: reqwest::Client,
    ollama_base_url: String,
    model: String,
    mock: bool,
}

impl GeneratorService {
    pub fn new(ollama_base_url: String, model: String, mock: bool) -> Self {
        Self {
            client: reqwest::Client::new(),
            ollama_base_url,
            model,
            mock,
        }
    }

    // Generate a personalized phishing email for a single target
    pub async fn generate(
        &self,
        target: &Target,
        context: &CampaignContext,
    ) -> Result<GeneratedEmail> {
        if self.mock {
            warn!("MOCK_AI is enabled - returning mock email, not calling Ollama");
            return Ok(mock_email(target, context));
        }

        let prompt = build_prompt(target, context);

        info!(
            target_email = %target.email,
            model = %self.model,
            "generating phishing email via Ollama"
        );

        let request = OllamaRequest {
            model: self.model.clone(),
            prompt,
            stream: false,
            format: "json".to_string(),
        };

        let response = self
            .client
            .post(format!("{}/api/generate", self.ollama_base_url))
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!(
                "Ollama returned error status: {}",
                response.status()
            );
        }

        let ollama_response: OllamaResponse = response.json().await?;

        let ai_response: AiEmailResponse =
            serde_json::from_str(&ollama_response.response).map_err(|e| {
                anyhow::anyhow!(
                    "failed to parse AI response as JSON: {}. Raw: {}",
                    e,
                    ollama_response.response
                )
            })?;

        let lure_type = parse_lure_type(&ai_response.lure_type);

        info!(
            target_email = %target.email,
            lure_type = ?lure_type,
            subject = %ai_response.subject,
            "email generated successfully"
        );

        Ok(GeneratedEmail {
            subject: ai_response.subject,
            body_html: ai_response.body_html,
            body_text: ai_response.body_text,
            lure_type,
        })
    }
}

// ─────────────────────────────────────────
// Prompt engineering
// This is the core of the AI generation.
// The more context we give, the more convincing
// the output. We tell the model exactly who the
// target is and what we want it to produce.
// ─────────────────────────────────────────
fn build_prompt(target: &Target, context: &CampaignContext) -> String {
    let target_name = match (&target.first_name, &target.last_name) {
        (Some(f), Some(l)) => format!("{} {}", f, l),
        (Some(f), None) => f.clone(),
        (None, Some(l)) => l.clone(),
        (None, None) => "User".to_string(),
    };

    let position = target
        .position
        .as_deref()
        .unwrap_or("employee");

    let department = target
        .department
        .as_deref()
        .unwrap_or("General");

    format!(
        r#"You are a security awareness training system generating realistic phishing simulation emails.
This is for authorized internal security testing only.

Generate a convincing phishing simulation email for the following target:

TARGET INFORMATION:
- Name: {target_name}
- Email: {target_email}
- Job Title: {position}
- Department: {department}

CAMPAIGN CONTEXT:
- Theme: {theme}
- Sender Name: {from_name}
- Sender Email: {from_email}
- Tracking URL: {redirect_url}

INSTRUCTIONS:
- Write a realistic phishing email that matches the campaign theme
- Personalize it using the target's name, job title and department
- The email should create urgency or curiosity without being obvious
- Use professional language appropriate for a corporate environment
- Include exactly one call-to-action link using this URL: {redirect_url}
- Choose the most convincing lure type for this target's role
- Keep the HTML clean and professional, similar to real corporate emails
- Do not include any warnings that this is a simulation

Respond ONLY with a valid JSON object in this exact format, no other text:
{{
  "subject": "email subject line here",
  "body_html": "full HTML email body here",
  "body_text": "plain text version here",
  "lure_type": "one of: credential_harvest, malicious_link, attachment, urgency, spear"
}}"#,
        target_name = target_name,
        target_email = target.email,
        position = position,
        department = department,
        theme = context.theme,
        from_name = context.from_name,
        from_email = context.from_email,
        redirect_url = context.redirect_url,
    )
}

// ─────────────────────────────────────────
// Mock email returned when MOCK_AI=true
// Used for laptop development without Ollama
// ─────────────────────────────────────────
fn mock_email(target: &Target, context: &CampaignContext) -> GeneratedEmail {
    let name = target
        .first_name
        .as_deref()
        .unwrap_or("User");

    let subject = format!(
        "[Mock] {} - Action Required",
        context.theme
    );

    let body_html = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
    <h2 style="color: #333;">Action Required</h2>
    <p>Dear {name},</p>
    <p>This is a <strong>mock phishing simulation email</strong> generated because
    <code>MOCK_AI=true</code> is set in your environment.</p>
    <p>In production with Ollama running, this would be a fully AI-generated,
    personalized phishing email based on {name}'s role and department.</p>
    <p><a href="{url}" style="background: #0066cc; color: white; padding: 10px 20px;
    text-decoration: none; border-radius: 4px; display: inline-block;">
    Click Here (Mock Tracking Link)</a></p>
    <p style="color: #999; font-size: 12px;">
    Campaign: {campaign} | Theme: {theme}
    </p>
  </div>
</body>
</html>"#,
        name = name,
        url = context.redirect_url,
        campaign = context.campaign_name,
        theme = context.theme,
    );

    let body_text = format!(
        "Dear {},\n\nThis is a mock phishing simulation email (MOCK_AI=true).\n\nClick here: {}\n\nCampaign: {}",
        name,
        context.redirect_url,
        context.campaign_name,
    );

    GeneratedEmail {
        subject,
        body_html,
        body_text,
        lure_type: LureType::MaliciousLink,
    }
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
fn parse_lure_type(s: &str) -> LureType {
    match s.to_lowercase().as_str() {
        "credential_harvest" => LureType::CredentialHarvest,
        "malicious_link"     => LureType::MaliciousLink,
        "attachment"         => LureType::Attachment,
        "urgency"            => LureType::Urgency,
        "spear"              => LureType::Spear,
        _ => {
            warn!(lure_type = %s, "unknown lure type from AI, defaulting to MaliciousLink");
            LureType::MaliciousLink
        }
    }
}
