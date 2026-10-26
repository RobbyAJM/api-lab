import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAvatar,
  formatAvatar,
  getDiceBearUrl,
  generateRandomSeed,
} from './dicebear.ts';

test('parseAvatar: defaults to bottts:api-lab on null or empty', () => {
  assert.deepEqual(parseAvatar(null), { style: 'bottts', seed: 'api-lab', options: {} });
  assert.deepEqual(parseAvatar(''), { style: 'bottts', seed: 'api-lab', options: {} });
  assert.deepEqual(parseAvatar('   '), { style: 'bottts', seed: 'api-lab', options: {} });
});

test('parseAvatar: parses style, seed and query options', () => {
  const parsed = parseAvatar('lorelei:Felix?backgroundColor=b6e3f4&radius=20&flip=true&rotate=90');
  assert.equal(parsed.style, 'lorelei');
  assert.equal(parsed.seed, 'Felix');
  assert.equal(parsed.options.backgroundColor, 'b6e3f4');
  assert.equal(parsed.options.radius, 20);
  assert.equal(parsed.options.flip, true);
  assert.equal(parsed.options.rotate, 90);
});

test('formatAvatar: produces style:seed with options query string', () => {
  const formatted = formatAvatar('lorelei', 'Felix', {
    backgroundColor: 'b6e3f4',
    radius: 20,
    flip: true,
  });
  assert.equal(
    formatted,
    'lorelei:Felix?backgroundColor=b6e3f4&radius=20&flip=true'
  );
});

test('getDiceBearUrl: generates expected URL with parameters', () => {
  const url = getDiceBearUrl('lorelei', 'Felix', {
    backgroundColor: 'b6e3f4',
    radius: 50,
  });
  assert.ok(url.includes('https://api.dicebear.com/9.x/lorelei/svg?'));
  assert.ok(url.includes('seed=Felix'));
  assert.ok(url.includes('backgroundColor=b6e3f4'));
  assert.ok(url.includes('radius=50'));
});

test('generateRandomSeed: returns non-empty random string', () => {
  const s1 = generateRandomSeed();
  const s2 = generateRandomSeed();
  assert.ok(s1.length > 0);
  assert.ok(s2.length > 0);
  assert.notEqual(s1, s2);
});
