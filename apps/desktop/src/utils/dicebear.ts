export const DICEBEAR_STYLES = [
  'bottts',
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

  const queryIndex = baseStr.indexOf('?');
  if (queryIndex !== -1) {
    const queryPart = baseStr.substring(queryIndex + 1);
    baseStr = baseStr.substring(0, queryIndex);
    const params = new URLSearchParams(queryPart);

    const bg = params.get('backgroundColor');
    if (bg) options.backgroundColor = bg;

    const rad = params.get('radius');
    if (rad !== null) {
      const parsedRad = parseInt(rad, 10);
      if (!isNaN(parsedRad)) options.radius = parsedRad;
    }

    const flip = params.get('flip');
    if (flip !== null) {
      options.flip = flip === 'true';
    }

    const rot = params.get('rotate');
    if (rot !== null) {
      const parsedRot = parseInt(rot, 10);
      if (!isNaN(parsedRot)) options.rotate = parsedRot;
    }
  }

  const parts = baseStr.split(':');
  if (parts.length >= 2) {
    const styleCandidate = parts[0].toLowerCase().trim() as DiceBearStyle;
    const seed = parts.slice(1).join(':').trim() || 'api-lab';
    if (DICEBEAR_STYLES.includes(styleCandidate)) {
      return { style: styleCandidate, seed, options };
    }
  }

  return { style: 'bottts', seed: baseStr, options };
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

  const query = params.toString();
  return query ? `${safeStyle}:${safeSeed}?${query}` : `${safeStyle}:${safeSeed}`;
}

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

  return `https://api.dicebear.com/9.x/${safeStyle}/svg?${params.toString()}`;
}

export function generateRandomSeed(): string {
  return Math.random().toString(36).substring(2, 10);
}
