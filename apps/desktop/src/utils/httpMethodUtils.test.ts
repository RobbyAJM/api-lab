import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HTTP_METHODS,
  normalizeHttpMethod,
  isValidHttpMethod,
  getHttpMethodColor,
  getHttpMethodBadgeClass,
  navigateMethodIndex,
  findMethodIndexByChar,
} from './httpMethodUtils.ts';

test('normalizeHttpMethod: normalizes casing and whitespace', () => {
  assert.equal(normalizeHttpMethod('get'), 'GET');
  assert.equal(normalizeHttpMethod('  post  '), 'POST');
  assert.equal(normalizeHttpMethod(''), '');
  assert.equal(normalizeHttpMethod(null as unknown as string), '');
});

test('isValidHttpMethod: validates against supported HTTP methods', () => {
  for (const method of HTTP_METHODS) {
    assert.equal(isValidHttpMethod(method), true);
    assert.equal(isValidHttpMethod(method.toLowerCase()), true);
  }
  assert.equal(isValidHttpMethod('CONNECT'), false);
  assert.equal(isValidHttpMethod('TRACE'), false);
  assert.equal(isValidHttpMethod('UNKNOWN'), false);
});

test('getHttpMethodColor: maps all 7 HTTP methods to design tokens', () => {
  assert.equal(getHttpMethodColor('GET'), 'text-emerald-400');
  assert.equal(getHttpMethodColor('POST'), 'text-blue-400');
  assert.equal(getHttpMethodColor('PUT'), 'text-amber-400');
  assert.equal(getHttpMethodColor('DELETE'), 'text-rose-400');
  assert.equal(getHttpMethodColor('PATCH'), 'text-orange-400');
  assert.equal(getHttpMethodColor('OPTIONS'), 'text-purple-400');
  assert.equal(getHttpMethodColor('HEAD'), 'text-cyan-400');
  assert.equal(getHttpMethodColor('CUSTOM'), 'text-zinc-400');
});

test('getHttpMethodBadgeClass: returns crisp badge classes for idle and selected states', () => {
  const idleGet = getHttpMethodBadgeClass('GET', false);
  assert.ok(idleGet.includes('text-emerald-400'));
  assert.ok(idleGet.includes('border-emerald-800/40'));

  const activeGet = getHttpMethodBadgeClass('GET', true);
  assert.ok(activeGet.includes('text-emerald-300'));
  assert.ok(activeGet.includes('border-emerald-700/60'));

  const fallback = getHttpMethodBadgeClass('UNKNOWN', false);
  assert.ok(fallback.includes('text-zinc-400'));
  assert.ok(fallback.includes('border-zinc-800'));
});

test('navigateMethodIndex: wraps correctly on bounds', () => {
  const total = HTTP_METHODS.length;
  // Down from end wraps to 0
  assert.equal(navigateMethodIndex(total - 1, 'down', total), 0);
  // Up from 0 wraps to end
  assert.equal(navigateMethodIndex(0, 'up', total), total - 1);
  // Normal stepping
  assert.equal(navigateMethodIndex(0, 'down', total), 1);
  assert.equal(navigateMethodIndex(2, 'up', total), 1);
  // Negative index handling
  assert.equal(navigateMethodIndex(-1, 'down', total), 0);
  assert.equal(navigateMethodIndex(-1, 'up', total), total - 1);
  // Zero total
  assert.equal(navigateMethodIndex(0, 'down', 0), 0);
});

test('findMethodIndexByChar: jumps to matching prefix with wrap-around', () => {
  // HTTP_METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']
  const getIdx = HTTP_METHODS.indexOf('GET');
  const postIdx = HTTP_METHODS.indexOf('POST');
  const putIdx = HTTP_METHODS.indexOf('PUT');
  const patchIdx = HTTP_METHODS.indexOf('PATCH');
  const delIdx = HTTP_METHODS.indexOf('DELETE');

  assert.equal(findMethodIndexByChar('g', HTTP_METHODS, 0), getIdx);
  assert.equal(findMethodIndexByChar('d', HTTP_METHODS, 0), delIdx);

  // Cycling 'P' from POST should find PUT, then PATCH, then POST
  assert.equal(findMethodIndexByChar('p', HTTP_METHODS, postIdx), putIdx);
  assert.equal(findMethodIndexByChar('p', HTTP_METHODS, putIdx), patchIdx);
  assert.equal(findMethodIndexByChar('p', HTTP_METHODS, patchIdx), postIdx);

  // Non-matching character
  assert.equal(findMethodIndexByChar('z', HTTP_METHODS, 0), -1);
  assert.equal(findMethodIndexByChar('', HTTP_METHODS, 0), -1);
});
