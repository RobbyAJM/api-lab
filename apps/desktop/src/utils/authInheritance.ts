import type {
  CollectionSettings,
  CollectionAuthSettings,
  HttpExecutionRequest,
  GrpcExecutionRequest,
} from '@api-lab/api-types';

function substitute(val: string, vars?: Record<string, string>): string {
  if (!val || !vars) return val;
  return val.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Resolves inherited authorization for HTTP requests.
 * If endpoint auth is 'inherit' (or empty/undefined), injects credentials from collectionSettings.auth.
 */
export function applyInheritedHttpAuth(
  req: HttpExecutionRequest,
  settings?: CollectionSettings,
  variables?: Record<string, string>
): HttpExecutionRequest {
  const reqClone: HttpExecutionRequest = {
    ...req,
    headers: { ...req.headers },
  };

  const endpointAuthType = reqClone.auth?.auth_type?.toLowerCase();

  // If endpoint explicitly defines own auth other than 'inherit' and not 'none', keep it
  if (endpointAuthType && endpointAuthType !== 'inherit' && endpointAuthType !== 'none') {
    return reqClone;
  }

  // If endpoint is explicitly 'none' and NOT 'inherit', don't inject
  if (endpointAuthType === 'none' && reqClone.auth && (reqClone.auth as any).is_explicit_none) {
    return reqClone;
  }

  const collectionAuth: CollectionAuthSettings | undefined = settings?.auth;
  if (!collectionAuth || collectionAuth.auth_type === 'none') {
    return reqClone;
  }

  const authType = collectionAuth.auth_type;

  if (authType === 'bearer' && collectionAuth.token) {
    let token = substitute(collectionAuth.token.trim(), variables).trim();
    const authVal = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
    reqClone.headers['Authorization'] = authVal;
  } else if (authType === 'basic') {
    const user = substitute(collectionAuth.username || '', variables);
    const pass = substitute(collectionAuth.password || '', variables);
    const b64 =
      typeof btoa === 'function'
        ? btoa(`${user}:${pass}`)
        : (globalThis as any).Buffer?.from(`${user}:${pass}`).toString('base64') || '';
    reqClone.headers['Authorization'] = `Basic ${b64}`;
  } else if (authType === 'custom' && collectionAuth.header_name && collectionAuth.header_value) {
    const name = substitute(collectionAuth.header_name, variables);
    const val = substitute(collectionAuth.header_value, variables);
    reqClone.headers[name] = val;
  }

  return reqClone;
}

/**
 * Resolves inherited authorization for gRPC requests.
 * Injects collection auth token into gRPC metadata (authorization header or custom header).
 */
export function applyInheritedGrpcAuth(
  req: GrpcExecutionRequest,
  settings?: CollectionSettings,
  variables?: Record<string, string>
): GrpcExecutionRequest {
  const reqClone: GrpcExecutionRequest = {
    ...req,
    metadata: { ...req.metadata },
  };

  const collectionAuth: CollectionAuthSettings | undefined = settings?.auth;
  if (!collectionAuth || collectionAuth.auth_type === 'none') {
    return reqClone;
  }

  const authType = collectionAuth.auth_type;

  // Don't overwrite if endpoint already has explicit non-empty authorization metadata key
  if (authType === 'bearer' && collectionAuth.token) {
    const existing = reqClone.metadata['authorization'] || reqClone.metadata['Authorization'];
    if (!existing || !existing.trim()) {
      const token = substitute(collectionAuth.token.trim(), variables).trim();
      const authVal = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
      reqClone.metadata['authorization'] = authVal;
    }
  } else if (authType === 'custom' && collectionAuth.header_name && collectionAuth.header_value) {
    const name = substitute(collectionAuth.header_name.trim(), variables).trim().toLowerCase();
    const existing = reqClone.metadata[name];
    if (!existing || !existing.trim()) {
      const val = substitute(collectionAuth.header_value.trim(), variables).trim();
      reqClone.metadata[name] = val;
    }
  }

  return reqClone;
}
