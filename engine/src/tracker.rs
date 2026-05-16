use crate::campaign::{CampaignService, EventType};
use anyhow::Result;
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Redirect, Response},
};
use hex::encode as hex_encode;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{info, warn};
use uuid::Uuid;

pub struct TrackerService {
    db:       PgPool,
    secret:   String,
    base_url: String,
}

impl TrackerService {
    pub fn new(db: PgPool, secret: String, base_url: String) -> Self {
        Self { db, secret, base_url }
    }

    pub fn generate_token(&self, campaign_id: Uuid, target_id: Uuid) -> String {
        let mut hasher = Sha256::new();
        hasher.update(campaign_id.as_bytes());
        hasher.update(target_id.as_bytes());
        hasher.update(self.secret.as_bytes());
        hex_encode(hasher.finalize())[..32].to_string()
    }

    pub fn tracking_urls(&self, campaign_id: Uuid, target_id: Uuid) -> TrackingUrls {
        let token = self.generate_token(campaign_id, target_id);
        TrackingUrls {
            open_pixel:  format!("{}/t/o/{}", self.base_url, token),
            click_link:  format!("{}/t/c/{}", self.base_url, token),
            submit_form: format!("{}/t/s/{}", self.base_url, token),
            token,
        }
    }

    pub async fn resolve_token(&self, token: &str) -> Result<Option<TokenRecord>> {
        let record = sqlx::query_as::<_, TokenRecord>(
            "SELECT campaign_id, target_id FROM tracking_tokens WHERE token = $1"
        )
        .bind(token)
        .fetch_optional(&self.db)
        .await?;
        Ok(record)
    }

    pub async fn store_token(&self, token: &str, campaign_id: Uuid, target_id: Uuid) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO tracking_tokens (token, campaign_id, target_id, created_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (token) DO NOTHING
            "#,
        )
        .bind(token)
        .bind(campaign_id)
        .bind(target_id)
        .execute(&self.db)
        .await?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct TrackingUrls {
    pub open_pixel:  String,
    pub click_link:  String,
    pub submit_form: String,
    pub token:       String,
}

#[derive(Debug, sqlx::FromRow)]
pub struct TokenRecord {
    pub campaign_id: Uuid,
    pub target_id:   Uuid,
}

#[derive(Clone)]
pub struct TrackerState {
    pub tracker:   Arc<TrackerService>,
    pub campaigns: Arc<CampaignService>,
}

// ─────────────────────────────────────────
// Axum handlers
// ─────────────────────────────────────────

pub async fn handle_open(
    Path(token): Path<String>,
    headers: HeaderMap,
    State(state): State<TrackerState>,
) -> Response {
    match state.tracker.resolve_token(&token).await {
        Ok(Some(record)) => {
            let ip = extract_ip(&headers);
            let ua = extract_ua(&headers);
            if let Err(e) = state.campaigns.log_event(
                record.campaign_id, record.target_id,
                EventType::EmailOpened, ip, ua, None,
            ).await {
                warn!(error = %e, token = %token, "failed to log open event");
            } else {
                info!(token = %token, "email opened");
            }
        }
        Ok(None) => warn!(token = %token, "open pixel hit with unknown token"),
        Err(e)   => warn!(error = %e, "token resolution failed"),
    }
    transparent_pixel()
}

#[derive(Deserialize)]
pub struct RedirectQuery {
    r: Option<String>,
}

pub async fn handle_click(
    Path(token): Path<String>,
    Query(query): Query<RedirectQuery>,
    headers: HeaderMap,
    State(state): State<TrackerState>,
) -> Response {
    let redirect_url = query.r.unwrap_or_else(|| "/awareness".to_string());

    match state.tracker.resolve_token(&token).await {
        Ok(Some(record)) => {
            let ip = extract_ip(&headers);
            let ua = extract_ua(&headers);
            if let Err(e) = state.campaigns.log_event(
                record.campaign_id, record.target_id,
                EventType::LinkClicked, ip, ua, None,
            ).await {
                warn!(error = %e, token = %token, "failed to log click event");
            } else {
                info!(token = %token, "link clicked");
            }
        }
        Ok(None) => warn!(token = %token, "click tracked with unknown token"),
        Err(e)   => warn!(error = %e, "token resolution failed"),
    }

    Redirect::to(&redirect_url).into_response()
}

pub async fn handle_submission(
    Path(token): Path<String>,
    headers: HeaderMap,
    State(state): State<TrackerState>,
    body: axum::extract::Json<serde_json::Value>,
) -> Response {
    match state.tracker.resolve_token(&token).await {
        Ok(Some(record)) => {
            let ip = extract_ip(&headers);
            let ua = extract_ua(&headers);
            if let Err(e) = state.campaigns.log_event(
                record.campaign_id, record.target_id,
                EventType::FormSubmitted, ip, ua, Some(body.0),
            ).await {
                warn!(error = %e, token = %token, "failed to log submission");
            } else {
                info!(token = %token, "form submitted");
            }
        }
        Ok(None) => warn!(token = %token, "submission with unknown token"),
        Err(e)   => warn!(error = %e, "token resolution failed"),
    }
    StatusCode::OK.into_response()
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
fn transparent_pixel() -> Response {
    let pixel: &[u8] = &[
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
        0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
        0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
        0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
        0x01, 0x00, 0x3b,
    ];
    (
        StatusCode::OK,
        [
            ("Content-Type", "image/gif"),
            ("Cache-Control", "no-store, no-cache, must-revalidate"),
            ("Pragma", "no-cache"),
        ],
        pixel,
    ).into_response()
}

fn extract_ip(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or(s).trim().to_string())
}

fn extract_ua(headers: &HeaderMap) -> Option<String> {
    headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}
