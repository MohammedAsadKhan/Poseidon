use anyhow::Result;
use dotenvy::dotenv;
use std::env;
use tracing::info;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

mod api;
mod campaign;
mod mailer;
mod metrics;
mod tracker;

// ─────────────────────────────────────────
// Application config - loaded from environment
// ─────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    pub smtp_pass: String,
    pub tracker_base_url: String,
    pub engine_port: u16,
    pub metrics_port: u16,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url: required_env("DATABASE_URL")?,
            smtp_host: required_env("SMTP_HOST")?,
            smtp_port: env::var("SMTP_PORT")
                .unwrap_or_else(|_| "587".to_string())
                .parse()?,
            smtp_user: required_env("SMTP_USER")?,
            smtp_pass: required_env("SMTP_PASS")?,
            tracker_base_url: required_env("TRACKER_BASE_URL")?,
            engine_port: env::var("ENGINE_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()?,
            metrics_port: env::var("METRICS_PORT")
                .unwrap_or_else(|_| "9090".to_string())
                .parse()?,
        })
    }
}

fn required_env(key: &str) -> Result<String> {
    env::var(key).map_err(|_| anyhow::anyhow!("Missing required environment variable: {}", key))
}

// ─────────────────────────────────────────
// Shared application state passed to all handlers
// ─────────────────────────────────────────
#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub db: sqlx::PgPool,
}

// ─────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────
#[tokio::main]
async fn main() -> Result<()> {
    // Load .env if present (dev convenience - prod uses real env vars)
    dotenv().ok();

    // Structured JSON logging - Loki ingests this
    tracing_subscriber::registry()
        .with(fmt::layer().json())
        .with(EnvFilter::from_default_env())
        .init();

    info!(
        version = env!("CARGO_PKG_VERSION"),
        "Poseidon engine starting"
    );

    // Load and validate config
    let config = AppConfig::from_env().map_err(|e| {
        tracing::error!(error = %e, "Failed to load configuration");
        e
    })?;

    info!(
        engine_port = config.engine_port,
        metrics_port = config.metrics_port,
        "Configuration loaded"
    );

    // Connect to Postgres
    let db = sqlx::PgPool::connect(&config.database_url)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to connect to database");
            e
        })?;

    info!("Database connection established");

    // Run migrations
    sqlx::migrate!("./migrations").run(&db).await.map_err(|e| {
        tracing::error!(error = %e, "Failed to run database migrations");
        e
    })?;

    info!("Database migrations complete");

    let state = AppState {
        config: config.clone(),
        db,
    };

    // Start metrics server on its own port (Prometheus scrapes this)
    let metrics_handle = {
        let port = config.metrics_port;
        tokio::spawn(async move {
            if let Err(e) = metrics::serve(port).await {
                tracing::error!(error = %e, "Metrics server failed");
            }
        })
    };

    // Start REST API server
    let api_handle = {
        let state = state.clone();
        let port = config.engine_port;
        tokio::spawn(async move {
            if let Err(e) = api::serve(state, port).await {
                tracing::error!(error = %e, "API server failed");
            }
        })
    };

    info!(
        engine_port = config.engine_port,
        metrics_port = config.metrics_port,
        "Poseidon engine running"
    );

    // Wait for both servers - if either exits something is wrong
    tokio::select! {
        _ = metrics_handle => {
            tracing::error!("Metrics server exited unexpectedly");
        }
        _ = api_handle => {
            tracing::error!("API server exited unexpectedly");
        }
        _ = tokio::signal::ctrl_c() => {
            info!("Shutdown signal received - goodbye");
        }
    }

    Ok(())
}
