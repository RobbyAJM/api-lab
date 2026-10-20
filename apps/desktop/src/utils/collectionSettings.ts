import type {
  CollectionSettings,
  CollectionHeaderSetting,
  HttpExecutionRequest,
  GrpcExecutionRequest,
} from '@api-lab/api-types';
import { applyInheritedHttpAuth, applyInheritedGrpcAuth } from './authInheritance.ts';

function substitute(val: string, vars?: Record<string, string>): string {
  if (!val || !vars) return val;
  return val.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Combines an endpoint's relative URL with a collection's base URL.
 * If endpoint URL is already absolute (http://, https://, etc.) or baseUrl is blank, returns original url.
 */
export function resolveEndpointUrl(
  url: string,
  baseUrl?: string,
  variables?: Record<string, string>
): string {
  const trimmedUrl = (url || '').trim();
  const trimmedBase = (baseUrl || '').trim();

  if (!trimmedBase) {
    return trimmedUrl;
  }

  const subBase = substitute(trimmedBase, variables).trim();
  const subUrl = substitute(trimmedUrl, variables).trim();

  // If endpoint URL is already absolute, do not prepend baseUrl
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(subUrl)) {
    return subUrl;
  }

  const baseHasSlash = subBase.endsWith('/');
  const urlHasSlash = subUrl.startsWith('/');

  if (baseHasSlash && urlHasSlash) {
    return `${subBase}${subUrl.slice(1)}`;
  }
  if (!baseHasSlash && !urlHasSlash) {
    return `${subBase}/${subUrl}`;
  }
  return `${subBase}${subUrl}`;
}

/**
 * Injects enabled collection-level headers into the request header dictionary
 * only if the request does not already define that header (case-insensitive check).
 */
export function applyInheritedHeaders(
  headers: Record<string, string>,
  collectionHeaders?: CollectionHeaderSetting[],
  variables?: Record<string, string>
): Record<string, string> {
  const out = { ...headers };
  if (!collectionHeaders || collectionHeaders.length === 0) {
    return out;
  }

  // Set of lowercase keys already present in request
  const existingKeys = new Set(Object.keys(out).map((k) => k.toLowerCase()));

  for (const item of collectionHeaders) {
    if (item.enabled === false) continue;
    const rawKey = item.key?.trim();
    if (!rawKey) continue;

    const lowerKey = rawKey.toLowerCase();
    if (!existingKeys.has(lowerKey)) {
      const key = substitute(rawKey, variables);
      const val = substitute(item.value || '', variables);
      out[key] = val;
      existingKeys.add(lowerKey);
    }
  }

  return out;
}

/**
 * Resolves all collection settings for HTTP:
 * 1. Base URL prefixing for relative paths
 * 2. Shared collection headers
 * 3. Shared authorization
 * 4. Default timeout
 */
export function applyCollectionSettingsToHttp(
  req: HttpExecutionRequest,
  settings?: CollectionSettings,
  variables?: Record<string, string>
): HttpExecutionRequest {
  if (!settings) return req;

  // 1. Resolve URL
  let resolvedUrl = req.url;
  if (settings.base_url) {
    resolvedUrl = resolveEndpointUrl(req.url, settings.base_url, variables);
  }

  // 2. Resolve Headers
  const resolvedHeaders = applyInheritedHeaders(req.headers, settings.headers, variables);

  const reqWithUrlAndHeaders: HttpExecutionRequest = {
    ...req,
    url: resolvedUrl,
    headers: resolvedHeaders,
    timeout_ms: req.timeout_ms || (settings.timeout_ms && settings.timeout_ms > 0 ? settings.timeout_ms : undefined),
  };

  // 3. Resolve Auth
  return applyInheritedHttpAuth(reqWithUrlAndHeaders, settings, variables);
}

/**
 * Resolves all collection settings for gRPC:
 * 1. Default server address
 * 2. Shared collection metadata headers
 * 3. Shared authorization
 * 4. Default timeout
 */
export function applyCollectionSettingsToGrpc(
  req: GrpcExecutionRequest,
  settings?: CollectionSettings,
  variables?: Record<string, string>
): GrpcExecutionRequest {
  if (!settings) return req;

  // 1. Fallback Server Address if empty
  let resolvedAddress = req.server_address;
  if (!resolvedAddress?.trim() && settings.base_url) {
    resolvedAddress = substitute(settings.base_url.trim(), variables).trim();
  }

  // 2. Resolve Metadata / Headers
  const resolvedMetadata = applyInheritedHeaders(req.metadata, settings.headers, variables);

  const reqWithMeta: GrpcExecutionRequest = {
    ...req,
    server_address: resolvedAddress,
    metadata: resolvedMetadata,
    timeout_ms: req.timeout_ms || (settings.timeout_ms && settings.timeout_ms > 0 ? settings.timeout_ms : undefined),
  };

  // 3. Resolve Auth
  return applyInheritedGrpcAuth(reqWithMeta, settings, variables);
}
