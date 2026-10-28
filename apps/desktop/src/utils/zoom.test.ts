import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNextZoom,
  parseStoredZoom,
  formatZoomPercentage,
  applyZoom,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
} from './zoom.ts';

test('calculateNextZoom: increments and clamps to MAX_ZOOM', () => {
  assert.equal(calculateNextZoom(1.0, 'in'), 1.1);
  assert.equal(calculateNextZoom(1.9, 'in'), 2.0);
  assert.equal(calculateNextZoom(2.0, 'in'), 2.0);
  assert.equal(calculateNextZoom(MAX_ZOOM, 'in'), MAX_ZOOM);
  // Float rounding stability
  assert.equal(calculateNextZoom(0.7, 'in'), 0.8);
});

test('calculateNextZoom: decrements and clamps to MIN_ZOOM', () => {
  assert.equal(calculateNextZoom(1.0, 'out'), 0.9);
  assert.equal(calculateNextZoom(0.6, 'out'), 0.5);
  assert.equal(calculateNextZoom(0.5, 'out'), 0.5);
  assert.equal(calculateNextZoom(MIN_ZOOM, 'out'), MIN_ZOOM);
});

test('calculateNextZoom: reset returns DEFAULT_ZOOM', () => {
  assert.equal(calculateNextZoom(1.5, 'reset'), DEFAULT_ZOOM);
  assert.equal(calculateNextZoom(0.5, 'reset'), DEFAULT_ZOOM);
  assert.equal(calculateNextZoom(2.0, 'reset'), DEFAULT_ZOOM);
});

test('parseStoredZoom: parses valid values and rejects out-of-bounds', () => {
  assert.equal(parseStoredZoom(null), DEFAULT_ZOOM);
  assert.equal(parseStoredZoom(''), DEFAULT_ZOOM);
  assert.equal(parseStoredZoom('invalid'), DEFAULT_ZOOM);
  assert.equal(parseStoredZoom('0.2'), DEFAULT_ZOOM);
  assert.equal(parseStoredZoom('3.5'), DEFAULT_ZOOM);
  assert.equal(parseStoredZoom('1.2'), 1.2);
  assert.equal(parseStoredZoom('0.8'), 0.8);
  assert.equal(parseStoredZoom('1.5'), 1.5);
});

test('formatZoomPercentage: formats zoom factor to readable percentage', () => {
  assert.equal(formatZoomPercentage(1.0), '100%');
  assert.equal(formatZoomPercentage(1.2), '120%');
  assert.equal(formatZoomPercentage(0.5), '50%');
  assert.equal(formatZoomPercentage(2.0), '200%');
});

test('applyZoom: invokes setter with clamped value', async () => {
  let calledVal: number | null = null;
  const res = await applyZoom(1.34, async (val) => {
    calledVal = val;
  });
  assert.equal(res, 1.3);
  assert.equal(calledVal, 1.3);

  const clampedMax = await applyZoom(3.5, async (val) => {
    calledVal = val;
  });
  assert.equal(clampedMax, 2.0);
  assert.equal(calledVal, 2.0);

  const clampedMin = await applyZoom(0.1, async (val) => {
    calledVal = val;
  });
  assert.equal(clampedMin, 0.5);
  assert.equal(calledVal, 0.5);
});
