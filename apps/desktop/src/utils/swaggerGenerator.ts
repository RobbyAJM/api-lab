/**
 * Generates collection folder hierarchy and HTTP endpoints from Swagger/OpenAPI specifications.
 * Pure logic and testable without UI or active Tauri window.
 */

import {
  parseSwaggerSpec,
  type ParsedSwaggerSpec,
  type SwaggerDoc,
} from './swaggerParser.ts';
import { executeNativeHttp } from '../api/native.ts';

export interface PlannedSwaggerEndpoint {
  name: string;
  protocol: 'http';
  serviceTag: string;
  config: {
    method: string;
    url: string;
    summary?: string;
    query_params: [string, string, string?][];
    path_variables?: [string, string, string?][];
    headers: Record<string, string>;
    header_descriptions?: Record<string, string>;
    body_type: 'none' | 'json' | 'text' | 'form' | 'multipart' | 'binary';
    body: string;
    specification?: any;
  };
}

export interface PlannedSwaggerServiceFolder {
  name: string;
  endpoints: PlannedSwaggerEndpoint[];
}

export interface PlannedSwaggerHierarchy {
  rootFolderName: string;
  swaggerUrl: string;
  baseUrl: string;
  serviceFolders: PlannedSwaggerServiceFolder[];
  totalEndpoints: number;
}

export interface SwaggerProgressInfo {
  message: string;
  percent: number;
  current?: number;
  total?: number;
}

export interface SwaggerAbortSignal {
  aborted: boolean;
}

export const DEFAULT_SWAGGER_BASE_URL = 'https://httpbin.dmuth.org';
export const DEFAULT_SWAGGER_PATH = 'openapi.json';
export const DEFAULT_SWAGGER_URL = `${DEFAULT_SWAGGER_BASE_URL}/${DEFAULT_SWAGGER_PATH}`;
export const DEFAULT_SWAGGER_FOLDER_NAME = 'Swagger APIs';

export function combineSwaggerUrl(baseUrl: string, path: string): string {
  let cleanBase = (baseUrl || '').trim();
  if (
    cleanBase &&
    !cleanBase.startsWith('http://') &&
    !cleanBase.startsWith('https://') &&
    !cleanBase.startsWith('{{')
  ) {
    cleanBase = `http://${cleanBase}`;
  }
  cleanBase = cleanBase.replace(/\/+$/, '');

  let cleanPath = (path || '').trim();
  cleanPath = cleanPath.replace(/^\/+/, '');

  if (!cleanBase) return cleanPath ? `/${cleanPath}` : '';
  if (!cleanPath) return cleanBase;
  return `${cleanBase}/${cleanPath}`;
}

export function getDefaultSwaggerConfig() {
  return {
    baseUrl: DEFAULT_SWAGGER_BASE_URL,
    path: DEFAULT_SWAGGER_PATH,
    swaggerUrl: DEFAULT_SWAGGER_URL,
    folderName: DEFAULT_SWAGGER_FOLDER_NAME,
  };
}

export interface ApiCaller {
  post: (path: string, body: any) => Promise<any>;
}

/**
 * Plans the folder and endpoint hierarchy:
 * {folderName}/ (Root Swagger Folder with swagger_url)
 * |-- {serviceTag}/ (Service / Tag subfolder)
 *     |-- {endpoint} (HTTP Endpoint)
 */
export function planSwaggerHierarchy(options: {
  folderName: string;
  swaggerUrl: string;
  spec: ParsedSwaggerSpec;
}): PlannedSwaggerHierarchy {
  const rootFolderName = options.folderName.trim() || options.spec.title || 'Swagger APIs';
  const serviceFolders: PlannedSwaggerServiceFolder[] = [];
  let totalEndpoints = 0;

  for (const svc of options.spec.services) {
    if (!svc.name) continue;
    const endpoints: PlannedSwaggerEndpoint[] = [];

    for (const ep of svc.endpoints) {
      endpoints.push({
        name: ep.name,
        protocol: 'http',
        serviceTag: svc.name,
        config: {
          method: ep.method,
          url: ep.fullUrl,
          summary: ep.summary,
          query_params: ep.queryParams,
          path_variables: ep.pathVariables,
          headers: ep.headers,
          header_descriptions: ep.headerDescriptions,
          body_type: ep.bodyType,
          body: ep.body,
          specification: ep.specification,
        },
      });
      totalEndpoints++;
    }

    serviceFolders.push({
      name: svc.name,
      endpoints,
    });
  }

  return {
    rootFolderName,
    swaggerUrl: options.swaggerUrl.trim(),
    baseUrl: options.spec.baseUrl,
    serviceFolders,
    totalEndpoints,
  };
}

/**
 * Executes folder and endpoint creation in the collection.
 */
export async function executeSwaggerHierarchyCreation(
  collectionId: string,
  planned: PlannedSwaggerHierarchy,
  api: ApiCaller,
  onProgress?: (info: SwaggerProgressInfo | string) => void,
  signal?: SwaggerAbortSignal
): Promise<{
  rootFolderId: string;
  createdServiceFoldersCount: number;
  createdEndpointsCount: number;
}> {
  if (signal?.aborted) {
    return { rootFolderId: '', createdServiceFoldersCount: 0, createdEndpointsCount: 0 };
  }

  // 1. Create root folder with swagger_url stored directly on the folder
  const rootFolder = await api.post(`/collections/${collectionId}/folders`, {
    name: planned.rootFolderName,
    parent_folder_id: null,
    swagger_url: planned.swaggerUrl,
  });

  const rootFolderId = rootFolder.id;
  let createdServiceFoldersCount = 0;
  let createdEndpointsCount = 0;
  const total = planned.totalEndpoints;
  let done = 0;

  const endpointsToCreate: Array<{
    name: string;
    protocol: 'http';
    folder_id: string;
    config: any;
  }> = [];

  // 2. Create service subfolders and collect child HTTP endpoints
  for (const sFolder of planned.serviceFolders) {
    if (signal?.aborted) break;
    const childFolder = await api.post(`/collections/${collectionId}/folders`, {
      name: sFolder.name,
      parent_folder_id: rootFolderId,
    });
    createdServiceFoldersCount++;

    for (const ep of sFolder.endpoints) {
      endpointsToCreate.push({
        name: ep.name,
        protocol: 'http',
        folder_id: childFolder.id,
        config: ep.config,
      });
    }
  }

  // 3. Batch create endpoints in chunks of 10 to minimize backend API calls
  const CHUNK_SIZE = 10;
  for (let i = 0; i < endpointsToCreate.length; i += CHUNK_SIZE) {
    if (signal?.aborted) break;
    const chunk = endpointsToCreate.slice(i, i + CHUNK_SIZE);

    let batchSuccess = false;
    try {
      await api.post(`/collections/${collectionId}/endpoints/batch`, {
        endpoints: chunk,
      });
      batchSuccess = true;
      createdEndpointsCount += chunk.length;
      done += chunk.length;
    } catch {
      batchSuccess = false;
    }

    if (!batchSuccess) {
      for (const ep of chunk) {
        if (signal?.aborted) break;
        await api.post(`/collections/${collectionId}/endpoints`, ep);
        createdEndpointsCount++;
        done++;
      }
    }

    const percent = 25 + Math.round((done / Math.max(total, 1)) * 70);
    onProgress?.({
      message: `Creating endpoints: ${done}/${total}...`,
      percent: Math.min(percent, 95),
      current: done,
      total,
    });
  }

  return {
    rootFolderId,
    createdServiceFoldersCount,
    createdEndpointsCount,
  };
}

/**
 * Replaces {{VAR}} placeholders in swagger URL using provided environment variables.
 */
export function substituteUrlVariables(url: string, variables?: Record<string, string>): string {
  if (!variables) return url;
  return url.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, key) => {
    return variables[key] ?? variables[key.toLowerCase()] ?? variables[key.toUpperCase()] ?? `{{${key}}}`;
  });
}

export function normalizeSwaggerUrl(url: string, variables?: Record<string, string>): string {
  let effective = substituteUrlVariables((url || '').trim(), variables);
  if (!effective) return '';
  if (!effective.startsWith('http://') && !effective.startsWith('https://') && !effective.startsWith('{{')) {
    effective = `http://${effective}`;
  }
  return effective;
}

/**
 * Standalone fetcher for Swagger/OpenAPI json with timeout protection.
 * In Tauri desktop runtime, uses native HTTP runner to bypass browser CORS blocks on local endpoints.
 */
export async function fetchSwaggerSpec(
  url: string,
  options?: {
    timeoutMs?: number;
    variables?: Record<string, string>;
    fetchFn?: typeof fetch;
  }
): Promise<SwaggerDoc> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const effectiveUrl = normalizeSwaggerUrl(url, options?.variables);
  if (!effectiveUrl) {
    throw new Error('Please specify a Swagger URL');
  }

  // 1. Explicit fetchFn provided (e.g. in tests)
  if (options?.fetchFn) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await options.fetchFn(effectiveUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json, */*',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch Swagger spec: HTTP ${res.status} ${res.statusText}`);
      }

      const json = await res.json();
      return json as SwaggerDoc;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Swagger request timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // 2. Execute via native HTTP client (bypasses browser CORS in Tauri desktop)
  try {
    const nativeRes = await executeNativeHttp(
      {
        url: effectiveUrl,
        method: 'GET',
        headers: { Accept: 'application/json, */*' },
        query_params: [],
        body: undefined,
        body_type: 'none',
        timeout_ms: timeoutMs,
      },
      options?.variables || {}
    );

    if (nativeRes.error) {
      throw new Error(nativeRes.error);
    }
    if (nativeRes.status_code >= 400 || nativeRes.status_code === 0) {
      throw new Error(
        `HTTP ${nativeRes.status_code} ${nativeRes.status_text || 'Error'}: ${
          nativeRes.body ? nativeRes.body.slice(0, 200) : 'Failed to fetch specification'
        }`
      );
    }

    try {
      return JSON.parse(nativeRes.body) as SwaggerDoc;
    } catch {
      throw new Error('Swagger specification is not valid JSON');
    }
  } catch (nativeErr: any) {
    // If native execution failed or was unavailable, try browser fetch as fallback
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(effectiveUrl, {
        method: 'GET',
        headers: { Accept: 'application/json, */*' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as SwaggerDoc;
    } catch {
      throw new Error(nativeErr.message || 'Failed to fetch Swagger specification');
    }
  }
}

/**
 * Full end-to-end generator coordinator.
 */
export async function generateSwaggerCollection(options: {
  collectionId: string;
  folderName: string;
  swaggerUrl: string;
  baseUrl?: string;
  variables?: Record<string, string>;
  timeoutMs?: number;
  onProgress?: (info: SwaggerProgressInfo | string) => void;
  signal?: SwaggerAbortSignal;
  apiCaller: ApiCaller;
  fetchFn?: typeof fetch;
}): Promise<{
  rootFolderId: string;
  createdServiceFoldersCount: number;
  createdEndpointsCount: number;
  totalEndpoints: number;
}> {
  if (options.signal?.aborted) {
    return { rootFolderId: '', createdServiceFoldersCount: 0, createdEndpointsCount: 0, totalEndpoints: 0 };
  }

  options.onProgress?.({ message: 'Fetching Swagger specification...', percent: 10 });

  const doc = await fetchSwaggerSpec(options.swaggerUrl, {
    timeoutMs: options.timeoutMs,
    variables: options.variables,
    fetchFn: options.fetchFn,
  });

  if (options.signal?.aborted) {
    return { rootFolderId: '', createdServiceFoldersCount: 0, createdEndpointsCount: 0, totalEndpoints: 0 };
  }

  options.onProgress?.({ message: 'Parsing endpoints and schemas...', percent: 25 });
  const spec = parseSwaggerSpec(doc, options.swaggerUrl, options.baseUrl);

  if (spec.services.length === 0 || spec.totalEndpoints === 0) {
    throw new Error('No endpoints discovered in Swagger specification.');
  }

  if (options.signal?.aborted) {
    return { rootFolderId: '', createdServiceFoldersCount: 0, createdEndpointsCount: 0, totalEndpoints: spec.totalEndpoints };
  }

  options.onProgress?.({
    message: `Found ${spec.totalEndpoints} endpoints across ${spec.services.length} services. Creating folders...`,
    percent: 25,
  });

  const planned = planSwaggerHierarchy({
    folderName: options.folderName,
    swaggerUrl: options.swaggerUrl,
    spec,
  });

  const result = await executeSwaggerHierarchyCreation(
    options.collectionId,
    planned,
    options.apiCaller,
    options.onProgress,
    options.signal
  );

  if (!options.signal?.aborted) {
    options.onProgress?.({ message: 'Finalizing collection...', percent: 100 });
  }

  return {
    ...result,
    totalEndpoints: planned.totalEndpoints,
  };
}
