import assert from 'node:assert/strict';
import test from 'node:test';
import {
  splitUrlQuery,
  encodeQueryParamComponent,
  serializeQueryParams,
  serializeQueryParamsToUrl,
  parseUrlQueryParams,
  type QueryParamRow,
} from './httpRequest.ts';

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

test('encodeQueryParamComponent preserves template variables and encodes specials', () => {
  assert.equal(encodeQueryParamComponent('hello world'), 'hello%20world');
  assert.equal(encodeQueryParamComponent('{{USER_ID}}'), '{{USER_ID}}');
  assert.equal(encodeQueryParamComponent('prefix-{{TOKEN}}-suffix'), 'prefix-{{TOKEN}}-suffix');
  assert.equal(encodeQueryParamComponent('a=b&c=d'), 'a%3Db%26c%3Dd');
});

test('serializeQueryParams serializes active parameters and skips disabled or empty keys', () => {
  const params: QueryParamRow[] = [
    ['query', 'value', 'desc 1', true],
    ['param', 'test', 'desc 2', true],
    ['disabled', 'ignore', 'desc 3', false],
    ['', 'no-key', 'desc 4', true],
    ['  ', 'whitespace-key', 'desc 5', true],
    ['empty_val', '', '', true],
  ];
  assert.equal(serializeQueryParams(params), 'query=value&param=test&empty_val=');
});

test('serializeQueryParams preserves duplicate keys in sequence', () => {
  const params: QueryParamRow[] = [
    ['filter', 'active', '', true],
    ['filter', 'pending', '', true],
  ];
  assert.equal(serializeQueryParams(params), 'filter=active&filter=pending');
});

test('serializeQueryParamsToUrl updates query string and preserves hash fragment', () => {
  const params: QueryParamRow[] = [
    ['page', '1', '', true],
    ['limit', '50', '', true],
  ];

  // Clean URL
  assert.equal(
    serializeQueryParamsToUrl('https://example.com/items', params),
    'https://example.com/items?page=1&limit=50'
  );

  // Existing query replaced
  assert.equal(
    serializeQueryParamsToUrl('https://example.com/items?old=value', params),
    'https://example.com/items?page=1&limit=50'
  );

  // URL with hash fragment
  assert.equal(
    serializeQueryParamsToUrl('https://example.com/items#summary', params),
    'https://example.com/items?page=1&limit=50#summary'
  );

  // URL with existing query and hash fragment
  assert.equal(
    serializeQueryParamsToUrl('https://example.com/items?foo=bar#summary', params),
    'https://example.com/items?page=1&limit=50#summary'
  );

  // When all params disabled, removes query string but keeps base and hash
  const disabled: QueryParamRow[] = [['foo', 'bar', '', false]];
  assert.equal(
    serializeQueryParamsToUrl('https://example.com/items?foo=bar#summary', disabled),
    'https://example.com/items#summary'
  );
  assert.equal(
    serializeQueryParamsToUrl('https://example.com/items?foo=bar', disabled),
    'https://example.com/items'
  );
});

test('parseUrlQueryParams parses query string with encoding, duplicate keys, and flags', () => {
  const url = 'https://example.com/search?query=hello+world&tag=alpha&tag=beta&flag&empty=&broken=%2';
  const parsed = parseUrlQueryParams(url);

  assert.deepEqual(parsed, [
    ['query', 'hello world', '', true],
    ['tag', 'alpha', '', true],
    ['tag', 'beta', '', true],
    ['flag', '', '', true],
    ['empty', '', '', true],
    ['broken', '%2', '', true],
  ]);
});

test('parseUrlQueryParams skips empty keys in query string', () => {
  const url = 'https://example.com/search?&=value&&valid=yes&=';
  const parsed = parseUrlQueryParams(url);
  assert.deepEqual(parsed, [['valid', 'yes', '', true]]);
});

test('parseUrlQueryParams reconciles descriptions and preserves disabled rows from existing params', () => {
  const existing: QueryParamRow[] = [
    ['query', 'old', 'User search term', true],
    ['tag', 'first', 'Primary tag', true],
    ['tag', 'second', 'Secondary tag', true],
    ['disabled_feature', 'off', 'Disabled setting', false],
  ];

  // User edits URL: changes query to 'shoes', edits second tag, adds sort, removes first tag
  const newUrl = 'https://example.com/search?query=shoes&tag=second_edited&sort=desc';
  const parsed = parseUrlQueryParams(newUrl, existing);

  assert.deepEqual(parsed, [
    ['query', 'shoes', 'User search term', true], // Preserved description
    ['tag', 'second_edited', 'Primary tag', true], // Matched first available tag description
    ['sort', 'desc', '', true], // New active entry
    ['disabled_feature', 'off', 'Disabled setting', false], // Preserved disabled entry!
  ]);
});

test('parseUrlQueryParams preserves disabled rows even when query string is emptied', () => {
  const existing: QueryParamRow[] = [
    ['active_one', '1', 'Desc', true],
    ['disabled_one', '2', 'Disabled Desc', false],
  ];

  const emptyQueryUrl = 'https://example.com/search';
  const parsed = parseUrlQueryParams(emptyQueryUrl, existing);

  assert.deepEqual(parsed, [
    ['disabled_one', '2', 'Disabled Desc', false],
  ]);
});

test('bidirectional query params round-trip', () => {
  const originalParams: QueryParamRow[] = [
    ['q', 'smart phone', 'Search text', true],
    ['brand', 'apple', 'Brand filter', true],
    ['brand', 'samsung', 'Duplicate brand filter', true],
  ];

  const serializedUrl = serializeQueryParamsToUrl('https://api.shop.com/v1/products', originalParams);
  assert.equal(
    serializedUrl,
    'https://api.shop.com/v1/products?q=smart%20phone&brand=apple&brand=samsung'
  );

  const parsedParams = parseUrlQueryParams(serializedUrl, originalParams);
  assert.deepEqual(parsedParams, originalParams);
});
