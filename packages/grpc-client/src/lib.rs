pub mod client;
pub mod payload_generator;
pub use client::*;
pub use payload_generator::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_streaming_multiple_messages_if_live() {
        if std::net::TcpStream::connect("127.0.0.1:3100").is_err() {
            return;
        }
        let req = rust_core::dto::GrpcExecutionRequest {
            server_address: "localhost:3100".into(),
            service: "nuconnector.PriceStreamAPI".into(),
            method: "SubscribePrice".into(),
            metadata: std::collections::HashMap::new(),
            payload: serde_json::json!({
                "action": "SUBSCRIBE",
                "symbol": ["XAUIDR"]
            }),
            timeout_ms: Some(2000),
            use_tls: Some(false),
        };

        let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
        let counter = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let c_clone = counter.clone();
        let handle = tokio::spawn(async move {
            client::execute_streaming(
                req,
                move |_msg| {
                    c_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                },
                cancel_rx,
            )
            .await
        });

        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
        let _ = cancel_tx.send(());
        if let Ok(res) = handle.await {
            if res.error.is_some() {
                return;
            }
        }
        let count = counter.load(std::sync::atomic::Ordering::SeqCst);
        assert!(count >= 2, "Expected multiple stream messages, got {}", count);
    }

    #[tokio::test]
    async fn test_bidi_streaming_with_outbound_send_if_live() {
        if std::net::TcpStream::connect("127.0.0.1:3100").is_err() {
            return;
        }
        let req = rust_core::dto::GrpcExecutionRequest {
            server_address: "localhost:3100".into(),
            service: "PriceStreamAPI".into(), // test unqualified name resolution
            method: "SubscribePrice".into(),
            metadata: std::collections::HashMap::new(),
            payload: serde_json::json!({
                "action": "SUBSCRIBE",
                "symbol": ["XAUIDR"]
            }),
            timeout_ms: Some(3000),
            use_tls: Some(false),
        };

        let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
        let (outbound_tx, outbound_rx) = tokio::sync::mpsc::channel(10);
        let counter = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let c_clone = counter.clone();

        let handle = tokio::spawn(async move {
            client::execute_streaming_with_outbound(
                req,
                move |_msg| {
                    c_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                },
                cancel_rx,
                Some(outbound_rx),
            )
            .await
        });

        // Send a subsequent message on the bidirectional stream
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        let _ = outbound_tx.send(serde_json::json!({
            "action": "SUBSCRIBE",
            "symbol": ["XAUIDR"]
        })).await;

        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
        let _ = cancel_tx.send(());

        let res = handle.await.expect("task completed");
        assert!(res.error.is_none(), "Unexpected stream error: {:?}", res.error);
        let count = counter.load(std::sync::atomic::Ordering::SeqCst);
        assert!(count >= 1, "Expected at least 1 tick message, got {}", count);
    }

    #[tokio::test]
    async fn test_probe_nutrade_discovery() {
        if std::net::TcpStream::connect("nu-trade.dev.dxtr.asia:443").is_err() {
            return;
        }

        // Test 1: use_tls: None with pure hostname
        let req_none = rust_core::dto::GrpcReflectionRequest {
            server_address: "nu-trade.dev.dxtr.asia".into(),
            use_tls: None,
        };
        let res_none = client::discover_services(req_none).await;
        assert!(!res_none.services.is_empty(), "None TLS should succeed via auto negotiation: {:?}", res_none.error);

        // Test 2: use_tls: Some(false) with fallback to TLS
        let req_false = rust_core::dto::GrpcReflectionRequest {
            server_address: "nu-trade.dev.dxtr.asia".into(),
            use_tls: Some(false),
        };
        let res_false = client::discover_services(req_false).await;
        assert!(!res_false.services.is_empty(), "False TLS should succeed via fallback: {:?}", res_false.error);

        // Test 3: use_tls: Some(true)
        let req_true = rust_core::dto::GrpcReflectionRequest {
            server_address: "nu-trade.dev.dxtr.asia".into(),
            use_tls: Some(true),
        };
        let res_true = client::discover_services(req_true).await;
        assert!(!res_true.services.is_empty(), "True TLS should succeed: {:?}", res_true.error);

        // Test 4: execute_unary with use_tls: Some(false) recovers via fallback
        let exec_false = rust_core::dto::GrpcExecutionRequest {
            server_address: "nu-trade.dev.dxtr.asia".into(),
            service: "nutrade.HealthCheckAPI".into(),
            method: "Health".into(),
            metadata: std::collections::HashMap::new(),
            payload: serde_json::json!({}),
            timeout_ms: Some(5000),
            use_tls: Some(false),
        };
        let exec_res = client::execute_unary(exec_false).await;
        assert!(exec_res.error.is_none(), "execute_unary with use_tls: Some(false) should recover via TLS fallback: {:?}", exec_res.error);
    }

    #[test]
    fn test_parse_target_address_schemes() {
        // grpc:// prefix
        let t1 = client::parse_target_address("grpc://localhost:50051", None);
        assert_eq!(t1.host_port, "localhost:50051");
        assert_eq!(t1.use_tls, false);
        assert_eq!(t1.scheme_locked, false);

        let t2 = client::parse_target_address("grpc://nu-trade.dev.dxtr.asia:443", None);
        assert_eq!(t2.host_port, "nu-trade.dev.dxtr.asia:443");
        assert_eq!(t2.use_tls, true);
        assert_eq!(t2.scheme_locked, false);

        // grpcs:// prefix forces TLS
        let t3 = client::parse_target_address("grpcs://localhost:50051", None);
        assert_eq!(t3.host_port, "localhost:50051");
        assert_eq!(t3.use_tls, true);
        assert_eq!(t3.scheme_locked, true);

        // http:// prefix forces plaintext
        let t4 = client::parse_target_address("http://nu-trade.dev.dxtr.asia", None);
        assert_eq!(t4.host_port, "nu-trade.dev.dxtr.asia");
        assert_eq!(t4.use_tls, false);
        assert_eq!(t4.scheme_locked, true);

        // https:// prefix forces TLS
        let t5 = client::parse_target_address("https://nu-trade.dev.dxtr.asia", None);
        assert_eq!(t5.host_port, "nu-trade.dev.dxtr.asia");
        assert_eq!(t5.use_tls, true);
        assert_eq!(t5.scheme_locked, true);

        // explicit override takes precedence
        let t6 = client::parse_target_address("grpc://localhost:50051", Some(true));
        assert_eq!(t6.host_port, "localhost:50051");
        assert_eq!(t6.use_tls, true);
    }
}


