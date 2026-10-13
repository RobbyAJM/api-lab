use std::env;
use rust_core::dto::GrpcReflectionRequest;

#[tokio::main]
async fn main() {
    let addr = env::args()
        .nth(1)
        .unwrap_or_else(|| "127.0.0.1:50051".to_string());
    let use_tls = env::args().nth(2).map(|s| s == "--tls").unwrap_or(false);

    println!("Querying gRPC reflection on: {addr} (TLS: {use_tls})...");
    let start = std::time::Instant::now();

    let res = grpc_client::discover_services(GrpcReflectionRequest {
        server_address: addr,
        use_tls: Some(use_tls),
    })
    .await;

    println!("Completed in {:?}", start.elapsed());
    if let Some(err) = res.error {
        eprintln!("Error: {err}");
    } else {
        println!("Discovered {} service(s):", res.services.len());
        for svc in res.services {
            println!("  Service: {}", svc.name);
            for m in svc.methods {
                println!("    Method: {} ({} -> {})", m.name, m.input_type, m.output_type);
            }
        }
    }
}
