/**
 * Standalone Swagger 2.0 and OpenAPI 3.x parser and sample payload generator.
 * Pure TypeScript, zero external UI/runtime dependencies.
 */

import { convertSwaggerPathToApiPath } from './pathVariables.ts';

export interface SwaggerFieldSummary {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  enum?: string[];
  example?: any;
  default?: any;
}

export interface SwaggerEndpointSpecification {
  summary?: string;
  requestTypeName?: string;
  requestFields: SwaggerFieldSummary[];
  responseTypeName?: string;
  responseFields: SwaggerFieldSummary[];
  schemas?: Record<string, SwaggerFieldSummary[]>;
  enums?: Record<string, string[]>;
}

export interface ParsedHttpEndpoint {
  name: string;
  method: string; // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string; // e.g. '/manager/api/v1/users' or '/manager/api/v1/users/:id'
  fullUrl: string; // e.g. 'http://localhost:9090/manager/api/v1/users/:id'
  serviceTag: string; // e.g. 'UserAPI' or 'Default'
  operationId?: string;
  summary?: string;
  description?: string;
  queryParams: [string, string, string?][];
  pathVariables?: [string, string, string?][];
  headers: Record<string, string>;
  headerDescriptions?: Record<string, string>;
  bodyType: 'none' | 'json' | 'form' | 'multipart' | 'text' | 'binary';
  body: string; // JSON string, urlencoded string, or multipart JSON payload
  specification?: SwaggerEndpointSpecification;
}

export interface SwaggerMultipartField {
  name: string;
  value: string;
  enabled?: boolean;
  filename?: string;
  data?: string;
  content_type?: string;
}

export interface SwaggerSamplePayloadResult {
  bodyType: 'json' | 'form' | 'multipart' | 'text';
  body: string;
  multipartFields?: SwaggerMultipartField[];
}

export interface ParsedSwaggerService {
  name: string; // Tag name, e.g. 'AuthAPI'
  endpoints: ParsedHttpEndpoint[];
}

export interface ParsedSwaggerSpec {
  title: string;
  version: string;
  baseUrl: string;
  services: ParsedSwaggerService[];
  totalEndpoints: number;
}

export interface SwaggerDoc {
  swagger?: string;
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  host?: string;
  basePath?: string;
  schemes?: string[];
  consumes?: string[];
  produces?: string[];
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths?: Record<string, Record<string, any>>;
  definitions?: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
  };
}

/**
 * Smart sample generator heuristics matching gRPC Request message sample payload generator.
 */
export function generateSmartStringSample(
  propertyName?: string,
  format?: string,
  enumVals?: string[]
): string {
  if (Array.isArray(enumVals) && enumVals.length > 0) {
    return String(enumVals[0]);
  }
  const prop = (propertyName || '').toLowerCase().replace(/[-_]/g, '');

  if (format === 'date-time') return '2026-10-30T12:00:00Z';
  if (format === 'date') return '2026-10-30';
  if (format === 'email' || prop.includes('email')) return 'user@example.com';
  if (
    format === 'uri' ||
    format === 'url' ||
    prop.includes('url') ||
    prop.includes('uri') ||
    prop.includes('link') ||
    prop.includes('avatar') ||
    prop.includes('website')
  ) {
    return 'https://example.com/api';
  }
  if (format === 'uuid' || prop.includes('uuid')) return '123e4567-e89b-12d3-a456-426614174000';
  if (prop.includes('phone') || prop.includes('mobile')) return '+15550199';
  if (
    prop.includes('password') ||
    prop.includes('secret') ||
    prop.includes('token') ||
    prop.includes('apikey')
  ) {
    return 'secret_token_123';
  }
  if (prop.includes('firstname')) return 'Jane';
  if (prop.includes('lastname')) return 'Doe';
  if (prop.includes('username')) return 'janedoe';
  if (prop === 'name' || prop.endsWith('name')) return 'Sample Name';
  if (prop.includes('title')) return 'Sample Title';
  if (
    prop.includes('description') ||
    prop.includes('summary') ||
    prop.includes('content') ||
    prop.includes('text')
  ) {
    return 'Sample description text';
  }
  if (prop === 'id' || prop.endsWith('id')) return 'id_1001';
  if (prop.includes('city')) return 'San Francisco';
  if (prop.includes('country')) return 'United States';
  if (prop.includes('zip') || prop.includes('postal')) return '94103';
  if (prop.includes('address')) return '123 Market Street';
  if (format === 'byte' || format === 'binary') return 'sample.txt';

  if (propertyName) {
    return `${propertyName}_sample`;
  }
  return 'sample_value';
}

export function generateSmartNumberSample(
  propertyName?: string,
  type?: string,
  format?: string,
  enumVals?: any[]
): number {
  if (Array.isArray(enumVals) && enumVals.length > 0 && typeof enumVals[0] === 'number') {
    return enumVals[0];
  }
  const prop = (propertyName || '').toLowerCase().replace(/[-_]/g, '');
  if (prop.includes('page')) return 1;
  if (prop.includes('limit') || prop.includes('pagesize') || prop.includes('size')) return 20;
  if (prop.includes('status') || prop.includes('code')) return 200;
  if (prop.includes('port')) return 8080;
  if (prop.includes('year')) return 2026;
  if (prop.includes('month')) return 10;
  if (prop.includes('day')) return 30;
  if (
    prop.includes('count') ||
    prop.includes('quantity') ||
    prop.includes('total') ||
    prop.includes('qty')
  ) {
    return 5;
  }
  if (
    prop.includes('price') ||
    prop.includes('amount') ||
    prop.includes('cost') ||
    prop.includes('fee') ||
    prop.includes('balance') ||
    prop.includes('rate')
  ) {
    return 49.99;
  }
  if (prop.includes('lat') || prop.includes('latitude')) return 37.7749;
  if (prop.includes('lng') || prop.includes('lon') || prop.includes('longitude')) return -122.4194;
  if (prop === 'id' || prop.endsWith('id')) return 1001;

  if (type === 'integer' || format === 'int32' || format === 'int64') return 100;
  return 42.5;
}

export function generateSmartBooleanSample(propertyName?: string): boolean {
  const prop = (propertyName || '').toLowerCase();
  if (prop.includes('delete') || prop.includes('disable') || prop.includes('archived')) {
    return false;
  }
  return true;
}

/**
 * Resolves a $ref pointer like '#/definitions/Pet' or '#/components/schemas/Pet'
 */
export function resolveRef(ref: string, rootDoc: SwaggerDoc): any {
  if (!ref || typeof ref !== 'string') return null;
  const parts = ref
    .replace(/^#\//, '')
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: any = rootDoc;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }
  return current;
}

/**
 * Resolves chained references until reaching the target schema object.
 */
export function resolveFully(schema: any, rootDoc: SwaggerDoc, depth: number = 0): any {
  if (!schema || typeof schema !== 'object' || depth > 8) return schema;
  if (schema.$ref && typeof schema.$ref === 'string') {
    const resolved = resolveRef(schema.$ref, rootDoc);
    if (resolved && resolved !== schema) {
      return resolveFully(resolved, rootDoc, depth + 1);
    }
  }
  return schema;
}

/**
 * Recursively generates a sample JSON value from a schema.
 * Employs visited set to prevent infinite loops on recursive schemas.
 */
export function generateSampleFromSchema(
  schema: any,
  rootDoc: SwaggerDoc,
  visitedRefs: Set<string> = new Set(),
  depth: number = 0,
  propertyName?: string
): any {
  if (!schema || depth > 8) return null;

  if (schema.$ref && typeof schema.$ref === 'string') {
    if (visitedRefs.has(schema.$ref)) {
      return {}; // Break circular reference
    }
    const resolved = resolveRef(schema.$ref, rootDoc);
    if (!resolved) return {};
    const nextVisited = new Set(visitedRefs);
    nextVisited.add(schema.$ref);
    return generateSampleFromSchema(resolved, rootDoc, nextVisited, depth + 1, propertyName);
  }

  // Handle allOf (merge properties and base schema)
  if (Array.isArray(schema.allOf)) {
    const merged: Record<string, any> = {};
    for (const sub of schema.allOf) {
      const sample = generateSampleFromSchema(sub, rootDoc, visitedRefs, depth + 1, propertyName);
      if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
        Object.assign(merged, sample);
      }
    }
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        merged[propName] = generateSampleFromSchema(propSchema, rootDoc, visitedRefs, depth + 1, propName);
      }
    }
    return merged;
  }

  // Handle oneOf / anyOf: pick first branch
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return generateSampleFromSchema(schema.oneOf[0], rootDoc, visitedRefs, depth + 1, propertyName);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return generateSampleFromSchema(schema.anyOf[0], rootDoc, visitedRefs, depth + 1, propertyName);
  }

  // Handle multi-types (OpenAPI 3.1)
  let type = schema.type;
  if (Array.isArray(type)) {
    type = type.find((t) => t !== 'null') || type[0];
  }

  // Primitives with defaults/examples
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  // Object
  if (type === 'object' || schema.properties || schema.additionalProperties) {
    const obj: Record<string, any> = {};
    const props = schema.properties || {};
    for (const [propName, propSchema] of Object.entries(props)) {
      obj[propName] = generateSampleFromSchema(propSchema, rootDoc, visitedRefs, depth + 1, propName);
    }
    if (Object.keys(obj).length === 0 && schema.additionalProperties) {
      const val =
        typeof schema.additionalProperties === 'object'
          ? generateSampleFromSchema(
              schema.additionalProperties,
              rootDoc,
              visitedRefs,
              depth + 1,
              'sample_key'
            )
          : 'sample_value';
      obj['sample_key'] = val;
    }
    return obj;
  }

  // Array
  if (type === 'array' || schema.items) {
    if (schema.items) {
      const itemSample = generateSampleFromSchema(schema.items, rootDoc, visitedRefs, depth + 1, propertyName);
      return itemSample !== null && itemSample !== undefined ? [itemSample] : [];
    }
    return [];
  }

  if (type === 'string') {
    return generateSmartStringSample(propertyName, schema.format, schema.enum);
  }

  if (type === 'integer' || type === 'number') {
    return generateSmartNumberSample(propertyName, type, schema.format, schema.enum);
  }

  if (type === 'boolean') {
    return generateSmartBooleanSample(propertyName);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  return generateSmartStringSample(propertyName);
}

export function getSchemaTypeName(schema: any): string | undefined {
  if (!schema) return undefined;
  if (schema.title && typeof schema.title === 'string') return schema.title;
  if (schema.$ref && typeof schema.$ref === 'string') {
    const parts = schema.$ref.split('/');
    return parts[parts.length - 1];
  }
  return undefined;
}

export function formatSwaggerPropertyType(propSchema: any, doc: SwaggerDoc): string {
  if (!propSchema) return 'string';
  if (propSchema.oneOf || propSchema['x-oneof']) return 'OneOf';
  if (propSchema.$ref) {
    const name = getSchemaTypeName(propSchema);
    if (name) return name;
  }
  if (propSchema.type === 'array' || propSchema.items) {
    if (propSchema.items) {
      const itemType = formatSwaggerPropertyType(propSchema.items, doc);
      return `${itemType}[]`;
    }
    return 'array';
  }
  if (propSchema.format) {
    const f = String(propSchema.format).toLowerCase();
    if (['int64', 'int32', 'uint64', 'uint32', 'float', 'double'].includes(f)) {
      return f;
    }
  }
  if (propSchema.type) {
    if (propSchema.type === 'integer') return 'int32';
    if (propSchema.type === 'number') return 'double';
    return String(propSchema.type);
  }
  return 'string';
}

export function extractSwaggerSpecification(
  operation: any,
  doc: SwaggerDoc,
  allParams: any[] = []
): SwaggerEndpointSpecification {
  // 1. Request
  let requestTypeName: string | undefined;
  const requestFields: SwaggerFieldSummary[] = [];

  let reqSchema: any = null;
  // Swagger 2.0 body param
  for (const p of allParams) {
    if (p && p.in === 'body' && p.schema) {
      reqSchema = p.schema;
      break;
    }
  }

  // OpenAPI 3.x requestBody
  if (!reqSchema && operation?.requestBody) {
    const reqBody = resolveFully(operation.requestBody, doc);
    if (reqBody?.content && typeof reqBody.content === 'object') {
      const content = reqBody.content;
      const jsonContent =
        content['application/json'] ||
        content['multipart/form-data'] ||
        content['application/x-www-form-urlencoded'] ||
        content['*/*'] ||
        Object.values(content)[0];
      if (jsonContent?.schema) {
        reqSchema = jsonContent.schema;
      }
    }
  }

  if (reqSchema) {
    const resolvedReq = resolveFully(reqSchema, doc);
    requestTypeName =
      getSchemaTypeName(reqSchema) || getSchemaTypeName(resolvedReq) || 'RequestBody';

    const props: Record<string, any> = {};
    const requiredList: string[] = [];

    const collectProperties = (schemaObj: any, seen: Set<any> = new Set()) => {
      if (!schemaObj || typeof schemaObj !== 'object' || seen.has(schemaObj)) return;
      seen.add(schemaObj);
      const fully = resolveFully(schemaObj, doc);
      if (Array.isArray(fully.allOf)) {
        for (const sub of fully.allOf) collectProperties(sub, seen);
      }
      if (fully.properties && typeof fully.properties === 'object') {
        Object.assign(props, fully.properties);
      }
      if (Array.isArray(fully.required)) {
        requiredList.push(...fully.required);
      }
      if (fully.items && (!fully.properties || Object.keys(fully.properties).length === 0)) {
        collectProperties(fully.items, seen);
      }
    };

    collectProperties(resolvedReq);

    for (const [propName, propSchema] of Object.entries(props)) {
      requestFields.push({
        name: propName,
        type: formatSwaggerPropertyType(propSchema, doc),
        required: requiredList.includes(propName),
        description: (propSchema as any)?.description,
        ...((propSchema as any)?.example !== undefined ? { example: (propSchema as any).example } : {}),
        ...((propSchema as any)?.default !== undefined ? { default: (propSchema as any).default } : {}),
      });
    }
  } else {
    // Check formData params
    const formDataParams = allParams.filter((p) => p && p.in === 'formData' && p.name);
    if (formDataParams.length > 0) {
      requestTypeName = 'FormData';
      for (const p of formDataParams) {
        requestFields.push({
          name: p.name,
          type: p.type || 'string',
          required: !!p.required,
          description: p.description,
        });
      }
    } else if (allParams.length > 0) {
      const nonBody = allParams.filter(
        (p) => p && p.name && p.in !== 'body' && p.in !== 'formData'
      );
      if (nonBody.length > 0) {
        requestTypeName = 'Parameters';
        for (const p of nonBody) {
          const enumVals = Array.isArray(p.enum)
            ? p.enum.map(String)
            : Array.isArray(p.schema?.enum)
            ? p.schema.enum.map(String)
            : undefined;
          requestFields.push({
            name: p.name,
            type: enumVals ? 'enum' : p.type || (p.schema ? formatSwaggerPropertyType(p.schema, doc) : 'string'),
            required: !!p.required,
            description: p.description,
            ...(enumVals && enumVals.length > 0 ? { enum: enumVals } : {}),
          });
        }
      }
    }
  }

  // 2. Response
  let responseTypeName: string | undefined;
  const responseFields: SwaggerFieldSummary[] = [];

  const responses = operation?.responses || {};
  const successKey =
    Object.keys(responses).find((k) => k.startsWith('2')) ||
    (responses['default'] ? 'default' : Object.keys(responses)[0]);

  if (successKey && responses[successKey]) {
    const respObj = responses[successKey];
    let resSchema = respObj.schema;
    if (!resSchema && respObj.content) {
      const content = respObj.content;
      const jsonContent =
        content['application/json'] ||
        content['*/*'] ||
        Object.values(content)[0];
      if (jsonContent?.schema) {
        resSchema = jsonContent.schema;
      }
    }

    if (resSchema) {
      const resolvedRes = resolveFully(resSchema, doc);
      responseTypeName =
        getSchemaTypeName(resSchema) || getSchemaTypeName(resolvedRes) || 'ResponseBody';

      const props: Record<string, any> = {};
      const requiredList: string[] = [];

      const collectProperties = (schemaObj: any, seen: Set<any> = new Set()) => {
        if (!schemaObj || typeof schemaObj !== 'object' || seen.has(schemaObj)) return;
        seen.add(schemaObj);
        const fully = resolveFully(schemaObj, doc);
        if (Array.isArray(fully.allOf)) {
          for (const sub of fully.allOf) collectProperties(sub, seen);
        }
        if (fully.properties && typeof fully.properties === 'object') {
          Object.assign(props, fully.properties);
        }
        if (Array.isArray(fully.required)) {
          requiredList.push(...fully.required);
        }
        if (fully.items && (!fully.properties || Object.keys(fully.properties).length === 0)) {
          collectProperties(fully.items, seen);
        }
      };

      collectProperties(resolvedRes);

      for (const [propName, propSchema] of Object.entries(props)) {
        responseFields.push({
          name: propName,
          type: formatSwaggerPropertyType(propSchema, doc),
          required: requiredList.includes(propName),
          description: (propSchema as any)?.description,
        });
      }
    }
  }

  // 3. Collect all definition schemas for DTO drilldown and all standalone enums
  const allSchemas: Record<string, SwaggerFieldSummary[]> = {};
  const allEnums: Record<string, string[]> = {};
  const defs = doc.definitions || doc.components?.schemas || {};

  for (const [defName, defSchema] of Object.entries(defs)) {
    if (!defSchema || typeof defSchema !== 'object') continue;
    const resolvedDef = resolveFully(defSchema, doc);
    if (Array.isArray(resolvedDef?.enum) && resolvedDef.enum.length > 0) {
      allEnums[defName] = resolvedDef.enum.map(String);
    }
  }

  for (const [defName, defSchema] of Object.entries(defs)) {
    if (!defSchema || typeof defSchema !== 'object') continue;
    const resolvedDef = resolveFully(defSchema, doc);
    const props: Record<string, any> = {};
    const reqList: string[] = [];

    const collectProps = (s: any, seen: Set<any> = new Set()) => {
      if (!s || typeof s !== 'object' || seen.has(s)) return;
      seen.add(s);
      const f = resolveFully(s, doc);
      if (Array.isArray(f.allOf)) {
        for (const sub of f.allOf) collectProps(sub, seen);
      }
      if (f.properties && typeof f.properties === 'object') {
        Object.assign(props, f.properties);
      }
      if (Array.isArray(f.required)) {
        reqList.push(...f.required);
      }
    };
    collectProps(resolvedDef);

    const fields: SwaggerFieldSummary[] = [];
    for (const [propName, propSchema] of Object.entries(props)) {
      const enumVals = Array.isArray((propSchema as any)?.enum)
        ? (propSchema as any).enum.map(String)
        : (propSchema as any)?.$ref
        ? allEnums[getSchemaTypeName(propSchema) || '']
        : undefined;
      fields.push({
        name: propName,
        type: enumVals && !propSchema.type ? 'enum' : formatSwaggerPropertyType(propSchema, doc),
        required: reqList.includes(propName),
        description: (propSchema as any)?.description,
        ...((propSchema as any)?.example !== undefined ? { example: (propSchema as any).example } : {}),
        ...((propSchema as any)?.default !== undefined ? { default: (propSchema as any).default } : {}),
        ...(enumVals && enumVals.length > 0 ? { enum: enumVals } : {}),
      });
    }
    allSchemas[defName] = fields;
  }

  // Populate enum on requestFields
  for (const f of requestFields) {
    if (!f.enum && allEnums[f.type]) {
      f.enum = allEnums[f.type];
    }
  }
  // Populate enum on responseFields
  for (const f of responseFields) {
    if (!f.enum && allEnums[f.type]) {
      f.enum = allEnums[f.type];
    }
  }

  return {
    summary: operation?.summary,
    requestTypeName,
    requestFields,
    responseTypeName,
    responseFields,
    schemas: allSchemas,
    enums: allEnums,
  };
}

/**
 * Derives the base URL from swagger doc + source URL.
 */
export function deriveBaseUrl(doc: SwaggerDoc, sourceUrl: string): string {
  let origin = 'http://localhost';
  try {
    const parsed = new URL(sourceUrl);
    origin = parsed.origin;
  } catch {
    // ignore
  }

  // 1. Swagger 2.0 host and basePath
  if (doc.host) {
    const scheme =
      (doc.schemes && doc.schemes[0]) || (sourceUrl.startsWith('https') ? 'https' : 'http');
    const basePath = (doc.basePath || '').replace(/\/$/, '');
    return `${scheme}://${doc.host}${basePath}`;
  }

  // 2. OpenAPI 3.0 servers
  if (doc.servers && doc.servers.length > 0 && doc.servers[0].url) {
    const serverUrl = doc.servers[0].url.trim();
    if (serverUrl.startsWith('http://') || serverUrl.startsWith('https://')) {
      return serverUrl.replace(/\/$/, '');
    }
    // Relative server url
    return `${origin}${serverUrl.startsWith('/') ? '' : '/'}${serverUrl}`.replace(/\/$/, '');
  }

  // 3. Fallback to origin + basePath
  const bp = (doc.basePath || '').replace(/\/$/, '');
  return `${origin}${bp}`;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head']);

const swaggerSpecCache = new WeakMap<SwaggerDoc, Map<string, ParsedSwaggerSpec>>();

/**
 * Parses raw Swagger or OpenAPI JSON into structured services and endpoints.
 */
export function parseSwaggerSpec(doc: SwaggerDoc, sourceUrl: string): ParsedSwaggerSpec {
  if (doc && typeof doc === 'object') {
    let urlMap = swaggerSpecCache.get(doc);
    if (!urlMap) {
      urlMap = new Map();
      swaggerSpecCache.set(doc, urlMap);
    }
    const cached = urlMap.get(sourceUrl);
    if (cached) return cached;
  }

  const title = doc.info?.title || 'Swagger API';
  const version = doc.info?.version || '1.0';
  const baseUrl = deriveBaseUrl(doc, sourceUrl);

  const servicesMap = new Map<string, ParsedHttpEndpoint[]>();
  let totalEndpoints = 0;

  const paths = doc.paths || {};

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    // Common parameters at path level
    const commonParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];

    for (const [methodKey, operation] of Object.entries(pathItem)) {
      const lowerMethod = methodKey.toLowerCase();
      if (!HTTP_METHODS.has(lowerMethod) || !operation || typeof operation !== 'object') {
        continue;
      }

      const method = lowerMethod.toUpperCase();
      const tags: string[] =
        Array.isArray(operation.tags) && operation.tags.length > 0
          ? operation.tags
          : ['Default'];
      const primaryTag = tags[0];

      // Merge common path params and operation params
      const opParams = Array.isArray(operation.parameters) ? operation.parameters : [];
      const allParams = [...commonParams, ...opParams];

      const queryParams: [string, string, string?][] = [];
      const pathVariables: [string, string, string?][] = [];
      const headers: Record<string, string> = {};
      const headerDescriptions: Record<string, string> = {};
      let bodySample: any = null;
      let hasBody = false;
      let detectedBodyType: 'none' | 'json' | 'form' | 'multipart' | 'text' | 'binary' = 'none';
      const formDataParams: any[] = [];

      for (const p of allParams) {
        if (!p || typeof p !== 'object') continue;
        const pIn = p.in;
        const pName = p.name;

        if (pIn === 'path' && pName) {
          const defaultVal = p.default !== undefined ? String(p.default) : '';
          pathVariables.push(
            p.description ? [pName, defaultVal, p.description] : [pName, defaultVal]
          );
        } else if (pIn === 'query' && pName) {
          const defaultVal = p.default !== undefined ? String(p.default) : '';
          queryParams.push(
            p.description ? [pName, defaultVal, p.description] : [pName, defaultVal]
          );
        } else if (pIn === 'header' && pName) {
          const defaultVal = p.default !== undefined ? String(p.default) : '';
          headers[pName] = defaultVal;
          if (p.description) headerDescriptions[pName] = p.description;
        } else if (pIn === 'body' && p.schema) {
          hasBody = true;
          detectedBodyType = 'json';
          bodySample = generateSampleFromSchema(p.schema, doc, new Set(), 0, pName);
        } else if (pIn === 'formData' && pName) {
          formDataParams.push(p);
        }
      }

      if (formDataParams.length > 0) {
        hasBody = true;
        const isMultipart =
          formDataParams.some((p) => p.type === 'file') ||
          (Array.isArray(operation.consumes) &&
            operation.consumes.some((c: string) => c.includes('multipart'))) ||
          (Array.isArray(doc.consumes) &&
            doc.consumes.some((c: string) => c.includes('multipart')));
        detectedBodyType = isMultipart ? 'multipart' : 'form';

        const formObj: Record<string, any> = {};
        for (const p of formDataParams) {
          formObj[p.name] =
            p.example !== undefined
              ? p.example
              : p.default !== undefined
              ? p.default
              : generateSampleFromSchema(p, doc, new Set(), 0, p.name) ||
                (p.type === 'file' ? 'sample.txt' : generateSmartStringSample(p.name));
        }
        bodySample = formObj;
      }

      // OpenAPI 3.x requestBody
      if (!hasBody && operation.requestBody && typeof operation.requestBody === 'object') {
        const reqBody = resolveFully(operation.requestBody, doc);
        const content = reqBody?.content;
        if (content && typeof content === 'object') {
          if (content['application/json']?.schema) {
            hasBody = true;
            detectedBodyType = 'json';
            bodySample = generateSampleFromSchema(content['application/json'].schema, doc);
          } else if (content['multipart/form-data']?.schema) {
            hasBody = true;
            detectedBodyType = 'multipart';
            bodySample = generateSampleFromSchema(content['multipart/form-data'].schema, doc);
          } else if (content['application/x-www-form-urlencoded']?.schema) {
            hasBody = true;
            detectedBodyType = 'form';
            bodySample = generateSampleFromSchema(content['application/x-www-form-urlencoded'].schema, doc);
          } else {
            const firstKey = Object.keys(content)[0];
            const firstContent = content[firstKey];
            if (firstContent?.schema) {
              hasBody = true;
              if (firstKey.includes('form') || firstKey.includes('urlencoded')) {
                detectedBodyType = 'form';
              } else if (firstKey.includes('multipart')) {
                detectedBodyType = 'multipart';
              } else {
                detectedBodyType = 'json';
              }
              bodySample = generateSampleFromSchema(firstContent.schema, doc);
            }
          }
        }
      }

      const normalizedPath = convertSwaggerPathToApiPath(pathKey);
      const rawPath = pathKey.startsWith('/') ? pathKey : `/${pathKey}`;

      // Format endpoint name: operationId > rawPath (e.g. /api/v1/user/{id}/update)
      let epName = (operation.operationId || rawPath).trim();

      const fullUrl = `${baseUrl}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;

      const specification = extractSwaggerSpecification(operation, doc, allParams);

      const endpoint: ParsedHttpEndpoint = {
        name: epName,
        method,
        path: normalizedPath,
        fullUrl,
        serviceTag: primaryTag,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        queryParams,
        pathVariables,
        headers,
        headerDescriptions,
        bodyType: detectedBodyType,
        body:
          !hasBody || bodySample === null
            ? ''
            : detectedBodyType === 'multipart'
            ? JSON.stringify(serializeMultipartSample(bodySample), null, 2)
            : detectedBodyType === 'form'
            ? serializeFormSample(bodySample)
            : JSON.stringify(bodySample, null, 2),
        specification,
      };

      if (!servicesMap.has(primaryTag)) {
        servicesMap.set(primaryTag, []);
      }
      servicesMap.get(primaryTag)!.push(endpoint);
      totalEndpoints++;
    }
  }

  const services: ParsedSwaggerService[] = [];
  for (const [name, endpoints] of servicesMap.entries()) {
    services.push({ name, endpoints });
  }

  // Sort services alphabetically
  services.sort((a, b) => a.name.localeCompare(b.name));

  const result: ParsedSwaggerSpec = {
    title,
    version,
    baseUrl,
    services,
    totalEndpoints,
  };

  if (doc && typeof doc === 'object') {
    swaggerSpecCache.get(doc)?.set(sourceUrl, result);
  }

  return result;
}

export function extractUrlPathname(u: string): string {
  if (!u) return '/';
  try {
    const parsed = new URL(u);
    return parsed.pathname.replace(/\/+$/, '') || '/';
  } catch {
    const withoutQuery = u.split('?')[0];
    const withoutHost = withoutQuery.replace(/^[a-zA-Z]+:\/\/[^\/]+/, '');
    const clean = (withoutHost.startsWith('/') ? withoutHost : `/${withoutHost}`).replace(/\/+$/, '');
    return clean || '/';
  }
}

export function matchPathSegments(pattern: string, actual: string): boolean {
  const normPattern = convertSwaggerPathToApiPath(pattern).replace(/\/+$/, '') || '/';
  const normActual = actual.replace(/\/+$/, '') || '/';
  if (normPattern === normActual) return true;

  const pSegs = normPattern.split('/').filter(Boolean);
  const aSegs = normActual.split('/').filter(Boolean);
  if (pSegs.length !== aSegs.length) return false;

  for (let i = 0; i < pSegs.length; i++) {
    const p = pSegs[i];
    const a = aSegs[i];
    if (p.startsWith(':') || (p.startsWith('{') && p.endsWith('}'))) {
      continue;
    }
    if (p.toLowerCase() !== a.toLowerCase()) {
      return false;
    }
  }
  return true;
}

export function findMatchingSwaggerEndpoint(
  parsed: ParsedSwaggerSpec,
  method: string,
  url: string,
  endpointName: string
): ParsedHttpEndpoint | null {
  const upperMethod = method.toUpperCase();
  const allEndpoints: ParsedHttpEndpoint[] = [];
  for (const svc of parsed.services) {
    allEndpoints.push(...svc.endpoints);
  }

  // 1. Direct name/operationId match with same method
  const directName = allEndpoints.find(
    (ep) =>
      ep.method.toUpperCase() === upperMethod &&
      (ep.operationId === endpointName || ep.name === endpointName)
  );
  if (directName) return directName;

  // 2. Full URL match
  const cleanUrl = url.split('?')[0].replace(/\/+$/, '');
  const urlMatch = allEndpoints.find((ep) => {
    if (ep.method.toUpperCase() !== upperMethod) return false;
    const epCleanUrl = ep.fullUrl.split('?')[0].replace(/\/+$/, '');
    return epCleanUrl === cleanUrl;
  });
  if (urlMatch) return urlMatch;

  // 3. Exact pathname match
  const pathname = extractUrlPathname(url);
  const pathMatch = allEndpoints.find((ep) => {
    if (ep.method.toUpperCase() !== upperMethod) return false;
    const epPath = ep.path.replace(/\/+$/, '') || '/';
    return epPath === pathname;
  });
  if (pathMatch) return pathMatch;

  // 4. Parameterized path template match
  const templateMatch = allEndpoints.find((ep) => {
    if (ep.method.toUpperCase() !== upperMethod) return false;
    return matchPathSegments(ep.path, pathname);
  });
  if (templateMatch) return templateMatch;

  // 5. Fallback name-only match
  const nameOnly = allEndpoints.find(
    (ep) => ep.operationId === endpointName || ep.name === endpointName
  );
  if (nameOnly) return nameOnly;

  return null;
}

export function serializeFormSample(sample: any): string {
  if (!sample || typeof sample !== 'object') return '';
  const entries: string[] = [];
  for (const [k, v] of Object.entries(sample)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        entries.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item ?? ''))}`);
      }
    } else if (typeof v === 'object') {
      entries.push(`${encodeURIComponent(k)}=${encodeURIComponent(JSON.stringify(v))}`);
    } else {
      entries.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return entries.join('&');
}

export function serializeMultipartSample(sample: any): SwaggerMultipartField[] {
  if (!sample || typeof sample !== 'object') return [];
  const fields: SwaggerMultipartField[] = [];
  for (const [name, val] of Object.entries(sample)) {
    const strVal = String(val ?? '');
    const isFile =
      strVal.endsWith('.txt') ||
      strVal.endsWith('.png') ||
      strVal.endsWith('.jpg') ||
      strVal.endsWith('.pdf') ||
      name.toLowerCase().includes('file') ||
      name.toLowerCase().includes('upload');
    fields.push({
      name,
      value: isFile ? '' : strVal,
      enabled: true,
      ...(isFile ? { filename: strVal || 'sample.txt', content_type: 'text/plain' } : {}),
    });
  }
  return fields;
}

function resolveSpecSchema(
  baseType: string,
  schemas?: Record<string, SwaggerFieldSummary[]>
): SwaggerFieldSummary[] | null {
  if (!schemas || !baseType) return null;
  if (schemas[baseType]) return schemas[baseType];
  const short = baseType.split('.').pop() || baseType;
  if (schemas[short]) return schemas[short];
  return null;
}

function resolveSpecEnum(
  fieldName: string,
  baseType: string,
  fieldEnum?: string[],
  enums?: Record<string, string[]>
): string[] | null {
  if (Array.isArray(fieldEnum) && fieldEnum.length > 0) return fieldEnum;
  if (!enums) return null;
  if (enums[baseType] && enums[baseType].length > 0) return enums[baseType];
  const short = baseType.split('.').pop() || baseType;
  if (enums[short] && enums[short].length > 0) return enums[short];
  if (enums[fieldName] && enums[fieldName].length > 0) return enums[fieldName];
  return null;
}

function generateFieldValue(
  f: SwaggerFieldSummary,
  spec: SwaggerEndpointSpecification,
  visited: Set<string> = new Set(),
  depth: number = 0
): any {
  if (depth > 6) return null;

  const rawType = (f.type || 'string').trim();
  const isArray = rawType.endsWith('[]');
  const baseType = rawType.replace(/\[\]$/, '').trim();

  const generateSingle = (): any => {
    // 0. Field-level example or default
    if (f.example !== undefined) return f.example;
    if (f.default !== undefined) return f.default;

    // 1. Enums (field-level or schema-level)
    const enumVals = resolveSpecEnum(f.name, baseType, f.enum, spec.enums);
    if (enumVals && enumVals.length > 0) {
      return enumVals[0];
    }

    // 2. Integers
    if (['int32', 'int64', 'uint32', 'uint64', 'integer'].includes(baseType.toLowerCase())) {
      return generateSmartNumberSample(f.name, 'integer');
    }

    // 3. Floats / Numbers
    if (['double', 'float', 'number'].includes(baseType.toLowerCase())) {
      return generateSmartNumberSample(f.name, 'number');
    }

    // 4. Booleans
    if (baseType.toLowerCase() === 'boolean') {
      return generateSmartBooleanSample(f.name);
    }

    // 5. Nested DTO / Object Schemas
    const schemaFields = resolveSpecSchema(baseType, spec.schemas);
    if (schemaFields) {
      if (visited.has(baseType)) {
        return {}; // Break circular reference
      }
      const nextVisited = new Set(visited);
      nextVisited.add(baseType);
      const subObj: Record<string, any> = {};
      for (const subF of schemaFields) {
        subObj[subF.name] = generateFieldValue(subF, spec, nextVisited, depth + 1);
      }
      return subObj;
    }

    // 6. Generic Strings or unknown primitives
    return generateSmartStringSample(f.name);
  };

  return isArray ? [generateSingle()] : generateSingle();
}

export function generateSampleFromSpecification(
  spec: SwaggerEndpointSpecification
): any {
  if (!spec.requestFields || spec.requestFields.length === 0) return {};
  const obj: Record<string, any> = {};

  for (const f of spec.requestFields) {
    obj[f.name] = generateFieldValue(f, spec, new Set(), 0);
  }
  return obj;
}

/**
 * Resolves example sample payload with detailed format results (JSON, Form, Multipart).
 */
export function resolveSwaggerSampleResult(
  method: string,
  url: string,
  endpointName: string,
  swaggerDoc?: SwaggerDoc | null,
  sourceUrl?: string,
  matchedEndpoint?: ParsedHttpEndpoint | null,
  targetBodyType?: 'json' | 'form' | 'multipart' | 'text' | 'binary' | 'none',
  specification?: SwaggerEndpointSpecification | null
): SwaggerSamplePayloadResult | null {
  let targetEp = matchedEndpoint;

  if (!targetEp && swaggerDoc && sourceUrl) {
    const parsed = parseSwaggerSpec(swaggerDoc, sourceUrl);
    targetEp = findMatchingSwaggerEndpoint(parsed, method, url, endpointName);
  }

  let sampleData: any = null;
  let detectedType: 'json' | 'form' | 'multipart' | 'text' = 'json';

  if (targetEp) {
    detectedType = (targetEp.bodyType === 'none' ? 'json' : targetEp.bodyType) as any;
  }

  // 1. Primary: Generate from specification if requestFields exist (matches Specification tab struct)
  const effectiveSpec = specification || targetEp?.specification;
  if (effectiveSpec && Array.isArray(effectiveSpec.requestFields) && effectiveSpec.requestFields.length > 0) {
    sampleData = generateSampleFromSpecification(effectiveSpec);
  }

  // 2. Fallback: targetEp.body if specification was not available or produced empty
  if (!sampleData && targetEp) {
    if (!targetBodyType && targetEp.body && !targetEp.specification) {
      return {
        bodyType: detectedType,
        body: targetEp.body,
        multipartFields:
          targetEp.bodyType === 'multipart'
            ? (() => {
                try {
                  return JSON.parse(targetEp.body);
                } catch {
                  return undefined;
                }
              })()
            : undefined,
      };
    }
    if (targetEp.body) {
      if (targetEp.bodyType === 'form') {
        try {
          const params = new URLSearchParams(targetEp.body);
          const parsedForm: Record<string, any> = {};
          params.forEach((v, k) => {
            parsedForm[k] = v;
          });
          sampleData = parsedForm;
        } catch {
          sampleData = targetEp.body;
        }
      } else {
        try {
          sampleData = JSON.parse(targetEp.body);
        } catch {
          sampleData = targetEp.body;
        }
      }
    }
  }

  // 3. Last fallback: specification if targetEp.body empty
  if (!sampleData && effectiveSpec) {
    sampleData = generateSampleFromSpecification(effectiveSpec);
  }

  if (!sampleData || typeof sampleData !== 'object') {
    return null;
  }

  const finalType = (
    targetBodyType && targetBodyType !== 'none' ? targetBodyType : detectedType
  ) as 'json' | 'form' | 'multipart' | 'text';

  if (finalType === 'form') {
    return {
      bodyType: 'form',
      body: typeof sampleData === 'string' ? sampleData : serializeFormSample(sampleData),
    };
  }

  if (finalType === 'multipart') {
    const fields =
      Array.isArray(sampleData) &&
      sampleData.every((item) => item && typeof item === 'object' && 'name' in item)
        ? (sampleData as SwaggerMultipartField[])
        : serializeMultipartSample(sampleData);
    return {
      bodyType: 'multipart',
      body: JSON.stringify(fields, null, 2),
      multipartFields: fields,
    };
  }

  // Default: JSON
  return {
    bodyType: 'json',
    body: typeof sampleData === 'string' ? sampleData : JSON.stringify(sampleData, null, 2),
  };
}

/**
 * Resolves example sample body from parsed swagger spec or matched endpoint.
 * Pure standalone function testable without component mount.
 */
export function resolveSwaggerSamplePayload(
  method: string,
  url: string,
  endpointName: string,
  swaggerDoc?: SwaggerDoc | null,
  sourceUrl?: string,
  matchedEndpoint?: ParsedHttpEndpoint | null,
  targetBodyType?: 'json' | 'form' | 'multipart' | 'text' | 'binary' | 'none',
  specification?: SwaggerEndpointSpecification | null
): string | null {
  const result = resolveSwaggerSampleResult(
    method,
    url,
    endpointName,
    swaggerDoc,
    sourceUrl,
    matchedEndpoint,
    targetBodyType,
    specification
  );
  return result ? result.body : null;
}

export interface SwaggerSampleParamsResult {
  queryParams: [string, string, string, boolean][];
  pathVariables: [string, string, string, boolean][];
}

/**
 * Resolves example query and path parameters from Swagger/OpenAPI spec.
 */
export function resolveSwaggerSampleParams(
  method: string,
  url: string,
  endpointName: string,
  swaggerDoc?: SwaggerDoc | null,
  sourceUrl?: string,
  matchedEndpoint?: ParsedHttpEndpoint | null,
  currentParams: Array<[string, string, string?, boolean?]> = [],
  currentPathVars: Array<[string, string, string?, boolean?]> = [],
  specification?: SwaggerEndpointSpecification | null
): SwaggerSampleParamsResult | null {
  let targetEp = matchedEndpoint;
  if (!targetEp && swaggerDoc && sourceUrl) {
    const parsed = parseSwaggerSpec(swaggerDoc, sourceUrl);
    targetEp = findMatchingSwaggerEndpoint(parsed, method, url, endpointName);
  }

  let opParams: any[] = [];
  if (swaggerDoc && sourceUrl) {
    const ep =
      targetEp ||
      findMatchingSwaggerEndpoint(
        parseSwaggerSpec(swaggerDoc, sourceUrl),
        method,
        url,
        endpointName
      );
    if (ep && swaggerDoc.paths) {
      const lowerMethod = method.toLowerCase();
      for (const [pathKey, pathObj] of Object.entries(swaggerDoc.paths)) {
        if (!pathObj || typeof pathObj !== 'object') continue;
        const norm = convertSwaggerPathToApiPath(pathKey);
        if (norm === ep.path || pathKey === ep.path || ep.fullUrl.includes(pathKey)) {
          const common = Array.isArray(pathObj.parameters) ? pathObj.parameters : [];
          const op = Array.isArray(pathObj[lowerMethod]?.parameters)
            ? pathObj[lowerMethod].parameters
            : [];
          opParams = [...common, ...op];
          break;
        }
      }
    }
  }

  const generateParamVal = (p: any): string => {
    const enumList = Array.isArray(p.enum)
      ? p.enum
      : Array.isArray(p.schema?.enum)
      ? p.schema.enum
      : null;
    if (enumList && enumList.length > 0) {
      if (p.default !== undefined && enumList.includes(p.default)) {
        return String(p.default);
      }
      return String(enumList[0]);
    }

    if (p.default !== undefined && String(p.default).trim() !== '') {
      return String(p.default);
    }
    if (p.example !== undefined && String(p.example).trim() !== '') {
      return String(p.example);
    }
    if (p.schema?.default !== undefined && String(p.schema.default).trim() !== '') {
      return String(p.schema.default);
    }

    const name = (p.name || '').toLowerCase().replace(/[-_]/g, '');
    const format = String(p.format || p.schema?.format || '').toLowerCase();
    const type = String(p.type || p.schema?.type || '').toLowerCase();

    if (['uint64', 'int64', 'int32', 'integer'].includes(format) || type === 'integer') {
      if (name.includes('page')) return '1';
      if (name.includes('limit') || name.includes('size')) return '20';
      if (name.endsWith('id') || name === 'id') return '1001';
      return '100';
    }

    if (name.includes('cursor')) return 'cur_1001';
    if (name.includes('email')) return 'user@example.com';
    if (name.endsWith('id') || name === 'id') return '1001';
    if (name.includes('limit') || name.includes('size')) return '20';
    if (name.includes('page')) return '1';
    if (name.includes('date')) return '2026-10-30';
    if (name.includes('query') || name.includes('search') || name.includes('keyword')) return 'test';
    if (name.includes('sort') || name.includes('order')) return 'asc';

    return `${p.name || 'param'}_sample`;
  };

  const newQueryParams: [string, string, string, boolean][] = [];
  const newPathVars: [string, string, string, boolean][] = [];

  if (opParams.length > 0) {
    for (const p of opParams) {
      if (!p || typeof p !== 'object' || !p.name) continue;
      const val = generateParamVal(p);
      const desc = p.description || '';
      if (p.in === 'query') {
        const existing = currentParams.find(([k]) => k === p.name);
        newQueryParams.push([
          p.name,
          val,
          desc || existing?.[2] || '',
          existing ? existing[3] !== false : true,
        ]);
      } else if (p.in === 'path') {
        const existing = currentPathVars.find(([k]) => k === p.name);
        newPathVars.push([
          p.name,
          val,
          desc || existing?.[2] || '',
          existing ? existing[3] !== false : true,
        ]);
      }
    }
  } else if (targetEp) {
    for (const [k, defVal, desc] of targetEp.queryParams || []) {
      const existing = currentParams.find(([curK]) => curK === k);
      const val = defVal && defVal.trim() !== '' ? defVal : generateParamVal({ name: k });
      newQueryParams.push([
        k,
        val,
        desc || existing?.[2] || '',
        existing ? existing[3] !== false : true,
      ]);
    }
    for (const [k, defVal, desc] of targetEp.pathVariables || []) {
      const existing = currentPathVars.find(([curK]) => curK === k);
      const val = defVal && defVal.trim() !== '' ? defVal : generateParamVal({ name: k });
      newPathVars.push([
        k,
        val,
        desc || existing?.[2] || '',
        existing ? existing[3] !== false : true,
      ]);
    }
  } else if (specification?.requestFields && specification.requestFields.length > 0) {
    for (const f of specification.requestFields) {
      const isPath = url.includes(`:${f.name}`) || url.includes(`{${f.name}}`);
      const val = generateParamVal({
        name: f.name,
        type: f.type,
        enum: f.enum || (specification.enums && specification.enums[f.type]),
        description: f.description,
      });
      const desc = f.description || '';
      if (isPath) {
        const existing = currentPathVars.find(([k]) => k === f.name);
        newPathVars.push([
          f.name,
          val,
          desc || existing?.[2] || '',
          existing ? existing[3] !== false : true,
        ]);
      } else {
        const existing = currentParams.find(([k]) => k === f.name);
        newQueryParams.push([
          f.name,
          val,
          desc || existing?.[2] || '',
          existing ? existing[3] !== false : true,
        ]);
      }
    }
  } else if (currentParams.length > 0 || currentPathVars.length > 0) {
    for (const [k, _v, d, en] of currentParams) {
      newQueryParams.push([k, generateParamVal({ name: k }), d ?? '', en !== false]);
    }
    for (const [k, _v, d, en] of currentPathVars) {
      newPathVars.push([k, generateParamVal({ name: k }), d ?? '', en !== false]);
    }
  }

  return {
    queryParams: newQueryParams,
    pathVariables: newPathVars,
  };
}
