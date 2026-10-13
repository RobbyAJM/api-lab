use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use rust_core::crypto::hash_token_sha256;
use serde::Deserialize;
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::auth::get_workspace_role;
use crate::state::SharedState;

#[derive(Deserialize)]
pub struct WsAuthQuery {
    pub token: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(workspace_id): Path<Uuid>,
    Query(query): Query<WsAuthQuery>,
    State(state): State<SharedState>,
) -> Result<impl IntoResponse, ApiError> {
    let token_hash = hash_token_sha256(&query.token);

    // Verify session
    let user_row = sqlx::query!(
        r#"
        SELECT u.id
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token_hash = $1 AND s.expires_at > NOW()
        "#,
        token_hash
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(ApiError::Database)?
    .ok_or_else(|| ApiError::Unauthorized("invalid session token".into()))?;

    // Verify workspace membership
    let _ = get_workspace_role(&state.pool, workspace_id, user_row.id).await?;

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, workspace_id, state)))
}

async fn handle_socket(socket: WebSocket, workspace_id: Uuid, state: SharedState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx_ws.subscribe();

    // Spawn task to forward broadcast events to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            if event.workspace_id == workspace_id {
                if let Ok(msg_text) = serde_json::to_string(&event) {
                    if sender.send(Message::Text(msg_text.into())).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Receive incoming pings / messages to keep connection alive
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Close(_) = msg {
                break;
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
