use crate::campaign::{CampaignService, CreateCampaignRequest};
use crate::generator::{CampaignContext, GeneratorService};
use crate::mailer::{MailerService, SmtpConfig};
use crate::metrics;
use crate::tracker::TrackerService;
use crate::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::error;
use uuid::Uuid;

// ─────────────────────────────────────────
// Standard API response envelope
// Every endpoint returns this shape so the
// dashboard always knows what to expect
// ─────────────────────────────────────────
#[derive(Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> Json<Self> {
        Json(Self {
            success: true,
            data: Some(data),
            error: None,
        })
    }

    pub fn err(message: impl Into<String>) -> Json<ApiResponse<()>> {
        Json(ApiResponse {
            success: false,
            data: None,
            error: Some(message.into()),
        })
    }
}

// ─────────────────────────────────────────
// Build the full router
// Called from main.rs with shared AppState
// ─────────────────────────────────────────
pub fn router(state: AppState) -> Router {
    // Initialize metrics on first router build
    metrics::init_metrics();

    // Wire up all services into shared state
    let campaign_service = Arc::new(CampaignService::new(state.db.clone()));

    let generator_service = Arc::new(GeneratorService::new(
        std::env::var("OLLAMA_BASE_URL").unwrap_or_else(|_| "http://ollama:11434".to_string()),
        std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| "llama3.1:8b".to_string()),
        std::env::var("MOCK_AI")
            .unwrap_or_else(|_| "false".to_string())
            .parse()
            .unwrap_or(false),
    ));

    let tracker_service = Arc::new(TrackerService::new(
        state.db.clone(),
        std::env::var("TRACKER_SECRET")
            .unwrap_or_else(|_| "change-this-secret-in-production".to_string()),
        state.config.tracker_base_url.clone(),
    ));

    let smtp_config = SmtpConfig {
        host: state.config.smtp_host.clone(),
        port: state.config.smtp_port,
        username: state.config.smtp_user.clone(),
        password: state.config.smtp_pass.clone(),
    };

    let mailer_service = Arc::new(MailerService::new(
        state.db.clone(),
        smtp_config,
        generator_service.clone(),
        tracker_service.clone(),
        campaign_service.clone(),
    ));

    // API state passed to every handler
    let api_state = ApiState {
        campaigns: campaign_service,
        generator: generator_service,
        tracker: tracker_service,
        mailer: mailer_service,
    };

    Router::new()
        // ── Health ──────────────────────────────
        .route("/health", get(health_handler))

        // ── Campaigns ───────────────────────────
        .route("/api/campaigns", get(list_campaigns))
        .route("/api/campaigns", post(create_campaign))
        .route("/api/campaigns/:id", get(get_campaign))
        .route("/api/campaigns/:id/launch", post(launch_campaign))
        .route("/api/campaigns/:id/pause", post(pause_campaign))
        .route("/api/campaigns/:id/complete", post(complete_campaign))
        .route("/api/campaigns/:id/stats", get(get_campaign_stats))

        // ── Tracking (hit by target email clients) ──
        .route("/t/o/:token", get(crate::tracker::handle_open))
        .route("/t/c/:token", get(crate::tracker::handle_click))
        .route("/t/s/:token", post(crate::tracker::handle_submission))

        // ── Middleware ──────────────────────────
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(api_state)
}

// ─────────────────────────────────────────
// Shared handler state
// ─────────────────────────────────────────
#[derive(Clone)]
pub struct ApiState {
    pub campaigns: Arc<CampaignService>,
    pub generator: Arc<GeneratorService>,
    pub tracker: Arc<TrackerService>,
    pub mailer: Arc<MailerService>,
}

// ─────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────

// GET /health
async fn health_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "poseidon-engine",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

// GET /api/campaigns
async fn list_campaigns(State(state): State<ApiState>) -> impl IntoResponse {
    match state.campaigns.list().await {
        Ok(campaigns) => ApiResponse::ok(campaigns).into_response(),
        Err(e) => {
            error!(error = %e, "failed to list campaigns");
            (StatusCode::INTERNAL_SERVER_ERROR, ApiResponse::err(e.to_string())).into_response()
        }
    }
}

// POST /api/campaigns
async fn create_campaign(
    State(state): State<ApiState>,
    Json(req): Json<CreateCampaignRequest>,
) -> impl IntoResponse {
    match state.campaigns.create(req).await {
        Ok(campaign) => (StatusCode::CREATED, ApiResponse::ok(campaign)).into_response(),
        Err(e) => {
            error!(error = %e, "failed to create campaign");
            (StatusCode::INTERNAL_SERVER_ERROR, ApiResponse::err(e.to_string())).into_response()
        }
    }
}

// GET /api/campaigns/:id
async fn get_campaign(
    Path(id): Path<Uuid>,
    State(state): State<ApiState>,
) -> impl IntoResponse {
    match state.campaigns.get(id).await {
        Ok(Some(campaign)) => ApiResponse::ok(campaign).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, ApiResponse::err("campaign not found")).into_response(),
        Err(e) => {
            error!(error = %e, campaign_id = %id, "failed to get campaign");
            (StatusCode::INTERNAL_SERVER_ERROR, ApiResponse::err(e.to_string())).into_response()
        }
    }
}

// POST /api/campaigns/:id/launch
// Transitions campaign to active and fires all emails
#[derive(Deserialize)]
struct LaunchRequest {
    theme: String,
}

async fn launch_campaign(
    Path(id): Path<Uuid>,
    State(state): State<ApiState>,
    Json(req): Json<LaunchRequest>,
) -> impl IntoResponse {
    // Transition to active in the database first
    let campaign = match state.campaigns.launch(id).await {
        Ok(c) => c,
        Err(e) => {
            error!(error = %e, campaign_id = %id, "failed to launch campaign");
            return (StatusCode::BAD_REQUEST, ApiResponse::err(e.to_string())).into_response();
        }
    };

    // Update metrics
    metrics::record_campaign_status(
        &campaign.id.to_string(),
        &campaign.name,
        "active",
        true,
    );

    // Build context for the generator and mailer
    let context = CampaignContext {
        campaign_name: campaign.name.clone(),
        from_name: campaign.from_name.clone(),
        from_email: campaign.from_email.clone(),
        theme: req.theme,
        redirect_url: campaign
            .redirect_url
            .clone()
            .unwrap_or_else(|| "/awareness".to_string()),
    };

    // Fire the campaign in a background task so the API
    // responds immediately without waiting for all sends
    let mailer = state.mailer.clone();
    let campaign_id = campaign.id;

    tokio::spawn(async move {
        match mailer.fire_campaign(campaign_id, context).await {
            Ok(results) => {
                let sent = results.iter().filter(|r| r.success).count();
                let failed = results.iter().filter(|r| !r.success).count();
                tracing::info!(
                    campaign_id = %campaign_id,
                    sent = sent,
                    failed = failed,
                    "campaign fire complete"
                );
            }
            Err(e) => {
                error!(campaign_id = %campaign_id, error = %e, "campaign fire failed");
            }
        }
    });

    ApiResponse::ok(campaign).into_response()
}

// POST /api/campaigns/:id/pause
async fn pause_campaign(
    Path(id): Path<Uuid>,
    State(state): State<ApiState>,
) -> impl IntoResponse {
    match state.campaigns.pause(id).await {
        Ok(campaign) => {
            metrics::record_campaign_status(
                &campaign.id.to_string(),
                &campaign.name,
                "paused",
                false,
            );
            ApiResponse::ok(campaign).into_response()
        }
        Err(e) => {
            error!(error = %e, campaign_id = %id, "failed to pause campaign");
            (StatusCode::BAD_REQUEST, ApiResponse::err(e.to_string())).into_response()
        }
    }
}

// POST /api/campaigns/:id/complete
async fn complete_campaign(
    Path(id): Path<Uuid>,
    State(state): State<ApiState>,
) -> impl IntoResponse {
    match state.campaigns.complete(id).await {
        Ok(campaign) => {
            metrics::record_campaign_status(
                &campaign.id.to_string(),
                &campaign.name,
                "completed",
                false,
            );
            ApiResponse::ok(campaign).into_response()
        }
        Err(e) => {
            error!(error = %e, campaign_id = %id, "failed to complete campaign");
            (StatusCode::BAD_REQUEST, ApiResponse::err(e.to_string())).into_response()
        }
    }
}

// GET /api/campaigns/:id/stats
async fn get_campaign_stats(
    Path(id): Path<Uuid>,
    State(state): State<ApiState>,
) -> impl IntoResponse {
    match state.campaigns.stats(id).await {
        Ok(stats) => ApiResponse::ok(stats).into_response(),
        Err(e) => {
            error!(error = %e, campaign_id = %id, "failed to get campaign stats");
            (StatusCode::INTERNAL_SERVER_ERROR, ApiResponse::err(e.to_string())).into_response()
        }
    }
}
