use std::collections::HashMap;
use std::sync::Arc;
use rust_core::dto::{PresenceEvent, PresenceUser, WsSyncEvent};
use sqlx::PgPool;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub encryption_key: String,
    pub tx_ws: broadcast::Sender<WsSyncEvent>,
    pub tx_presence: broadcast::Sender<PresenceEvent>,
    pub presence: Arc<RwLock<HashMap<Uuid, HashMap<Uuid, PresenceUser>>>>,
}

pub type SharedState = Arc<AppState>;
