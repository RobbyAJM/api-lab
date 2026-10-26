use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use rust_core::crypto::hash_token_sha256;
use rust_core::dto::{PresenceEvent, PresenceUser};
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
        SELECT u.id, u.name, u.email, u.avatar
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

    let presence_user = PresenceUser {
        user_id: user_row.id,
        name: user_row.name,
        email: user_row.email,
        avatar: user_row.avatar,
    };

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, workspace_id, presence_user, state)))
}

async fn handle_socket(
    socket: WebSocket,
    workspace_id: Uuid,
    presence_user: PresenceUser,
    state: SharedState,
) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx_sync = state.tx_ws.subscribe();
    let mut rx_presence = state.tx_presence.subscribe();

    // 1. Add user to presence and get current list
    let users_list = {
        let mut p = state.presence.write().await;
        let ws_users = p.entry(workspace_id).or_default();
        ws_users.insert(presence_user.user_id, presence_user.clone());
        ws_users.values().cloned().collect::<Vec<_>>()
    };

    // 2. Send initial presence_state to this client
    let init_msg = serde_json::json!({
        "type": "presence_state",
        "workspace_id": workspace_id,
        "users": users_list
    });
    let _ = sender.send(Message::Text(init_msg.to_string().into())).await;

    // 3. Broadcast join to other clients
    let _ = state.tx_presence.send(PresenceEvent::Join {
        workspace_id,
        user: presence_user.clone(),
    });

    // 4. Send task forwarding sync and presence events
    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                Ok(event) = rx_sync.recv() => {
                    if event.workspace_id == workspace_id {
                        if let Ok(msg_text) = serde_json::to_string(&event) {
                            if sender.send(Message::Text(msg_text.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                }
                Ok(pres) = rx_presence.recv() => {
                    match pres {
                        PresenceEvent::Join { workspace_id: ws_id, user } if ws_id == workspace_id => {
                            let msg = serde_json::json!({
                                "type": "presence_join",
                                "workspace_id": ws_id,
                                "user": user
                            });
                            if sender.send(Message::Text(msg.to_string().into())).await.is_err() {
                                break;
                            }
                        }
                        PresenceEvent::Leave { workspace_id: ws_id, user_id } if ws_id == workspace_id => {
                            let msg = serde_json::json!({
                                "type": "presence_leave",
                                "workspace_id": ws_id,
                                "user_id": user_id
                            });
                            if sender.send(Message::Text(msg.to_string().into())).await.is_err() {
                                break;
                            }
                        }
                        PresenceEvent::Notification { workspace_id: ws_id, notification } if ws_id == workspace_id => {
                            let msg = serde_json::json!({
                                "type": "notification",
                                "workspace_id": ws_id,
                                "notification": notification
                            });
                            if sender.send(Message::Text(msg.to_string().into())).await.is_err() {
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                else => break,
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

    // Clean up presence on disconnect
    {
        let mut p = state.presence.write().await;
        if let Some(ws_users) = p.get_mut(&workspace_id) {
            ws_users.remove(&presence_user.user_id);
        }
    }
    let _ = state.tx_presence.send(PresenceEvent::Leave {
        workspace_id,
        user_id: presence_user.user_id,
    });
}
