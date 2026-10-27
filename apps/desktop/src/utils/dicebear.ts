import { sanitizeExtraComponents } from './dicebearSchema.ts';

export const DICEBEAR_STYLES = [
  'bottts',
  'croodles-neutral',
  'croodles',
  'lorelei',
  'avataaars',
  'identicon',
  'shapes',
  'thumbs',
  'pixel-art',
  'notionists',
  'adventurer',
  'fun-emoji',
] as const;

export type DiceBearStyle = (typeof DICEBEAR_STYLES)[number];

export interface AvatarOptions {
  backgroundColor?: string;
  radius?: number;
  flip?: boolean;
  rotate?: number;
  scale?: number;
  extra?: Record<string, string>;
}

export interface ParsedAvatar {
  style: DiceBearStyle;
  seed: string;
  options: AvatarOptions;
}

export function parseAvatar(raw?: string | null): ParsedAvatar {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { style: 'bottts', seed: 'api-lab', options: {} };
  }

  let baseStr = raw.trim();
  const options: AvatarOptions = {};
  let queryParams: URLSearchParams | null = null;

  const queryIndex = baseStr.indexOf('?');
  if (queryIndex !== -1) {
    const queryPart = baseStr.substring(queryIndex + 1);
    baseStr = baseStr.substring(0, queryIndex);
    queryParams = new URLSearchParams(queryPart);

    const bg = queryParams.get('backgroundColor');
    if (bg) options.backgroundColor = bg;

    const rad = queryParams.get('radius');
    if (rad !== null) {
      const parsedRad = parseInt(rad, 10);
      if (!isNaN(parsedRad)) options.radius = parsedRad;
    }

    const flip = queryParams.get('flip');
    if (flip !== null) {
      options.flip = flip === 'true';
    }

    const rot = queryParams.get('rotate');
    if (rot !== null) {
      const parsedRot = parseInt(rot, 10);
      if (!isNaN(parsedRot)) options.rotate = parsedRot;
    }

    const sc = queryParams.get('scale');
    if (sc !== null) {
      const parsedSc = parseInt(sc, 10);
      if (!isNaN(parsedSc)) options.scale = parsedSc;
    }

    const extra: Record<string, string> = {};
    for (const [k, v] of queryParams.entries()) {
      if (!['backgroundColor', 'radius', 'flip', 'rotate', 'scale', 'seed'].includes(k) && v) {
        extra[k] = v;
      }
    }
    if (Object.keys(extra).length > 0) {
      options.extra = extra;
    }
  }

  // Handle DiceBear HTTP CDN URLs e.g. https://api.dicebear.com/10.x/avataaars/svg?seed=Felix
  const urlMatch = baseStr.match(/api\.dicebear\.com\/(?:[0-9]+\.x|[^\/]+)\/([^\/?#]+)/i);
  if (urlMatch) {
    const matchedStyle = urlMatch[1].toLowerCase().trim() as DiceBearStyle;
    const safeStyle = DICEBEAR_STYLES.includes(matchedStyle) ? matchedStyle : 'bottts';
    const seedParam = queryParams?.get('seed');
    const safeSeed = seedParam ? decodeURIComponent(seedParam).trim() : 'api-lab';
    const cleanExtra = sanitizeExtraComponents(safeStyle, options.extra);
    return {
      style: safeStyle,
      seed: safeSeed || 'api-lab',
      options: {
        ...options,
        extra: Object.keys(cleanExtra).length > 0 ? cleanExtra : undefined,
      },
    };
  }

  const parts = baseStr.split(':');
  if (parts.length >= 2) {
    const styleCandidate = parts[0].toLowerCase().trim() as DiceBearStyle;
    const seedFromQuery = queryParams?.get('seed');
    const seed = seedFromQuery
      ? decodeURIComponent(seedFromQuery).trim()
      : parts.slice(1).join(':').trim() || 'api-lab';

    if (DICEBEAR_STYLES.includes(styleCandidate)) {
      const cleanExtra = sanitizeExtraComponents(styleCandidate, options.extra);
      return {
        style: styleCandidate,
        seed,
        options: {
          ...options,
          extra: Object.keys(cleanExtra).length > 0 ? cleanExtra : undefined,
        },
      };
    }
  }

  const cleanExtra = sanitizeExtraComponents('bottts', options.extra);
  return {
    style: 'bottts',
    seed: baseStr,
    options: {
      ...options,
      extra: Object.keys(cleanExtra).length > 0 ? cleanExtra : undefined,
    },
  };
}

export function formatAvatar(
  style: string,
  seed: string,
  options?: AvatarOptions
): string {
  const safeStyle = DICEBEAR_STYLES.includes(style as DiceBearStyle) ? style : 'bottts';
  const safeSeed = seed.trim() || 'api-lab';

  const params = new URLSearchParams();
  if (options?.backgroundColor) params.set('backgroundColor', options.backgroundColor);
  if (options?.radius !== undefined && options.radius > 0) params.set('radius', String(options.radius));
  if (options?.flip) params.set('flip', 'true');
  if (options?.rotate !== undefined && options.rotate > 0) params.set('rotate', String(options.rotate));
  if (options?.scale !== undefined && options.scale !== 100) params.set('scale', String(options.scale));

  const cleanExtra = sanitizeExtraComponents(safeStyle, options?.extra);
  for (const [k, v] of Object.entries(cleanExtra)) {
    if (v) params.set(k, v);
  }

  const query = params.toString();
  return query ? `${safeStyle}:${safeSeed}?${query}` : `${safeStyle}:${safeSeed}`;
}

// ponytail: DiceBear HTTP API used directly; upgrade to @dicebear/core when 100% offline avatar rendering is required
export function getDiceBearUrl(
  avatarOrStyle: string,
  seedParam?: string,
  optionsParam?: AvatarOptions
): string {
  let style: string;
  let seed: string;
  let options: AvatarOptions = {};

  if (seedParam !== undefined) {
    style = avatarOrStyle;
    seed = seedParam;
    options = optionsParam || {};
  } else {
    const parsed = parseAvatar(avatarOrStyle);
    style = parsed.style;
    seed = parsed.seed;
    options = parsed.options;
  }

  const safeStyle = DICEBEAR_STYLES.includes(style as DiceBearStyle) ? style : 'bottts';
  const encodedSeed = encodeURIComponent(seed.trim() || 'api-lab');

  const params = new URLSearchParams();
  params.set('seed', encodedSeed);

  if (options.backgroundColor) {
    params.set('backgroundColor', options.backgroundColor);
  }
  if (options.radius !== undefined && options.radius > 0) {
    params.set('radius', String(options.radius));
  }
  if (options.flip) {
    params.set('flip', 'true');
  }
  if (options.rotate !== undefined && options.rotate > 0) {
    params.set('rotate', String(options.rotate));
  }
  if (options.scale !== undefined && options.scale !== 100) {
    params.set('scale', String(options.scale));
  }

  const cleanExtra = sanitizeExtraComponents(safeStyle, options.extra);
  for (const [k, v] of Object.entries(cleanExtra)) {
    if (v) params.set(k, v);
  }

  return `https://api.dicebear.com/10.x/${safeStyle}/svg?${params.toString()}`;
}

export function generateRandomSeed(): string {
  return Math.random().toString(36).substring(2, 10);
}
