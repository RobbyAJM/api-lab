use std::sync::Arc;
use rust_core::dto::WsSyncEvent;
use sqlx::PgPool;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub encryption_key: String,
    pub tx_ws: broadcast::Sender<WsSyncEvent>,
}

pub type SharedState = Arc<AppState>;
