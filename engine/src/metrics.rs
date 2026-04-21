use anyhow::Result;
use axum::{http::StatusCode, response::IntoResponse, routing::get, Router};
use prometheus::{
    register_counter_vec, register_gauge_vec, register_histogram_vec, CounterVec, Encoder,
    GaugeVec, HistogramVec, TextEncoder,
};
use std::net::SocketAddr;
use std::sync::OnceLock;
use tracing::info;

// ─────────────────────────────────────────
// Global metrics registry
// OnceLock ensures these are initialized
// exactly once at startup
// ─────────────────────────────────────────
static EMAILS_SENT: OnceLock<CounterVec> = OnceLock::new();
static EMAILS_OPENED: OnceLock<CounterVec> = OnceLock::new();
static LINKS_CLICKED: OnceLock<CounterVec> = OnceLock::new();
static FORMS_SUBMITTED: OnceLock<CounterVec> = OnceLock::new();
static PHISHING_REPORTED: OnceLock<CounterVec> = OnceLock::new();
static CAMPAIGN_STATUS: OnceLock<GaugeVec> = OnceLock::new();
static EMAIL_SEND_DURATION: OnceLock<HistogramVec> = OnceLock::new();
static AI_GENERATION_DURATION: OnceLock<HistogramVec> = OnceLock::new();
static ACTIVE_CAMPAIGNS: OnceLock<GaugeVec> = OnceLock::new();

// ─────────────────────────────────────────
// Initialize all metrics at engine startup
// Call this once before serving
// ─────────────────────────────────────────
pub fn init_metrics() {
    EMAILS_SENT
        .set(
            register_counter_vec!(
                "poseidon_emails_sent_total",
                "Total number of phishing emails sent",
                &["campaign_id", "campaign_name"]
            )
            .expect("failed to register emails_sent metric"),
        )
        .ok();

    EMAILS_OPENED
        .set(
            register_counter_vec!(
                "poseidon_emails_opened_total",
                "Total number of phishing emails opened",
                &["campaign_id", "campaign_name"]
            )
            .expect("failed to register emails_opened metric"),
        )
        .ok();

    LINKS_CLICKED
        .set(
            register_counter_vec!(
                "poseidon_links_clicked_total",
                "Total number of tracking links clicked",
                &["campaign_id", "campaign_name"]
            )
            .expect("failed to register links_clicked metric"),
        )
        .ok();

    FORMS_SUBMITTED
        .set(
            register_counter_vec!(
                "poseidon_forms_submitted_total",
                "Total number of credential forms submitted",
                &["campaign_id", "campaign_name"]
            )
            .expect("failed to register forms_submitted metric"),
        )
        .ok();

    PHISHING_REPORTED
        .set(
            register_counter_vec!(
                "poseidon_phishing_reported_total",
                "Total number of phishing emails reported by targets",
                &["campaign_id", "campaign_name"]
            )
            .expect("failed to register phishing_reported metric"),
        )
        .ok();

    CAMPAIGN_STATUS
        .set(
            register_gauge_vec!(
                "poseidon_campaign_status",
                "Current status of campaigns (1 = active, 0 = inactive)",
                &["campaign_id", "campaign_name", "status"]
            )
            .expect("failed to register campaign_status metric"),
        )
        .ok();

    EMAIL_SEND_DURATION
        .set(
            register_histogram_vec!(
                "poseidon_email_send_duration_seconds",
                "Time taken to send a single phishing email via SMTP",
                &["campaign_id"],
                vec![0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
            )
            .expect("failed to register email_send_duration metric"),
        )
        .ok();

    AI_GENERATION_DURATION
        .set(
            register_histogram_vec!(
                "poseidon_ai_generation_duration_seconds",
                "Time taken to generate a phishing email via Ollama",
                &["campaign_id", "model"],
                vec![0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0]
            )
            .expect("failed to register ai_generation_duration metric"),
        )
        .ok();

    ACTIVE_CAMPAIGNS
        .set(
            register_gauge_vec!(
                "poseidon_active_campaigns",
                "Number of currently active campaigns",
                &["status"]
            )
            .expect("failed to register active_campaigns metric"),
        )
        .ok();

    info!("prometheus metrics initialized");
}

// ─────────────────────────────────────────
// Public metric recording functions
// Called from campaign, mailer and generator
// ─────────────────────────────────────────

pub fn record_email_sent(campaign_id: &str, campaign_name: &str) {
    if let Some(m) = EMAILS_SENT.get() {
        m.with_label_values(&[campaign_id, campaign_name]).inc();
    }
}

pub fn record_email_opened(campaign_id: &str, campaign_name: &str) {
    if let Some(m) = EMAILS_OPENED.get() {
        m.with_label_values(&[campaign_id, campaign_name]).inc();
    }
}

pub fn record_link_clicked(campaign_id: &str, campaign_name: &str) {
    if let Some(m) = LINKS_CLICKED.get() {
        m.with_label_values(&[campaign_id, campaign_name]).inc();
    }
}

pub fn record_form_submitted(campaign_id: &str, campaign_name: &str) {
    if let Some(m) = FORMS_SUBMITTED.get() {
        m.with_label_values(&[campaign_id, campaign_name]).inc();
    }
}

pub fn record_phishing_reported(campaign_id: &str, campaign_name: &str) {
    if let Some(m) = PHISHING_REPORTED.get() {
        m.with_label_values(&[campaign_id, campaign_name]).inc();
    }
}

pub fn record_campaign_status(campaign_id: &str, campaign_name: &str, status: &str, active: bool) {
    if let Some(m) = CAMPAIGN_STATUS.get() {
        m.with_label_values(&[campaign_id, campaign_name, status])
            .set(if active { 1.0 } else { 0.0 });
    }
}

pub fn record_active_campaigns(status: &str, count: f64) {
    if let Some(m) = ACTIVE_CAMPAIGNS.get() {
        m.with_label_values(&[status]).set(count);
    }
}

// Returns a timer guard - drop it when the operation completes
// to record the duration automatically
pub fn start_email_send_timer(campaign_id: &str) -> Option<prometheus::HistogramTimer> {
    EMAIL_SEND_DURATION
        .get()
        .map(|m| m.with_label_values(&[campaign_id]).start_timer())
}

pub fn start_ai_generation_timer(
    campaign_id: &str,
    model: &str,
) -> Option<prometheus::HistogramTimer> {
    AI_GENERATION_DURATION
        .get()
        .map(|m| m.with_label_values(&[campaign_id, model]).start_timer())
}

// ─────────────────────────────────────────
// Metrics HTTP server
// Runs on a separate port from the main API
// so Prometheus can scrape it independently
// ─────────────────────────────────────────
pub async fn serve(addr: SocketAddr) {
    let app = Router::new().route("/metrics", get(metrics_handler));

    info!(addr = %addr, "metrics server starting");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind metrics server");

    axum::serve(listener, app)
        .await
        .expect("metrics server failed");
}

// GET /metrics
// Prometheus scrapes this endpoint on its configured interval
async fn metrics_handler() -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();

    match encoder.encode_to_string(&metric_families) {
        Ok(output) => (
            StatusCode::OK,
            [("Content-Type", "text/plain; version=0.0.4")],
            output,
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to encode metrics: {}", e),
        )
            .into_response(),
    }
}
