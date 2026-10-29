import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runBeforeHook,
  runAfterHook,
  type HttpRequestContext,
  type HttpResponseContext,
  type GrpcRequestContext,
  type GrpcResponseContext,
} from './hookRunner.ts';

test('HTTP Before Hook: modifies url, headers, and sets environment variables', async () => {
  const req: HttpRequestContext = {
    url: 'https://api.example.com/items',
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  };

  const initialVars = { API_KEY: 'secret123' };

  const script = `
    // Script hook API
    pm.request.headers['Authorization'] = 'Bearer ' + pm.variables.get('API_KEY');
    pm.environment.set('TIMESTAMP', '1600000000');
    console.log('Attached authorization token');
  `;

  const result = await runBeforeHook(script, req, initialVars);

  assert.equal(result.error, undefined);
  assert.equal(result.request.headers['Authorization'], 'Bearer secret123');
  assert.equal(result.variables['TIMESTAMP'], '1600000000');
  assert.equal(result.variables['API_KEY'], 'secret123');
  assert.equal(result.logs.length, 1);
  assert.match(result.logs[0], /Attached authorization token/);
  // Ensure headers dictionary contains only string values, no function pollution
  for (const [k, v] of Object.entries(result.request.headers)) {
    assert.equal(typeof v, 'string');
  }
});

test('HTTP Before Hook: supports crypto.randomUUID() and case-insensitive header access', async () => {
  const req: HttpRequestContext = {
    url: 'https://api.example.com/items',
    method: 'GET',
    headers: { 'X-Existing': 'existing-val' },
  };

  const script = `
    const uuid = crypto.randomUUID();
    pm.environment.set('REQ_UUID', uuid);
    pm.request.headers.set('X-Request-ID', uuid);
    const existing = pm.request.headers.get('x-existing');
    pm.environment.set('CHECK_EXISTING', existing);
  `;

  const result = await runBeforeHook(script, req, {});
  assert.equal(result.error, undefined);
  assert.ok(result.variables['REQ_UUID']);
  assert.match(
    result.variables['REQ_UUID'],
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
  assert.equal(result.request.headers['X-Request-ID'], result.variables['REQ_UUID']);
  assert.equal(result.variables['CHECK_EXISTING'], 'existing-val');
});

test('HTTP After Hook: inspects response, parses JSON, and sets token variable', async () => {
  const req: HttpRequestContext = {
    url: 'https://api.example.com/login',
    method: 'POST',
    headers: {},
  };

  const res: HttpResponseContext = {
    status_code: 200,
    status_text: 'OK',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      access_token: 'jwt_token_xyz',
      user: { id: 42, name: 'Alice' },
    }),
  };

  const initialVars = {};

  const script = `
    pm.test("Status code is 200", function () {
      pm.expect(pm.response.code).to.equal(200);
    });

    const data = pm.response.json();
    pm.test("Token exists", function () {
      pm.expect(data.access_token).to.include("jwt_token");
    });

    pm.environment.set("ACCESS_TOKEN", data.access_token);
    pm.environment.set("USER_ID", data.user.id);
  `;

  const result = await runAfterHook(script, req, res, initialVars);

  assert.equal(result.error, undefined);
  assert.equal(result.tests.length, 2);
  assert.equal(result.tests[0].passed, true);
  assert.equal(result.tests[1].passed, true);
  assert.equal(result.variables['ACCESS_TOKEN'], 'jwt_token_xyz');
  assert.equal(result.variables['USER_ID'], '42');
});

test('gRPC Before Hook: mutates server_address, metadata, and payload', async () => {
  const req: GrpcRequestContext = {
    server_address: 'localhost:50051',
    service: 'nutrade.manager.AuthAPI',
    method: 'Login',
    metadata: {},
    payload: { login: 'old_login' },
  };

  const initialVars = { GRPC_HOST: 'localhost:9091' };

  const script = `
    request.server_address = variables['GRPC_HOST'];
    request.payload.login = "200010";
    request.payload.password = "lmOLj6Yivv1zYLMD";
    request.metadata['x-client-id'] = 'api-lab-test';
  `;

  const result = await runBeforeHook(script, req, initialVars);

  assert.equal(result.error, undefined);
  assert.equal(result.request.server_address, 'localhost:9091');
  assert.equal(result.request.payload.login, '200010');
  assert.equal(result.request.payload.password, 'lmOLj6Yivv1zYLMD');
  assert.equal(result.request.metadata['x-client-id'], 'api-lab-test');
});

test('gRPC After Hook: inspects status code, body and runs assertions', async () => {
  const req: GrpcRequestContext = {
    server_address: 'localhost:9091',
    service: 'nutrade.manager.AuthAPI',
    method: 'Login',
    metadata: {},
    payload: {},
  };

  const res: GrpcResponseContext = {
    status_code: 0,
    status_message: 'OK',
    metadata: {},
    body: {
      details: {
        token: 'ey-token-123',
        user: { name: 'NUTRADE-DEV' },
      },
      message: 'OK',
    },
  };

  const script = `
    pm.test("gRPC OK status", function () {
      pm.expect(pm.response.code).to.equal(0);
    });

    const body = pm.response.json();
    pm.test("Response contains user", function () {
      pm.expect(body.details.user.name).to.equal("NUTRADE-DEV");
    });

    pm.variables.set("AUTH_BEARER", body.details.token);
  `;

  const result = await runAfterHook(script, req, res, {});

  assert.equal(result.error, undefined);
  assert.equal(result.tests.length, 2);
  assert.equal(result.tests[0].passed, true);
  assert.equal(result.tests[1].passed, true);
  assert.equal(result.variables['AUTH_BEARER'], 'ey-token-123');
});

test('Error handling: capture script syntax and runtime error without crash', async () => {
  const req: HttpRequestContext = {
    url: 'https://example.com',
    method: 'GET',
    headers: {},
  };

  const script = `
    // Throwing error
    throw new Error("Custom assertion failed");
  `;

  const result = await runBeforeHook(script, req, {});
  assert.ok(result.error);
  assert.match(result.error, /Custom assertion failed/);
});

test('HTTP After Hook: warns on empty test closure with zero assertions', async () => {
  const req: HttpRequestContext = {
    url: 'https://api.example.com/login',
    method: 'POST',
    headers: {},
  };

  const res: HttpResponseContext = {
    status_code: 200,
    headers: {},
    body: '{"ok": true}',
  };

  const script = `
    pm.test("Save token", () => {
    });

    pm.test("Valid assertion", () => {
      pm.expect(pm.response.code).to.equal(200);
    });
  `;

  const result = await runAfterHook(script, req, res, {});

  assert.equal(result.tests.length, 2);
  // Empty test closure must warn with zero assertions instead of pass
  assert.equal(result.tests[0].name, 'Save token');
  assert.equal(result.tests[0].passed, false);
  assert.equal(result.tests[0].status, 'warn');
  assert.equal(result.tests[0].warning, 'zero assertions');

  // Valid assertion passes
  assert.equal(result.tests[1].name, 'Valid assertion');
  assert.equal(result.tests[1].passed, true);
  assert.equal(result.tests[1].status, 'pass');
});

test('HTTP After Hook: supports below, above, and type assertions', async () => {
  const req: HttpRequestContext = {
    url: 'https://api.example.com/items',
    method: 'GET',
    headers: {},
  };

  const res: HttpResponseContext = {
    status_code: 200,
    headers: {},
    body: '{"count": 42, "items": [1, 2]}',
    response_time_ms: 120,
  };

  const script = `
    const data = pm.response.json();
    pm.test("Response time is under 500ms", () => {
      pm.expect(pm.response.responseTime).to.be.below(500);
    });
    pm.test("Count is positive", () => {
      pm.expect(data.count).to.be.above(0);
    });
    pm.test("Items is array", () => {
      pm.expect(data.items).to.be.an("array");
    });
  `;

  const result = await runAfterHook(script, req, res, {});

  assert.equal(result.tests.length, 3);
  assert.equal(result.tests[0].passed, true);
  assert.equal(result.tests[1].passed, true);
  assert.equal(result.tests[2].passed, true);
});
