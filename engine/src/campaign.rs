use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::{info, warn};
use uuid::Uuid;

// ─────────────────────────────────────────
// Campaign status lifecycle
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "campaign_status", rename_all = "lowercase")]
pub enum CampaignStatus {
    Draft,
    Active,
    Paused,
    Completed,
    Archived,
}

// ─────────────────────────────────────────
// Core campaign model
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Campaign {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub status: CampaignStatus,
    pub from_name: String,
    pub from_email: String,
    pub subject: String,
    pub template_id: Uuid,
    pub target_group_id: Uuid,
    pub redirect_url: Option<String>,    // where targets land after clicking
    pub scheduled_at: Option<DateTime<Utc>>,
    pub launched_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ─────────────────────────────────────────
// Request body for creating a campaign
// ─────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct CreateCampaignRequest {
    pub name: String,
    pub description: Option<String>,
    pub from_name: String,
    pub from_email: String,
    pub subject: String,
    pub template_id: Uuid,
    pub target_group_id: Uuid,
    pub redirect_url: Option<String>,
    pub scheduled_at: Option<DateTime<Utc>>,
}

// ─────────────────────────────────────────
// Campaign event - every meaningful action a target takes
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "event_type", rename_all = "lowercase")]
pub enum EventType {
    EmailSent,
    EmailOpened,
    LinkClicked,
    FormSubmitted,
    ReportedPhishing,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CampaignEvent {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub target_id: Uuid,
    pub event_type: EventType,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub payload: Option<serde_json::Value>,  // form submissions land here
    pub occurred_at: DateTime<Utc>,
}

// ─────────────────────────────────────────
// Target - a single person in a campaign
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Target {
    pub id: Uuid,
    pub group_id: Uuid,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub position: Option<String>,
    pub department: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ─────────────────────────────────────────
// Target group - a named list of targets
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TargetGroup {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ─────────────────────────────────────────
// Campaign summary stats (for dashboard)
// ─────────────────────────────────────────
#[derive(Debug, Serialize)]
pub struct CampaignStats {
    pub campaign_id: Uuid,
    pub total_targets: i64,
    pub emails_sent: i64,
    pub emails_opened: i64,
    pub links_clicked: i64,
    pub forms_submitted: i64,
    pub reported_phishing: i64,
    pub open_rate: f64,
    pub click_rate: f64,
    pub submission_rate: f64,
}

// ─────────────────────────────────────────
// Database operations
// ─────────────────────────────────────────
pub struct CampaignService {
    db: PgPool,
}

impl CampaignService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    // Create a new campaign in draft state
    pub async fn create(&self, req: CreateCampaignRequest) -> Result<Campaign> {
        let campaign = sqlx::query_as!(
            Campaign,
            r#"
            INSERT INTO campaigns (
                id, name, description, status, from_name, from_email,
                subject, template_id, target_group_id, redirect_url,
                scheduled_at, created_at, updated_at
            )
            VALUES (
                $1, $2, $3, 'draft', $4, $5,
                $6, $7, $8, $9,
                $10, NOW(), NOW()
            )
            RETURNING *
            "#,
            Uuid::new_v4(),
            req.name,
            req.description,
            req.from_name,
            req.from_email,
            req.subject,
            req.template_id,
            req.target_group_id,
            req.redirect_url,
            req.scheduled_at,
        )
        .fetch_one(&self.db)
        .await?;

        info!(campaign_id = %campaign.id, name = %campaign.name, "campaign created");
        Ok(campaign)
    }

    // Fetch all campaigns
    pub async fn list(&self) -> Result<Vec<Campaign>> {
        let campaigns = sqlx::query_as!(
            Campaign,
            r#"SELECT * FROM campaigns ORDER BY created_at DESC"#
        )
        .fetch_all(&self.db)
        .await?;

        Ok(campaigns)
    }

    // Fetch a single campaign by ID
    pub async fn get(&self, id: Uuid) -> Result<Option<Campaign>> {
        let campaign = sqlx::query_as!(
            Campaign,
            r#"SELECT * FROM campaigns WHERE id = $1"#,
            id
        )
        .fetch_optional(&self.db)
        .await?;

        Ok(campaign)
    }

    // Launch a campaign - transitions from Draft to Active
    pub async fn launch(&self, id: Uuid) -> Result<Campaign> {
        let campaign = sqlx::query_as!(
            Campaign,
            r#"
            UPDATE campaigns
            SET status = 'active', launched_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND status = 'draft'
            RETURNING *
            "#,
            id
        )
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| anyhow::anyhow!("campaign not found or not in draft state"))?;

        info!(campaign_id = %campaign.id, "campaign launched");
        Ok(campaign)
    }

    // Pause an active campaign
    pub async fn pause(&self, id: Uuid) -> Result<Campaign> {
        let campaign = sqlx::query_as!(
            Campaign,
            r#"
            UPDATE campaigns
            SET status = 'paused', updated_at = NOW()
            WHERE id = $1 AND status = 'active'
            RETURNING *
            "#,
            id
        )
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| anyhow::anyhow!("campaign not found or not active"))?;

        warn!(campaign_id = %campaign.id, "campaign paused");
        Ok(campaign)
    }

    // Mark a campaign as completed
    pub async fn complete(&self, id: Uuid) -> Result<Campaign> {
        let campaign = sqlx::query_as!(
            Campaign,
            r#"
            UPDATE campaigns
            SET status = 'completed', completed_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND status = 'active'
            RETURNING *
            "#,
            id
        )
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| anyhow::anyhow!("campaign not found or not active"))?;

        info!(campaign_id = %campaign.id, "campaign completed");
        Ok(campaign)
    }

    // Log a campaign event (open, click, submission, etc.)
    pub async fn log_event(
        &self,
        campaign_id: Uuid,
        target_id: Uuid,
        event_type: EventType,
        ip_address: Option<String>,
        user_agent: Option<String>,
        payload: Option<serde_json::Value>,
    ) -> Result<CampaignEvent> {
        let event = sqlx::query_as!(
            CampaignEvent,
            r#"
            INSERT INTO campaign_events (
                id, campaign_id, target_id, event_type,
                ip_address, user_agent, payload, occurred_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING *
            "#,
            Uuid::new_v4(),
            campaign_id,
            target_id,
            event_type as EventType,
            ip_address,
            user_agent,
            payload,
        )
        .fetch_one(&self.db)
        .await?;

        info!(
            campaign_id = %campaign_id,
            target_id = %target_id,
            event = ?event_type,
            "campaign event logged"
        );

        Ok(event)
    }

    // Pull aggregated stats for a campaign
    pub async fn stats(&self, campaign_id: Uuid) -> Result<CampaignStats> {
        let row = sqlx::query!(
            r#"
            SELECT
                COUNT(DISTINCT t.id)                                            AS total_targets,
                COUNT(*) FILTER (WHERE e.event_type = 'emailsent')             AS emails_sent,
                COUNT(*) FILTER (WHERE e.event_type = 'emailopened')           AS emails_opened,
                COUNT(*) FILTER (WHERE e.event_type = 'linkclicked')           AS links_clicked,
                COUNT(*) FILTER (WHERE e.event_type = 'formsubmitted')         AS forms_submitted,
                COUNT(*) FILTER (WHERE e.event_type = 'reportedphishing')      AS reported_phishing
            FROM campaigns c
            JOIN target_groups tg ON tg.id = c.target_group_id
            JOIN targets t ON t.group_id = tg.id
            LEFT JOIN campaign_events e ON e.campaign_id = c.id AND e.target_id = t.id
            WHERE c.id = $1
            "#,
            campaign_id
        )
        .fetch_one(&self.db)
        .await?;

        let sent = row.emails_sent.unwrap_or(0);
        let opened = row.emails_opened.unwrap_or(0);
        let clicked = row.links_clicked.unwrap_or(0);
        let submitted = row.forms_submitted.unwrap_or(0);

        Ok(CampaignStats {
            campaign_id,
            total_targets: row.total_targets.unwrap_or(0),
            emails_sent: sent,
            emails_opened: opened,
            links_clicked: clicked,
            forms_submitted: submitted,
            reported_phishing: row.reported_phishing.unwrap_or(0),
            open_rate: if sent > 0 { opened as f64 / sent as f64 * 100.0 } else { 0.0 },
            click_rate: if sent > 0 { clicked as f64 / sent as f64 * 100.0 } else { 0.0 },
            submission_rate: if sent > 0 { submitted as f64 / sent as f64 * 100.0 } else { 0.0 },
        })
    }
}
