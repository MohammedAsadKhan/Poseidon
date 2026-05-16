use anyhow::Result;
use dotenvy::dotenv;
use std::env;
use std::net::SocketAddr;
use tracing::info;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

mod api;
mod campaign;
mod generator;
mod mailer;
mod metrics;
mod tracker;

// ─────────────────────────────────────────
// Application config
// ─────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub database_url:     String,
    pub smtp_host:        String,
    pub smtp_port:        u16,
    pub smtp_user:        String,
    pub smtp_pass:        String,
    pub tracker_base_url: String,
    pub engine_port:      u16,
    pub metrics_port:     u16,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url:     required_env("DATABASE_URL")?,
            smtp_host:        env::var("SMTP_HOST").unwrap_or_else(|_| "localhost".to_string()),
            smtp_port:        env::var("SMTP_PORT").unwrap_or_else(|_| "587".to_string()).parse()?,
            smtp_user:        env::var("SMTP_USER").unwrap_or_default(),
            smtp_pass:        env::var("SMTP_PASS").unwrap_or_default(),
            tracker_base_url: env::var("TRACKER_BASE_URL").unwrap_or_else(|_| "http://localhost:8080".to_string()),
            engine_port:      env::var("ENGINE_PORT").unwrap_or_else(|_| "8080".to_string()).parse()?,
            metrics_port:     env::var("METRICS_PORT").unwrap_or_else(|_| "9090".to_string()).parse()?,
        })
    }
}

fn required_env(key: &str) -> Result<String> {
    env::var(key).map_err(|_| anyhow::anyhow!("Missing required env var: {}", key))
}

// ─────────────────────────────────────────
// Shared state
// ─────────────────────────────────────────
#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub db:     sqlx::PgPool,
}

// ─────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────
#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();

    tracing_subscriber::registry()
        .with(fmt::layer().json())
        .with(EnvFilter::from_default_env())
        .init();

    info!(version = env!("CARGO_PKG_VERSION"), "Poseidon engine starting");

    let config = AppConfig::from_env()?;
    let db     = sqlx::PgPool::connect(&config.database_url).await?;

    info!("Database connected");
    sqlx::migrate!("./migrations").run(&db).await?;
    info!("Migrations complete");

    let state = AppState { config: config.clone(), db };

    // Metrics server on its own port
    let metrics_addr: SocketAddr = format!("0.0.0.0:{}", config.metrics_port).parse()?;
    tokio::spawn(async move {
        metrics::serve(metrics_addr).await;
    });

    // REST API
    let api_addr: SocketAddr = format!("0.0.0.0:{}", config.engine_port).parse()?;
    let router = api::router(state);
    let listener = tokio::net::TcpListener::bind(api_addr).await?;

    info!(port = config.engine_port, "API server listening");
    axum::serve(listener, router).await?;

    Ok(())
}
