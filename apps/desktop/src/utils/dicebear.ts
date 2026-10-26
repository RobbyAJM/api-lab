export const DICEBEAR_STYLES = [
  'bottts',
  'lorelei',
  'avataaars',
  'identicon',
  'shapes',
  'thumbs',
] as const;

export type DiceBearStyle = (typeof DICEBEAR_STYLES)[number];

export interface ParsedAvatar {
  style: DiceBearStyle;
  seed: string;
}

export function parseAvatar(raw?: string | null): ParsedAvatar {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { style: 'bottts', seed: 'api-lab' };
  }

  const parts = raw.split(':');
  if (parts.length >= 2) {
    const styleCandidate = parts[0].toLowerCase().trim() as DiceBearStyle;
    const seed = parts.slice(1).join(':').trim() || 'api-lab';
    if (DICEBEAR_STYLES.includes(styleCandidate)) {
      return { style: styleCandidate, seed };
    }
  }

  return { style: 'bottts', seed: raw.trim() };
}

export function formatAvatar(style: string, seed: string): string {
  const safeStyle = DICEBEAR_STYLES.includes(style as DiceBearStyle) ? style : 'bottts';
  const safeSeed = seed.trim() || 'api-lab';
  return `${safeStyle}:${safeSeed}`;
}

export function getDiceBearUrl(avatarOrStyle: string, seedParam?: string): string {
  let style: string;
  let seed: string;

  if (seedParam !== undefined) {
    style = avatarOrStyle;
    seed = seedParam;
  } else {
    const parsed = parseAvatar(avatarOrStyle);
    style = parsed.style;
    seed = parsed.seed;
  }

  const safeStyle = DICEBEAR_STYLES.includes(style as DiceBearStyle) ? style : 'bottts';
  const encoded = encodeURIComponent(seed.trim() || 'api-lab');
  return `https://api.dicebear.com/9.x/${safeStyle}/svg?seed=${encoded}`;
}

export function generateRandomSeed(): string {
  return Math.random().toString(36).substring(2, 10);
}
