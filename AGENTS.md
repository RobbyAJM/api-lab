# Agent Instructions: API Lab

## Overview

API Lab is a high-density, keyboard-driven API & gRPC workbench desktop app built with **Tauri v2**, **React 18**, and **Rust**.

Monorepo layout:
- `apps/desktop`: Tauri v2 frontend (React 18, TypeScript, Tailwind CSS, Zustand, TanStack Query).
- `apps/desktop/src-tauri`: Native Rust desktop runner (HTTP & gRPC invocation via direct socket/TLS).
- `apps/server`: Axum + SQLx API server syncing workspaces and collections.
- `packages/rust-core`: Shared Rust types and domain logic.
- `packages/grpc-client`: Native Tonic gRPC client runner.
- `packages/api-types`: Generated / shared TypeScript interfaces.

---

## Required Skills in this Codebase

Vendored skills live under `.opencode/skills/`:

### 1. Codebase Memory (`codebase-memory-mcp`)
- **Location:** `.opencode/skills/codebase-memory/SKILL.md`
- **When to use:** Structural code discovery, call hierarchies, function dependencies, impact analysis.
- **Rules:**
  - Prefer MCP graph tools (`search_graph`, `trace_path`, `get_code_snippet`, `query_graph`) over raw grep/glob for code architecture.
  - Project identifier for this repo is `C-Users-Robby-Alvian-Jaya-research-api-lab`.
  - Always verify candidate paths with `check_index_coverage`.

### 2. Rust Skills (`@rust-skills`)
- **Location:** `.opencode/skills/rust-skills/`
- **When to use:** Authoring, reviewing, or refactoring Rust code (`apps/server`, `apps/desktop/src-tauri`, `packages/*`).
- **Core Guidelines:**
  - **Ownership:** Prefer borrowing (`&T`, `&str`, `&[T]`) over `.clone()`. Use `Arc<T>` for cross-thread shared state.
  - **Error Handling:** Use `thiserror` in packages/libraries; `anyhow` in applications. Never `.unwrap()` in production paths.
  - **Async:** Never hold `Mutex` guards across `.await`. Use `tokio::select!` cancellation-safe futures.
  - **API Design:** Use `#[must_use]` on fallible or builder methods. Implement `From<T>` rather than `Into<U>`.

### 3. Impeccable (`@impeccable`)
- **Location:** `.opencode/skills/impeccable/`
- **When to use:** UI/UX design, frontend components, styling, polish, audits.
- **Contracts:**
  - `PRODUCT.md`: Durable product purpose, platform (`web`), target users, and constraints.
  - `DESIGN.md`: Visual system tokens (mineral dark surfaces, electric cobalt CTA, semantic method colors, 1px hairlines).
- **Quality Floor:**
  - **Refuse AI Slop:** No thick side-tab borders (`border-l-4`), no nested cards inside cards, no floating rounded-xl bubbles, no decorative gradients, no gray text on colored grounds.
  - **Density:** High information density, flush edge-to-edge tabs, single-row monolithic command bars.
  - **Scrollbars:** Code line containers must NOT have `overflow-x-auto` per line; scroll at viewer level.
  - **Linter:** Run `pnpm run lint:design` to verify with 61 deterministic rules.

---

## Development & Testing

- Ensure every implemented or modified function is independently testable without launching the app. Refactor into standalone functions when necessary.
- Run relevant tests and verify the changes work correctly.

---

## Development & Verification Commands

```bash
# Frontend Unit Tests (143+ tests)
pnpm run test:ts

# Rust Workspace Tests
pnpm run test:rust
# or: cargo test --workspace

# Design Quality & Anti-Slop Check
pnpm run lint:design

# Build Desktop Web Frontend
pnpm run build:desktop

# Build Desktop Executable (Tauri Release)
# Note: Ensure any running api-lab-desktop.exe process is closed first.
pnpm run build:desktop:exe
```
