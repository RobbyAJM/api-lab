use std::sync::Arc;
use api_lab_server::router::create_router;
use api_lab_server::state::AppState;
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use http_body_util::BodyExt;
use rust_core::dto::*;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use tokio::sync::broadcast;
use tower::ServiceExt;
use uuid::Uuid;

async fn setup_app() -> axum::Router {
    dotenvy::dotenv().ok();

    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://root:root@localhost:5432/api_lab?sslmode=disable".into());

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .expect("failed to connect to test postgres");

    sqlx::migrate!("../../migrations")
        .run(&pool)
        .await
        .expect("failed to run migrations in test setup");

    let encryption_key =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string();
    let (tx_ws, _) = broadcast::channel(100);
    let (tx_presence, _) = broadcast::channel(100);
    let presence = Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new()));

    let state = Arc::new(AppState {
        pool,
        encryption_key,
        tx_ws,
        tx_presence,
        presence,
    });

    create_router(state)
}

async fn parse_body<T: serde::de::DeserializeOwned>(body: Body) -> T {
    let bytes = body.collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn test_auth_and_password_reset_flow() {
    let app = setup_app().await;
    let email = format!("test_{}@example.com", Uuid::new_v4());

    // 1. Register admin
    let register_req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": email,
                "name": "Admin Tester",
                "password": "Password123!",
                "workspace_name": "Test Workspace"
            })
            .to_string(),
        ))
        .unwrap();

    let res = app.clone().oneshot(register_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let auth_res: AuthResponse = parse_body(res.into_body()).await;
    assert_eq!(auth_res.user.email, email);
    assert_eq!(auth_res.user.theme, "api-lab");
    let token = auth_res.token;

    // 2. /auth/me with Bearer token
    let me_req = Request::builder()
        .method("GET")
        .uri("/api/v1/auth/me")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(me_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 3. Login with wrong password fails
    let fail_login = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({ "email": email, "password": "WrongPassword!" }).to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(fail_login).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

    // 4. Forgot password
    let forgot_req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/forgot-password")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "email": email }).to_string()))
        .unwrap();
    let res = app.clone().oneshot(forgot_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_rbac_and_invitations() {
    let app = setup_app().await;
    let admin_email = format!("admin_{}@example.com", Uuid::new_v4());
    let dev_email = format!("dev_{}@example.com", Uuid::new_v4());

    // 1. Register Admin
    let reg_admin = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": admin_email,
                "name": "Workspace Admin",
                "password": "Password123!"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(reg_admin).await.unwrap();
    let admin_auth: AuthResponse = parse_body(res.into_body()).await;
    let admin_token = admin_auth.token;
    let workspace_id = admin_auth.workspace.unwrap().id;

    // 2. Admin creates invitation for Developer
    let invite_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/workspaces/{workspace_id}/invitations"))
        .header(header::AUTHORIZATION, format!("Bearer {admin_token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({ "role": "developer", "expires_in_days": 7 }).to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(invite_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let invite_res: InvitationResponse = parse_body(res.into_body()).await;
    let invite_token = invite_res.token.unwrap();

    // 3. Dev registers via invitation
    let accept_req = Request::builder()
        .method("POST")
        .uri("/api/v1/invitations/accept")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": dev_email,
                "name": "Workspace Dev",
                "password": "Password123!",
                "invitation_token": invite_token
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(accept_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let dev_auth: AuthResponse = parse_body(res.into_body()).await;
    let dev_token = dev_auth.token;

    // 4. Developer tries to create invitation -> 403 Forbidden
    let dev_invite_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/workspaces/{workspace_id}/invitations"))
        .header(header::AUTHORIZATION, format!("Bearer {dev_token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({ "role": "developer", "expires_in_days": 7 }).to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(dev_invite_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    // 5. Developer can list collections
    let list_colls = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/workspaces/{workspace_id}/collections"))
        .header(header::AUTHORIZATION, format!("Bearer {dev_token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(list_colls).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_collections_endpoints_concurrency_and_saved_responses() {
    let app = setup_app().await;
    let email = format!("user_{}@example.com", Uuid::new_v4());

    // 1. Register User
    let reg_req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": email,
                "name": "Api User",
                "password": "Password123!"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(reg_req).await.unwrap();
    let auth: AuthResponse = parse_body(res.into_body()).await;
    let token = auth.token;
    let ws_id = auth.workspace.unwrap().id;

    // 2. Create Collection
    let coll_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/workspaces/{ws_id}/collections"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "name": "Users API" }).to_string()))
        .unwrap();
    let res = app.clone().oneshot(coll_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let coll: Value = parse_body(res.into_body()).await;
    let coll_id = coll["id"].as_str().unwrap();

    // 3. Create Endpoint
    let ep_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/collections/{coll_id}/endpoints"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "name": "Get User",
                "protocol": "http",
                "config": {
                    "method": "GET",
                    "url": "https://httpbin.org/get"
                }
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(ep_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let ep: Value = parse_body(res.into_body()).await;
    let ep_id = ep["id"].as_str().unwrap();
    assert_eq!(ep["version"].as_i64().unwrap(), 1);

    // 4. Optimistic locking: update with mismatched version -> 409 Conflict
    let patch_fail = Request::builder()
        .method("PATCH")
        .uri(format!("/api/v1/endpoints/{ep_id}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "name": "Get User V2",
                "version": 999
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(patch_fail).await.unwrap();
    assert_eq!(res.status(), StatusCode::CONFLICT);

    // 5. Update with correct version -> bumps to 2
    let patch_ok = Request::builder()
        .method("PATCH")
        .uri(format!("/api/v1/endpoints/{ep_id}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "name": "Get User V2",
                "version": 1
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(patch_ok).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let ep_updated: Value = parse_body(res.into_body()).await;
    assert_eq!(ep_updated["version"].as_i64().unwrap(), 2);

    // 5b. Update endpoint with pre_request_script and post_request_script -> bumps to 3
    let patch_scripts = Request::builder()
        .method("PATCH")
        .uri(format!("/api/v1/endpoints/{ep_id}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "version": 2,
                "config": {
                    "method": "POST",
                    "url": "https://api.example.com/test",
                    "pre_request_script": "pm.environment.set('KEY', 'val');",
                    "post_request_script": "pm.test('Status 200', () => {});"
                }
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(patch_scripts).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let ep_scripts: Value = parse_body(res.into_body()).await;
    assert_eq!(ep_scripts["version"].as_i64().unwrap(), 3);
    assert_eq!(
        ep_scripts["config"]["pre_request_script"].as_str().unwrap(),
        "pm.environment.set('KEY', 'val');"
    );
    assert_eq!(
        ep_scripts["config"]["post_request_script"].as_str().unwrap(),
        "pm.test('Status 200', () => {});"
    );

    // Verify GET endpoint returns persisted scripts
    let get_ep = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/endpoints/{ep_id}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(get_ep).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let ep_fetched: Value = parse_body(res.into_body()).await;
    assert_eq!(
        ep_fetched["config"]["pre_request_script"].as_str().unwrap(),
        "pm.environment.set('KEY', 'val');"
    );
    assert_eq!(
        ep_fetched["config"]["post_request_script"].as_str().unwrap(),
        "pm.test('Status 200', () => {});"
    );

    // 6. Put Saved Response
    let save_resp = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/endpoints/{ep_id}/saved-response"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "status_code": 200,
                "response_headers": { "content-type": "application/json" },
                "response_body": "{\"hello\":\"world\"}",
                "response_time_ms": 125,
                "response_size_bytes": 17
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(save_resp).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 7. Get Saved Response
    let get_resp = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/endpoints/{ep_id}/saved-response"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(get_resp).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let saved: Value = parse_body(res.into_body()).await;
    assert_eq!(saved["status_code"].as_i64().unwrap(), 200);
}

#[tokio::test]
async fn test_environments_and_sensitive_variables() {
    let app = setup_app().await;
    let email = format!("env_user_{}@example.com", Uuid::new_v4());

    let reg_req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": email,
                "name": "Env Tester",
                "password": "Password123!"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(reg_req).await.unwrap();
    let auth: AuthResponse = parse_body(res.into_body()).await;
    let token = auth.token;
    let ws_id = auth.workspace.unwrap().id;

    // 1. Create Environment
    let env_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/workspaces/{ws_id}/environments"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "name": "Production" }).to_string()))
        .unwrap();
    let res = app.clone().oneshot(env_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let env: Value = parse_body(res.into_body()).await;
    let env_id = env["id"].as_str().unwrap();

    // 2. Add sensitive variable
    let var_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/environments/{env_id}/variables"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "key": "API_SECRET",
                "value": "super-secret-key-999",
                "is_sensitive": true
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(var_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 3. List variables decodes for authorized member
    let list_vars = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/environments/{env_id}/variables"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(list_vars).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let vars: Vec<VariableResponse> = parse_body(res.into_body()).await;
    assert_eq!(vars.len(), 1);
    assert_eq!(vars[0].key, "API_SECRET");
    assert_eq!(vars[0].value, "super-secret-key-999");
    assert!(vars[0].is_sensitive);
    let var_id = vars[0].id;

    // 4. Update variable to non-sensitive with new value
    let update_req = Request::builder()
        .method("PATCH")
        .uri(format!("/api/v1/variables/{var_id}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "key": "API_SECRET_UPDATED",
                "value": "now-plain-value",
                "is_sensitive": false
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(update_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let updated_var: VariableResponse = parse_body(res.into_body()).await;
    assert_eq!(updated_var.key, "API_SECRET_UPDATED");
    assert_eq!(updated_var.value, "now-plain-value");
    assert!(!updated_var.is_sensitive);

    // 5. Update variable with empty key returns BadRequest
    let bad_key_req = Request::builder()
        .method("PATCH")
        .uri(format!("/api/v1/variables/{var_id}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "key": "   " }).to_string()))
        .unwrap();
    let res = app.clone().oneshot(bad_key_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_grpc_reflection_unavailable_response() {
    let req = GrpcReflectionRequest {
        server_address: "localhost:59999".into(), // non-existent gRPC port
        use_tls: Some(false),
    };
    let res = grpc_client::discover_services(req).await;
    assert!(res.error.is_some());
    let err_str = res.error.unwrap();
    assert!(err_str.contains("gRPC server reflection unavailable on target; reflection required"));
}

#[tokio::test]
async fn test_delete_folder_cascades_endpoints_and_subfolders() {
    let app = setup_app().await;
    let email = format!("user_{}@example.com", Uuid::new_v4());

    // 1. Register User
    let reg_req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": email,
                "name": "Folder Test User",
                "password": "Password123!"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(reg_req).await.unwrap();
    let auth: AuthResponse = parse_body(res.into_body()).await;
    let token = auth.token;
    let ws_id = auth.workspace.unwrap().id;

    // 2. Create Collection
    let coll_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/workspaces/{ws_id}/collections"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "name": "Cascade Test Collection" }).to_string()))
        .unwrap();
    let res = app.clone().oneshot(coll_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let coll: Value = parse_body(res.into_body()).await;
    let coll_id = coll["id"].as_str().unwrap();

    // 3. Create Root Folder
    let folder_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/collections/{coll_id}/folders"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "name": "Parent Folder" }).to_string()))
        .unwrap();
    let res = app.clone().oneshot(folder_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let parent_folder: Value = parse_body(res.into_body()).await;
    let parent_folder_id = parent_folder["id"].as_str().unwrap();

    // 4. Create Nested Child Subfolder
    let subfolder_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/collections/{coll_id}/folders"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "name": "Child Subfolder",
                "parent_folder_id": parent_folder_id
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(subfolder_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let subfolder: Value = parse_body(res.into_body()).await;
    let subfolder_id = subfolder["id"].as_str().unwrap();

    // 5. Create Endpoint in Parent Folder
    let ep1_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/collections/{coll_id}/endpoints"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "name": "Endpoint in Parent",
                "protocol": "http",
                "folder_id": parent_folder_id,
                "config": { "method": "GET", "url": "/parent" }
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(ep1_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 6. Create Endpoint in Child Subfolder
    let ep2_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/collections/{coll_id}/endpoints"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "name": "Endpoint in Child",
                "protocol": "http",
                "folder_id": subfolder_id,
                "config": { "method": "POST", "url": "/child" }
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(ep2_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // Verify endpoints exist
    let list_req = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/collections/{coll_id}/endpoints"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(list_req).await.unwrap();
    let eps: Vec<Value> = parse_body(res.into_body()).await;
    assert_eq!(eps.len(), 2);

    // 7. Delete Parent Folder
    let del_req = Request::builder()
        .method("DELETE")
        .uri(format!("/api/v1/folders/{parent_folder_id}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(del_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 8. Verify endpoints are completely deleted, NOT moved to root (folder_id: null)!
    let list_req_after = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/collections/{coll_id}/endpoints"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(list_req_after).await.unwrap();
    let eps_after: Vec<Value> = parse_body(res.into_body()).await;
    assert_eq!(
        eps_after.len(),
        0,
        "Endpoints inside deleted folder and subfolders must be deleted, not moved to root"
    );

    // 9. Verify folders are deleted
    let folders_req = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/collections/{coll_id}/folders"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(folders_req).await.unwrap();
    let folders_after: Vec<Value> = parse_body(res.into_body()).await;
    assert_eq!(folders_after.len(), 0);
}

#[tokio::test]
async fn test_create_and_retrieve_reflection_folder_with_grpc_url() {
    let app = setup_app().await;
    let email = format!("user_{}@example.com", Uuid::new_v4());

    // 1. Register User
    let reg_req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": email,
                "name": "Reflection Folder User",
                "password": "Password123!"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(reg_req).await.unwrap();
    let auth: AuthResponse = parse_body(res.into_body()).await;
    let token = auth.token;
    let ws_id = auth.workspace.unwrap().id;

    // 2. Create Collection
    let coll_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/workspaces/{ws_id}/collections"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "name": "gRPC Test Collection" }).to_string()))
        .unwrap();
    let res = app.clone().oneshot(coll_req).await.unwrap();
    let coll: Value = parse_body(res.into_body()).await;
    let coll_id = coll["id"].as_str().unwrap();

    // 3. Create Reflection Folder with variable grpc_url: {{GRPC_HOST}}
    let folder_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/collections/{coll_id}/folders"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "name": "NuTrade Reflection Services",
                "grpc_url": "{{GRPC_HOST}}"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(folder_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let created: Value = parse_body(res.into_body()).await;
    let folder_id = created["id"].as_str().unwrap();
    assert_eq!(created["grpc_url"].as_str().unwrap(), "{{GRPC_HOST}}");

    // 4. List folders and verify grpc_url is preserved
    let list_req = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/collections/{coll_id}/folders"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(list_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let folders: Vec<Value> = parse_body(res.into_body()).await;
    assert_eq!(folders.len(), 1);
    assert_eq!(folders[0]["id"].as_str().unwrap(), folder_id);
    assert_eq!(folders[0]["grpc_url"].as_str().unwrap(), "{{GRPC_HOST}}");

    // 5. Update folder grpc_url
    let update_req = Request::builder()
        .method("PATCH")
        .uri(format!("/api/v1/folders/{folder_id}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "grpc_url": "localhost:50051"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(update_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let updated: Value = parse_body(res.into_body()).await;
    assert_eq!(updated["grpc_url"].as_str().unwrap(), "localhost:50051");
}

#[tokio::test]
async fn test_create_and_retrieve_swagger_folder_with_swagger_url() {
    let app = setup_app().await;
    let email = format!("user_{}@example.com", Uuid::new_v4());

    // 1. Register User
    let reg_req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": email,
                "name": "Swagger Folder User",
                "password": "Password123!"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(reg_req).await.unwrap();
    let auth: AuthResponse = parse_body(res.into_body()).await;
    let token = auth.token;
    let ws_id = auth.workspace.unwrap().id;

    // 2. Create Collection
    let coll_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/workspaces/{ws_id}/collections"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "name": "Swagger Test Collection" }).to_string()))
        .unwrap();
    let res = app.clone().oneshot(coll_req).await.unwrap();
    let coll: Value = parse_body(res.into_body()).await;
    let coll_id = coll["id"].as_str().unwrap();

    // 3. Create Swagger Folder with variable swagger_url
    let folder_req = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/collections/{coll_id}/folders"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "name": "NuTrade Swagger APIs",
                "swagger_url": "http://localhost:9090/swagger/combined/nutrade.swagger.json"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(folder_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let created: Value = parse_body(res.into_body()).await;
    let folder_id = created["id"].as_str().unwrap();
    assert_eq!(created["swagger_url"].as_str().unwrap(), "http://localhost:9090/swagger/combined/nutrade.swagger.json");

    // 4. List folders and verify swagger_url is preserved
    let list_req = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/collections/{coll_id}/folders"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(list_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let folders: Vec<Value> = parse_body(res.into_body()).await;
    assert_eq!(folders.len(), 1);
    assert_eq!(folders[0]["id"].as_str().unwrap(), folder_id);
    assert_eq!(folders[0]["swagger_url"].as_str().unwrap(), "http://localhost:9090/swagger/combined/nutrade.swagger.json");

    // 5. Update folder swagger_url
    let update_req = Request::builder()
        .method("PATCH")
        .uri(format!("/api/v1/folders/{folder_id}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "swagger_url": "http://localhost:9090/swagger/combined/nuconnector.swagger.json"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(update_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let updated: Value = parse_body(res.into_body()).await;
    assert_eq!(updated["swagger_url"].as_str().unwrap(), "http://localhost:9090/swagger/combined/nuconnector.swagger.json");
}

#[tokio::test]
async fn test_user_theme_persistence() {
    let app = setup_app().await;
    let email = format!("theme_user_{}@example.com", Uuid::new_v4());

    // 1. Register user
    let reg_req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": email,
                "name": "Theme Tester",
                "password": "Password123!"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(reg_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let auth: AuthResponse = parse_body(res.into_body()).await;
    assert_eq!(auth.user.theme, "api-lab");
    let token = auth.token;

    // 2. Update theme to "dracula"
    let update_theme_req = Request::builder()
        .method("PATCH")
        .uri("/api/v1/auth/theme")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "theme": "dracula" }).to_string()))
        .unwrap();
    let res = app.clone().oneshot(update_theme_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let updated_user: UserSummary = parse_body(res.into_body()).await;
    assert_eq!(updated_user.theme, "dracula");

    // 3. Verify /auth/me returns persisted theme
    let me_req = Request::builder()
        .method("GET")
        .uri("/api/v1/auth/me")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(me_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let me: Value = parse_body(res.into_body()).await;
    assert_eq!(me["user"]["theme"].as_str().unwrap(), "dracula");
}

#[tokio::test]
async fn test_user_avatar_and_profile_update() {
    let app = setup_app().await;
    let email = format!("avatar_user_{}@example.com", Uuid::new_v4());

    // 1. Register user
    let reg_req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": email,
                "name": "Avatar Tester",
                "password": "Password123!"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(reg_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let auth: AuthResponse = parse_body(res.into_body()).await;
    assert_eq!(auth.user.avatar, "bottts:api-lab");
    let token = auth.token;

    // 2. Update profile name and avatar
    let update_req = Request::builder()
        .method("PUT")
        .uri("/api/v1/auth/profile")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "name": "Avatar Pro",
                "avatar": "lorelei:cool-seed"
            })
            .to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(update_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let updated: UserSummary = parse_body(res.into_body()).await;
    assert_eq!(updated.name, "Avatar Pro");
    assert_eq!(updated.avatar, "lorelei:cool-seed");

    // 3. Verify /auth/me returns persisted avatar & name
    let me_req = Request::builder()
        .method("GET")
        .uri("/api/v1/auth/me")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(me_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let me: Value = parse_body(res.into_body()).await;
    assert_eq!(me["user"]["name"].as_str().unwrap(), "Avatar Pro");
    assert_eq!(me["user"]["avatar"].as_str().unwrap(), "lorelei:cool-seed");
}
