import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatResponseSize,
  formatElapsedTime,
  formatStatusCode,
} from './responseViewerUtils.ts';

test('formatResponseSize formats bytes correctly', () => {
  assert.equal(formatResponseSize(0), '0 B');
  assert.equal(formatResponseSize(512), '512 B');
  assert.equal(formatResponseSize(1024), '1.0 KB');
  assert.equal(formatResponseSize(1657), '1.6 KB');
  assert.equal(formatResponseSize(1024 * 1024 * 2.5), '2.50 MB');
});

test('formatElapsedTime formats ms and s correctly', () => {
  assert.equal(formatElapsedTime(0), '0 ms');
  assert.equal(formatElapsedTime(313.34), '313 ms');
  assert.equal(formatElapsedTime(999), '999 ms');
  assert.equal(formatElapsedTime(1200), '1.2s');
  assert.equal(formatElapsedTime(10500), '11s');
});

test('formatStatusCode handles HTTP codes', () => {
  const ok = formatStatusCode('http', 200, 'OK');
  assert.equal(ok.label, '200 OK');
  assert.equal(ok.isSuccess, true);
  assert.equal(ok.isError, false);

  const notFound = formatStatusCode('http', 404, 'Not Found');
  assert.equal(notFound.label, '404 Not Found');
  assert.equal(notFound.isSuccess, false);
  assert.equal(notFound.isError, true);

  const redirect = formatStatusCode('http', 301, 'Moved Permanently');
  assert.equal(redirect.isWarning, true);
});

test('formatStatusCode handles gRPC codes Postman-style', () => {
  const ok = formatStatusCode('grpc', 0, 'OK');
  assert.equal(ok.label, '0 OK');
  assert.equal(ok.isSuccess, true);
  assert.equal(ok.isError, false);

  const unavail = formatStatusCode('grpc', 14, 'Unavailable');
  assert.equal(unavail.isSuccess, false);
  assert.equal(unavail.isError, true);
  assert.ok(unavail.label.includes('14'));
});
