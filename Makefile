.PHONY: help build-windows-exe run-server dev-desktop build-desktop test clean

TARGET_DIR = target/x86_64-pc-windows-gnu
RELEASE_DIR = $(TARGET_DIR)/release
ZIP_FILE = $(TARGET_DIR)/release.zip

help:
	@echo "Usage:"
	@echo "  make build-windows-exe   - Cross-compile Windows .exe and zip $(RELEASE_DIR) into $(ZIP_FILE)"
	@echo "  make run-server          - Run Axum backend server"
	@echo "  make dev-desktop         - Run desktop React web dev server"
	@echo "  make build-desktop       - Build frontend bundle (Vite + TypeScript)"
	@echo "  make test                - Run all Rust tests and verify DB"
	@echo "  make clean               - Clean build artifacts"

build-windows-exe:
	pnpm --filter @api-lab/desktop exec tauri build --target x86_64-pc-windows-gnu --features desktop --no-bundle
	@echo "Packaging contents of $(RELEASE_DIR) into $(ZIP_FILE)..."
	rm -f $(ZIP_FILE)
	cd $(RELEASE_DIR) && zip -r ../release.zip .
	@echo "Package created at $(ZIP_FILE)"

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
	rm -rf apps/desktop/dist node_modules $(ZIP_FILE) *.zip *.tar.gz
