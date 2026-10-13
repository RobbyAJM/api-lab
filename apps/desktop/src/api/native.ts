import type {
  HttpExecutionRequest,
  HttpExecutionResponse,
  GrpcExecutionRequest,
  GrpcExecutionResponse,
  GrpcReflectionRequest,
  GrpcReflectionResponse,
} from '@api-lab/api-types';

async function isTauri(): Promise<boolean> {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function executeNativeHttp(
  req: HttpExecutionRequest,
  variables: Record<string, string>
): Promise<HttpExecutionResponse> {
  if (await isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<HttpExecutionResponse>('execute_http_request', {
      req,
      variables,
    });
  }

  // Fallback for browser dev mode: direct fetch where possible
  const start = performance.now();
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    return {
      status_code: res.status,
      status_text: res.statusText,
      response_time_ms: Math.round(performance.now() - start),
      response_size_bytes: new Blob([body]).size,
      headers,
      body,
    };
  } catch (err: any) {
    return {
      status_code: 0,
      status_text: 'Error',
      response_time_ms: Math.round(performance.now() - start),
      response_size_bytes: 0,
      headers: {},
      body: '',
      error: `Browser fetch failed: ${err.message}. Run via Tauri desktop app for native HTTP & TLS bypass.`,
    };
  }
}

export async function executeNativeGrpc(
  req: GrpcExecutionRequest,
  variables: Record<string, string>
): Promise<GrpcExecutionResponse> {
  if (await isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<GrpcExecutionResponse>('execute_grpc_request', {
      req,
      variables,
    });
  }

  return {
    status_code: 14,
    status_message: 'Native execution required',
    response_time_ms: 0,
    response_size_bytes: 0,
    metadata: {},
    body: null,
    error: 'gRPC calls require native desktop runtime. Please run inside the Tauri desktop client.',
  };
}

export async function discoverNativeGrpcServices(
  req: GrpcReflectionRequest,
  variables: Record<string, string>
): Promise<GrpcReflectionResponse> {
  if (await isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<GrpcReflectionResponse>('discover_grpc_services', {
      req,
      variables,
    });
  }

  return {
    services: [],
    error: 'gRPC reflection requires native desktop runtime. Please run inside the Tauri desktop client.',
  };
}
