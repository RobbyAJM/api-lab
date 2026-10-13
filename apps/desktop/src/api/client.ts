const API_BASE = 'http://localhost:8080/api/v1';

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

  const response = await fetch(`${API_BASE}${path}`, {
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
