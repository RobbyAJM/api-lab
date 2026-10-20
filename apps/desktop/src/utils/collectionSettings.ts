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
 * 1. Shared collection headers
 * 2. Shared authorization
 * 3. Default timeout
 */
export function applyCollectionSettingsToHttp(
  req: HttpExecutionRequest,
  settings?: CollectionSettings,
  variables?: Record<string, string>
): HttpExecutionRequest {
  if (!settings) return req;

  // 1. Resolve Headers
  const resolvedHeaders = applyInheritedHeaders(req.headers, settings.headers, variables);

  const reqWithHeaders: HttpExecutionRequest = {
    ...req,
    headers: resolvedHeaders,
    timeout_ms: req.timeout_ms || (settings.timeout_ms && settings.timeout_ms > 0 ? settings.timeout_ms : undefined),
  };

  // 2. Resolve Auth
  return applyInheritedHttpAuth(reqWithHeaders, settings, variables);
}

/**
 * Resolves all collection settings for gRPC:
 * 1. Shared collection metadata headers
 * 2. Shared authorization
 * 3. Default timeout
 */
export function applyCollectionSettingsToGrpc(
  req: GrpcExecutionRequest,
  settings?: CollectionSettings,
  variables?: Record<string, string>
): GrpcExecutionRequest {
  if (!settings) return req;

  // 1. Resolve Metadata / Headers
  const resolvedMetadata = applyInheritedHeaders(req.metadata, settings.headers, variables);

  const reqWithMeta: GrpcExecutionRequest = {
    ...req,
    metadata: resolvedMetadata,
    timeout_ms: req.timeout_ms || (settings.timeout_ms && settings.timeout_ms > 0 ? settings.timeout_ms : undefined),
  };

  // 2. Resolve Auth
  return applyInheritedGrpcAuth(reqWithMeta, settings, variables);
}
