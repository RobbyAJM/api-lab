# API Lab

API Lab is a minimal, cross-platform collaborative API testing application for HTTP and gRPC services, built with Rust, Axum, SQLx, PostgreSQL, Tauri 2, React, and TypeScript.

## Architecture

Monorepo layout:

```text
api-lab/
├── apps/
│   ├── desktop/                 # Tauri 2 + React + TypeScript + Vite + Tailwind
│   │   ├── src/                 # 3-Panel developer UI (Sidebar, Request Editor, Response Panel)
│   │   └── src-tauri/           # Native request runner (HTTP via reqwest, gRPC via tonic)
│   └── server/                  # Axum HTTP API + WebSocket sync + SQLx PostgreSQL
│       ├── src/
│       └── tests/
├── packages/
│   ├── rust-core/               # Shared models, DTOs, crypto, and variable resolution
│   ├── grpc-client/             # Dynamic gRPC caller via tonic & server reflection
│   └── api-types/               # Shared TypeScript type definitions
├── migrations/                  # PostgreSQL schema migrations
└── Cargo.toml                   # Root Cargo workspace
```

## Prerequisites

- **Rust toolchain:** 1.80+ (`rustc`, `cargo`)
- **Node.js:** 20+
- **pnpm:** 9+
- **PostgreSQL:** 14+ running locally (default: `postgres://root:root@localhost:5432/api_lab?sslmode=disable`)

### Platform-specific Tauri Prerequisites
- **macOS:** Xcode command line tools.
- **Windows:** Microsoft C++ Build Tools & WebView2.
- **Linux:** `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

## Quick Start

### 1. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Default variables:
```env
PORT=8080
DATABASE_URL=postgres://root:root@localhost:5432/api_lab?sslmode=disable
ENV_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### 2. Run Database Migrations
Apply the PostgreSQL migration:
```bash
psql "postgres://root:root@localhost:5432/api_lab?sslmode=disable" -f migrations/20260101000000_init_schema.sql
```

### 3. Install Dependencies
```bash
pnpm install
```

### 4. Start Backend Server
```bash
cargo run -p api-lab-server
```
Server starts on `http://localhost:8080`.

### 5. Start Desktop Application
```bash
# Web UI preview mode
pnpm dev:desktop

# Or native Tauri desktop runtime
pnpm --filter @api-lab/desktop tauri dev
```

## Running Tests

Run all unit and integration tests across the monorepo:
```bash
# Rust test suite (crypto, variables, server integration, request runner)
DATABASE_URL="postgres://root:root@localhost:5432/api_lab?sslmode=disable" cargo test --workspace

# Frontend build & typecheck
pnpm build:desktop
```

## Features

- **Authentication & RBAC:**
  - Email/password authentication with Argon2id password hashing.
  - Single-use password reset tokens (logged to console in development).
  - Admin & Developer roles enforced server-side.
  - Shareable single-use invitation tokens with configurable expiration.
- **HTTP Request Builder:**
  - GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
  - Variable substitution: `{{VARIABLE_NAME}}`.
  - Headers, query parameters, JSON/text/form bodies.
  - Bearer, Basic, and Custom header authentication.
  - Response panel with status, execution time, payload size, headers, and formatted body.
- **gRPC Request Builder:**
  - Dynamic unary execution using server reflection (`grpc.reflection.v1alpha`).
  - Auto-discovery of services, methods, and message schemas.
  - JSON input payloads transcoded directly into protobuf.
  - TLS support and configurable deadlines.
- **Environments & Sensitive Variables:**
  - Named environments (Local, Dev, Staging, Prod).
  - Variables encrypted at rest using AES-256-GCM (`ENV_ENCRYPTION_KEY`).
  - Strict undefined variable error prevention (no silent substitutions).
- **Saved Responses:**
  - Save execution responses per endpoint and synchronize across workspace members.
- **Real-time Synchronization:**
  - WebSocket change event notification stream (`/api/v1/workspaces/:id/ws`).
  - Auto-invalidates client query cache on mutation.
