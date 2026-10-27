use std::collections::HashMap;
use std::time::Instant;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Method;
use rust_core::dto::{HttpExecutionRequest, HttpExecutionResponse};
use rust_core::variable::substitute_variables;

pub async fn run_http(
    req: HttpExecutionRequest,
    variables: HashMap<String, String>,
) -> HttpExecutionResponse {
    let start = Instant::now();

    // Variable interpolation
    let url = match substitute_variables(&req.url, &variables) {
        Ok(u) => u,
        Err(e) => {
            return HttpExecutionResponse {
                status_code: 0,
                status_text: "Variable Error".into(),
                response_time_ms: 0,
                response_size_bytes: 0,
                headers: HashMap::new(),
                body: String::new(),
                error: Some(e.to_string()),
            };
        }
    };

    let mut interpolated_headers = HashMap::new();
    for (k, v) in req.headers {
        let key = match substitute_variables(&k, &variables) {
            Ok(k) => k,
            Err(e) => {
                return HttpExecutionResponse {
                    status_code: 0,
                    status_text: "Variable Error".into(),
                    response_time_ms: 0,
                    response_size_bytes: 0,
                    headers: HashMap::new(),
                    body: String::new(),
                    error: Some(e.to_string()),
                };
            }
        };
        let val = match substitute_variables(&v, &variables) {
            Ok(v) => v,
            Err(e) => {
                return HttpExecutionResponse {
                    status_code: 0,
                    status_text: "Variable Error".into(),
                    response_time_ms: 0,
                    response_size_bytes: 0,
                    headers: HashMap::new(),
                    body: String::new(),
                    error: Some(e.to_string()),
                };
            }
        };
        interpolated_headers.insert(key, val);
    }

    let mut interpolated_query = Vec::new();
    for (k, v) in req.query_params {
        let key = match substitute_variables(&k, &variables) {
            Ok(k) => k,
            Err(e) => {
                return HttpExecutionResponse {
                    status_code: 0,
                    status_text: "Variable Error".into(),
                    response_time_ms: 0,
                    response_size_bytes: 0,
                    headers: HashMap::new(),
                    body: String::new(),
                    error: Some(e.to_string()),
                };
            }
        };
        let val = match substitute_variables(&v, &variables) {
            Ok(v) => v,
            Err(e) => {
                return HttpExecutionResponse {
                    status_code: 0,
                    status_text: "Variable Error".into(),
                    response_time_ms: 0,
                    response_size_bytes: 0,
                    headers: HashMap::new(),
                    body: String::new(),
                    error: Some(e.to_string()),
                };
            }
        };
        interpolated_query.push((key, val));
    }

    let interpolated_body = if let Some(body_str) = req.body {
        match substitute_variables(&body_str, &variables) {
            Ok(b) => Some(b),
            Err(e) => {
                return HttpExecutionResponse {
                    status_code: 0,
                    status_text: "Variable Error".into(),
                    response_time_ms: 0,
                    response_size_bytes: 0,
                    headers: HashMap::new(),
                    body: String::new(),
                    error: Some(e.to_string()),
                };
            }
        }
    } else {
        None
    };

    // Client with default TLS cert verification
    let timeout_ms = req.timeout_ms.unwrap_or(30_000);
    let client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout_ms));

    let client = match client_builder.build() {
        Ok(c) => c,
        Err(e) => {
            return HttpExecutionResponse {
                status_code: 0,
                status_text: "Client Error".into(),
                response_time_ms: start.elapsed().as_millis() as u64,
                response_size_bytes: 0,
                headers: HashMap::new(),
                body: String::new(),
                error: Some(format!("Failed to build HTTP client: {e}")),
            };
        }
    };

    let method = match req.method.to_uppercase().as_str() {
        "GET" => Method::GET,
        "POST" => Method::POST,
        "PUT" => Method::PUT,
        "PATCH" => Method::PATCH,
        "DELETE" => Method::DELETE,
        "HEAD" => Method::HEAD,
        "OPTIONS" => Method::OPTIONS,
        other => {
            return HttpExecutionResponse {
                status_code: 0,
                status_text: "Invalid Method".into(),
                response_time_ms: 0,
                response_size_bytes: 0,
                headers: HashMap::new(),
                body: String::new(),
                error: Some(format!("Unsupported HTTP method: {other}")),
            };
        }
    };

    let base_url = if !interpolated_query.is_empty() {
        url.split_once('?').map(|(base, _)| base).unwrap_or(&url)
    } else {
        &url
    };

    let mut request_builder = client.request(method, base_url).query(&interpolated_query);

    // Apply headers
    let mut header_map = HeaderMap::new();
    for (k, v) in interpolated_headers {
        if let (Ok(name), Ok(val)) = (
            HeaderName::from_bytes(k.as_bytes()),
            HeaderValue::from_str(&v),
        ) {
            header_map.insert(name, val);
        }
    }
    request_builder = request_builder.headers(header_map);

    // Apply Auth
    if let Some(auth) = req.auth {
        match auth.auth_type.to_lowercase().as_str() {
            "bearer" => {
                if let Some(token) = auth.token {
                    let sub_token = substitute_variables(&token, &variables).unwrap_or(token);
                    request_builder = request_builder.bearer_auth(sub_token);
                }
            }
            "basic" => {
                let user = auth.username.unwrap_or_default();
                let sub_user = substitute_variables(&user, &variables).unwrap_or(user);
                let pass = auth.password.unwrap_or_default();
                let sub_pass = substitute_variables(&pass, &variables).unwrap_or(pass);
                request_builder = request_builder.basic_auth(sub_user, Some(sub_pass));
            }
            "custom" => {
                if let (Some(name), Some(val)) = (auth.header_name, auth.header_value) {
                    let sub_name = substitute_variables(&name, &variables).unwrap_or(name);
                    let sub_val = substitute_variables(&val, &variables).unwrap_or(val);
                    if let (Ok(n), Ok(v)) = (
                        HeaderName::from_bytes(sub_name.as_bytes()),
                        HeaderValue::from_str(&sub_val),
                    ) {
                        request_builder = request_builder.header(n, v);
                    }
                }
            }
            _ => {}
        }
    }

    // Apply Body
    if let Some(body) = interpolated_body {
        let btype = req.body_type.as_deref().unwrap_or("json");
        match btype {
            "json" => {
                request_builder = request_builder
                    .header("content-type", "application/json")
                    .body(body);
            }
            "form" => {
                request_builder = request_builder
                    .header("content-type", "application/x-www-form-urlencoded")
                    .body(body);
            }
            "multipart" => {
                let fields: Vec<serde_json::Value> = match serde_json::from_str(&body) {
                    Ok(fields) => fields,
                    Err(e) => {
                        return HttpExecutionResponse {
                            status_code: 0,
                            status_text: "Invalid Multipart Body".into(),
                            response_time_ms: start.elapsed().as_millis() as u64,
                            response_size_bytes: 0,
                            headers: HashMap::new(),
                            body: String::new(),
                            error: Some(format!("Multipart body must be valid JSON: {e}")),
                        };
                    }
                };
                let mut form = reqwest::multipart::Form::new();
                for field in fields {
                    let Some(name) = field.get("name").and_then(|v| v.as_str()) else {
                        return HttpExecutionResponse {
                            status_code: 0,
                            status_text: "Invalid Multipart Body".into(),
                            response_time_ms: start.elapsed().as_millis() as u64,
                            response_size_bytes: 0,
                            headers: HashMap::new(),
                            body: String::new(),
                            error: Some("Each multipart field must have string name and value".into()),
                        };
                    };
                    if let Some(data) = field.get("data").and_then(|v| v.as_str()) {
                        let bytes = match base64::Engine::decode(
                            &base64::engine::general_purpose::STANDARD,
                            data.as_bytes(),
                        ) {
                            Ok(bytes) => bytes,
                            Err(e) => {
                                return HttpExecutionResponse {
                                    status_code: 0,
                                    status_text: "Invalid Multipart Body".into(),
                                    response_time_ms: start.elapsed().as_millis() as u64,
                                    response_size_bytes: 0,
                                    headers: HashMap::new(),
                                    body: String::new(),
                                    error: Some(format!("Multipart file must be valid Base64: {e}")),
                                };
                            }
                        };
                        let mut part = reqwest::multipart::Part::bytes(bytes);
                        if let Some(filename) = field.get("filename").and_then(|v| v.as_str()) {
                            part = part.file_name(filename.to_string());
                        }
                        if let Some(content_type) = field.get("content_type").and_then(|v| v.as_str()) {
                            part = match part.mime_str(content_type) {
                                Ok(with_mime) => with_mime,
                                Err(_) => {
                                    return HttpExecutionResponse {
                                        status_code: 0,
                                        status_text: "Invalid Multipart Body".into(),
                                        response_time_ms: start.elapsed().as_millis() as u64,
                                        response_size_bytes: 0,
                                        headers: HashMap::new(),
                                        body: String::new(),
                                        error: Some(format!("Invalid multipart content type: {content_type}")),
                                    };
                                }
                            };
                        }
                        form = form.part(name.to_string(), part);
                    } else if let Some(value) = field.get("value").and_then(|v| v.as_str()) {
                        form = form.text(name.to_string(), value.to_string());
                    } else {
                        return HttpExecutionResponse {
                            status_code: 0,
                            status_text: "Invalid Multipart Body".into(),
                            response_time_ms: start.elapsed().as_millis() as u64,
                            response_size_bytes: 0,
                            headers: HashMap::new(),
                            body: String::new(),
                            error: Some("Each multipart field must have string value or file data".into()),
                        };
                    }
                }
                request_builder = request_builder.multipart(form);
            }
            "binary" => {
                let (encoded, content_type) = match serde_json::from_str::<serde_json::Value>(&body) {
                    Ok(file) if file.get("data").is_some() => (
                        file.get("data").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                        file.get("content_type").and_then(|v| v.as_str()).map(str::to_string),
                    ),
                    _ => (body, None),
                };
                let bytes = match base64::Engine::decode(
                    &base64::engine::general_purpose::STANDARD,
                    encoded.as_bytes(),
                ) {
                    Ok(bytes) => bytes,
                    Err(e) => {
                        return HttpExecutionResponse {
                            status_code: 0,
                            status_text: "Invalid Binary Body".into(),
                            response_time_ms: start.elapsed().as_millis() as u64,
                            response_size_bytes: 0,
                            headers: HashMap::new(),
                            body: String::new(),
                            error: Some(format!("Binary body must be valid Base64: {e}")),
                        };
                    }
                };
                if let Some(content_type) = content_type {
                    request_builder = request_builder.header("content-type", content_type);
                }
                request_builder = request_builder.body(bytes);
            }
            _ => {
                request_builder = request_builder.body(body);
            }
        }
    }

    match request_builder.send().await {
        Ok(res) => {
            let status = res.status();
            let status_code = status.as_u16();
            let status_text = status.canonical_reason().unwrap_or("").to_string();

            let mut resp_headers = HashMap::new();
            for (k, v) in res.headers() {
                if let Ok(v_str) = v.to_str() {
                    resp_headers.insert(k.as_str().to_string(), v_str.to_string());
                }
            }

            match res.bytes().await {
                Ok(bytes) => {
                    let elapsed = start.elapsed().as_millis() as u64;
                    let size = bytes.len();
                    let body_str = String::from_utf8_lossy(&bytes).into_owned();

                    HttpExecutionResponse {
                        status_code,
                        status_text,
                        response_time_ms: elapsed,
                        response_size_bytes: size,
                        headers: resp_headers,
                        body: body_str,
                        error: None,
                    }
                }
                Err(e) => HttpExecutionResponse {
                    status_code,
                    status_text,
                    response_time_ms: start.elapsed().as_millis() as u64,
                    response_size_bytes: 0,
                    headers: resp_headers,
                    body: String::new(),
                    error: Some(format!("Failed to read response body: {e}")),
                },
            }
        }
        Err(e) => HttpExecutionResponse {
            status_code: 0,
            status_text: "Request Failed".into(),
            response_time_ms: start.elapsed().as_millis() as u64,
            response_size_bytes: 0,
            headers: HashMap::new(),
            body: String::new(),
            error: Some(format!("{e}")),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_undefined_variable_returns_error() {
        let req = HttpExecutionRequest {
            url: "https://example.com/{{MISSING_VAR}}".into(),
            method: "GET".into(),
            headers: HashMap::new(),
            query_params: Vec::new(),
            body: None,
            body_type: None,
            auth: None,
            timeout_ms: Some(1000),
        };
        let vars = HashMap::new();
        let res = run_http(req, vars).await;
        assert!(res.error.is_some());
        assert!(res.error.unwrap().contains("undefined variable"));
    }
}
