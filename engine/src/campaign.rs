use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::{info, warn};
use uuid::Uuid;

// ─────────────────────────────────────────
// Campaign status lifecycle
// Using String in DB queries, deserialize manually
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CampaignStatus {
    Draft,
    Active,
    Paused,
    Completed,
    Archived,
}

impl std::fmt::Display for CampaignStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            CampaignStatus::Draft     => write!(f, "draft"),
            CampaignStatus::Active    => write!(f, "active"),
            CampaignStatus::Paused    => write!(f, "paused"),
            CampaignStatus::Completed => write!(f, "completed"),
            CampaignStatus::Archived  => write!(f, "archived"),
        }
    }
}

impl std::str::FromStr for CampaignStatus {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self> {
        match s {
            "draft"     => Ok(CampaignStatus::Draft),
            "active"    => Ok(CampaignStatus::Active),
            "paused"    => Ok(CampaignStatus::Paused),
            "completed" => Ok(CampaignStatus::Completed),
            "archived"  => Ok(CampaignStatus::Archived),
            _           => Err(anyhow::anyhow!("unknown campaign status: {}", s)),
        }
    }
}

// ─────────────────────────────────────────
// Event type
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EventType {
    EmailSent,
    EmailOpened,
    LinkClicked,
    FormSubmitted,
    ReportedPhishing,
}

impl std::fmt::Display for EventType {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            EventType::EmailSent       => write!(f, "emailsent"),
            EventType::EmailOpened     => write!(f, "emailopened"),
            EventType::LinkClicked     => write!(f, "linkclicked"),
            EventType::FormSubmitted   => write!(f, "formsubmitted"),
            EventType::ReportedPhishing => write!(f, "reportedphishing"),
        }
    }
}

// ─────────────────────────────────────────
// Raw DB row for Campaign (uses String for enums)
// ─────────────────────────────────────────
#[derive(sqlx::FromRow)]
struct CampaignRow {
    pub id:              Uuid,
    pub name:            String,
    pub description:     Option<String>,
    pub status:          String,
    pub from_name:       String,
    pub from_email:      String,
    pub subject:         String,
    pub template_id:     Uuid,
    pub target_group_id: Uuid,
    pub redirect_url:    Option<String>,
    pub scheduled_at:    Option<DateTime<Utc>>,
    pub launched_at:     Option<DateTime<Utc>>,
    pub completed_at:    Option<DateTime<Utc>>,
    pub created_at:      DateTime<Utc>,
    pub updated_at:      DateTime<Utc>,
}

impl CampaignRow {
    fn into_campaign(self) -> Campaign {
        Campaign {
            id:              self.id,
            name:            self.name,
            description:     self.description,
            status:          self.status.parse().unwrap_or(CampaignStatus::Draft),
            from_name:       self.from_name,
            from_email:      self.from_email,
            subject:         self.subject,
            template_id:     self.template_id,
            target_group_id: self.target_group_id,
            redirect_url:    self.redirect_url,
            scheduled_at:    self.scheduled_at,
            launched_at:     self.launched_at,
            completed_at:    self.completed_at,
            created_at:      self.created_at,
            updated_at:      self.updated_at,
        }
    }
}

// ─────────────────────────────────────────
// Core campaign model (public API)
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Campaign {
    pub id:              Uuid,
    pub name:            String,
    pub description:     Option<String>,
    pub status:          CampaignStatus,
    pub from_name:       String,
    pub from_email:      String,
    pub subject:         String,
    pub template_id:     Uuid,
    pub target_group_id: Uuid,
    pub redirect_url:    Option<String>,
    pub scheduled_at:    Option<DateTime<Utc>>,
    pub launched_at:     Option<DateTime<Utc>>,
    pub completed_at:    Option<DateTime<Utc>>,
    pub created_at:      DateTime<Utc>,
    pub updated_at:      DateTime<Utc>,
}

// ─────────────────────────────────────────
// Request body for creating a campaign
// ─────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct CreateCampaignRequest {
    pub name:            String,
    pub description:     Option<String>,
    pub from_name:       String,
    pub from_email:      String,
    pub subject:         String,
    pub template_id:     Uuid,
    pub target_group_id: Uuid,
    pub redirect_url:    Option<String>,
    pub scheduled_at:    Option<DateTime<Utc>>,
}

// ─────────────────────────────────────────
// Campaign event raw row
// ─────────────────────────────────────────
#[derive(sqlx::FromRow)]
struct CampaignEventRow {
    pub id:          Uuid,
    pub campaign_id: Uuid,
    pub target_id:   Uuid,
    pub event_type:  String,
    pub ip_address:  Option<String>,
    pub user_agent:  Option<String>,
    pub payload:     Option<serde_json::Value>,
    pub occurred_at: DateTime<Utc>,
}

impl CampaignEventRow {
    fn into_event(self) -> CampaignEvent {
        let event_type = match self.event_type.as_str() {
            "emailsent"        => EventType::EmailSent,
            "emailopened"      => EventType::EmailOpened,
            "linkclicked"      => EventType::LinkClicked,
            "formsubmitted"    => EventType::FormSubmitted,
            "reportedphishing" => EventType::ReportedPhishing,
            _                  => EventType::EmailSent,
        };
        CampaignEvent {
            id:          self.id,
            campaign_id: self.campaign_id,
            target_id:   self.target_id,
            event_type,
            ip_address:  self.ip_address,
            user_agent:  self.user_agent,
            payload:     self.payload,
            occurred_at: self.occurred_at,
        }
    }
}

// ─────────────────────────────────────────
// Campaign event public model
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampaignEvent {
    pub id:          Uuid,
    pub campaign_id: Uuid,
    pub target_id:   Uuid,
    pub event_type:  EventType,
    pub ip_address:  Option<String>,
    pub user_agent:  Option<String>,
    pub payload:     Option<serde_json::Value>,
    pub occurred_at: DateTime<Utc>,
}

// ─────────────────────────────────────────
// Target
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Target {
    pub id:         Uuid,
    pub group_id:   Uuid,
    pub email:      String,
    pub first_name: Option<String>,
    pub last_name:  Option<String>,
    pub position:   Option<String>,
    pub department: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ─────────────────────────────────────────
// Target group
// ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TargetGroup {
    pub id:          Uuid,
    pub name:        String,
    pub description: Option<String>,
    pub created_at:  DateTime<Utc>,
}

// ─────────────────────────────────────────
// Campaign stats
// ─────────────────────────────────────────
#[derive(Debug, Serialize)]
pub struct CampaignStats {
    pub campaign_id:       Uuid,
    pub total_targets:     i64,
    pub emails_sent:       i64,
    pub emails_opened:     i64,
    pub links_clicked:     i64,
    pub forms_submitted:   i64,
    pub reported_phishing: i64,
    pub open_rate:         f64,
    pub click_rate:        f64,
    pub submission_rate:   f64,
}

// ─────────────────────────────────────────
// Database operations
// ─────────────────────────────────────────
pub struct CampaignService {
    db: PgPool,
}

impl CampaignService {
    pub fn new(db: PgPool) -> Self { Self { db } }

    pub async fn create(&self, req: CreateCampaignRequest) -> Result<Campaign> {
        let row = sqlx::query_as::<_, CampaignRow>(
            r#"
            INSERT INTO campaigns (
                id, name, description, status, from_name, from_email,
                subject, template_id, target_group_id, redirect_url,
                scheduled_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            RETURNING *
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(&req.name)
        .bind(&req.description)
        .bind(&req.from_name)
        .bind(&req.from_email)
        .bind(&req.subject)
        .bind(req.template_id)
        .bind(req.target_group_id)
        .bind(&req.redirect_url)
        .bind(req.scheduled_at)
        .fetch_one(&self.db)
        .await?;

        let campaign = row.into_campaign();
        info!(campaign_id = %campaign.id, name = %campaign.name, "campaign created");
        Ok(campaign)
    }

    pub async fn list(&self) -> Result<Vec<Campaign>> {
        let rows = sqlx::query_as::<_, CampaignRow>(
            "SELECT * FROM campaigns ORDER BY created_at DESC"
        )
        .fetch_all(&self.db)
        .await?;
        Ok(rows.into_iter().map(|r| r.into_campaign()).collect())
    }

    pub async fn get(&self, id: Uuid) -> Result<Option<Campaign>> {
        let row = sqlx::query_as::<_, CampaignRow>(
            "SELECT * FROM campaigns WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;
        Ok(row.map(|r| r.into_campaign()))
    }

    pub async fn launch(&self, id: Uuid) -> Result<Campaign> {
        let row = sqlx::query_as::<_, CampaignRow>(
            r#"
            UPDATE campaigns
            SET status = 'active', launched_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND status = 'draft'
            RETURNING *
            "#,
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| anyhow::anyhow!("campaign not found or not in draft state"))?;

        let campaign = row.into_campaign();
        info!(campaign_id = %campaign.id, "campaign launched");
        Ok(campaign)
    }

    pub async fn pause(&self, id: Uuid) -> Result<Campaign> {
        let row = sqlx::query_as::<_, CampaignRow>(
            r#"
            UPDATE campaigns
            SET status = 'paused', updated_at = NOW()
            WHERE id = $1 AND status = 'active'
            RETURNING *
            "#,
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| anyhow::anyhow!("campaign not found or not active"))?;

        let campaign = row.into_campaign();
        warn!(campaign_id = %campaign.id, "campaign paused");
        Ok(campaign)
    }

    pub async fn complete(&self, id: Uuid) -> Result<Campaign> {
        let row = sqlx::query_as::<_, CampaignRow>(
            r#"
            UPDATE campaigns
            SET status = 'completed', completed_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND status = 'active'
            RETURNING *
            "#,
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| anyhow::anyhow!("campaign not found or not active"))?;

        let campaign = row.into_campaign();
        info!(campaign_id = %campaign.id, "campaign completed");
        Ok(campaign)
    }

    pub async fn log_event(
        &self,
        campaign_id: Uuid,
        target_id:   Uuid,
        event_type:  EventType,
        ip_address:  Option<String>,
        user_agent:  Option<String>,
        payload:     Option<serde_json::Value>,
    ) -> Result<CampaignEvent> {
        let row = sqlx::query_as::<_, CampaignEventRow>(
            r#"
            INSERT INTO campaign_events (
                id, campaign_id, target_id, event_type,
                ip_address, user_agent, payload, occurred_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING *
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(campaign_id)
        .bind(target_id)
        .bind(event_type.to_string())
        .bind(&ip_address)
        .bind(&user_agent)
        .bind(&payload)
        .fetch_one(&self.db)
        .await?;

        let event = row.into_event();
        info!(
            campaign_id = %campaign_id,
            target_id   = %target_id,
            event       = %event_type,
            "campaign event logged"
        );
        Ok(event)
    }

    pub async fn stats(&self, campaign_id: Uuid) -> Result<CampaignStats> {
        let row = sqlx::query!(
            r#"
            SELECT
                COUNT(DISTINCT t.id)                                             AS total_targets,
                COUNT(*) FILTER (WHERE e.event_type = 'emailsent')              AS emails_sent,
                COUNT(*) FILTER (WHERE e.event_type = 'emailopened')            AS emails_opened,
                COUNT(*) FILTER (WHERE e.event_type = 'linkclicked')            AS links_clicked,
                COUNT(*) FILTER (WHERE e.event_type = 'formsubmitted')          AS forms_submitted,
                COUNT(*) FILTER (WHERE e.event_type = 'reportedphishing')       AS reported_phishing
            FROM campaigns c
            JOIN target_groups tg ON tg.id = c.target_group_id
            JOIN targets t        ON t.group_id = tg.id
            LEFT JOIN campaign_events e ON e.campaign_id = c.id AND e.target_id = t.id
            WHERE c.id = $1
            "#,
            campaign_id
        )
        .fetch_one(&self.db)
        .await?;

        let sent      = row.emails_sent.unwrap_or(0);
        let opened    = row.emails_opened.unwrap_or(0);
        let clicked   = row.links_clicked.unwrap_or(0);
        let submitted = row.forms_submitted.unwrap_or(0);

        Ok(CampaignStats {
            campaign_id,
            total_targets:     row.total_targets.unwrap_or(0),
            emails_sent:       sent,
            emails_opened:     opened,
            links_clicked:     clicked,
            forms_submitted:   submitted,
            reported_phishing: row.reported_phishing.unwrap_or(0),
            open_rate:         if sent > 0 { opened    as f64 / sent as f64 * 100.0 } else { 0.0 },
            click_rate:        if sent > 0 { clicked   as f64 / sent as f64 * 100.0 } else { 0.0 },
            submission_rate:   if sent > 0 { submitted as f64 / sent as f64 * 100.0 } else { 0.0 },
        })
    }
}
