import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DICEBEAR_STYLES,
  parseAvatar,
  formatAvatar,
  getDiceBearUrl,
  generateRandomSeed,
} from './dicebear.ts';

test('parseAvatar: defaults to bottts:api-lab on null or empty', () => {
  assert.deepEqual(parseAvatar(null), { style: 'bottts', seed: 'api-lab' });
  assert.deepEqual(parseAvatar(''), { style: 'bottts', seed: 'api-lab' });
  assert.deepEqual(parseAvatar('   '), { style: 'bottts', seed: 'api-lab' });
});

test('parseAvatar: parses style and seed with colon separator', () => {
  assert.deepEqual(parseAvatar('lorelei:Felix'), { style: 'lorelei', seed: 'Felix' });
  assert.deepEqual(parseAvatar('avataaars:Jane_Doe'), { style: 'avataaars', seed: 'Jane_Doe' });
  assert.deepEqual(parseAvatar('identicon:user@example.com'), {
    style: 'identicon',
    seed: 'user@example.com',
  });
});

test('parseAvatar: falls back to bottts if style is unrecognized', () => {
  assert.deepEqual(parseAvatar('unknownstyle:myseed'), { style: 'bottts', seed: 'unknownstyle:myseed' });
});

test('formatAvatar: produces style:seed format', () => {
  assert.equal(formatAvatar('lorelei', 'Felix'), 'lorelei:Felix');
  assert.equal(formatAvatar('unknown', 'seed123'), 'bottts:seed123');
  assert.equal(formatAvatar('bottts', ''), 'bottts:api-lab');
});

test('getDiceBearUrl: generates expected URL from string or parameters', () => {
  const url1 = getDiceBearUrl('lorelei:Felix');
  assert.equal(url1, 'https://api.dicebear.com/9.x/lorelei/svg?seed=Felix');

  const url2 = getDiceBearUrl('bottts', 'seed with spaces');
  assert.equal(url2, 'https://api.dicebear.com/9.x/bottts/svg?seed=seed%20with%20spaces');
});

test('generateRandomSeed: returns non-empty random string', () => {
  const s1 = generateRandomSeed();
  const s2 = generateRandomSeed();
  assert.ok(s1.length > 0);
  assert.ok(s2.length > 0);
  assert.notEqual(s1, s2);
});
