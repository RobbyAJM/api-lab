import type { Endpoint, HttpExecutionResponse, GrpcExecutionResponse } from '@api-lab/api-types';
import { getGrpcStatusLabel, formatExecutionError } from './grpcSpecification.ts';
import { getEffectiveEndpointConfig } from './tabManager.ts';

/**
 * Formats byte size into human-readable B / KB / MB.
 */
export function formatResponseSize(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Formats elapsed response time into ms or s.
 */
export function formatElapsedTime(ms: number): string {
  if (!ms || ms <= 0 || isNaN(ms)) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 1000).toFixed(0)}s`;
}

export interface StatusBadgeInfo {
  label: string;
  isSuccess: boolean;
  isWarning: boolean;
  isError: boolean;
}

export interface HttpStatusColors {
  badgeClass: string;
  dotClass: string;
}

/**
 * Returns color classes for HTTP response status based on status tier:
 * 2xx (Green), 3xx (Blue), 4xx (Amber), 5xx (Red).
 */
export function getHttpStatusColors(code: number): HttpStatusColors {
  if (code >= 200 && code < 300) {
    return {
      badgeClass: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
      dotClass: 'bg-emerald-400',
    };
  }
  if (code >= 300 && code < 400) {
    return {
      badgeClass: 'bg-blue-950/60 text-blue-400 border border-blue-800/60',
      dotClass: 'bg-blue-400',
    };
  }
  if (code >= 400 && code < 500) {
    return {
      badgeClass: 'bg-amber-950/60 text-amber-400 border border-amber-800/60',
      dotClass: 'bg-amber-400',
    };
  }
  if (code >= 500) {
    return {
      badgeClass: 'bg-red-950/60 text-red-400 border border-red-800/60',
      dotClass: 'bg-red-400',
    };
  }
  return {
    badgeClass: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
    dotClass: 'bg-zinc-400',
  };
}

/**
 * Formats HTTP or gRPC status code into a standard status label and tone.
 */
export function formatStatusCode(
  protocol: 'http' | 'grpc',
  code: number,
  statusText?: string
): StatusBadgeInfo {
  if (protocol === 'http') {
    const isSuccess = code >= 200 && code < 300;
    const isWarning = code >= 300 && code < 400;
    const isError = code >= 400 || code === 0;
    const textPart = statusText ? ` ${statusText}` : '';
    return {
      label: `${code}${textPart}`.trim(),
      isSuccess,
      isWarning,
      isError,
    };
  }

  // gRPC
  const isSuccess = code === 0;
  const isError = code !== 0;
  const canonical = getGrpcStatusLabel(code, statusText);
  return {
    label: `${code} ${canonical}`.trim(),
    isSuccess,
    isWarning: false,
    isError,
  };
}

export interface ExecutedRequestMeta {
  timestamp: string;
  protocol: 'http' | 'grpc';
  http?: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    queryParams?: [string, string][];
    body?: string;
    bodyType?: string;
  };
  grpc?: {
    serverAddress: string;
    service?: string;
    method?: string;
    metadata?: Record<string, string>;
    payload?: any;
  };
}

/**
 * Formats request body for copy trace diagnostics.
 * When payload is multipart, suppresses base64 file buffers and reveals only filename and filesize.
 */
export function formatTraceRequestBody(
  body?: string | null,
  bodyType?: string | null
): string {
  if (!body || bodyType === 'none') {
    return '  (empty)';
  }

  if (bodyType === 'multipart') {
    let fields: any[] = [];
    try {
      fields = typeof body === 'string' ? JSON.parse(body) : (Array.isArray(body) ? body : []);
    } catch {
      fields = [];
    }
    if (!Array.isArray(fields) || fields.length === 0) {
      return '  (empty multipart)';
    }

    return fields
      .map((f) => {
        const fieldName = f.name?.trim() || '(unnamed)';
        if (f.filename) {
          let sizeStr = '0 B (0 bytes)';
          if (typeof f.data === 'string' && f.data.length > 0) {
            const byteLen = Math.round((f.data.length * 3) / 4);
            sizeStr = `${formatResponseSize(byteLen)} (${byteLen.toLocaleString()} bytes)`;
          } else if (typeof f.filesize === 'number' || typeof f.size === 'number') {
            const byteLen = f.filesize ?? f.size;
            sizeStr = `${formatResponseSize(byteLen)} (${byteLen.toLocaleString()} bytes)`;
          }
          const typeStr = f.content_type ? `, type=${f.content_type}` : '';
          return `  - ${fieldName}: filename="${f.filename}", filesize=${sizeStr}${typeStr}`;
        }
        return `  - ${fieldName}: ${JSON.stringify(f.value ?? '')}`;
      })
      .join('\n');
  }

  if (bodyType === 'binary') {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      if (parsed && typeof parsed === 'object' && parsed.filename) {
        let sizeStr = '0 B (0 bytes)';
        if (typeof parsed.data === 'string' && parsed.data.length > 0) {
          const byteLen = Math.round((parsed.data.length * 3) / 4);
          sizeStr = `${formatResponseSize(byteLen)} (${byteLen.toLocaleString()} bytes)`;
        } else if (typeof parsed.filesize === 'number' || typeof parsed.size === 'number') {
          const byteLen = parsed.filesize ?? parsed.size;
          sizeStr = `${formatResponseSize(byteLen)} (${byteLen.toLocaleString()} bytes)`;
        }
        const typeStr = parsed.content_type ? `, type=${parsed.content_type}` : '';
        return `  filename="${parsed.filename}", filesize=${sizeStr}${typeStr}`;
      }
    } catch {
      // Fall through to plain text formatting
    }
    return '  (binary data)';
  }

  if (bodyType === 'json') {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const pretty = JSON.stringify(parsed, null, 2);
      return pretty.split('\n').map((l) => `  ${l}`).join('\n');
    } catch {
      return body.split('\n').map((l) => `  ${l}`).join('\n');
    }
  }

  return body.split('\n').map((l) => `  ${l}`).join('\n');
}

/**
 * Layout styling classes for the request execution progress indicator.
 * Absolute positioning guarantees zero layout shift (CLS) during execution state transitions.
 */
export const RESPONSE_PROGRESS_BAR_CONTAINER_CLASS =
  'absolute top-0 inset-x-0 h-[2px] z-10 pointer-events-none overflow-hidden bg-zinc-900';

export interface FormatCopyTraceOptions {
  endpoint: Endpoint;
  response?: (HttpExecutionResponse & { error?: string }) | (GrpcExecutionResponse & { error?: string }) | null;
  executedMeta?: ExecutedRequestMeta | null;
  draftConfig?: Record<string, any> | null;
  variables?: Record<string, string>;
}

/**
 * Substitutes {{VARIABLE_NAME}} tokens with values from the variables map (case-insensitive fallback).
 */
export function substituteVariables(
  text: string,
  variables?: Record<string, string>
): string {
  if (typeof text !== 'string') return String(text ?? '');
  if (!text || !variables || Object.keys(variables).length === 0) return text;
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    const rawKey = key.trim();
    if (rawKey in variables) return variables[rawKey];
    const lowerKey = rawKey.toLowerCase();
    for (const [k, v] of Object.entries(variables)) {
      if (k.toLowerCase() === lowerKey) return v;
    }
    return match;
  });
}

/**
 * Extracts connected IP/host and port from underlying socket/transport error strings
 * when template variables were unresolvable in the environment.
 */
export function extractAddressFromError(rawError?: string): string | null {
  if (!rawError) return null;
  const m =
    rawError.match(/(?:tcp connect error|connect error|failed to connect to|target machine|failed to connect)\D*?(\b(?:\d{1,3}\.){3}\d{1,3}:\d+|\blocalhost:\d+|\[[a-fA-F0-9:]+\]:\d+)/i) ||
    rawError.match(/(\b(?:\d{1,3}\.){3}\d{1,3}:\d+)/);
  return m ? m[1] : null;
}

/**
 * Formats full execution trace for clipboard copy.
 * Captures endpoint, method/protocol, timestamp, status code, request params,
 * request headers, sanitized request body (filename/filesize only for multipart/binary),
 * and error details.
 */
export function formatCopyTrace(options: FormatCopyTraceOptions): string {
  const { endpoint, response, executedMeta, draftConfig, variables } = options;
  const effectiveConfig = getEffectiveEndpointConfig(endpoint, draftConfig);
  const isHttp = endpoint.protocol === 'http';
  const lines: string[] = [];

  if (isHttp) {
    const rawUrl = executedMeta?.http?.url || effectiveConfig.url || 'https://httpbin.org/get';
    let url = substituteVariables(rawUrl, variables);
    if (url.includes('{{')) {
      const fallbackAddr = extractAddressFromError(response?.error);
      if (fallbackAddr) {
        url = url.replace(/\{\{\s*[\w.-]+\s*\}\}/g, fallbackAddr);
      }
    }
    lines.push(`Endpoint: ${url}`);

    const method = (executedMeta?.http?.method || effectiveConfig.method || 'GET').toUpperCase();
    lines.push(`HTTP Method: ${method}`);

    const time = executedMeta?.timestamp || new Date().toISOString();
    lines.push(`Time: ${time}`);

    const code = response?.status_code ?? 0;
    const statusText =
      (response as HttpExecutionResponse)?.status_text ||
      (code === 0 ? 'Execution Failed' : '');
    const statusInfo = formatStatusCode('http', code, statusText);
    lines.push(`Status: ${statusInfo.label}`);

    lines.push('Request Body:');
    const body = executedMeta?.http?.body ?? effectiveConfig.body;
    const bodyType = executedMeta?.http?.bodyType ?? effectiveConfig.body_type;
    lines.push(formatTraceRequestBody(body, bodyType));

    lines.push('Request Param:');
    const params = executedMeta?.http?.queryParams || effectiveConfig.query_params || [];
    const validParams = (params as [string, string][]).filter(([k]) => k && String(k).trim());
    if (validParams.length > 0) {
      for (const [k, v] of validParams) {
        const paramKey = substituteVariables(String(k), variables);
        const paramVal = substituteVariables(String(v ?? ''), variables);
        lines.push(`  ${paramKey}: ${paramVal}`);
      }
    } else {
      lines.push('  (none)');
    }

    lines.push('Request Header:');
    const headers = executedMeta?.http?.headers || effectiveConfig.headers || {};
    const headerEntries = Object.entries(headers).filter(([k]) => k && k.trim());
    if (headerEntries.length > 0) {
      for (const [k, v] of headerEntries) {
        const headerKey = substituteVariables(String(k), variables);
        const headerVal = substituteVariables(String(v ?? ''), variables);
        lines.push(`  ${headerKey}: ${headerVal}`);
      }
    } else {
      lines.push('  (none)');
    }
  } else {
    // gRPC
    const rawServer = executedMeta?.grpc?.serverAddress || effectiveConfig.server_address || '';
    let server = substituteVariables(rawServer, variables);
    if (server.includes('{{')) {
      const fallbackAddr = extractAddressFromError(response?.error);
      if (fallbackAddr) {
        server = fallbackAddr;
      }
    }
    lines.push(`Endpoint: ${server}`);
    lines.push('Protocol: gRPC');

    const service = executedMeta?.grpc?.service || effectiveConfig.service || '';
    const rpcMethod = executedMeta?.grpc?.method || effectiveConfig.method || '';
    if (service) lines.push(`RPC Service: ${service}`);
    if (rpcMethod) lines.push(`RPC Method: ${rpcMethod}`);

    const time = executedMeta?.timestamp || new Date().toISOString();
    lines.push(`Time: ${time}`);

    const code = response?.status_code ?? 14;
    const statusText =
      (response as GrpcExecutionResponse)?.status_message ||
      (code === 0 ? 'OK' : 'Execution Failed');
    const statusInfo = formatStatusCode('grpc', code, statusText);
    lines.push(`Status: ${statusInfo.label}`);

    lines.push('Request Body:');
    const payload = executedMeta?.grpc?.payload ?? effectiveConfig.payload;
    if (payload !== undefined && payload !== null) {
      const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      lines.push(jsonStr.split('\n').map((l) => `  ${l}`).join('\n'));
    } else {
      lines.push('  (empty)');
    }

    lines.push('Request Header:');
    const meta = executedMeta?.grpc?.metadata || effectiveConfig.metadata || {};
    const metaEntries = Object.entries(meta).filter(([k]) => k && k.trim());
    if (metaEntries.length > 0) {
      for (const [k, v] of metaEntries) {
        const metaKey = substituteVariables(String(k), variables);
        const metaVal = substituteVariables(String(v ?? ''), variables);
        lines.push(`  ${metaKey}: ${metaVal}`);
      }
    } else {
      lines.push('  (none)');
    }
  }

  if (response?.error) {
    const parsedErr = formatExecutionError(response.error, response.status_code);
    lines.push(`Error: ${parsedErr.title} - ${parsedErr.summary}`);
    if (parsedErr.details || response.error) {
      lines.push('Details:');
      lines.push(parsedErr.details || response.error);
    }
  }

  return lines.join('\n');
}

