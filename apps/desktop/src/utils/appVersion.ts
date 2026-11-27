export const FALLBACK_APP_VERSION = '0.0.0';

/**
 * Strips whitespace and any leading `v`/`V` prefix from a version string.
 */
export function normalizeVersion(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^v/i, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Formats a version string for display with a single lowercase `v` prefix.
 */
export function formatVersionLabel(raw?: string | null): string {
  const normalized = normalizeVersion(raw);
  return `v${normalized ?? FALLBACK_APP_VERSION}`;
}

/**
 * Reads the Vite build-time injected `__APP_VERSION__` safely (also works outside Vite in Node tests).
 */
export function getBuildTimeAppVersion(): string {
  try {
    if (typeof __APP_VERSION__ === 'string') {
      const normalized = normalizeVersion(__APP_VERSION__);
      if (normalized) return normalized;
    }
  } catch {
    // __APP_VERSION__ is not defined outside Vite builds (e.g., direct Node test execution).
  }
  return FALLBACK_APP_VERSION;
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface ResolveClientVersionOptions {
  isTauri?: boolean;
  getTauriVersion?: () => Promise<string>;
  fallbackVersion?: string;
}

/**
 * Resolves the authoritative client version:
 * 1. Inside Tauri desktop runtime: reads live `getVersion()` from `@tauri-apps/api/app`
 *    (which honors CI `--config '{"version":"..."}'` overrides and `tauri.conf.json`).
 * 2. Outside Tauri (browser dev mode / tests) or on IPC failure: falls back to build-time `__APP_VERSION__`.
 */
export async function resolveClientVersion(
  options: ResolveClientVersionOptions = {}
): Promise<string> {
  const fallback = normalizeVersion(options.fallbackVersion) ?? getBuildTimeAppVersion();
  const inTauri = options.isTauri ?? isTauriRuntime();

  if (!inTauri) {
    return fallback;
  }

  try {
    const fetcher =
      options.getTauriVersion ??
      (async () => {
        const { getVersion } = await import('@tauri-apps/api/app');
        return getVersion();
      });
    const runtimeVersion = normalizeVersion(await fetcher());
    return runtimeVersion ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Builds a concise tooltip summarizing client and optional server versions.
 */
export function formatVersionTooltip(
  clientVersion: string,
  serverVersion?: string | null
): string {
  const clientLabel = `Client ${formatVersionLabel(clientVersion)}`;
  const normalizedServer = normalizeVersion(serverVersion);
  if (!normalizedServer) {
    return clientLabel;
  }
  return `${clientLabel} · Server v${normalizedServer}`;
}
