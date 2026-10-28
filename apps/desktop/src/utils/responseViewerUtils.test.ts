import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatResponseSize,
  formatElapsedTime,
  formatStatusCode,
  getHttpStatusColors,
  formatTraceRequestBody,
  formatCopyTrace,
  substituteVariables,
  extractAddressFromError,
  RESPONSE_PROGRESS_BAR_CONTAINER_CLASS,
} from './responseViewerUtils.ts';
import type { Endpoint } from '@api-lab/api-types';

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

test('getHttpStatusColors maps tiers to semantic colors', () => {
  const success200 = getHttpStatusColors(200);
  assert.ok(success200.badgeClass.includes('emerald'));
  assert.ok(success200.dotClass.includes('emerald'));

  const redirect302 = getHttpStatusColors(302);
  assert.ok(redirect302.badgeClass.includes('blue'));
  assert.ok(redirect302.dotClass.includes('blue'));

  const clientError404 = getHttpStatusColors(404);
  assert.ok(clientError404.badgeClass.includes('amber'));
  assert.ok(clientError404.dotClass.includes('amber'));

  const serverError500 = getHttpStatusColors(500);
  assert.ok(serverError500.badgeClass.includes('red'));
  assert.ok(serverError500.dotClass.includes('red'));

  const zeroOrUnknown = getHttpStatusColors(0);
  assert.ok(zeroOrUnknown.badgeClass.includes('zinc'));
});

test('formatStatusCode handles gRPC codes with standard status label', () => {
  const ok = formatStatusCode('grpc', 0, 'OK');
  assert.equal(ok.label, '0 OK');
  assert.equal(ok.isSuccess, true);
  assert.equal(ok.isError, false);

  const unavail = formatStatusCode('grpc', 14, 'Unavailable');
  assert.equal(unavail.isSuccess, false);
  assert.equal(unavail.isError, true);
  assert.ok(unavail.label.includes('14'));
});

test('formatTraceRequestBody handles empty and json payloads', () => {
  assert.equal(formatTraceRequestBody(null, 'none'), '  (empty)');
  assert.equal(formatTraceRequestBody('', 'json'), '  (empty)');

  const json = JSON.stringify({ key: 'val', num: 123 });
  const formattedJson = formatTraceRequestBody(json, 'json');
  assert.ok(formattedJson.includes('"key": "val"'));
  assert.ok(formattedJson.includes('"num": 123'));
});

test('formatTraceRequestBody handles multipart payloads suppressing binary data', () => {
  const multipart = JSON.stringify([
    {
      name: 'fileUpload',
      filename: 'sample.pdf',
      data: 'JVBERi0xLjQKJcTl8uXr...verylongbase64string...',
      content_type: 'application/pdf',
    },
    {
      name: 'description',
      value: 'My document description',
    },
  ]);

  const result = formatTraceRequestBody(multipart, 'multipart');
  assert.ok(result.includes('filename="sample.pdf"'));
  assert.ok(result.includes('filesize='));
  assert.ok(result.includes('type=application/pdf'));
  assert.ok(result.includes('description: "My document description"'));
  // Ensure base64 payload is omitted completely
  assert.equal(result.includes('verylongbase64string'), false);
});

test('formatTraceRequestBody handles binary payload', () => {
  const binary = JSON.stringify({
    filename: 'avatar.png',
    data: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9h...',
    content_type: 'image/png',
  });

  const result = formatTraceRequestBody(binary, 'binary');
  assert.ok(result.includes('filename="avatar.png"'));
  assert.ok(result.includes('filesize='));
  assert.ok(result.includes('type=image/png'));
  assert.equal(result.includes('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9h'), false);
});

test('formatCopyTrace formats complete HTTP trace with multipart payload', () => {
  const endpoint: Endpoint = {
    id: 'ep-1',
    collection_id: 'col-1',
    name: 'Upload Endpoint',
    protocol: 'http',
    config: {
      url: 'https://httpbin.org/post',
      method: 'POST',
      body_type: 'multipart',
      body: JSON.stringify([
        {
          name: 'avatar',
          filename: 'profile.jpg',
          data: 'base64bytesdata12345',
          content_type: 'image/jpeg',
        },
      ]),
      query_params: [['redirect', 'true']],
      headers: { 'X-Custom-Header': 'TestValue' },
    },
    sort_order: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const trace = formatCopyTrace({
    endpoint,
    response: {
      status_code: 0,
      status_text: 'Execution Failed',
      response_time_ms: 0,
      response_size_bytes: 0,
      headers: {},
      body: '',
      error: 'Failed to connect to host: connection refused',
    },
    executedMeta: {
      timestamp: '2026-10-26T12:00:00.000Z',
      protocol: 'http',
      http: {
        url: 'https://httpbin.org/post',
        method: 'POST',
        queryParams: [['redirect', 'true']],
        headers: { 'X-Custom-Header': 'TestValue' },
        body: endpoint.config.body,
        bodyType: 'multipart',
      },
    },
  });

  assert.ok(trace.includes('Endpoint: https://httpbin.org/post'));
  assert.ok(trace.includes('HTTP Method: POST'));
  assert.ok(trace.includes('Time: 2026-10-26T12:00:00.000Z'));
  assert.ok(trace.includes('Status: 0 Execution Failed'));
  assert.ok(trace.includes('Request Param:'));
  assert.ok(trace.includes('redirect: true'));
  assert.ok(trace.includes('Request Header:'));
  assert.ok(trace.includes('X-Custom-Header: TestValue'));
  assert.ok(trace.includes('Request Body:'));
  assert.ok(trace.includes('filename="profile.jpg"'));
  assert.ok(trace.includes('filesize='));
  assert.equal(trace.includes('base64bytesdata12345'), false);
  assert.ok(trace.includes('Error: Connection Refused'));
  assert.ok(trace.includes('Details:'));
});

test('formatCopyTrace formats complete gRPC trace', () => {
  const endpoint: Endpoint = {
    id: 'ep-2',
    collection_id: 'col-1',
    name: 'Get User',
    protocol: 'grpc',
    config: {
      server_address: 'localhost:50051',
      service: 'api.UserService',
      method: 'GetUser',
      metadata: { authorization: 'Bearer token123' },
      payload: { id: 42 },
    },
    sort_order: 1,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const trace = formatCopyTrace({
    endpoint,
    response: {
      status_code: 14,
      status_message: 'Unavailable',
      response_time_ms: 0,
      response_size_bytes: 0,
      metadata: {},
      body: null,
      error: 'failed to connect to all addresses',
    },
  });

  assert.ok(trace.includes('Endpoint: localhost:50051'));
  assert.ok(trace.includes('Protocol: gRPC'));
  assert.ok(trace.includes('RPC Service: api.UserService'));
  assert.ok(trace.includes('RPC Method: GetUser'));
  assert.ok(trace.includes('Status: 14 UNAVAILABLE'));
  assert.ok(trace.includes('Request Header:'));
  assert.ok(trace.includes('authorization: Bearer token123'));
  assert.ok(trace.includes('Request Body:'));
  assert.ok(trace.includes('"id": 42'));
  assert.ok(trace.includes('Error: Connection Refused'));
});

test('substituteVariables replaces {{VAR}} case-insensitively', () => {
  const vars = { NUCONNECTOR_GRPC_URL: '127.0.0.1:3100', ApiKey: 'secret_123' };
  assert.equal(substituteVariables('{{NUCONNECTOR_GRPC_URL}}', vars), '127.0.0.1:3100');
  assert.equal(substituteVariables('http://{{nuconnector_grpc_url}}/api', vars), 'http://127.0.0.1:3100/api');
  assert.equal(substituteVariables('Bearer {{apikey}}', vars), 'Bearer secret_123');
  assert.equal(substituteVariables('{{MISSING_VAR}}', vars), '{{MISSING_VAR}}');
});

test('extractAddressFromError parses target IP and port from transport errors', () => {
  const rawErr = `Failed to retrieve service reflection: failed to connect to gRPC server: transport error (tonic::transport::Error(Transport, ConnectError(ConnectError("tcp connect error", 127.0.0.1:3100, Os { code: 10061, kind: ConnectionRefused, message: "No connection could be made because the target machine actively refused it." }))) -> tcp connect error -> tcp connect error -> No connection could be made because the target machine actively refused it. (os error 10061))`;
  assert.equal(extractAddressFromError(rawErr), '127.0.0.1:3100');

  const httpErr = `connect error: failed to connect to 192.168.1.50:8080: timed out`;
  assert.equal(extractAddressFromError(httpErr), '192.168.1.50:8080');
});

test('formatCopyTrace resolves template variable to actual endpoint value', () => {
  const endpoint: Endpoint = {
    id: 'ep-var',
    collection_id: 'col-1',
    name: 'Variable Endpoint',
    protocol: 'grpc',
    config: {
      server_address: '{{NUCONNECTOR_GRPC_URL}}',
      service: 'grpc.health.v1.Health',
      method: 'Check',
    },
    sort_order: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const trace = formatCopyTrace({
    endpoint,
    response: {
      status_code: 14,
      status_message: 'Unavailable',
      response_time_ms: 0,
      response_size_bytes: 0,
      metadata: {},
      body: null,
      error: 'transport error ConnectError("tcp connect error", 127.0.0.1:3100)',
    },
    variables: {
      NUCONNECTOR_GRPC_URL: '127.0.0.1:3100',
    },
  });

  assert.ok(trace.includes('Endpoint: 127.0.0.1:3100'));
  assert.equal(trace.includes('{{NUCONNECTOR_GRPC_URL}}'), false);
});

test('formatCopyTrace falls back to error details address if variable is not in dictionary', () => {
  const endpoint: Endpoint = {
    id: 'ep-fallback',
    collection_id: 'col-1',
    name: 'Unmapped Variable Endpoint',
    protocol: 'grpc',
    config: {
      server_address: '{{NUCONNECTOR_GRPC_URL}}',
      service: 'grpc.health.v1.Health',
      method: 'Check',
    },
    sort_order: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const trace = formatCopyTrace({
    endpoint,
    response: {
      status_code: 14,
      status_message: 'Unavailable',
      response_time_ms: 0,
      response_size_bytes: 0,
      metadata: {},
      body: null,
      error: 'Failed to connect: ConnectError("tcp connect error", 127.0.0.1:3100, Os { code: 10061 })',
    },
    variables: {}, // Empty variables
  });

  // Replaced via socket error fallback
  assert.ok(trace.includes('Endpoint: 127.0.0.1:3100'));
  assert.equal(trace.includes('{{NUCONNECTOR_GRPC_URL}}'), false);
});

test('RESPONSE_PROGRESS_BAR_CONTAINER_CLASS enforces absolute zero-CLS layout', () => {
  assert.ok(RESPONSE_PROGRESS_BAR_CONTAINER_CLASS.includes('absolute'));
  assert.ok(RESPONSE_PROGRESS_BAR_CONTAINER_CLASS.includes('top-0'));
  assert.ok(RESPONSE_PROGRESS_BAR_CONTAINER_CLASS.includes('inset-x-0'));
  assert.ok(RESPONSE_PROGRESS_BAR_CONTAINER_CLASS.includes('pointer-events-none'));
  assert.ok(RESPONSE_PROGRESS_BAR_CONTAINER_CLASS.includes('h-[2px]'));
});



