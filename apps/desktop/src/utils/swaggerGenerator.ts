/**
 * Generates collection folder hierarchy and HTTP endpoints from Swagger/OpenAPI specifications.
 * Pure logic and testable without UI or active Tauri window.
 */

import {
  parseSwaggerSpec,
  type ParsedSwaggerSpec,
  type SwaggerDoc,
} from './swaggerParser.ts';

export interface PlannedSwaggerEndpoint {
  name: string;
  protocol: 'http';
  serviceTag: string;
  config: {
    method: string;
    url: string;
    query_params: [string, string][];
    headers: Record<string, string>;
    body_type: 'none' | 'json';
    body: string;
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
          query_params: ep.queryParams,
          headers: ep.headers,
          body_type: ep.bodyType,
          body: ep.body,
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
  api: ApiCaller
): Promise<{
  rootFolderId: string;
  createdServiceFoldersCount: number;
  createdEndpointsCount: number;
}> {
  // 1. Create root folder with swagger_url stored directly on the folder
  const rootFolder = await api.post(`/collections/${collectionId}/folders`, {
    name: planned.rootFolderName,
    parent_folder_id: null,
    swagger_url: planned.swaggerUrl,
  });

  const rootFolderId = rootFolder.id;
  let createdServiceFoldersCount = 0;
  let createdEndpointsCount = 0;

  // 2. Create service subfolders and child HTTP endpoints
  for (const sFolder of planned.serviceFolders) {
    const childFolder = await api.post(`/collections/${collectionId}/folders`, {
      name: sFolder.name,
      parent_folder_id: rootFolderId,
    });
    createdServiceFoldersCount++;

    for (const ep of sFolder.endpoints) {
      await api.post(`/collections/${collectionId}/endpoints`, {
        name: ep.name,
        protocol: 'http',
        folder_id: childFolder.id,
        config: ep.config,
      });
      createdEndpointsCount++;
    }
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

/**
 * Standalone fetcher for Swagger/OpenAPI json with timeout protection.
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
  const effectiveUrl = substituteUrlVariables(url, options?.variables);
  const customFetch = options?.fetchFn || fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await customFetch(effectiveUrl, {
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

/**
 * Full end-to-end generator coordinator.
 */
export async function generateSwaggerCollection(options: {
  collectionId: string;
  folderName: string;
  swaggerUrl: string;
  variables?: Record<string, string>;
  timeoutMs?: number;
  onProgress?: (status: string) => void;
  apiCaller: ApiCaller;
  fetchFn?: typeof fetch;
}): Promise<{
  rootFolderId: string;
  createdServiceFoldersCount: number;
  createdEndpointsCount: number;
  totalEndpoints: number;
}> {
  options.onProgress?.('Fetching Swagger specification...');

  const doc = await fetchSwaggerSpec(options.swaggerUrl, {
    timeoutMs: options.timeoutMs,
    variables: options.variables,
    fetchFn: options.fetchFn,
  });

  options.onProgress?.('Parsing endpoints and schemas...');
  const spec = parseSwaggerSpec(doc, options.swaggerUrl);

  if (spec.services.length === 0 || spec.totalEndpoints === 0) {
    throw new Error('No endpoints discovered in Swagger specification.');
  }

  options.onProgress?.(`Found ${spec.totalEndpoints} endpoints across ${spec.services.length} services. Creating folders...`);

  const planned = planSwaggerHierarchy({
    folderName: options.folderName,
    swaggerUrl: options.swaggerUrl,
    spec,
  });

  const result = await executeSwaggerHierarchyCreation(
    options.collectionId,
    planned,
    options.apiCaller
  );

  return {
    ...result,
    totalEndpoints: planned.totalEndpoints,
  };
}
