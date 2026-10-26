import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPathVariables,
  interpolatePathVariables,
  convertSwaggerPathToApiPath,
  syncPathVariablesWithKeys,
} from './pathVariables.ts';

test('convertSwaggerPathToApiPath: converts {param} into :param', () => {
  const input = '/manager/api/v1/emergency-contact-status/{id}';
  assert.equal(
    convertSwaggerPathToApiPath(input),
    '/manager/api/v1/emergency-contact-status/:id'
  );

  const multiple = '/users/{userId}/books/{bookId}';
  assert.equal(
    convertSwaggerPathToApiPath(multiple),
    '/users/:userId/books/:bookId'
  );

  assert.equal(convertSwaggerPathToApiPath('/api/v1/health'), '/api/v1/health');
});

test('convertSwaggerPathToApiPath: preserves environment variables', () => {
  assert.equal(
    convertSwaggerPathToApiPath('https://{{nutrade_se}}/api/{{BASE_URL}}/{id}'),
    'https://{{nutrade_se}}/api/{{BASE_URL}}/:id'
  );
});

test('extractPathVariables: extracts keys from standard full URL', () => {
  const url = 'https://httpbin.org/status/:id';
  assert.deepEqual(extractPathVariables(url), ['id']);
});

test('extractPathVariables: ignores port in host', () => {
  const url = 'http://localhost:8080/manager/api/v1/emergency-contact-status/:id';
  assert.deepEqual(extractPathVariables(url), ['id']);
});

test('extractPathVariables: ignores query params and hash', () => {
  const url = 'https://example.com/items/:itemId?filter=:not_a_var#hash_:not';
  assert.deepEqual(extractPathVariables(url), ['itemId']);
});

test('extractPathVariables: extracts multiple unique keys', () => {
  const url = 'https://example.com/api/v1/orgs/:orgId/users/:userId/roles/:orgId';
  assert.deepEqual(extractPathVariables(url), ['orgId', 'userId']);
});

test('extractPathVariables: returns empty when no path variable', () => {
  assert.deepEqual(extractPathVariables('https://httpbin.org/get?query=1'), []);
  assert.deepEqual(extractPathVariables('http://localhost:8080/'), []);
});

test('interpolatePathVariables: replaces :key with value', () => {
  const url = 'https://httpbin.org/status/:id';
  const res = interpolatePathVariables(url, [['id', '42']]);
  assert.equal(
    res,
    'https://httpbin.org/status/42'
  );
});

test('interpolatePathVariables: respects word boundaries and distinct prefixes', () => {
  const url = 'http://localhost:8080/users/:id_token/:id';
  const res = interpolatePathVariables(url, [
    ['id', '99'],
    ['id_token', 'jwt_abc'],
  ]);
  assert.equal(res, 'http://localhost:8080/users/jwt_abc/99');
});

test('interpolatePathVariables: preserves port and query string', () => {
  const url = 'http://localhost:8080/users/:id?active=true#profile';
  const res = interpolatePathVariables(url, [['id', 'user_123']]);
  assert.equal(res, 'http://localhost:8080/users/user_123?active=true#profile');
});

test('syncPathVariablesWithKeys: keeps existing values and descriptions', () => {
  const existing: [string, string, string][] = [
    ['id', '100', 'Unique user id'],
    ['old', 'discard', 'stale'],
  ];
  const keys = ['id', 'status'];

  const synced = syncPathVariablesWithKeys(existing, keys);
  assert.deepEqual(synced, [
    ['id', '100', 'Unique user id'],
    ['status', '', ''],
  ]);
});
