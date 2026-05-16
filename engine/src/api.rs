use crate::campaign::{CampaignService, CreateCampaignRequest};
use crate::generator::{CampaignContext, GeneratorService};
use crate::mailer::{MailerService, SmtpConfig};
use crate::metrics;
use crate::tracker::{TrackerService, TrackerState};
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
// ─────────────────────────────────────────
#[derive(Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    pub data:    Option<T>,
    pub error:   Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> Json<Self> {
        Json(Self { success: true, data: Some(data), error: None })
    }
}

// Separate error constructor that returns a concrete type
fn api_err(message: impl Into<String>) -> Json<ApiResponse<()>> {
    Json(ApiResponse { success: false, data: None, error: Some(message.into()) })
}

// ─────────────────────────────────────────
// Shared handler state
// ─────────────────────────────────────────
#[derive(Clone)]
pub struct ApiState {
    pub campaigns: Arc<CampaignService>,
    pub generator: Arc<GeneratorService>,
    pub tracker:   Arc<TrackerService>,
    pub mailer:    Arc<MailerService>,
}

// ─────────────────────────────────────────
// Build the full router
// ─────────────────────────────────────────
pub fn router(state: AppState) -> Router {
    metrics::init_metrics();

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
        host:     state.config.smtp_host.clone(),
        port:     state.config.smtp_port,
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

    let api_state = ApiState {
        campaigns: campaign_service.clone(),
        generator: generator_service,
        tracker:   tracker_service.clone(),
        mailer:    mailer_service,
    };

    // Tracker state for the tracking endpoints
    let tracker_state = TrackerState {
        tracker:   tracker_service,
        campaigns: campaign_service,
    };

    // Tracking routes use TrackerState
    let tracking_router = Router::new()
        .route("/t/o/:token", get(crate::tracker::handle_open))
        .route("/t/c/:token", get(crate::tracker::handle_click))
        .route("/t/s/:token", post(crate::tracker::handle_submission))
        .with_state(tracker_state);

    // API routes use ApiState
    let api_router = Router::new()
        .route("/health", get(health_handler))
        .route("/api/campaigns", get(list_campaigns))
        .route("/api/campaigns", post(create_campaign))
        .route("/api/campaigns/:id", get(get_campaign))
        .route("/api/campaigns/:id/launch", post(launch_campaign))
        .route("/api/campaigns/:id/pause", post(pause_campaign))
        .route("/api/campaigns/:id/complete", post(complete_campaign))
        .route("/api/campaigns/:id/stats", get(get_campaign_stats))
        .with_state(api_state);

    Router::new()
        .merge(api_router)
        .merge(tracking_router)
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .layer(TraceLayer::new_for_http())
}

// ─────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────

async fn health_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "poseidon-engine",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn list_campaigns(State(state): State<ApiState>) -> impl IntoResponse {
    match state.campaigns.list().await {
        Ok(c)  => ApiResponse::ok(c).into_response(),
        Err(e) => {
            error!(error = %e, "failed to list campaigns");
            (StatusCode::INTERNAL_SERVER_ERROR, api_err(e.to_string())).into_response()
        }
    }
}

async fn create_campaign(
    State(state): State<ApiState>,
    Json(req): Json<CreateCampaignRequest>,
) -> impl IntoResponse {
    match state.campaigns.create(req).await {
        Ok(c)  => (StatusCode::CREATED, ApiResponse::ok(c)).into_response(),
        Err(e) => {
            error!(error = %e, "failed to create campaign");
            (StatusCode::INTERNAL_SERVER_ERROR, api_err(e.to_string())).into_response()
        }
    }
}

async fn get_campaign(
    Path(id): Path<Uuid>,
    State(state): State<ApiState>,
) -> impl IntoResponse {
    match state.campaigns.get(id).await {
        Ok(Some(c)) => ApiResponse::ok(c).into_response(),
        Ok(None)    => (StatusCode::NOT_FOUND, api_err("campaign not found")).into_response(),
        Err(e)      => {
            error!(error = %e, campaign_id = %id, "failed to get campaign");
            (StatusCode::INTERNAL_SERVER_ERROR, api_err(e.to_string())).into_response()
        }
    }
}

#[derive(Deserialize)]
struct LaunchRequest {
    theme: String,
}

async fn launch_campaign(
    Path(id): Path<Uuid>,
    State(state): State<ApiState>,
    Json(req): Json<LaunchRequest>,
) -> impl IntoResponse {
    let campaign = match state.campaigns.launch(id).await {
        Ok(c)  => c,
        Err(e) => {
            error!(error = %e, campaign_id = %id, "failed to launch campaign");
            return (StatusCode::BAD_REQUEST, api_err(e.to_string())).into_response();
        }
    };

    metrics::record_campaign_status(&campaign.id.to_string(), &campaign.name, "active", true);

    let context = CampaignContext {
        campaign_name: campaign.name.clone(),
        from_name:     campaign.from_name.clone(),
        from_email:    campaign.from_email.clone(),
        theme:         req.theme,
        redirect_url:  campaign.redirect_url.clone().unwrap_or_else(|| "/awareness".to_string()),
    };

    let mailer      = state.mailer.clone();
    let campaign_id = campaign.id;

    tokio::spawn(async move {
        match mailer.fire_campaign(campaign_id, context).await {
            Ok(results) => {
                let sent   = results.iter().filter(|r| r.success).count();
                let failed = results.iter().filter(|r| !r.success).count();
                tracing::info!(campaign_id = %campaign_id, sent, failed, "campaign fire complete");
            }
            Err(e) => error!(campaign_id = %campaign_id, error = %e, "campaign fire failed"),
        }
    });

    ApiResponse::ok(campaign).into_response()
}

async fn pause_campaign(
    Path(id): Path<Uuid>,
    State(state): State<ApiState>,
) -> impl IntoResponse {
    match state.campaigns.pause(id).await {
        Ok(c) => {
            metrics::record_campaign_status(&c.id.to_string(), &c.name, "paused", false);
            ApiResponse::ok(c).into_response()
        }
        Err(e) => {
            error!(error = %e, campaign_id = %id, "failed to pause campaign");
            (StatusCode::BAD_REQUEST, api_err(e.to_string())).into_response()
        }
    }
}

async fn complete_campaign(
    Path(id): Path<Uuid>,
    State(state): State<ApiState>,
) -> impl IntoResponse {
    match state.campaigns.complete(id).await {
        Ok(c) => {
            metrics::record_campaign_status(&c.id.to_string(), &c.name, "completed", false);
            ApiResponse::ok(c).into_response()
        }
        Err(e) => {
            error!(error = %e, campaign_id = %id, "failed to complete campaign");
            (StatusCode::BAD_REQUEST, api_err(e.to_string())).into_response()
        }
    }
}

async fn get_campaign_stats(
    Path(id): Path<Uuid>,
    State(state): State<ApiState>,
) -> impl IntoResponse {
    match state.campaigns.stats(id).await {
        Ok(s)  => ApiResponse::ok(s).into_response(),
        Err(e) => {
            error!(error = %e, campaign_id = %id, "failed to get campaign stats");
            (StatusCode::INTERNAL_SERVER_ERROR, api_err(e.to_string())).into_response()
        }
    }
}
