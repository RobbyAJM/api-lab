<p align="center">
  <img src="apps/desktop/public/api-lab-logo.png" alt="API Lab Logo" width="90" height="90">
</p>

<h1 align="center">API Lab</h1>

<p align="center">
  <b>High-density, keyboard-driven API, gRPC & FIX workbench for desktop.</b><br>
  Native Rust direct sockets, dynamic reflection gRPC, live FIX sessions, and encrypted workspace sync.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License MIT or Apache 2.0" src="https://img.shields.io/badge/license-MIT%20/%20Apache--2.0-000?style=for-the-badge"></a>
  <img alt="Tauri v2" src="https://img.shields.io/badge/Tauri-v2-000?style=for-the-badge&logo=tauri&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-1.80%2B-000?style=for-the-badge&logo=rust&logoColor=white">
  <img alt="React 18" src="https://img.shields.io/badge/React-18-000?style=for-the-badge&logo=react&logoColor=white">
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20|%20macOS%20|%20Linux-000?style=for-the-badge">
</p>

<p align="center">
  <img src="docs/assets/screenshot.png" alt="API Lab Screenshot" width="850">
</p>

## Why API Lab?

| | |
|---|---|
| 🪶 **Ultra-lightweight footprint** | Client idles at **5–7 MB RAM** (vs 300 MB+ in Electron-based tools). Minimal installer size with zero bundled Chromium or Node.js bloat. |
| ⚡ **Built for fast-paced work** | Zero delayed transition animations, instant tab and collection switches, and rapid response parsing. Never waits on UI sluggishness. |
| 🦀 **Direct native sockets** | HTTP, gRPC, and FIX execute over native Rust sockets (`reqwest`, `tonic`, and a dedicated FIX engine). No browser sandbox constraints, no CORS limits, and minimal overhead. |
| 📡 **Dynamic gRPC reflection** | Auto-discovers services via `grpc.reflection.v1alpha`. Protobuf transcoding happens on the wire with zero manual `.proto` files needed. |
| 📑 **Swagger & OpenAPI sync folders** | Dedicated sync folders mirror OpenAPI 3.x and Swagger schemas like gRPC reflection. Auto-generates sample payloads and reconciles endpoint changes on demand. |
| 🔒 **Encrypted & local-first** | Multi-tier environment variables encrypted at rest with AES-256-GCM. 100% functional offline with optional self-hosted realtime sync. |
| ⌨️ **High-density workbench** | 1px hairline mineral dark layout, flush command bar, tab dirty-state tracking, and keyboard navigation (`Ctrl+K`, `Ctrl+E`, `Ctrl+Enter`). |

## Protocol Support

| Protocol | Capabilities |
|---|---|
| **HTTP / REST** | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS · Path vars (`:id`) · Query editor · Bearer/Basic/Inherited auth · Multipart/Form/JSON payloads · Script hooks |
| **gRPC** | Server Reflection v1alpha · Unary · Server/Client/Bidirectional streaming · Protobuf dynamic transcoding · Deadlines · Metadata · TLS detection |
| **FIX** | FIX 4.2/4.4 initiator · Logon/heartbeat/Test Request/Logout · Dictionary-backed grouped transcript with clickable tag/enum reference · Sequence validation · Direct TCP · Managed/external stunnel |

Managed stunnel mode requires a `stunnel` executable on `PATH`, or an explicit executable path in the FIX transport settings. External stunnel mode connects to a local listener that you configure and run separately.

## Quick Start

1. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

2. **Prepare PostgreSQL 14+** (`DATABASE_URL` in `.env`). The sync server applies migrations automatically on startup.

3. **Install dependencies:**
   ```bash
   pnpm install
   ```

4. **Start backend sync server:**
   ```bash
   cargo run -p api-lab-server
   ```

5. **Launch desktop app:**
   ```bash
   pnpm --filter @api-lab/desktop tauri dev
   ```

## Repository Structure

```text
api-lab/
├── apps/
│   ├── desktop/                 # Tauri v2 frontend (React 18, Vite, Tailwind CSS)
│   │   └── src-tauri/           # Native request runner (HTTP, gRPC, FIX + stunnel lifecycle)
│   └── server/                  # Axum sync server + WebSocket rooms + PostgreSQL
├── packages/
│   ├── rust-core/               # Shared Rust models, AES-256-GCM crypto, variable engine
│   ├── grpc-client/             # Tonic reflection gRPC caller
│   ├── fix-client/              # FIX framing, initiator session state, stunnel config
│   └── api-types/               # Generated TypeScript definitions
└── docs/                        # Static docs & assets
```

## Contributors

<a href="https://github.com/RobbyAJM/api-lab/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=RobbyAJM/api-lab" alt="API Lab Contributors" />
</a>

## Third-party notices

Bundled FIX 4.2 and FIX 4.4 dictionary data includes QuickFIX/FIX Repository structure and Apache-2.0 FIX Orchestra descriptions. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and license details.

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE) at your option.

