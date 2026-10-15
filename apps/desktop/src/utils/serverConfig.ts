export const DEFAULT_SERVER_URL = 'http://localhost:8080';
export const SERVER_URL_STORAGE_KEY = 'api_lab_server_url';

/**
 * Normalizes a user-input server address string.
 * Strips trailing slashes, prefixes http:// if protocol is omitted,
 * and strips redundant /api/v1 paths.
 */
export function normalizeServerUrl(rawUrl: string): string {
  let trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return DEFAULT_SERVER_URL;
  }
  // Strip trailing slashes
  trimmed = trimmed.replace(/\/+$/, '');
  // Prefix protocol if missing
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  // Remove accidental trailing /api/v1 or /api/v1/
  trimmed = trimmed.replace(/\/api\/v1\/?$/i, '');
  return trimmed.replace(/\/+$/, '') || DEFAULT_SERVER_URL;
}

/**
 * Retrieves the currently configured server URL from localStorage or default.
 */
export function getServerUrl(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_SERVER_URL;
  }
  const custom = window.localStorage.getItem(SERVER_URL_STORAGE_KEY);
  if (custom && custom.trim()) {
    return normalizeServerUrl(custom);
  }
  return DEFAULT_SERVER_URL;
}

/**
 * Persists custom server URL into localStorage.
 * If empty or matches default, removes the key.
 */
export function setServerUrl(url: string): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return normalizeServerUrl(url);
  }
  const normalized = normalizeServerUrl(url);
  if (!url.trim() || normalized === DEFAULT_SERVER_URL) {
    window.localStorage.removeItem(SERVER_URL_STORAGE_KEY);
  } else {
    window.localStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
  }
  return normalized;
}

/**
 * Resets the server URL back to default.
 */
export function resetServerUrl(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(SERVER_URL_STORAGE_KEY);
  }
  return DEFAULT_SERVER_URL;
}

/**
 * Returns the full base URL including /api/v1 for REST endpoints.
 */
export function getApiBaseUrl(): string {
  const base = getServerUrl();
  return `${base}/api/v1`;
}

/**
 * Returns the WebSocket base URL including /api/v1 for real-time synchronization.
 */
export function getWsBaseUrl(): string {
  const apiBase = getApiBaseUrl();
  if (apiBase.startsWith('https://')) {
    return apiBase.replace(/^https:\/\//, 'wss://');
  }
  if (apiBase.startsWith('http://')) {
    return apiBase.replace(/^http:\/\//, 'ws://');
  }
  return `ws://${apiBase}`;
}

export interface ServerConnectionTestResult {
  ok: boolean;
  message: string;
  statusCode?: number;
}

/**
 * Pings the target server to verify reachability.
 */
export async function testServerConnection(url: string): Promise<ServerConnectionTestResult> {
  const normalized = normalizeServerUrl(url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(`${normalized}/api/v1/health`, {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain' },
      signal: controller.signal,
    }).catch(async () => {
      return fetch(`${normalized}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain' },
        signal: controller.signal,
      });
    }).catch(async () => {
      return fetch(`${normalized}/api/v1/auth/me`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    });

    clearTimeout(timeoutId);

    if (res.status === 200 || res.status === 204 || res.status === 401) {
      return {
        ok: true,
        statusCode: res.status,
        message: `Successfully connected to server (${normalized})`,
      };
    }

    return {
      ok: true,
      statusCode: res.status,
      message: `Server reachable (HTTP ${res.status} ${res.statusText})`,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        ok: false,
        message: `Connection timed out after 4 seconds (${normalized})`,
      };
    }
    return {
      ok: false,
      message: err.message || `Unable to reach server at ${normalized}`,
    };
  }
}
