<p align="center">
  <img src="apps/desktop/public/api-lab-logo.png" alt="API Lab Logo" width="100" height="100">
</p>

<h1 align="center">API Lab</h1>

<p align="center">
  <b>High-density, keyboard-driven API & gRPC workbench for desktop.</b><br>
  Direct socket HTTP, native reflection-powered gRPC, and encrypted realtime workspace sync.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/license-MIT-000?style=for-the-badge"></a>
  <img alt="Tauri v2" src="https://img.shields.io/badge/Tauri-v2-000?style=for-the-badge&logo=tauri&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-1.80%2B-000?style=for-the-badge&logo=rust&logoColor=white">
  <img alt="React 18" src="https://img.shields.io/badge/React-18-000?style=for-the-badge&logo=react&logoColor=white">
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20|%20macOS%20|%20Linux-000?style=for-the-badge">
</p>

> **API Lab** is a high-performance desktop workbench for developing, debugging, and testing HTTP and gRPC services. Built with Tauri v2, React 18, and Rust, it replaces resource-heavy web-wrapper tooling with direct native socket execution (`reqwest` + `tonic`), live workspace collaboration, and AES-256-GCM encrypted secrets.

<br>

## What it does

| | |
|---|---|
| **Direct socket HTTP** | Zero-latency HTTP invocation powered by native Rust `reqwest`. Supports all REST verbs, path variables (`:id`), query parameters, binary/multipart uploads, and streaming responses without browser CORS restrictions. |
| **Native gRPC reflection** | Dynamic service and schema discovery via `grpc.reflection.v1alpha`. Transcodes JSON payloads into protobuf directly on the wire with zero manual `.proto` compilation. |
| **Streaming execution** | Full support for gRPC Server Streaming, Client Streaming, and Bidirectional Streaming with real-time message inspect, prepend ordering, and stream cancellation. |
| **Encrypted environments** | Multi-tier environment variables (Local, Dev, Staging, Prod) encrypted at rest with AES-256-GCM. Strict undefined variable detection prevents silent parameter leaks. |
| **Realtime team sync** | Live workspace synchronization over Axum WebSockets (`/api/v1/workspaces/:id/ws`). Updates to collections, folders, environments, and saved responses sync instantly across connected members. |
| **Pre & post scripts** | Sandboxed JavaScript execution hooks for dynamic variable interpolation, HMAC/token computation, assertion testing, and chaining requests. |
| **High-density UI** | Monolithic command bar, keyboard navigation (`Ctrl+K`, `Ctrl+E`, `Ctrl+Enter`), tab state drafts with dirty tracking, and collapsible JSON response inspector. |
| **OpenAPI & Swagger sync** | Import OpenAPI 3.x and Swagger 2.0 schemas with recursive JSON sample generation, schema parameter mapping, and two-way collection reconciliation. |

## Protocol support

| Protocol | Capabilities |
|---|---|
| **HTTP / REST** | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS · Path variables (`:param`) · Query string editor · Bearer / Basic / Custom header auth · Collection inherited auth · Form-data / Multipart / Binary / Raw JSON · Custom timeouts · Variable substitution (`{{VAR}}`) |
| **gRPC** | Server Reflection v1alpha · Unary execution · Server Streaming · Client Streaming · Bidirectional Streaming · Dynamic Protobuf transcoding · Custom metadata & deadlines · Automatic TLS detection |

## Requirements

| | |
|---|---|
| **Operating System** | Windows 10/11 (WebView2), macOS 12+ (Apple Silicon & Intel), Linux (WebKitGTK 4.1+) |
| **Rust Toolchain** | 1.80+ (`rustc`, `cargo`) |
| **Node.js** | 20+ with `pnpm` 9+ |
| **PostgreSQL** | 14+ (required for backend workspace sync & authentication) |

## Quick start

1. **Configure environment:** Copy the environment template:
   ```bash
   cp .env.example .env
   ```
   Default variables:
   ```env
   PORT=8080
   DATABASE_URL=postgres://root:root@localhost:5432/api_lab?sslmode=disable
   ENV_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
   ```

2. **Apply database migrations:**
   ```bash
   psql "postgres://root:root@localhost:5432/api_lab?sslmode=disable" -f migrations/20260101000000_init_schema.sql
   ```

3. **Install dependencies:**
   ```bash
   pnpm install
   ```

4. **Start backend server:**
   ```bash
   cargo run -p api-lab-server
   ```
   Server listens on `http://localhost:8080`.

5. **Launch desktop application:**
   ```bash
   # Web preview mode
   pnpm dev:desktop

   # Or native Tauri runtime
   pnpm --filter @api-lab/desktop tauri dev
   ```

## How it works

API Lab separates developer interaction from network execution using a native desktop architecture:

- **Desktop Frontend:** React 18, TypeScript, Tailwind CSS, Zustand, and TanStack Query. Built to mineral dark tokens (`#09090b` base, `#2563eb` accent, 1px hairlines) with zero decorative overhead.
- **Native Request Runner:** Direct socket execution inside Tauri v2 via Rust `reqwest` (HTTP) and `tonic` (gRPC). Bypasses browser CORS, sandbox headers, and proxy constraints.
- **Sync Server:** Axum HTTP server backed by SQLx PostgreSQL with WebSocket rooms broadcast on workspace mutations.
- **Shared Core:** Rust packages (`packages/rust-core`, `packages/grpc-client`) handle AES-256-GCM encryption, variable interpolation, and dynamic reflection schemas.

```text
api-lab/
├── apps/
│   ├── desktop/                 # Tauri 2 + React + TypeScript + Vite + Tailwind
│   │   ├── src/                 # 3-Panel developer UI (Sidebar, Request Editor, Response Panel)
│   │   └── src-tauri/           # Native request runner (HTTP via reqwest, gRPC via tonic)
│   └── server/                  # Axum HTTP API + WebSocket sync + SQLx PostgreSQL
├── packages/
│   ├── rust-core/               # Shared models, DTOs, crypto, and variable resolution
│   ├── grpc-client/             # Dynamic gRPC caller via tonic & server reflection
│   └── api-types/               # Shared TypeScript type definitions
├── migrations/                  # PostgreSQL schema migrations
└── Cargo.toml                   # Root Cargo workspace
```

## Testing

Run the test suites across the monorepo:

```bash
# TypeScript unit tests (269+ tests)
pnpm run test:ts

# Design quality & anti-slop verification
pnpm run lint:design

# Rust workspace tests
DATABASE_URL="postgres://root:root@localhost:5432/api_lab?sslmode=disable" cargo test --workspace

# Build release desktop executable
pnpm run build:desktop:exe
```

## Credits

API Lab is built on top of open-source software:

- **Tauri:** [tauri-apps/tauri](https://github.com/tauri-apps/tauri) (Apache-2.0 / MIT)
- **Axum:** [tokio-rs/axum](https://github.com/tokio-rs/axum) (MIT)
- **Tonic:** [hyperium/tonic](https://github.com/hyperium/tonic) (MIT)
- **Reqwest:** [seanmonstar/reqwest](https://github.com/seanmonstar/reqwest) (Apache-2.0 / MIT)
- **SQLx:** [launchbadge/sqlx](https://github.com/launchbadge/sqlx) (Apache-2.0 / MIT)
- **React:** [facebook/react](https://github.com/facebook/react) (MIT)
- **Lucide Icons:** [lucide-icons](https://github.com/lucide-icons/lucide) (ISC)
- **Tailwind CSS:** [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) (MIT)

## License

API Lab is licensed under the [MIT License](LICENSE).
