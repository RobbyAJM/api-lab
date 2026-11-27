import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function normalizeVersion(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^v/i, '').trim();
  return cleaned || null;
}

function resolveClientBuildVersion(): string {
  const envOverride = normalizeVersion(process.env.API_LAB_CLIENT_VERSION);
  if (envOverride) return envOverride;

  try {
    const tauriConfPath = path.resolve(__dirname, './src-tauri/tauri.conf.json');
    const parsed = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8')) as { version?: string };
    const tauriVersion = normalizeVersion(parsed.version);
    if (tauriVersion) return tauriVersion;
  } catch {
    // Fall through to package.json fallback
  }

  try {
    const pkgPath = path.resolve(__dirname, './package.json');
    const parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
    const pkgVersion = normalizeVersion(parsed.version);
    if (pkgVersion) return pkgVersion;
  } catch {
    // Fall through to default
  }

  return '0.0.0';
}

const appVersion = resolveClientBuildVersion();

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0',
  },
});
