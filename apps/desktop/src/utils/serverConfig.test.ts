import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SERVER_URL,
  SERVER_URL_STORAGE_KEY,
  normalizeServerUrl,
  getServerUrl,
  setServerUrl,
  resetServerUrl,
  getApiBaseUrl,
  getWsBaseUrl,
  parseServerVersionResponse,
  fetchServerVersion,
} from './serverConfig.ts';

test('normalizeServerUrl: defaults on empty input', () => {
  assert.equal(normalizeServerUrl(''), DEFAULT_SERVER_URL);
  assert.equal(normalizeServerUrl('   '), DEFAULT_SERVER_URL);
});

test('normalizeServerUrl: automatically prefixes http:// when missing', () => {
  assert.equal(normalizeServerUrl('localhost:8080'), 'http://localhost:8080');
  assert.equal(normalizeServerUrl('127.0.0.1:9090'), 'http://127.0.0.1:9090');
  assert.equal(normalizeServerUrl('api.example.com'), 'http://api.example.com');
});

test('normalizeServerUrl: strips trailing slashes and redundant /api/v1', () => {
  assert.equal(normalizeServerUrl('http://localhost:8080/'), 'http://localhost:8080');
  assert.equal(normalizeServerUrl('http://localhost:8080/api/v1'), 'http://localhost:8080');
  assert.equal(normalizeServerUrl('http://localhost:8080/api/v1/'), 'http://localhost:8080');
  assert.equal(normalizeServerUrl('https://api.lab.internal/api/v1/'), 'https://api.lab.internal');
});

test('normalizeServerUrl: preserves https:// and custom ports', () => {
  assert.equal(normalizeServerUrl('https://remote.corp:8443'), 'https://remote.corp:8443');
});

test('getServerUrl and setServerUrl: manages localStorage lifecycle', () => {
  const store: Record<string, string> = {};
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    },
  };

  // Initially default
  assert.equal(getServerUrl(), DEFAULT_SERVER_URL);

  // Set custom
  setServerUrl('http://192.168.1.100:8080');
  assert.equal(getServerUrl(), 'http://192.168.1.100:8080');
  assert.equal(store[SERVER_URL_STORAGE_KEY], 'http://192.168.1.100:8080');

  // Set back to default clears key
  setServerUrl('http://localhost:8080');
  assert.equal(store[SERVER_URL_STORAGE_KEY], undefined);
  assert.equal(getServerUrl(), DEFAULT_SERVER_URL);

  // Reset helper
  setServerUrl('https://api.domain.com');
  assert.equal(getServerUrl(), 'https://api.domain.com');
  resetServerUrl();
  assert.equal(getServerUrl(), DEFAULT_SERVER_URL);
});

test('getApiBaseUrl and getWsBaseUrl: maps protocols correctly', () => {
  const store: Record<string, string> = {};
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    },
  };

  // HTTP default
  resetServerUrl();
  assert.equal(getApiBaseUrl(), 'http://localhost:8080/api/v1');
  assert.equal(getWsBaseUrl(), 'ws://localhost:8080/api/v1');

  // HTTPS
  setServerUrl('https://api.cloud.corp');
  assert.equal(getApiBaseUrl(), 'https://api.cloud.corp/api/v1');
  assert.equal(getWsBaseUrl(), 'wss://api.cloud.corp/api/v1');
});

test('parseServerVersionResponse: validates and normalizes server version JSON', () => {
  assert.deepEqual(
    parseServerVersionResponse({
      service: 'api-lab-server',
      version: 'v0.1.163',
      api_version: 'v1',
      git_sha: '71aadfa',
    }),
    {
      service: 'api-lab-server',
      version: '0.1.163',
      api_version: 'v1',
      git_sha: '71aadfa',
    }
  );
  assert.equal(parseServerVersionResponse(null), null);
  assert.equal(parseServerVersionResponse({ version: '   ' }), null);
  assert.equal(parseServerVersionResponse({ status: 'ok' }), null);
});

test('fetchServerVersion: queries /api/v1/version and degrades gracefully on error or 404', async () => {
  let requestedUrl = '';
  const okFetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        service: 'api-lab-server',
        version: '0.1.163',
        api_version: 'v1',
        git_sha: '71aadfa',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const info = await fetchServerVersion('localhost:8080/api/v1/', okFetch);
  assert.equal(requestedUrl, 'http://localhost:8080/api/v1/version');
  assert.equal(info?.version, '0.1.163');
  assert.equal(info?.git_sha, '71aadfa');

  const notFoundFetch = (async () => new Response('Not Found', { status: 404 })) as typeof fetch;
  assert.equal(await fetchServerVersion('http://localhost:8080', notFoundFetch), null);

  const errorFetch = (async () => {
    throw new Error('ECONNREFUSED');
  }) as typeof fetch;
  assert.equal(await fetchServerVersion('http://localhost:8080', errorFetch), null);
});
