// ponytail: custom arbitrary methods skipped; add when RFC 7231 extension methods or custom WebDAV methods are requested.

export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
  'HEAD',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface HttpMethodStyle {
  color: string;
  badge: string;
  badgeActive: string;
}

const METHOD_STYLES: Record<string, HttpMethodStyle> = {
  GET: {
    color: 'text-emerald-400',
    badge: 'text-emerald-400 bg-emerald-950/50 border-emerald-800/40',
    badgeActive: 'text-emerald-300 bg-emerald-900/60 border-emerald-700/60',
  },
  POST: {
    color: 'text-blue-400',
    badge: 'text-blue-400 bg-blue-950/50 border-blue-800/40',
    badgeActive: 'text-blue-300 bg-blue-900/60 border-blue-700/60',
  },
  PUT: {
    color: 'text-amber-400',
    badge: 'text-amber-400 bg-amber-950/50 border-amber-800/40',
    badgeActive: 'text-amber-300 bg-amber-900/60 border-amber-700/60',
  },
  DELETE: {
    color: 'text-rose-400',
    badge: 'text-rose-400 bg-rose-950/50 border-rose-800/40',
    badgeActive: 'text-rose-300 bg-rose-900/60 border-rose-700/60',
  },
  PATCH: {
    color: 'text-orange-400',
    badge: 'text-orange-400 bg-orange-950/50 border-orange-800/40',
    badgeActive: 'text-orange-300 bg-orange-900/60 border-orange-700/60',
  },
  OPTIONS: {
    color: 'text-purple-400',
    badge: 'text-purple-400 bg-purple-950/50 border-purple-800/40',
    badgeActive: 'text-purple-300 bg-purple-900/60 border-purple-700/60',
  },
  HEAD: {
    color: 'text-cyan-400',
    badge: 'text-cyan-400 bg-cyan-950/50 border-cyan-800/40',
    badgeActive: 'text-cyan-300 bg-cyan-900/60 border-cyan-700/60',
  },
};

const DEFAULT_STYLE: HttpMethodStyle = {
  color: 'text-zinc-400',
  badge: 'text-zinc-400 bg-zinc-900 border-zinc-800',
  badgeActive: 'text-zinc-200 bg-zinc-800 border-zinc-700',
};

export function normalizeHttpMethod(method: string): string {
  return (method || '').trim().toUpperCase();
}

export function isValidHttpMethod(method: string): method is HttpMethod {
  return HTTP_METHODS.includes(normalizeHttpMethod(method) as HttpMethod);
}

export function getHttpMethodStyle(method: string): HttpMethodStyle {
  const norm = normalizeHttpMethod(method);
  return METHOD_STYLES[norm] || DEFAULT_STYLE;
}

export function getHttpMethodColor(method: string): string {
  return getHttpMethodStyle(method).color;
}

export function getHttpMethodBadgeClass(method: string, isSelected = false): string {
  const style = getHttpMethodStyle(method);
  return isSelected ? style.badgeActive : style.badge;
}

export function navigateMethodIndex(
  currentIndex: number,
  direction: 'up' | 'down',
  total: number
): number {
  if (total <= 0) return 0;
  if (currentIndex < 0) return direction === 'down' ? 0 : total - 1;
  return direction === 'down'
    ? (currentIndex + 1) % total
    : (currentIndex - 1 + total) % total;
}

export function findMethodIndexByChar(
  char: string,
  methods: readonly string[] = HTTP_METHODS,
  startIndex = 0
): number {
  if (!char || methods.length === 0) return -1;
  const target = char.toUpperCase();
  const len = methods.length;
  for (let i = 1; i <= len; i++) {
    const idx = (startIndex + i) % len;
    if (methods[idx].startsWith(target)) {
      return idx;
    }
  }
  return -1;
}
