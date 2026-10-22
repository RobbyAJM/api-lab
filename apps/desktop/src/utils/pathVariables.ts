/**
 * Standalone path variables utilities.
 * Handles extracting :param from URLs, interpolating values, and converting Swagger {param} patterns.
 */

/**
 * Converts Swagger/OpenAPI path template pattern `{id}` into `:id`.
 * E.g. `/manager/api/v1/emergency-contact-status/{id}` -> `/manager/api/v1/emergency-contact-status/:id`
 */
export function convertSwaggerPathToApiPath(path: string): string {
  if (!path) return '';
  return path.replace(/\{([a-zA-Z0-9_]+)\}/g, ':$1');
}

/**
 * Extracts URL path part, stripping scheme, host:port, query string, and hash.
 */
export function getUrlPathOnly(url: string): string {
  if (!url) return '';
  let u = url.trim();

  // Strip query and hash
  const qIdx = u.indexOf('?');
  if (qIdx !== -1) u = u.slice(0, qIdx);
  const hIdx = u.indexOf('#');
  if (hIdx !== -1) u = u.slice(0, hIdx);

  // Strip protocol and host
  const schemeIdx = u.indexOf('://');
  if (schemeIdx !== -1) {
    const afterScheme = u.slice(schemeIdx + 3);
    const slashIdx = afterScheme.indexOf('/');
    if (slashIdx === -1) return '';
    return afterScheme.slice(slashIdx);
  }

  // Handle variable base like {{BASE_URL}}/path or relative /path
  const firstSlash = u.indexOf('/');
  if (firstSlash !== -1 && !u.startsWith('/')) {
    // If there is host:port before slash
    const prefix = u.slice(0, firstSlash);
    if (!prefix.includes('{{') && (prefix.includes('.') || prefix.includes(':'))) {
      return u.slice(firstSlash);
    }
  }

  return u;
}

/**
 * Extracts unique path variable keys from URL.
 * Matches `:paramName` only in the URL path (ignores host:port like localhost:8080).
 */
export function extractPathVariables(url: string): string[] {
  const path = getUrlPathOnly(url);
  if (!path) return [];

  // Match :param preceded by start of string, slash, or delimiter
  const regex = /(?:^|\/):([a-zA-Z0-9_]+)/g;
  const matches: string[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(path)) !== null) {
    const key = match[1];
    if (key && !seen.has(key)) {
      seen.add(key);
      matches.push(key);
    }
  }

  return matches;
}

/**
 * Interpolates path variable values into URL path.
 * Replaces `:key` with value when followed by `/`, `?`, `#`, or end of string.
 */
export function interpolatePathVariables(
  url: string,
  pathVariables: Array<[string, string, string?]> | Record<string, string>
): string {
  if (!url) return '';

  const entries: [string, string][] = Array.isArray(pathVariables)
    ? pathVariables.map(([k, v]) => [k, v ?? ''])
    : Object.entries(pathVariables);

  if (entries.length === 0) return url;

  // Split URL into pre-path, path, and post-path (query/hash)
  let prefix = '';
  let pathAndRest = url;

  const schemeIdx = url.indexOf('://');
  if (schemeIdx !== -1) {
    const afterScheme = url.slice(schemeIdx + 3);
    const slashIdx = afterScheme.indexOf('/');
    if (slashIdx === -1) {
      prefix = url;
      pathAndRest = '';
    } else {
      prefix = url.slice(0, schemeIdx + 3 + slashIdx);
      pathAndRest = afterScheme.slice(slashIdx);
    }
  }

  let queryOrHash = '';
  const qIdx = pathAndRest.search(/[?#]/);
  let path = pathAndRest;
  if (qIdx !== -1) {
    path = pathAndRest.slice(0, qIdx);
    queryOrHash = pathAndRest.slice(qIdx);
  }

  // Replace each path variable in path only
  for (const [key, value] of entries) {
    if (!key.trim()) continue;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`:${escapedKey}(?=[/?#]|$)`, 'g');
    path = path.replace(pattern, value !== undefined ? value : `:${key}`);
  }

  return `${prefix}${path}${queryOrHash}`;
}

/**
 * Synchronizes existing path variable rows with keys extracted from URL.
 * Preserves user entered values and descriptions.
 */
export function syncPathVariablesWithKeys(
  existing: Array<[string, string, string?]>,
  keys: string[]
): Array<[string, string, string]> {
  const map = new Map<string, [string, string]>();
  for (const [k, v, d] of existing) {
    if (k) map.set(k, [v ?? '', d ?? '']);
  }

  return keys.map((key) => {
    const prev = map.get(key);
    return [key, prev ? prev[0] : '', prev ? prev[1] : ''];
  });
}
