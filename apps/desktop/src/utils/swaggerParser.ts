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
}

export interface SwaggerEndpointSpecification {
  summary?: string;
  requestTypeName?: string;
  requestFields: SwaggerFieldSummary[];
  responseTypeName?: string;
  responseFields: SwaggerFieldSummary[];
  schemas?: Record<string, SwaggerFieldSummary[]>;
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
  bodyType: 'none' | 'json';
  body: string; // JSON string payload
  specification?: SwaggerEndpointSpecification;
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
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths?: Record<string, Record<string, any>>;
  definitions?: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
  };
}

/**
 * Resolves a $ref pointer like '#/definitions/Pet' or '#/components/schemas/Pet'
 */
export function resolveRef(ref: string, rootDoc: SwaggerDoc): any {
  if (!ref || typeof ref !== 'string') return null;
  const parts = ref.replace(/^#\//, '').split('/');
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
 * Recursively generates a sample JSON value from a schema.
 * Employs visited set to prevent infinite loops on recursive schemas.
 */
export function generateSampleFromSchema(
  schema: any,
  rootDoc: SwaggerDoc,
  visitedRefs: Set<string> = new Set(),
  depth: number = 0
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
    return generateSampleFromSchema(resolved, rootDoc, nextVisited, depth + 1);
  }

  // Handle allOf (merge properties)
  if (Array.isArray(schema.allOf)) {
    const merged: Record<string, any> = {};
    for (const sub of schema.allOf) {
      const sample = generateSampleFromSchema(sub, rootDoc, visitedRefs, depth + 1);
      if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
        Object.assign(merged, sample);
      }
    }
    return merged;
  }

  // Handle oneOf / anyOf: pick first branch
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return generateSampleFromSchema(schema.oneOf[0], rootDoc, visitedRefs, depth + 1);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return generateSampleFromSchema(schema.anyOf[0], rootDoc, visitedRefs, depth + 1);
  }

  const type = schema.type;

  // Object
  if (type === 'object' || schema.properties) {
    const obj: Record<string, any> = {};
    const props = schema.properties || {};
    for (const [propName, propSchema] of Object.entries(props)) {
      obj[propName] = generateSampleFromSchema(propSchema, rootDoc, visitedRefs, depth + 1);
    }
    return obj;
  }

  // Array
  if (type === 'array' || schema.items) {
    if (schema.items) {
      const itemSample = generateSampleFromSchema(schema.items, rootDoc, visitedRefs, depth + 1);
      return itemSample !== null && itemSample !== undefined ? [itemSample] : [];
    }
    return [];
  }

  // Primitives with defaults/examples
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  if (type === 'string') {
    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      return schema.enum[0];
    }
    if (schema.format === 'date-time') return '2026-01-01T00:00:00Z';
    if (schema.format === 'date') return '2026-01-01';
    if (schema.format === 'byte' || schema.format === 'binary') return '';
    return '';
  }

  if (type === 'integer' || type === 'number') {
    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      return schema.enum[0];
    }
    return 0;
  }

  if (type === 'boolean') {
    return false;
  }

  return {};
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
  if (!reqSchema && operation?.requestBody?.content) {
    const content = operation.requestBody.content;
    const jsonContent =
      content['application/json'] ||
      content['*/*'] ||
      Object.values(content)[0];
    if (jsonContent?.schema) {
      reqSchema = jsonContent.schema;
    }
  }

  if (reqSchema) {
    requestTypeName = getSchemaTypeName(reqSchema) || 'RequestBody';
    const resolvedReq = reqSchema.$ref ? resolveRef(reqSchema.$ref, doc) : reqSchema;
    const props = resolvedReq?.properties || {};
    const requiredList = Array.isArray(resolvedReq?.required) ? resolvedReq.required : [];

    for (const [propName, propSchema] of Object.entries(props)) {
      requestFields.push({
        name: propName,
        type: formatSwaggerPropertyType(propSchema, doc),
        required: requiredList.includes(propName),
        description: (propSchema as any)?.description,
      });
    }
  } else if (allParams.length > 0) {
    const nonBody = allParams.filter((p) => p && p.name && p.in !== 'body');
    if (nonBody.length > 0) {
      requestTypeName = 'Parameters';
      for (const p of nonBody) {
        requestFields.push({
          name: p.name,
          type: p.type || (p.schema ? formatSwaggerPropertyType(p.schema, doc) : 'string'),
          required: !!p.required,
          description: p.description,
        });
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
      responseTypeName = getSchemaTypeName(resSchema) || 'ResponseBody';
      const resolvedRes = resSchema.$ref ? resolveRef(resSchema.$ref, doc) : resSchema;
      const props = resolvedRes?.properties || {};
      const requiredList = Array.isArray(resolvedRes?.required) ? resolvedRes.required : [];

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

  // 3. Collect all definition schemas for DTO drilldown
  const allSchemas: Record<string, SwaggerFieldSummary[]> = {};
  const defs = doc.definitions || doc.components?.schemas || {};
  for (const [defName, defSchema] of Object.entries(defs)) {
    if (!defSchema || typeof defSchema !== 'object') continue;
    const props = (defSchema as any).properties || {};
    const reqList = Array.isArray((defSchema as any).required) ? (defSchema as any).required : [];
    const fields: SwaggerFieldSummary[] = [];
    for (const [propName, propSchema] of Object.entries(props)) {
      fields.push({
        name: propName,
        type: formatSwaggerPropertyType(propSchema, doc),
        required: reqList.includes(propName),
        description: (propSchema as any)?.description,
      });
    }
    allSchemas[defName] = fields;
  }

  return {
    summary: operation?.summary,
    requestTypeName,
    requestFields,
    responseTypeName,
    responseFields,
    schemas: allSchemas,
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

/**
 * Parses raw Swagger or OpenAPI JSON into structured services and endpoints.
 */
export function parseSwaggerSpec(doc: SwaggerDoc, sourceUrl: string): ParsedSwaggerSpec {
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
          bodySample = generateSampleFromSchema(p.schema, doc);
        }
      }

      // OpenAPI 3.x requestBody
      if (!hasBody && operation.requestBody && typeof operation.requestBody === 'object') {
        const content = operation.requestBody.content;
        if (content && typeof content === 'object') {
          const jsonContent =
            content['application/json'] ||
            content['*/*'] ||
            Object.values(content)[0];
          if (jsonContent?.schema) {
            hasBody = true;
            bodySample = generateSampleFromSchema(jsonContent.schema, doc);
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
        bodyType: hasBody ? 'json' : 'none',
        body: hasBody && bodySample !== null ? JSON.stringify(bodySample, null, 2) : '',
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

  return {
    title,
    version,
    baseUrl,
    services,
    totalEndpoints,
  };
}
