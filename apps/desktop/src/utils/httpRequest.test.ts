import assert from 'node:assert/strict';
import test from 'node:test';
import { splitUrlQuery } from './httpRequest.ts';

test('splitUrlQuery extracts decoded URL query parameters', () => {
  assert.deepEqual(splitUrlQuery('https://example.test/users?name=Jane%20Doe&active=true'), {
    url: 'https://example.test/users',
    params: [['name', 'Jane Doe'], ['active', 'true']],
  });
});

test('splitUrlQuery preserves malformed query components', () => {
  assert.deepEqual(splitUrlQuery('https://example.test/users?name=Jane%2'), {
    url: 'https://example.test/users',
    params: [['name', 'Jane%2']],
  });
});
