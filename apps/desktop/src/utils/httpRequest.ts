export type HttpBodyType = 'none' | 'json' | 'text' | 'form' | 'multipart' | 'binary';

function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
