import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSwaggerSpec,
  generateSampleFromSchema,
  deriveBaseUrl,
  resolveRef,
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
  assert.equal(generateSampleFromSchema({ type: 'string' }, doc), '');
  assert.equal(
    generateSampleFromSchema({ type: 'string', format: 'date-time' }, doc),
    '2026-01-01T00:00:00Z'
  );
  assert.equal(
    generateSampleFromSchema({ type: 'string', enum: ['PENDING', 'ACTIVE'] }, doc),
    'PENDING'
  );
  assert.equal(generateSampleFromSchema({ type: 'integer' }, doc), 0);
  assert.equal(generateSampleFromSchema({ type: 'boolean' }, doc), false);
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
