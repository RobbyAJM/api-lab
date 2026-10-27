import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAvatar,
  formatAvatar,
  getDiceBearUrl,
  generateRandomSeed,
  DICEBEAR_STYLES,
} from './dicebear.ts';
import { sanitizeExtraComponents, DICEBEAR_STYLE_DEFINITIONS } from './dicebearSchema.ts';

test('parseAvatar: defaults to bottts:api-lab on null or empty', () => {
  assert.deepEqual(parseAvatar(null), { style: 'bottts', seed: 'api-lab', options: {} });
  assert.deepEqual(parseAvatar(''), { style: 'bottts', seed: 'api-lab', options: {} });
  assert.deepEqual(parseAvatar('   '), { style: 'bottts', seed: 'api-lab', options: {} });
});

test('parseAvatar: parses style, seed and query options', () => {
  const parsed = parseAvatar('lorelei:Felix?backgroundColor=b6e3f4&radius=20&flip=true&rotate=90&scale=120&eyes=variant01');
  assert.equal(parsed.style, 'lorelei');
  assert.equal(parsed.seed, 'Felix');
  assert.equal(parsed.options.backgroundColor, 'b6e3f4');
  assert.equal(parsed.options.radius, 20);
  assert.equal(parsed.options.flip, true);
  assert.equal(parsed.options.rotate, 90);
  assert.equal(parsed.options.scale, 120);
  assert.deepEqual(parsed.options.extra, { eyes: 'variant01' });
});

test('parseAvatar: parses full DiceBear HTTP CDN URLs seamlessly', () => {
  const parsed10 = parseAvatar('https://api.dicebear.com/10.x/avataaars/svg?seed=John%20Doe&radius=15&scale=115&eyes=closed');
  assert.equal(parsed10.style, 'avataaars');
  assert.equal(parsed10.seed, 'John Doe');
  assert.equal(parsed10.options.radius, 15);
  assert.equal(parsed10.options.scale, 115);
  assert.deepEqual(parsed10.options.extra, { eyes: 'closed' });

  // Backwards compatibility with 9.x URLs stored in DB
  const parsed9 = parseAvatar('https://api.dicebear.com/9.x/avataaars/svg?seed=John%20Doe&radius=15&scale=115&eyes=closed');
  assert.equal(parsed9.style, 'avataaars');
  assert.equal(parsed9.seed, 'John Doe');
  assert.equal(parsed9.options.radius, 15);
  assert.equal(parsed9.options.scale, 115);
  assert.deepEqual(parsed9.options.extra, { eyes: 'closed' });
});

test('parseAvatar: drops incompatible or invalid variants on parse', () => {
  // eyes=close is invalid in avataaars (must be 'closed')
  const parsed = parseAvatar('avataaars:Felix?eyes=close');
  assert.equal(parsed.style, 'avataaars');
  assert.equal(parsed.seed, 'Felix');
  assert.deepEqual(parsed.options.extra, undefined);
});

test('sanitizeExtraComponents: validates components strictly against style schema', () => {
  // bottts allows 'eva' but rejects 'variant01'
  const botttsSanitized = sanitizeExtraComponents('bottts', {
    eyes: 'variant01',
    mouth: 'bite',
  });
  assert.deepEqual(botttsSanitized, { mouth: 'bite' });

  // avataaars allows 'closed' and 'default'
  const avataaarsSanitized = sanitizeExtraComponents('avataaars', {
    eyes: 'closed',
    mouth: 'default',
    invalidComponent: 'abc',
  });
  assert.deepEqual(avataaarsSanitized, { eyes: 'closed', mouth: 'default' });
});

test('formatAvatar: produces style:seed with options query string', () => {
  const formatted = formatAvatar('croodles-neutral', 'Felix', {
    backgroundColor: 'b6e3f4',
    radius: 20,
    flip: true,
    scale: 110,
    extra: { eyes: 'variant02', mouth: 'variant05' },
  });
  assert.ok(formatted.startsWith('croodles-neutral:Felix?'));
  assert.ok(formatted.includes('backgroundColor=b6e3f4'));
  assert.ok(formatted.includes('radius=20'));
  assert.ok(formatted.includes('flip=horizontal'));
  assert.ok(formatted.includes('scale=110'));
  assert.ok(formatted.includes('eyes=variant02'));
  assert.ok(formatted.includes('mouth=variant05'));
});

test('getDiceBearUrl: generates expected URL and strips invalid variants to prevent 400 Fastify error', () => {
  // variant01 is invalid in bottts, so getDiceBearUrl omits it
  const botttsUrl = getDiceBearUrl('bottts', 'Felix', {
    extra: { eyes: 'variant01', mouth: 'bite' },
  });
  assert.ok(botttsUrl.includes('https://api.dicebear.com/10.x/bottts/svg?'));
  assert.ok(botttsUrl.includes('mouth=bite'));
  assert.ok(!botttsUrl.includes('eyes=variant01'));

  // variant01 is valid in croodles-neutral
  const croodlesUrl = getDiceBearUrl('croodles-neutral', 'Felix', {
    backgroundColor: 'b6e3f4',
    radius: 50,
    scale: 120,
    flip: true,
    extra: { eyes: 'variant01' },
  });
  assert.ok(croodlesUrl.includes('https://api.dicebear.com/10.x/croodles-neutral/svg?'));
  assert.ok(croodlesUrl.includes('seed=Felix'));
  assert.ok(croodlesUrl.includes('backgroundColor=b6e3f4'));
  assert.ok(croodlesUrl.includes('radius=50'));
  assert.ok(croodlesUrl.includes('scale=1.2'));
  assert.ok(croodlesUrl.includes('flip=horizontal'));
  assert.ok(croodlesUrl.includes('eyes=variant01'));
});

test('parseAvatar: handles comma-separated extra components in 10.x style URLs', () => {
  const parsed = parseAvatar('https://api.dicebear.com/10.x/bottts/svg?seed=Felix&mouth=bite,diagram&top=antenna');
  assert.equal(parsed.style, 'bottts');
  assert.equal(parsed.seed, 'Felix');
  // Extra options with first variant or validated variant for single-select playground
  assert.ok(parsed.options.extra);
  assert.equal(parsed.options.extra?.top, 'antenna');
});

test('parseAvatar: roundtrip with formatAvatar produces exact persistence string', () => {
  const initial = formatAvatar('bottts', 'Felix', {
    backgroundColor: 'b6e3f4',
    radius: 20,
    flip: true,
    scale: 110,
    extra: { mouth: 'bite', top: 'antenna' },
  });

  const parsed = parseAvatar(initial);
  assert.equal(parsed.style, 'bottts');
  assert.equal(parsed.seed, 'Felix');
  assert.equal(parsed.options.backgroundColor, 'b6e3f4');
  assert.equal(parsed.options.radius, 20);
  assert.equal(parsed.options.flip, true);
  assert.equal(parsed.options.scale, 110);
  assert.deepEqual(parsed.options.extra, { mouth: 'bite', top: 'antenna' });

  // Autofill roundtrip back to formatAvatar
  const second = formatAvatar(parsed.style, parsed.seed, parsed.options);
  assert.equal(initial, second);
});

test('DICEBEAR_STYLES: contains all 61 official 10.x styles with schema definitions', () => {
  assert.equal(DICEBEAR_STYLES.length, 61);
  assert.equal(DICEBEAR_STYLE_DEFINITIONS.length, 61);
  for (const style of DICEBEAR_STYLES) {
    const def = DICEBEAR_STYLE_DEFINITIONS.find((d) => d.id === style);
    assert.ok(def, `Missing schema definition for style: ${style}`);
    assert.ok(def.label, `Missing label for style: ${style}`);
  }
});

test('generateRandomSeed: returns non-empty random string', () => {
  const s1 = generateRandomSeed();
  const s2 = generateRandomSeed();
  assert.ok(s1.length > 0);
  assert.ok(s2.length > 0);
  assert.notEqual(s1, s2);
});
