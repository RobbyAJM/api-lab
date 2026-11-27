import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_APP_VERSION,
  normalizeVersion,
  formatVersionLabel,
  getBuildTimeAppVersion,
  resolveClientVersion,
  formatVersionTooltip,
} from './appVersion.ts';

test('normalizeVersion: strips leading v/V and whitespace', () => {
  assert.equal(normalizeVersion('v0.1.163'), '0.1.163');
  assert.equal(normalizeVersion('V1.2.3\n'), '1.2.3');
  assert.equal(normalizeVersion('  0.1.163  '), '0.1.163');
  assert.equal(normalizeVersion('v'), null);
  assert.equal(normalizeVersion('   '), null);
  assert.equal(normalizeVersion(null), null);
  assert.equal(normalizeVersion(undefined), null);
});

test('formatVersionLabel: formats with single v prefix and fallback', () => {
  assert.equal(formatVersionLabel('0.1.163'), 'v0.1.163');
  assert.equal(formatVersionLabel('v0.1.163'), 'v0.1.163');
  assert.equal(formatVersionLabel(''), `v${FALLBACK_APP_VERSION}`);
  assert.equal(formatVersionLabel(undefined), `v${FALLBACK_APP_VERSION}`);
});

test('getBuildTimeAppVersion: safely falls back outside Vite builds', () => {
  assert.equal(getBuildTimeAppVersion(), FALLBACK_APP_VERSION);
});

test('resolveClientVersion: uses fallback outside Tauri runtime', async () => {
  let called = false;
  const version = await resolveClientVersion({
    isTauri: false,
    fallbackVersion: '0.1.163',
    getTauriVersion: async () => {
      called = true;
      return '9.9.9';
    },
  });

  assert.equal(called, false);
  assert.equal(version, '0.1.163');
});

test('resolveClientVersion: prefers Tauri runtime version inside desktop app', async () => {
  const version = await resolveClientVersion({
    isTauri: true,
    fallbackVersion: '0.1.162',
    getTauriVersion: async () => '0.1.163',
  });

  assert.equal(version, '0.1.163');
});

test('resolveClientVersion: gracefully falls back when Tauri getVersion fails or returns empty', async () => {
  const onError = await resolveClientVersion({
    isTauri: true,
    fallbackVersion: '0.1.163',
    getTauriVersion: async () => {
      throw new Error('IPC unavailable');
    },
  });
  assert.equal(onError, '0.1.163');

  const onEmpty = await resolveClientVersion({
    isTauri: true,
    fallbackVersion: '0.1.163',
    getTauriVersion: async () => '  ',
  });
  assert.equal(onEmpty, '0.1.163');
});

test('formatVersionTooltip: includes server version only when available', () => {
  assert.equal(formatVersionTooltip('0.1.163'), 'Client v0.1.163');
  assert.equal(formatVersionTooltip('0.1.163', null), 'Client v0.1.163');
  assert.equal(formatVersionTooltip('0.1.163', '  '), 'Client v0.1.163');
  assert.equal(formatVersionTooltip('0.1.163', '0.1.163'), 'Client v0.1.163 · Server v0.1.163');
  assert.equal(formatVersionTooltip('v0.1.163', 'v0.1.164'), 'Client v0.1.163 · Server v0.1.164');
});
