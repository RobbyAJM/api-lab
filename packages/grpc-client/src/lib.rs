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
        let _ = handle.await;
        let count = counter.load(std::sync::atomic::Ordering::SeqCst);
        assert!(count >= 2, "Expected multiple stream messages, got {}", count);
    }
}


