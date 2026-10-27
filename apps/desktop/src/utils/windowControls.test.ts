import test from 'node:test';
import assert from 'node:assert/strict';
import { isMacOS, getMaximizeButtonLabels } from './windowControls.ts';

test('isMacOS: identifies macOS and iOS user agents', () => {
  assert.equal(isMacOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), true);
  assert.equal(isMacOS('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)'), true);
  assert.equal(isMacOS('Mozilla/5.0 (iPad; CPU OS 13_2 like Mac OS X)'), true);
});

test('isMacOS: returns false for Windows and Linux user agents', () => {
  assert.equal(isMacOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), false);
  assert.equal(isMacOS('Mozilla/5.0 (X11; Linux x86_64)'), false);
  assert.equal(isMacOS(''), false);
  assert.equal(isMacOS(undefined), false);
});

test('getMaximizeButtonLabels: returns restore down when maximized', () => {
  const labels = getMaximizeButtonLabels(true);
  assert.equal(labels.title, 'Restore Down');
  assert.equal(labels.ariaLabel, 'Restore window');
});

test('getMaximizeButtonLabels: returns maximize when not maximized', () => {
  const labels = getMaximizeButtonLabels(false);
  assert.equal(labels.title, 'Maximize');
  assert.equal(labels.ariaLabel, 'Maximize window');
});
