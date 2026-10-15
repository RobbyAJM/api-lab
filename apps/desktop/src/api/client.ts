import {
  getApiBaseUrl,
  getServerUrl,
  setServerUrl,
  resetServerUrl,
  getWsBaseUrl,
  DEFAULT_SERVER_URL,
  testServerConnection,
  normalizeServerUrl,
  type ServerConnectionTestResult,
} from '../utils/serverConfig';

export {
  getServerUrl,
  setServerUrl,
  resetServerUrl,
  getApiBaseUrl,
  getWsBaseUrl,
  DEFAULT_SERVER_URL,
  testServerConnection,
  normalizeServerUrl,
  type ServerConnectionTestResult,
};

export function getAuthToken(): string | null {
  return localStorage.getItem('api_lab_token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('api_lab_token', token);
  } else {
    localStorage.removeItem('api_lab_token');
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errMsg = `Request failed: ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.error) {
        errMsg = errJson.error;
      }
    } catch {
      // fallback
    }
    throw new Error(errMsg);
  }

  return response.json();
}
