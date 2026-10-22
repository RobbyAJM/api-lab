export interface ThemePalette {
  neutral: string;
  ink: string;
  primary: string;
  accent?: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  isLight?: boolean;
  palette: ThemePalette;
  overrides?: Record<string, string>;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RgbColor {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (clean.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function blendRgb(from: RgbColor, to: RgbColor, weight: number): RgbColor {
  const w = Math.max(0, Math.min(1, weight));
  return {
    r: Math.round(from.r + (to.r - from.r) * w),
    g: Math.round(from.g + (to.g - from.g) * w),
    b: Math.round(from.b + (to.b - from.b) * w),
  };
}

export function formatRgbSpace(color: RgbColor): string {
  return `${color.r} ${color.g} ${color.b}`;
}

export const DEFAULT_THEME_ID = 'api-lab';

export function sortThemes(themes: ThemeDefinition[]): ThemeDefinition[] {
  return [...themes].sort((a, b) => {
    if (a.id === DEFAULT_THEME_ID) return -1;
    if (b.id === DEFAULT_THEME_ID) return 1;

    const aLight = Boolean(a.isLight);
    const bLight = Boolean(b.isLight);
    if (aLight !== bLight) {
      return aLight ? 1 : -1;
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

const RAW_THEMES: ThemeDefinition[] = [
  {
    id: 'api-lab',
    name: 'API Lab Mineral (Default)',
    palette: {
      neutral: '#111317',
      ink: '#e4e4e7',
      primary: '#4f46e5',
      accent: '#6366f1',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#06b6d4',
    },
    overrides: {
      'zinc-950': '#0b0c0e',
      'zinc-900': '#111317',
      'zinc-850': '#16191f',
      'zinc-800': '#20242c',
      'zinc-750': '#292e39',
      'zinc-700': '#353c4a',
      'zinc-600': '#52525b',
      'zinc-500': '#71717a',
      'zinc-400': '#a1a1aa',
      'zinc-300': '#d4d4d8',
      'zinc-200': '#e4e4e7',
      'zinc-100': '#f4f4f5',
      primary: '#4f46e5',
      'primary-hover': '#4338ca',
      secondary: '#6366f1',
      'secondary-hover': '#4f46e5',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    palette: {
      neutral: '#1d1e28',
      ink: '#f8f8f2',
      primary: '#bd93f9',
      accent: '#ff79c6',
      success: '#50fa7b',
      warning: '#ffb86c',
      error: '#ff5555',
      info: '#8be9fd',
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    palette: {
      neutral: '#1e1e2e',
      ink: '#cdd6f4',
      primary: '#b4befe',
      accent: '#f38ba8',
      success: '#a6e3a1',
      warning: '#f9e2af',
      error: '#f38ba8',
      info: '#89dceb',
    },
  },
  {
    id: 'catppuccin-frappe',
    name: 'Catppuccin Frappé',
    palette: {
      neutral: '#303446',
      ink: '#c6d0f5',
      primary: '#babbf1',
      accent: '#ea999c',
      success: '#a6d189',
      warning: '#e5c890',
      error: '#e78284',
      info: '#99d1db',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    palette: {
      neutral: '#2e3440',
      ink: '#e5e9f0',
      primary: '#88c0d0',
      accent: '#d57780',
      success: '#a3be8c',
      warning: '#d08770',
      error: '#bf616a',
      info: '#81a1c1',
    },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    palette: {
      neutral: '#282c34',
      ink: '#abb2bf',
      primary: '#61afef',
      accent: '#56b6c2',
      success: '#98c379',
      warning: '#e5c07b',
      error: '#e06c75',
      info: '#d19a66',
    },
  },
  {
    id: 'tokyonight',
    name: 'Tokyo Night',
    palette: {
      neutral: '#1a1b26',
      ink: '#c0caf5',
      primary: '#7aa2f7',
      accent: '#ff9e64',
      success: '#9ece6a',
      warning: '#e0af68',
      error: '#f7768e',
      info: '#7dcfff',
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox Dark',
    palette: {
      neutral: '#282828',
      ink: '#ebdbb2',
      primary: '#fe8019',
      accent: '#d3869b',
      success: '#b8bb26',
      warning: '#fabd2f',
      error: '#fb4934',
      info: '#83a598',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    palette: {
      neutral: '#272822',
      ink: '#f8f8f2',
      primary: '#66d9ef',
      accent: '#fd971f',
      success: '#a6e22e',
      warning: '#e6db74',
      error: '#f92672',
      info: '#ae81ff',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    palette: {
      neutral: '#002b36',
      ink: '#839496',
      primary: '#268bd2',
      accent: '#2aa198',
      success: '#859900',
      warning: '#b58900',
      error: '#dc322f',
      info: '#6c71c4',
    },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    palette: {
      neutral: '#0d1117',
      ink: '#e6edf3',
      primary: '#2f81f7',
      accent: '#a371f7',
      success: '#3fb950',
      warning: '#d29922',
      error: '#f85149',
      info: '#58a6ff',
    },
  },
  {
    id: 'everforest',
    name: 'Everforest Dark',
    palette: {
      neutral: '#2d353b',
      ink: '#d3c6aa',
      primary: '#a7c080',
      accent: '#7fbbb3',
      success: '#83c092',
      warning: '#dbbc7f',
      error: '#e67e80',
      info: '#d699b6',
    },
  },
  {
    id: 'kanagawa',
    name: 'Kanagawa',
    palette: {
      neutral: '#1f1f28',
      ink: '#dcd7ba',
      primary: '#7e9cd8',
      accent: '#957fb8',
      success: '#76946a',
      warning: '#c0a36e',
      error: '#c34043',
      info: '#6a9589',
    },
  },
  {
    id: 'vesper',
    name: 'Vesper',
    palette: {
      neutral: '#101010',
      ink: '#ffffff',
      primary: '#ffc799',
      accent: '#ca9ee6',
      success: '#99ffe4',
      warning: '#ffc799',
      error: '#ff8080',
      info: '#acd157',
    },
  },
  {
    id: 'matrix',
    name: 'Matrix',
    palette: {
      neutral: '#0d110d',
      ink: '#b6f4b6',
      primary: '#00ff41',
      accent: '#3bf46e',
      success: '#00ff41',
      warning: '#99e344',
      error: '#ff5555',
      info: '#008f11',
    },
  },
  {
    id: 'synthwave84',
    name: "Synthwave '84",
    palette: {
      neutral: '#262335',
      ink: '#fffefe',
      primary: '#f92aad',
      accent: '#36f9f6',
      success: '#72f1b8',
      warning: '#fede5d',
      error: '#fe4450',
      info: '#2ee2fa',
    },
  },
  {
    id: 'nightowl',
    name: 'Night Owl',
    palette: {
      neutral: '#011627',
      ink: '#d6deeb',
      primary: '#82aaff',
      accent: '#c792ea',
      success: '#addb67',
      warning: '#ecc48d',
      error: '#ef5350',
      info: '#7fdbca',
    },
  },
  {
    id: 'rosepine',
    name: 'Rosé Pine',
    palette: {
      neutral: '#191724',
      ink: '#e0def4',
      primary: '#ebbcba',
      accent: '#c4a7e7',
      success: '#9ccfd8',
      warning: '#f6c177',
      error: '#eb6f92',
      info: '#31748f',
    },
  },
  {
    id: 'ayu',
    name: 'Ayu Dark',
    palette: {
      neutral: '#0f1419',
      ink: '#e6e1cf',
      primary: '#e6b450',
      accent: '#f29668',
      success: '#aad94c',
      warning: '#ffb454',
      error: '#d95757',
      info: '#39bae6',
    },
  },
  {
    id: 'carbonfox',
    name: 'Carbonfox',
    palette: {
      neutral: '#161616',
      ink: '#f2f4f8',
      primary: '#78a9ff',
      accent: '#3ddbd9',
      success: '#25be6b',
      warning: '#33b1ff',
      error: '#ee5396',
      info: '#be95ff',
    },
  },
  {
    id: 'amoled',
    name: 'AMOLED Black',
    palette: {
      neutral: '#000000',
      ink: '#ffffff',
      primary: '#3b82f6',
      accent: '#8b5cf6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#06b6d4',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    isLight: true,
    palette: {
      neutral: '#ffffff',
      ink: '#1f2328',
      primary: '#0969da',
      accent: '#8250df',
      success: '#1a7f37',
      warning: '#9a6700',
      error: '#cf222e',
      info: '#0969da',
    },
  },
  {
    id: 'one-light',
    name: 'One Light',
    isLight: true,
    palette: {
      neutral: '#fafafa',
      ink: '#383a42',
      primary: '#4078f2',
      accent: '#0184bc',
      success: '#50a14f',
      warning: '#c18401',
      error: '#e45649',
      info: '#a626a4',
    },
  },
  {
    id: 'nord-light',
    name: 'Nord Snow',
    isLight: true,
    palette: {
      neutral: '#eceff4',
      ink: '#2e3440',
      primary: '#5e81ac',
      accent: '#88c0d0',
      success: '#8fbcbb',
      warning: '#d08770',
      error: '#bf616a',
      info: '#81a1c1',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    isLight: true,
    palette: {
      neutral: '#fdf6e3',
      ink: '#657b83',
      primary: '#268bd2',
      accent: '#2aa198',
      success: '#859900',
      warning: '#b58900',
      error: '#dc322f',
      info: '#6c71c4',
    },
  },
  {
    id: 'vesper-light',
    name: 'Vesper Light',
    isLight: true,
    palette: {
      neutral: '#f5f5f3',
      ink: '#1b1b1b',
      primary: '#b45309',
      accent: '#7c3aed',
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626',
      info: '#2563eb',
    },
  },
  {
    id: 'postman-dark',
    name: 'Postman Dark',
    palette: {
      neutral: '#212121',
      ink: '#e6e6e6',
      primary: '#0265dc',
      accent: '#ff6c37',
      success: '#2ba058',
      warning: '#f59e0b',
      error: '#eb4444',
      info: '#0265dc',
    },
    overrides: {
      'zinc-950': '#181818',
      'zinc-900': '#212121',
      'zinc-850': '#282828',
      'zinc-800': '#2e2e2e',
      'zinc-750': '#383838',
      'zinc-700': '#444444',
      'zinc-600': '#737373',
      'zinc-500': '#8f8f8f',
      'zinc-400': '#a3a3a3',
      'zinc-300': '#cccccc',
      'zinc-200': '#e6e6e6',
      'zinc-100': '#f5f5f5',
      primary: '#0265dc',
      'primary-hover': '#0052b4',
      secondary: '#ff6c37',
      'secondary-hover': '#e05a33',
    },
  },
  {
    id: 'postman-light',
    name: 'Postman Light',
    isLight: true,
    palette: {
      neutral: '#ffffff',
      ink: '#212121',
      primary: '#0265dc',
      accent: '#ff6c37',
      success: '#2ba058',
      warning: '#d97706',
      error: '#dc2626',
      info: '#0265dc',
    },
    overrides: {
      'zinc-950': '#ffffff',
      'zinc-900': '#f7f7f7',
      'zinc-850': '#ebebeb',
      'zinc-800': '#e0e0e0',
      'zinc-750': '#d0d0d0',
      'zinc-700': '#bcbcbc',
      'zinc-600': '#8f8f8f',
      'zinc-500': '#737373',
      'zinc-400': '#555555',
      'zinc-300': '#383838',
      'zinc-200': '#212121',
      'zinc-100': '#111111',
      primary: '#0265dc',
      'primary-hover': '#0052b4',
      secondary: '#ff6c37',
      'secondary-hover': '#e05a33',
    },
  },
];

export const THEMES: ThemeDefinition[] = sortThemes(RAW_THEMES);

export function getThemeById(themeId?: string | null): ThemeDefinition {
  const match = THEMES.find((t) => t.id === themeId);
  return match ?? THEMES[0];
}

export function resolveThemeVariables(theme: ThemeDefinition): Record<string, string> {
  const overrides = theme.overrides || {};
  const neutral = hexToRgb(theme.palette.neutral);
  const ink = hexToRgb(theme.palette.ink);
  const black: RgbColor = { r: 0, g: 0, b: 0 };
  const primary = hexToRgb(theme.palette.primary);
  const secondary = hexToRgb(theme.palette.accent ?? theme.palette.info);

  const getRgb = (key: string, fallback: RgbColor): RgbColor => {
    if (overrides[key]) {
      return hexToRgb(overrides[key]);
    }
    return fallback;
  };

  const isLight = Boolean(theme.isLight);

  const cZinc950 = getRgb('zinc-950', isLight ? neutral : blendRgb(neutral, black, 0.35));
  const cZinc900 = getRgb('zinc-900', isLight ? blendRgb(neutral, ink, 0.04) : neutral);
  const cZinc850 = getRgb('zinc-850', isLight ? blendRgb(neutral, ink, 0.07) : blendRgb(neutral, ink, 0.05));
  const cZinc800 = getRgb('zinc-800', isLight ? blendRgb(neutral, ink, 0.14) : blendRgb(neutral, ink, 0.1));
  const cZinc750 = getRgb('zinc-750', isLight ? blendRgb(neutral, ink, 0.22) : blendRgb(neutral, ink, 0.16));
  const cZinc700 = getRgb('zinc-700', isLight ? blendRgb(neutral, ink, 0.32) : blendRgb(neutral, ink, 0.23));
  const cZinc600 = getRgb('zinc-600', isLight ? blendRgb(neutral, ink, 0.50) : blendRgb(neutral, ink, 0.38));
  const cZinc500 = getRgb('zinc-500', isLight ? blendRgb(neutral, ink, 0.62) : blendRgb(neutral, ink, 0.52));
  const cZinc400 = getRgb('zinc-400', isLight ? blendRgb(neutral, ink, 0.75) : blendRgb(neutral, ink, 0.68));
  const cZinc300 = getRgb('zinc-300', isLight ? blendRgb(neutral, ink, 0.85) : blendRgb(neutral, ink, 0.82));
  const cZinc200 = getRgb('zinc-200', isLight ? blendRgb(neutral, ink, 0.94) : blendRgb(neutral, ink, 0.92));
  const cZinc100 = getRgb('zinc-100', ink);

  const cPrimary = getRgb('primary', primary);
  const cPrimaryHover = getRgb('primary-hover', blendRgb(cPrimary, black, 0.15));
  const cSecondary = getRgb('secondary', secondary);
  const cSecondaryHover = getRgb('secondary-hover', blendRgb(cSecondary, black, 0.15));

  return {
    '--color-zinc-950': formatRgbSpace(cZinc950),
    '--color-zinc-900': formatRgbSpace(cZinc900),
    '--color-zinc-850': formatRgbSpace(cZinc850),
    '--color-zinc-800': formatRgbSpace(cZinc800),
    '--color-zinc-750': formatRgbSpace(cZinc750),
    '--color-zinc-700': formatRgbSpace(cZinc700),
    '--color-zinc-600': formatRgbSpace(cZinc600),
    '--color-zinc-500': formatRgbSpace(cZinc500),
    '--color-zinc-400': formatRgbSpace(cZinc400),
    '--color-zinc-300': formatRgbSpace(cZinc300),
    '--color-zinc-200': formatRgbSpace(cZinc200),
    '--color-zinc-100': formatRgbSpace(cZinc100),
    '--color-primary': formatRgbSpace(cPrimary),
    '--color-primary-hover': formatRgbSpace(cPrimaryHover),
    '--color-secondary': formatRgbSpace(cSecondary),
    '--color-secondary-hover': formatRgbSpace(cSecondaryHover),
  };
}

export function generateThemeCss(theme: ThemeDefinition): string {
  const vars = resolveThemeVariables(theme);
  const rules = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  const colorScheme = theme.isLight ? 'light' : 'dark';
  return `:root {\n  color-scheme: ${colorScheme};\n${rules}\n}\nbody {\n  background-color: rgb(var(--color-zinc-950));\n  color: rgb(var(--color-zinc-200));\n}\n::selection {\n  background: rgb(var(--color-primary) / 0.35);\n}\ninput, textarea, select {\n  caret-color: rgb(var(--color-primary));\n}\n::-webkit-scrollbar-thumb {\n  background: rgb(var(--color-zinc-800));\n}\n::-webkit-scrollbar-thumb:hover {\n  background: rgb(var(--color-zinc-700));\n}`;
}

export const THEME_STYLE_ID = 'api-lab-theme-vars';

export function applyTheme(theme: ThemeDefinition): void {
  if (typeof document === 'undefined') return;
  let styleEl = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = THEME_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = generateThemeCss(theme);
  document.documentElement.setAttribute('data-theme', theme.id);
}
