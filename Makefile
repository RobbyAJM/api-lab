.PHONY: help build-windows-exe run-server dev-desktop build-desktop test clean

TARGET_DIR = target/x86_64-pc-windows-gnu
RELEASE_DIR = $(TARGET_DIR)/release

help:
	@echo "Usage:"
	@echo "  make build-windows-exe   - Cross-compile Windows .exe"
	@echo "  make run-server          - Run Axum backend server"
	@echo "  make dev-desktop         - Run desktop React web dev server"
	@echo "  make build-desktop       - Build frontend bundle (Vite + TypeScript)"
	@echo "  make test                - Run all Rust tests and verify DB"
	@echo "  make clean               - Clean build artifacts"

build-windows-exe:
	pnpm --filter @api-lab/desktop exec tauri build --target x86_64-pc-windows-gnu --features desktop --no-bundle
	@echo "Build complete. Executable located at $(RELEASE_DIR)/api-lab-desktop.exe"

run-server:
	cargo run -p api-lab-server

dev-desktop:
	pnpm dev:desktop

build-desktop:
	pnpm build:desktop

test:
	cargo test --workspace

clean:
	cargo clean
	rm -rf apps/desktop/dist node_modules *.zip *.tar.gz
