use axum::Json;
use serde::Serialize;

pub const SERVICE_NAME: &str = "api-lab-server";
pub const API_VERSION: &str = "v1";
pub const SERVER_VERSION: &str = env!("API_LAB_SERVER_VERSION");
pub const SERVER_GIT_SHA: &str = env!("API_LAB_GIT_SHA");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ServerVersionInfo {
    pub service: &'static str,
    pub version: &'static str,
    pub api_version: &'static str,
    pub git_sha: &'static str,
}

#[must_use]
pub const fn server_version_info() -> ServerVersionInfo {
    ServerVersionInfo {
        service: SERVICE_NAME,
        version: SERVER_VERSION,
        api_version: API_VERSION,
        git_sha: SERVER_GIT_SHA,
    }
}

#[must_use]
pub fn normalize_version_tag(raw: &str) -> Option<&str> {
    let trimmed = raw.trim();
    let stripped = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed)
        .trim();
    if stripped.is_empty() {
        None
    } else {
        Some(stripped)
    }
}

#[must_use]
pub fn format_version_label(raw: &str) -> String {
    match normalize_version_tag(raw) {
        Some(ver) => format!("v{ver}"),
        None => "v0.0.0".to_string(),
    }
}

pub async fn get_version() -> Json<ServerVersionInfo> {
    Json(server_version_info())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::routing::get;
    use axum::Router;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[test]
    fn normalize_version_tag_strips_prefix_and_whitespace() {
        assert_eq!(normalize_version_tag("v0.1.163"), Some("0.1.163"));
        assert_eq!(normalize_version_tag("V1.2.3\n"), Some("1.2.3"));
        assert_eq!(normalize_version_tag("  0.1.163  "), Some("0.1.163"));
        assert_eq!(normalize_version_tag("v"), None);
        assert_eq!(normalize_version_tag("   "), None);
    }

    #[test]
    fn format_version_label_formats_cleanly() {
        assert_eq!(format_version_label("0.1.163"), "v0.1.163");
        assert_eq!(format_version_label("v0.1.163"), "v0.1.163");
        assert_eq!(format_version_label(""), "v0.0.0");
    }

    #[test]
    fn server_version_info_populates_metadata() {
        let info = server_version_info();
        assert_eq!(info.service, "api-lab-server");
        assert_eq!(info.api_version, "v1");
        assert!(!info.version.is_empty());
        assert!(!info.version.starts_with('v'));
        assert!(!info.git_sha.is_empty());
    }

    #[tokio::test]
    async fn get_version_route_returns_expected_json() {
        let app = Router::new().route("/api/v1/version", get(get_version));
        let req = Request::builder()
            .uri("/api/v1/version")
            .body(Body::empty())
            .expect("valid request");

        let response = app.oneshot(req).await.expect("response");
        assert_eq!(response.status(), StatusCode::OK);

        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("body bytes")
            .to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).expect("valid json");

        assert_eq!(json["service"], "api-lab-server");
        assert_eq!(json["api_version"], "v1");
        assert_eq!(json["version"], SERVER_VERSION);
        assert_eq!(json["git_sha"], SERVER_GIT_SHA);
    }
}
