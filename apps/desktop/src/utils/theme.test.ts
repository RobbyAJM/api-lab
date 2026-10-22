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

test('THEMES list contains popular Opencode themes', () => {
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
  assert.ok(THEMES.length >= 20);
});
