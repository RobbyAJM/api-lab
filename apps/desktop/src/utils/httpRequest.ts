export type HttpBodyType = 'none' | 'json' | 'text' | 'form' | 'multipart' | 'binary';

export type QueryParamRow = [string, string, string?, boolean?];

function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function encodeQueryParamComponent(value: string): string {
  // Preserve {{variable}} templates unencoded so variable highlighting works in UI
  const tokens: string[] = [];
  const tokenized = value.replace(/\{\{[^}]+\}\}/g, (match) => {
    tokens.push(match);
    return `__API_LAB_VAR_${tokens.length - 1}__`;
  });
  const encoded = encodeURIComponent(tokenized);
  return encoded.replace(/__API_LAB_VAR_(\d+)__/g, (_, idx) => tokens[Number(idx)] || '');
}

export function serializeQueryParams(params: QueryParamRow[]): string {
  const active = params.filter(
    ([k, _v, _d, enabled]) => enabled !== false && k !== undefined && k !== null && k.trim() !== ''
  );
  if (active.length === 0) return '';

  return active
    .map(([k, v]) => {
      const encKey = encodeQueryParamComponent(k.trim());
      const encVal = encodeQueryParamComponent(v ?? '');
      return `${encKey}=${encVal}`;
    })
    .join('&');
}

export function serializeQueryParamsToUrl(rawUrl: string, params: QueryParamRow[]): string {
  const hashIndex = rawUrl.indexOf('#');
  const hash = hashIndex >= 0 ? rawUrl.slice(hashIndex) : '';
  const urlWithoutHash = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;

  const questionIndex = urlWithoutHash.indexOf('?');
  const base = questionIndex >= 0 ? urlWithoutHash.slice(0, questionIndex) : urlWithoutHash;

  const queryString = serializeQueryParams(params);
  if (!queryString) {
    return `${base}${hash}`;
  }
  return `${base}?${queryString}${hash}`;
}

export function parseUrlQueryParams(
  url: string,
  existingParams: QueryParamRow[] = []
): QueryParamRow[] {
  const disabledParams = existingParams.filter(
    ([_, __, ___, enabled]) => enabled === false
  );
  const activeExisting = existingParams.filter(
    ([_, __, ___, enabled]) => enabled !== false
  );

  const question = url.indexOf('?');
  if (question < 0) {
    // ponytail: keep disabled params when URL query stripped so user toggle history isn't erased
    return disabledParams.map(([k, v, d]) => [k, v, d ?? '', false] as QueryParamRow);
  }

  const raw = url.slice(question + 1).split('#', 1)[0];
  if (!raw) {
    return disabledParams.map(([k, v, d]) => [k, v, d ?? '', false] as QueryParamRow);
  }

  const parsedActive: QueryParamRow[] = [];
  const usedExistingIndices = new Set<number>();

  for (const part of raw.split('&')) {
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    let rawKey = '';
    let rawVal = '';
    if (eqIdx >= 0) {
      rawKey = part.slice(0, eqIdx);
      rawVal = part.slice(eqIdx + 1);
    } else {
      rawKey = part;
      rawVal = '';
    }

    if (!rawKey) continue;

    const key = decodeQueryComponent(rawKey.replace(/\+/g, ' '));
    const val = decodeQueryComponent(rawVal.replace(/\+/g, ' '));

    let matchedDesc = '';
    for (let i = 0; i < activeExisting.length; i++) {
      if (!usedExistingIndices.has(i) && activeExisting[i][0] === key) {
        usedExistingIndices.add(i);
        matchedDesc = activeExisting[i][2] ?? '';
        break;
      }
    }

    parsedActive.push([key, val, matchedDesc, true]);
  }

  return [...parsedActive, ...disabledParams.map(([k, v, d]) => [k, v, d ?? '', false] as QueryParamRow)];
}

export function splitUrlQuery(url: string): { url: string; params: [string, string][] } {
  const question = url.indexOf('?');
  if (question < 0) return { url, params: [] };

  const base = url.slice(0, question);
  const raw = url.slice(question + 1).split('#', 1)[0];
  const params: [string, string][] = [];
  for (const part of raw.split('&')) {
    if (!part) continue;
    const [key, ...value] = part.split('=');
    if (!key) continue;
    params.push([
      decodeQueryComponent(key.replace(/\+/g, ' ')),
      decodeQueryComponent(value.join('=').replace(/\+/g, ' ')),
    ]);
  }
  return { url: base, params };
}
