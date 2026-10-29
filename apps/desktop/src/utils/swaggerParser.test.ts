import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSwaggerSpec,
  generateSampleFromSchema,
  deriveBaseUrl,
  resolveRef,
  resolveSwaggerSamplePayload,
  resolveSwaggerSampleResult,
  findMatchingSwaggerEndpoint,
  resolveSwaggerSampleParams,
  generateSmartStringSample,
  generateSmartNumberSample,
  generateSmartBooleanSample,
  type SwaggerDoc,
} from './swaggerParser.ts';

test('resolveRef: correctly resolves internal #/definitions and #/components/schemas', () => {
  const doc: SwaggerDoc = {
    definitions: {
      User: { type: 'object', properties: { id: { type: 'string' } } },
    },
    components: {
      schemas: {
        Role: { type: 'string', enum: ['admin', 'user'] },
      },
    },
  };

  assert.deepEqual(resolveRef('#/definitions/User', doc), {
    type: 'object',
    properties: { id: { type: 'string' } },
  });
  assert.deepEqual(resolveRef('#/components/schemas/Role', doc), {
    type: 'string',
    enum: ['admin', 'user'],
  });
  assert.equal(resolveRef('#/definitions/NonExistent', doc), null);
});

test('generateSampleFromSchema: primitives and enums', () => {
  const doc: SwaggerDoc = {};
  assert.equal(generateSampleFromSchema({ type: 'string' }, doc), 'sample_value');
  assert.equal(
    generateSampleFromSchema({ type: 'string', format: 'date-time' }, doc),
    '2026-10-30T12:00:00Z'
  );
  assert.equal(
    generateSampleFromSchema({ type: 'string', enum: ['PENDING', 'ACTIVE'] }, doc),
    'PENDING'
  );
  assert.equal(generateSampleFromSchema({ type: 'integer' }, doc), 100);
  assert.equal(generateSampleFromSchema({ type: 'boolean' }, doc), true);
});

test('generateSampleFromSchema: objects, arrays, and nested schemas', () => {
  const doc: SwaggerDoc = {};
  const schema = {
    type: 'object',
    properties: {
      id: { type: 'integer', default: 101 },
      username: { type: 'string', example: 'robby' },
      tags: {
        type: 'array',
        items: { type: 'string', example: 'dev' },
      },
      profile: {
        type: 'object',
        properties: {
          bio: { type: 'string', default: 'engineer' },
        },
      },
    },
  };

  const sample = generateSampleFromSchema(schema, doc);
  assert.deepEqual(sample, {
    id: 101,
    username: 'robby',
    tags: ['dev'],
    profile: {
      bio: 'engineer',
    },
  });
});

test('generateSampleFromSchema: handles circular references safely without infinite recursion', () => {
  const doc: SwaggerDoc = {
    definitions: {
      Node: {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'root' },
          child: { $ref: '#/definitions/Node' },
        },
      },
    },
  };

  const sample = generateSampleFromSchema(doc.definitions!.Node, doc);
  assert.deepEqual(sample, {
    name: 'root',
    child: {
      name: 'root',
      child: {},
    },
  });
});

test('deriveBaseUrl: resolves host, basePath, and servers correctly', () => {
  // Swagger 2.0 with host & basePath
  const doc2: SwaggerDoc = {
    swagger: '2.0',
    host: 'api.nutrade.com:8443',
    basePath: '/api/v1',
    schemes: ['https'],
  };
  assert.equal(
    deriveBaseUrl(doc2, 'http://localhost:9090/swagger.json'),
    'https://api.nutrade.com:8443/api/v1'
  );

  // OpenAPI 3.0 with servers
  const doc3: SwaggerDoc = {
    openapi: '3.0.0',
    servers: [{ url: 'https://gateway.internal/v2' }],
  };
  assert.equal(
    deriveBaseUrl(doc3, 'http://localhost:9090/openapi.json'),
    'https://gateway.internal/v2'
  );

  // Fallback to source URL origin
  const docFallback: SwaggerDoc = {
    swagger: '2.0',
    basePath: '/v1',
  };
  assert.equal(
    deriveBaseUrl(docFallback, 'http://localhost:9090/swagger/combined/nutrade.swagger.json'),
    'http://localhost:9090/v1'
  );
});

test('parseSwaggerSpec: parses Swagger 2.0 with tags, parameters, and payloads', () => {
  const doc: SwaggerDoc = {
    swagger: '2.0',
    info: {
      title: 'NuTrade Service APIs',
      version: 'v1',
    },
    paths: {
      '/manager/api/v1/users': {
        get: {
          operationId: 'ListUsers',
          tags: ['UserAPI'],
          parameters: [
            { in: 'query', name: 'page', default: '1' },
            { in: 'query', name: 'page_size', default: '50' },
          ],
        },
        post: {
          operationId: 'CreateUser',
          tags: ['UserAPI'],
          parameters: [
            {
              in: 'body',
              name: 'body',
              schema: {
                $ref: '#/definitions/CreateUserRequest',
              },
            },
            {
              in: 'header',
              name: 'Idempotency-Key',
              default: 'test-uuid',
            },
          ],
        },
      },
      '/manager/api/v1/auth/login': {
        post: {
          operationId: 'Login',
          tags: ['AuthAPI'],
          parameters: [
            {
              in: 'body',
              name: 'body',
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'admin@nutrade.com' },
                  password: { type: 'string' },
                },
              },
            },
          ],
        },
      },
    },
    definitions: {
      CreateUserRequest: {
        type: 'object',
        properties: {
          login: { type: 'string', default: '100020' },
          name: { type: 'string', default: 'John Doe' },
        },
      },
    },
  };

  const parsed = parseSwaggerSpec(doc, 'http://localhost:9090/swagger.json');

  assert.equal(parsed.title, 'NuTrade Service APIs');
  assert.equal(parsed.version, 'v1');
  assert.equal(parsed.totalEndpoints, 3);
  assert.equal(parsed.services.length, 2);

  const authService = parsed.services.find((s) => s.name === 'AuthAPI');
  assert.ok(authService);
  assert.equal(authService.endpoints.length, 1);
  assert.equal(authService.endpoints[0].name, 'Login');
  assert.equal(authService.endpoints[0].method, 'POST');
  assert.equal(authService.endpoints[0].bodyType, 'json');
  assert.ok(authService.endpoints[0].body.includes('admin@nutrade.com'));

  const userService = parsed.services.find((s) => s.name === 'UserAPI');
  assert.ok(userService);
  assert.equal(userService.endpoints.length, 2);

  const listEp = userService.endpoints.find((e) => e.method === 'GET');
  assert.ok(listEp);
  assert.deepEqual(listEp.queryParams, [
    ['page', '1'],
    ['page_size', '50'],
  ]);

  const createEp = userService.endpoints.find((e) => e.method === 'POST');
  assert.ok(createEp);
  assert.equal(createEp.headers['Idempotency-Key'], 'test-uuid');
  assert.ok(createEp.body.includes('100020'));
});

test('parseSwaggerSpec: parses OpenAPI 3.x with requestBody', () => {
  const doc: SwaggerDoc = {
    openapi: '3.0.0',
    info: { title: 'OpenAPI Store' },
    servers: [{ url: 'https://store.example.com/api' }],
    paths: {
      '/products/{id}': {
        put: {
          operationId: 'UpdateProduct',
          tags: ['Products'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', example: 'Laptop' },
                    price: { type: 'number', default: 999 },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const parsed = parseSwaggerSpec(doc, 'https://store.example.com/openapi.json');
  assert.equal(parsed.services.length, 1);
  assert.equal(parsed.services[0].name, 'Products');

  const ep = parsed.services[0].endpoints[0];
  assert.equal(ep.name, 'UpdateProduct');
  assert.equal(ep.method, 'PUT');
  assert.equal(ep.fullUrl, 'https://store.example.com/api/products/:id');
  assert.equal(ep.bodyType, 'json');
  assert.ok(ep.body.includes('Laptop'));
  assert.ok(ep.body.includes('999'));
});

test('extractSwaggerSpecification: extracts request and response specification correctly', () => {
  const doc: SwaggerDoc = {
    swagger: '2.0',
    paths: {
      '/trade/spot': {
        post: {
          operationId: 'TradeSpotRequest',
          tags: ['TradeAPI'],
          parameters: [
            {
              in: 'body',
              name: 'body',
              schema: {
                $ref: '#/definitions/TradeSpotRequest',
              },
            },
          ],
          responses: {
            '200': {
              schema: {
                $ref: '#/definitions/TradeResponse',
              },
            },
          },
        },
      },
    },
    definitions: {
      TradeSpotRequest: {
        type: 'object',
        properties: {
          login: { type: 'integer', format: 'uint64' },
          symbol: { type: 'string' },
          side: { type: 'string' },
          _volume: { oneOf: [{ type: 'number' }] },
        },
      },
      TradeResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', format: 'int32' },
          message: { type: 'string' },
          details: { $ref: '#/definitions/TradeDetails' },
          _order_value: { 'x-oneof': true },
        },
      },
      TradeDetails: {
        type: 'object',
        properties: {
          order_id: { type: 'string' },
        },
      },
    },
  };

  const parsed = parseSwaggerSpec(doc, 'http://localhost:9090/swagger.json');
  const ep = parsed.services[0].endpoints[0];
  assert.ok(ep.specification);
  assert.equal(ep.specification.requestTypeName, 'TradeSpotRequest');
  assert.equal(ep.specification.responseTypeName, 'TradeResponse');

  assert.deepEqual(ep.specification.requestFields, [
    { name: 'login', type: 'uint64', required: false, description: undefined },
    { name: 'symbol', type: 'string', required: false, description: undefined },
    { name: 'side', type: 'string', required: false, description: undefined },
    { name: '_volume', type: 'OneOf', required: false, description: undefined },
  ]);

  assert.deepEqual(ep.specification.responseFields, [
    { name: 'code', type: 'int32', required: false, description: undefined },
    { name: 'message', type: 'string', required: false, description: undefined },
    { name: 'details', type: 'TradeDetails', required: false, description: undefined },
    { name: '_order_value', type: 'OneOf', required: false, description: undefined },
  ]);

  assert.ok(ep.specification.schemas);
  assert.ok(ep.specification.schemas['TradeDetails']);
  assert.deepEqual(ep.specification.schemas['TradeDetails'], [
    { name: 'order_id', type: 'string', required: false, description: undefined },
  ]);
});

test('parseSwaggerSpec: converts path variable {id} to :id and extracts path parameters', () => {
  const doc: SwaggerDoc = {
    swagger: '2.0',
    host: 'httpbin.org',
    basePath: '',
    schemes: ['https'],
    paths: {
      '/manager/api/v1/emergency-contact-status/{id}': {
        get: {
          summary: 'Get Emergency Contact Status',
          tags: ['EmergencyAPI'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              type: 'string',
              description: 'Contact identifier',
              default: '123',
            },
            {
              name: 'verbose',
              in: 'query',
              type: 'boolean',
              description: 'Include full logs',
              default: 'true',
            },
          ],
        },
      },
    },
  };

  const parsed = parseSwaggerSpec(doc, 'https://httpbin.org/swagger.json');
  assert.equal(parsed.services.length, 1);
  const ep = parsed.services[0].endpoints[0];
  assert.equal(ep.path, '/manager/api/v1/emergency-contact-status/:id');
  assert.equal(
    ep.fullUrl,
    'https://httpbin.org/manager/api/v1/emergency-contact-status/:id'
  );
  assert.deepEqual(ep.pathVariables, [
    ['id', '123', 'Contact identifier'],
  ]);
  assert.deepEqual(ep.queryParams, [
    ['verbose', 'true', 'Include full logs'],
  ]);
  assert.equal(ep.name, '/manager/api/v1/emergency-contact-status/{id}');
  assert.equal(ep.summary, 'Get Emergency Contact Status');
  assert.equal(ep.specification?.summary, 'Get Emergency Contact Status');
});

test('parseSwaggerSpec: prioritizes operationId over path for ep.name while storing summary separately', () => {
  const doc: SwaggerDoc = {
    swagger: '2.0',
    host: 'httpbin.org',
    basePath: '',
    paths: {
      '/users/{id}': {
        get: {
          operationId: 'getUserById',
          summary: 'Retrieve User by ID',
          tags: ['Users'],
        },
      },
    },
  };

  const parsed = parseSwaggerSpec(doc, 'https://httpbin.org/swagger.json');
  const ep = parsed.services[0].endpoints[0];
  assert.equal(ep.name, 'getUserById');
  assert.equal(ep.summary, 'Retrieve User by ID');
  assert.equal(ep.specification?.summary, 'Retrieve User by ID');
});

test('parseSwaggerSpec: returns exact cached reference on repeated calls with identical doc', () => {
  const doc: SwaggerDoc = {
    swagger: '2.0',
    paths: {
      '/ping': {
        get: {
          responses: {
            '200': { description: 'pong' },
          },
        },
      },
    },
  };

  const first = parseSwaggerSpec(doc, 'https://example.com/swagger.json');
  const second = parseSwaggerSpec(doc, 'https://example.com/swagger.json');
  assert.equal(first, second); // Identity comparison validates WeakMap caching
});

test('resolveSwaggerSamplePayload: resolves sample payload from matched endpoint or spec search', () => {
  const doc: SwaggerDoc = {
    swagger: '2.0',
    host: 'api.example.com',
    paths: {
      '/items': {
        post: {
          operationId: 'CreateItem',
          parameters: [
            {
              name: 'body',
              in: 'body',
              schema: {
                type: 'object',
                properties: { title: { type: 'string', example: 'Book' } },
              },
            },
          ],
        },
      },
    },
  };

  const sample = resolveSwaggerSamplePayload(
    'POST',
    'https://api.example.com/items',
    'CreateItem',
    doc,
    'https://api.example.com/swagger.json'
  );

  assert.ok(sample);
  assert.ok(sample.includes('Book'));

  // Fallback to matchedEndpoint directly
  const direct = resolveSwaggerSamplePayload('GET', '/test', 'test', null, undefined, {
    name: 'test',
    method: 'GET',
    path: '/test',
    fullUrl: 'http://test',
    bodyType: 'json',
    body: '{"direct":true}',
  } as any);
  assert.equal(direct, '{"direct":true}');
});

test('generateSmartSample: realistic values matching field name heuristics', () => {
  assert.equal(generateSmartStringSample('email'), 'user@example.com');
  assert.equal(generateSmartStringSample('user_email'), 'user@example.com');
  assert.equal(generateSmartStringSample('id'), 'id_1001');
  assert.equal(generateSmartStringSample('user_id'), 'id_1001');
  assert.equal(generateSmartStringSample('name'), 'Sample Name');
  assert.equal(generateSmartStringSample('first_name'), 'Jane');
  assert.equal(generateSmartStringSample('avatar_url'), 'https://example.com/api');
  assert.equal(generateSmartStringSample('phone_number'), '+15550199');
  assert.equal(generateSmartStringSample('unknown_custom_field'), 'unknown_custom_field_sample');

  assert.equal(generateSmartNumberSample('page'), 1);
  assert.equal(generateSmartNumberSample('limit'), 20);
  assert.equal(generateSmartNumberSample('price'), 49.99);
  assert.equal(generateSmartNumberSample('user_id'), 1001);
  assert.equal(generateSmartNumberSample('count'), 5);

  assert.equal(generateSmartBooleanSample('is_active'), true);
  assert.equal(generateSmartBooleanSample('is_deleted'), false);
});

test('resolveSwaggerSampleResult: supports Form URL-Encoded and Multipart body types', () => {
  const doc: SwaggerDoc = {
    openapi: '3.0.0',
    info: { title: 'Upload API' },
    servers: [{ url: 'https://api.example.com' }],
    paths: {
      '/login': {
        post: {
          operationId: 'loginUser',
          requestBody: {
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: {
                    username: { type: 'string' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      '/upload': {
        post: {
          operationId: 'uploadFile',
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const parsed = parseSwaggerSpec(doc, 'https://api.example.com/openapi.json');
  const loginEp = parsed.services[0].endpoints.find((e) => e.name === 'loginUser');
  assert.ok(loginEp);
  assert.equal(loginEp.bodyType, 'form');
  assert.ok(loginEp.body.includes('username=janedoe'));
  assert.ok(loginEp.body.includes('password=secret_token_123'));

  const uploadEp = parsed.services[0].endpoints.find((e) => e.name === 'uploadFile');
  assert.ok(uploadEp);
  assert.equal(uploadEp.bodyType, 'multipart');
  const fields = JSON.parse(uploadEp.body);
  assert.equal(fields.length, 2);
  const fileField = fields.find((f: any) => f.name === 'file');
  assert.ok(fileField);
  assert.equal(fileField.filename, 'sample.txt');

  // Generate as Form
  const formRes = resolveSwaggerSampleResult(
    'POST',
    'https://api.example.com/login',
    'loginUser',
    doc,
    'https://api.example.com/openapi.json',
    null,
    'form'
  );
  assert.ok(formRes);
  assert.equal(formRes.bodyType, 'form');
  assert.ok(formRes.body.includes('username=janedoe'));

  // Generate as Multipart
  const multiRes = resolveSwaggerSampleResult(
    'POST',
    'https://api.example.com/upload',
    'uploadFile',
    doc,
    'https://api.example.com/openapi.json',
    null,
    'multipart'
  );
  assert.ok(multiRes);
  assert.equal(multiRes.bodyType, 'multipart');
  assert.ok(multiRes.multipartFields && multiRes.multipartFields.length > 0);
});

test('resolveSwaggerSampleResult: fallback from SwaggerEndpointSpecification when doc is offline', () => {
  const spec = {
    summary: 'Offline Endpoint',
    requestTypeName: 'CreateUserDto',
    requestFields: [
      { name: 'name', type: 'string', required: true },
      { name: 'email', type: 'string', required: true },
      { name: 'age', type: 'int32', required: false },
      { name: 'is_active', type: 'boolean', required: false },
    ],
    responseFields: [],
  };

  const jsonRes = resolveSwaggerSampleResult(
    'POST',
    'http://localhost/users',
    'createUser',
    null,
    undefined,
    null,
    'json',
    spec
  );
  assert.ok(jsonRes);
  assert.equal(jsonRes.bodyType, 'json');
  const parsedJson = JSON.parse(jsonRes.body);
  assert.equal(parsedJson.name, 'Sample Name');
  assert.equal(parsedJson.email, 'user@example.com');
  assert.equal(parsedJson.age, 100);
  assert.equal(parsedJson.is_active, true);

  // Fallback to Form URL-Encoded
  const formRes = resolveSwaggerSampleResult(
    'POST',
    'http://localhost/users',
    'createUser',
    null,
    undefined,
    null,
    'form',
    spec
  );
  assert.ok(formRes);
  assert.equal(formRes.bodyType, 'form');
  assert.ok(formRes.body.includes('email=user%40example.com'));

  // Fallback to Multipart
  const multiRes = resolveSwaggerSampleResult(
    'POST',
    'http://localhost/users',
    'createUser',
    null,
    undefined,
    null,
    'multipart',
    spec
  );
  assert.ok(multiRes);
  assert.equal(multiRes.bodyType, 'multipart');
  assert.equal(multiRes.multipartFields?.length, 4);
});

test('findMatchingSwaggerEndpoint: avoids prefix collision bug and matches exact routes', () => {
  const parsed = {
    title: 'Test',
    version: '1.0',
    baseUrl: 'https://api.example.com',
    services: [
      {
        name: 'Service',
        endpoints: [
          {
            name: 'RootEndpoint',
            method: 'POST',
            path: '/',
            fullUrl: 'https://api.example.com/',
            serviceTag: 'Service',
            queryParams: [],
            headers: {},
            bodyType: 'json' as const,
            body: '{"root":true}',
          },
          {
            name: 'CreateUser',
            method: 'POST',
            path: '/users',
            fullUrl: 'https://api.example.com/users',
            serviceTag: 'Service',
            queryParams: [],
            headers: {},
            bodyType: 'json' as const,
            body: '{"user":true}',
          },
          {
            name: 'SearchUsers',
            method: 'POST',
            path: '/users/search',
            fullUrl: 'https://api.example.com/users/search',
            serviceTag: 'Service',
            queryParams: [],
            headers: {},
            bodyType: 'json' as const,
            body: '{"search":true}',
          },
        ],
      },
    ],
    totalEndpoints: 3,
  };

  // Searching for /users/search should NOT match / or /users
  const match = findMatchingSwaggerEndpoint(
    parsed,
    'POST',
    'https://api.example.com/users/search',
    'SearchUsers'
  );
  assert.ok(match);
  assert.equal(match.name, 'SearchUsers');
  assert.equal(match.body, '{"search":true}');

  // Searching for /users should NOT match /
  const userMatch = findMatchingSwaggerEndpoint(
    parsed,
    'POST',
    'https://api.example.com/users',
    'CreateUser'
  );
  assert.ok(userMatch);
  assert.equal(userMatch.name, 'CreateUser');
});

test('resolveSwaggerSampleParams: correctly resolves GET query parameters and enum values', () => {
  const doc: SwaggerDoc = {
    swagger: '2.0',
    paths: {
      '/manager/api/v1/users/query/cursor': {
        get: {
          operationId: 'QueryCursor',
          parameters: [
            {
              in: 'query',
              name: 'cursor',
              required: false,
              type: 'string',
            },
            {
              format: 'uint64',
              in: 'query',
              name: 'limit',
              required: false,
              type: 'string',
            },
            {
              format: 'uint64',
              in: 'query',
              name: 'group_id',
              required: false,
              type: 'string',
            },
            {
              default: 'SORT_DIRECTION_UNSPECIFIED',
              enum: [
                'SORT_DIRECTION_UNSPECIFIED',
                'SORT_DIRECTION_ASC',
                'SORT_DIRECTION_DESC',
              ],
              in: 'query',
              name: 'sort_direction',
              required: false,
              type: 'string',
            },
          ],
          responses: {
            '200': {
              description: 'A successful response.',
            },
          },
          summary: 'Paginate User with Cursor',
          tags: ['UserAPI'],
        },
      },
    },
  };

  const res = resolveSwaggerSampleParams(
    'GET',
    'https://api.example.com/manager/api/v1/users/query/cursor',
    'QueryCursor',
    doc,
    'https://api.example.com/swagger.json'
  );

  assert.ok(res);
  assert.equal(res.queryParams.length, 4);

  const cursorRow = res.queryParams.find(([k]) => k === 'cursor');
  assert.ok(cursorRow);
  assert.equal(cursorRow[1], 'cur_1001');

  const limitRow = res.queryParams.find(([k]) => k === 'limit');
  assert.ok(limitRow);
  assert.equal(limitRow[1], '20');

  const groupRow = res.queryParams.find(([k]) => k === 'group_id');
  assert.ok(groupRow);
  assert.equal(groupRow[1], '1001');

  const sortRow = res.queryParams.find(([k]) => k === 'sort_direction');
  assert.ok(sortRow);
  assert.equal(sortRow[1], 'SORT_DIRECTION_UNSPECIFIED');

  // Verify extractSwaggerSpecification extracts enum metadata
  const spec = parseSwaggerSpec(doc, 'https://api.example.com/swagger.json').services[0].endpoints[0].specification;
  assert.ok(spec);
  const sortField = spec.requestFields.find((f) => f.name === 'sort_direction');
  assert.ok(sortField);
  assert.deepEqual(sortField.enum, [
    'SORT_DIRECTION_UNSPECIFIED',
    'SORT_DIRECTION_ASC',
    'SORT_DIRECTION_DESC',
  ]);
});
