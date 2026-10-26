import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb,
  rgbToHex,
  blendRgb,
  formatRgbSpace,
  getThemeById,
  resolveThemeVariables,
  generateThemeCss,
  sortThemes,
  THEMES,
  DEFAULT_THEME_ID,
} from './theme.ts';

test('hexToRgb: parses 6-digit and 3-digit hex strings correctly', () => {
  assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb('4f46e5'), { r: 79, g: 70, b: 229 });
  assert.deepEqual(hexToRgb('#f00'), { r: 255, g: 0, b: 0 });
  assert.deepEqual(hexToRgb('invalid'), { r: 0, g: 0, b: 0 });
});

test('rgbToHex: converts rgb structure to hex string with clamping', () => {
  assert.equal(rgbToHex({ r: 0, g: 0, b: 0 }), '#000000');
  assert.equal(rgbToHex({ r: 255, g: 255, b: 255 }), '#ffffff');
  assert.equal(rgbToHex({ r: 300, g: -10, b: 128 }), '#ff0080');
});

test('blendRgb: interpolates correctly between two colors', () => {
  const c1 = { r: 0, g: 0, b: 0 };
  const c2 = { r: 100, g: 200, b: 50 };
  assert.deepEqual(blendRgb(c1, c2, 0), c1);
  assert.deepEqual(blendRgb(c1, c2, 1), c2);
  assert.deepEqual(blendRgb(c1, c2, 0.5), { r: 50, g: 100, b: 25 });
});

test('formatRgbSpace: formats rgb for modern CSS alpha division', () => {
  assert.equal(formatRgbSpace({ r: 11, g: 12, b: 14 }), '11 12 14');
});

test('getThemeById: finds themes by ID and falls back to default on unknown', () => {
  const dracula = getThemeById('dracula');
  assert.equal(dracula.id, 'dracula');
  assert.equal(dracula.name, 'Dracula');

  const fallback = getThemeById('non-existent-theme-xyz');
  assert.equal(fallback.id, DEFAULT_THEME_ID);

  const fallbackNull = getThemeById(null);
  assert.equal(fallbackNull.id, DEFAULT_THEME_ID);
});

test('resolveThemeVariables: preserves exact mineral dark values for default api-lab theme', () => {
  const defaultTheme = getThemeById('api-lab');
  const vars = resolveThemeVariables(defaultTheme);

  assert.equal(vars['--color-zinc-950'], '11 12 14');
  assert.equal(vars['--color-zinc-900'], '17 19 23');
  assert.equal(vars['--color-zinc-850'], '22 25 31');
  assert.equal(vars['--color-zinc-800'], '32 36 44');
  assert.equal(vars['--color-zinc-750'], '41 46 57');
  assert.equal(vars['--color-zinc-700'], '53 60 74');
  assert.equal(vars['--color-primary'], '79 70 229');
  assert.equal(vars['--color-secondary'], '99 102 241');
});

test('resolveThemeVariables: derives distinct palettes for other themes', () => {
  const dracula = getThemeById('dracula');
  const vars = resolveThemeVariables(dracula);

  assert.notEqual(vars['--color-zinc-950'], '11 12 14');
  assert.ok(vars['--color-primary'].length > 0);
  assert.ok(vars['--color-zinc-900'].length > 0);
});

test('generateThemeCss: outputs complete valid CSS text block', () => {
  const theme = getThemeById('nord');
  const css = generateThemeCss(theme);

  assert.ok(css.includes(':root {'));
  assert.ok(css.includes('--color-zinc-950:'));
  assert.ok(css.includes('--color-primary:'));
  assert.ok(css.includes('background-color: rgb(var(--color-zinc-950));'));
});

test('THEMES list contains popular Opencode themes and light themes', () => {
  const ids = THEMES.map((t) => t.id);
  assert.ok(ids.includes('api-lab'));
  assert.ok(ids.includes('dracula'));
  assert.ok(ids.includes('catppuccin'));
  assert.ok(ids.includes('nord'));
  assert.ok(ids.includes('tokyonight'));
  assert.ok(ids.includes('one-dark'));
  assert.ok(ids.includes('gruvbox'));
  assert.ok(ids.includes('monokai'));
  assert.ok(ids.includes('vesper'));
  assert.ok(ids.includes('github-light'));
  assert.ok(ids.includes('one-light'));
  assert.ok(ids.includes('nord-light'));
  assert.ok(ids.includes('solarized-light'));
  assert.ok(ids.includes('vesper-light'));
  assert.ok(ids.includes('solar-dark'));
  assert.ok(ids.includes('solar-light'));
  assert.ok(THEMES.length >= 27);
});

test('sortThemes: pins api-lab to top, then dark themes A-Z, then light themes A-Z', () => {
  assert.equal(THEMES[0].id, 'api-lab');
  assert.equal(THEMES[0].name, 'API Lab Mineral (Default)');

  const darkThemes = THEMES.filter((t) => !t.isLight);
  const lightThemes = THEMES.filter((t) => t.isLight);

  // Dark themes appear before light themes
  const firstLightIndex = THEMES.findIndex((t) => t.isLight);
  const lastDarkIndex = THEMES.map((t) => Boolean(t.isLight)).lastIndexOf(false);
  assert.ok(lastDarkIndex < firstLightIndex);

  // Remaining dark themes (after index 0) are strictly alphabetical
  const darkNamesAfterDefault = darkThemes.slice(1).map((t) => t.name);
  const sortedDarkNames = [...darkNamesAfterDefault].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
  assert.deepEqual(darkNamesAfterDefault, sortedDarkNames);

  // Light themes are strictly alphabetical
  const lightNames = lightThemes.map((t) => t.name);
  const sortedLightNames = [...lightNames].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
  assert.deepEqual(lightNames, sortedLightNames);
});

test('resolveThemeVariables: resolves sampled solar-dark and solar-light themes', () => {
  const solarDark = getThemeById('solar-dark');
  assert.equal(solarDark.id, 'solar-dark');
  const darkVars = resolveThemeVariables(solarDark);
  assert.equal(darkVars['--color-zinc-950'], '24 24 24'); // #181818
  assert.equal(darkVars['--color-zinc-900'], '33 33 33'); // #212121
  assert.equal(darkVars['--color-primary'], '2 101 220'); // #0265dc
  assert.equal(darkVars['--color-secondary'], '255 108 55'); // #ff6c37

  const solarLight = getThemeById('solar-light');
  assert.equal(solarLight.id, 'solar-light');
  assert.equal(solarLight.isLight, true);
  const lightVars = resolveThemeVariables(solarLight);
  assert.equal(lightVars['--color-zinc-950'], '255 255 255'); // #ffffff
  assert.equal(lightVars['--color-zinc-900'], '247 247 247'); // #f7f7f7
  assert.equal(lightVars['--color-primary'], '2 101 220'); // #0265dc
  assert.equal(lightVars['--color-secondary'], '255 108 55'); // #ff6c37
});

test('resolveThemeVariables: handles light themes with inverted surface scale', () => {
  const ghLight = getThemeById('github-light');
  assert.equal(ghLight.isLight, true);
  const vars = resolveThemeVariables(ghLight);

  // In light mode, zinc-950 is the lightest background (#ffffff -> 255 255 255)
  assert.equal(vars['--color-zinc-950'], '255 255 255');
  // zinc-100 is dark high-contrast ink
  assert.notEqual(vars['--color-zinc-100'], '255 255 255');

  const css = generateThemeCss(ghLight);
  assert.ok(css.includes('color-scheme: light;'));
});
