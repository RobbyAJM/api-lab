use std::net::SocketAddr;
use std::sync::Arc;
use api_lab_server::router::create_router;
use api_lab_server::state::AppState;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::broadcast;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "api_lab_server=debug,tower_http=debug,axum=trace".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://root:root@localhost:5432/api_lab?sslmode=disable".into());

    let encryption_key = std::env::var("ENV_ENCRYPTION_KEY")
        .unwrap_or_else(|_| "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".into());

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    tracing::info!("Connecting to PostgreSQL at {db_url}...");
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(&db_url)
        .await?;

    let (tx_ws, _) = broadcast::channel(1024);

    let state = Arc::new(AppState {
        pool,
        encryption_key,
        tx_ws,
    });

    let app = create_router(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("API Lab Server listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
