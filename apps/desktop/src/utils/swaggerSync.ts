/**
 * Reconciles and synchronizes local Swagger Folders and endpoints with fresh Swagger specifications.
 * Pure logic and testable without UI or active Tauri window.
 */

import type { CollectionFolder, Endpoint } from '@api-lab/api-types';
import type { ParsedSwaggerSpec, ParsedSwaggerService, ParsedHttpEndpoint } from './swaggerParser.ts';

export interface SwaggerSyncPlan {
  servicesToDelete: { folderId: string; serviceName: string }[];
  servicesToCreate: ParsedSwaggerService[];
  endpointsToCreate: {
    folderId: string;
    serviceName: string;
    endpoint: ParsedHttpEndpoint;
  }[];
  endpointsToDelete: {
    endpointId: string;
    endpointName: string;
  }[];
  endpointsToUpdate: {
    endpoint: Endpoint;
    newName?: string;
    newConfig: Record<string, any>;
  }[];
}

/**
 * Reconciles an existing JSON payload with a fresh schema-generated payload:
 * 1. Preserves non-empty values the user already edited.
 * 2. Injects new keys present in the fresh schema.
 * 3. Prunes keys removed from the fresh schema.
 */
export function reconcileHttpPayload(
  current: any,
  fresh: any
): { updatedPayload: any; changed: boolean } {
  // If either is not an object or is null/array, fallback to fresh if current empty
  if (
    typeof current !== 'object' ||
    current === null ||
    Array.isArray(current) ||
    typeof fresh !== 'object' ||
    fresh === null ||
    Array.isArray(fresh)
  ) {
    const isCurrentEmpty =
      current === null ||
      current === undefined ||
      current === '' ||
      (typeof current === 'object' && Object.keys(current).length === 0);

    if (isCurrentEmpty) {
      return { updatedPayload: fresh, changed: true };
    }
    return { updatedPayload: current, changed: false };
  }

  let changed = false;
  const result: Record<string, any> = {};

  // 1. Reconcile matching keys and add new keys
  for (const [key, freshVal] of Object.entries(fresh)) {
    if (key in current) {
      const curVal = current[key];
      if (
        typeof curVal === 'object' &&
        curVal !== null &&
        typeof freshVal === 'object' &&
        freshVal !== null
      ) {
        const nested = reconcileHttpPayload(curVal, freshVal);
        result[key] = nested.updatedPayload;
        if (nested.changed) changed = true;
      } else {
        result[key] = curVal;
      }
    } else {
      result[key] = freshVal;
      changed = true;
    }
  }

  // 2. Detect if keys were dropped
  for (const key of Object.keys(current)) {
    if (!(key in fresh)) {
      changed = true;
    }
  }

  return { updatedPayload: result, changed };
}

/**
 * Matches an existing endpoint to a fresh parsed endpoint by name or method+path.
 */
function findMatchingEndpoint(
  existingEp: Endpoint,
  freshEndpoints: ParsedHttpEndpoint[]
): ParsedHttpEndpoint | undefined {
  // 1. Direct name match
  const byName = freshEndpoints.find((f) => f.name === existingEp.name);
  if (byName) return byName;

  // 2. Method + URL match
  const curMethod = existingEp.config?.method?.toUpperCase();
  const curUrl = existingEp.config?.url;
  if (curMethod && curUrl) {
    return freshEndpoints.find(
      (f) => f.method.toUpperCase() === curMethod && f.fullUrl === curUrl
    );
  }

  return undefined;
}

/**
 * Plans the Swagger reconciliation between existing folders/endpoints and the freshly parsed Swagger spec.
 */
export function planSwaggerSync(
  rootFolderId: string,
  existingFolders: CollectionFolder[],
  existingEndpoints: Endpoint[],
  freshSpec: ParsedSwaggerSpec
): SwaggerSyncPlan {
  const serviceFolders = existingFolders.filter((f) => f.parent_folder_id === rootFolderId);

  const freshServiceMap = new Map<string, ParsedSwaggerService>();
  for (const s of freshSpec.services) {
    freshServiceMap.set(s.name, s);
  }

  const existingFolderMap = new Map<string, CollectionFolder>();
  for (const sf of serviceFolders) {
    existingFolderMap.set(sf.name, sf);
  }

  const servicesToDelete: { folderId: string; serviceName: string }[] = [];
  const servicesToCreate: ParsedSwaggerService[] = [];
  const endpointsToCreate: SwaggerSyncPlan['endpointsToCreate'] = [];
  const endpointsToDelete: SwaggerSyncPlan['endpointsToDelete'] = [];
  const endpointsToUpdate: SwaggerSyncPlan['endpointsToUpdate'] = [];

  // 1. Detect deleted service folders
  for (const sf of serviceFolders) {
    if (!freshServiceMap.has(sf.name)) {
      servicesToDelete.push({ folderId: sf.id, serviceName: sf.name });
    }
  }

  // 2. Detect new service folders
  for (const fs of freshSpec.services) {
    if (!existingFolderMap.has(fs.name)) {
      servicesToCreate.push(fs);
    }
  }

  // 3. For existing service folders: reconcile endpoints
  for (const sf of serviceFolders) {
    const freshService = freshServiceMap.get(sf.name);
    if (!freshService) continue;

    const folderEndpoints = existingEndpoints.filter((e) => e.folder_id === sf.id);

    // Endpoints to delete
    for (const ep of folderEndpoints) {
      const match = findMatchingEndpoint(ep, freshService.endpoints);
      if (!match) {
        endpointsToDelete.push({ endpointId: ep.id, endpointName: ep.name });
      }
    }

    // Endpoints to create or update
    for (const fep of freshService.endpoints) {
      const match = folderEndpoints.find((ep) => {
        if (ep.name === fep.name) return true;
        const curMethod = ep.config?.method?.toUpperCase();
        const curUrl = ep.config?.url;
        return curMethod === fep.method.toUpperCase() && curUrl === fep.fullUrl;
      });

      if (!match) {
        endpointsToCreate.push({
          folderId: sf.id,
          serviceName: sf.name,
          endpoint: fep,
        });
      } else {
        // Reconcile config
        let curPayload: any = {};
        if (match.config?.body) {
          try {
            curPayload = JSON.parse(match.config.body);
          } catch {
            curPayload = match.config.body;
          }
        }

        let freshPayload: any = {};
        if (fep.body) {
          try {
            freshPayload = JSON.parse(fep.body);
          } catch {
            freshPayload = fep.body;
          }
        }

        const { updatedPayload, changed } = reconcileHttpPayload(curPayload, freshPayload);

        const nameChanged = match.name !== fep.name;
        const urlChanged = match.config?.url !== fep.fullUrl;
        const methodChanged = match.config?.method?.toUpperCase() !== fep.method.toUpperCase();
        const summaryChanged = fep.summary !== undefined && match.config?.summary !== fep.summary;

        if (changed || urlChanged || methodChanged || summaryChanged || nameChanged) {
          endpointsToUpdate.push({
            endpoint: match,
            newName: nameChanged ? fep.name : undefined,
            newConfig: {
              ...match.config,
              url: fep.fullUrl,
              method: fep.method,
              summary: fep.summary ?? match.config?.summary,
              specification: fep.specification ?? match.config?.specification,
              query_params: fep.queryParams,
              path_variables: fep.pathVariables,
              headers: fep.headers,
              header_descriptions: fep.headerDescriptions,
              body_type: fep.bodyType,
              body:
                typeof updatedPayload === 'object' && updatedPayload !== null
                  ? JSON.stringify(updatedPayload, null, 2)
                  : String(updatedPayload || ''),
            },
          });
        }
      }
    }
  }

  return {
    servicesToDelete,
    servicesToCreate,
    endpointsToCreate,
    endpointsToDelete,
    endpointsToUpdate,
  };
}

export interface SyncApiCaller {
  post: (path: string, body: any) => Promise<any>;
  patch: (path: string, body: any) => Promise<any>;
  delete: (path: string) => Promise<any>;
}

/**
 * Executes the planned Swagger sync actions against the workspace API.
 */
export async function executeSwaggerSync(
  collectionId: string,
  rootFolderId: string,
  plan: SwaggerSyncPlan,
  api: SyncApiCaller
): Promise<{
  deletedEndpointsCount: number;
  deletedServicesCount: number;
  createdServicesCount: number;
  createdEndpointsCount: number;
  updatedEndpointsCount: number;
}> {
  let deletedEndpointsCount = 0;
  let deletedServicesCount = 0;
  let createdServicesCount = 0;
  let createdEndpointsCount = 0;
  let updatedEndpointsCount = 0;

  // 1. Delete endpoints
  for (const d of plan.endpointsToDelete) {
    try {
      await api.delete(`/endpoints/${d.endpointId}`);
      deletedEndpointsCount++;
    } catch {
      // ignore
    }
  }

  // 2. Delete service folders
  for (const s of plan.servicesToDelete) {
    try {
      await api.delete(`/folders/${s.folderId}`);
      deletedServicesCount++;
    } catch {
      // ignore
    }
  }

  // 3. Create new service folders and their endpoints
  for (const s of plan.servicesToCreate) {
    try {
      const createdFolder = await api.post(`/collections/${collectionId}/folders`, {
        name: s.name,
        parent_folder_id: rootFolderId,
      });
      createdServicesCount++;

      for (const ep of s.endpoints) {
        await api.post(`/collections/${collectionId}/endpoints`, {
          name: ep.name,
          protocol: 'http',
          folder_id: createdFolder.id,
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
          },
        });
        createdEndpointsCount++;
      }
    } catch {
      // ignore
    }
  }

  // 4. Create new endpoints in existing folders
  for (const c of plan.endpointsToCreate) {
    try {
      await api.post(`/collections/${collectionId}/endpoints`, {
        name: c.endpoint.name,
        protocol: 'http',
        folder_id: c.folderId,
        config: {
          method: c.endpoint.method,
          url: c.endpoint.fullUrl,
          summary: c.endpoint.summary,
          query_params: c.endpoint.queryParams,
          path_variables: c.endpoint.pathVariables,
          headers: c.endpoint.headers,
          header_descriptions: c.endpoint.headerDescriptions,
          body_type: c.endpoint.bodyType,
          body: c.endpoint.body,
        },
      });
      createdEndpointsCount++;
    } catch {
      // ignore
    }
  }

  // 5. Update existing endpoints
  for (const u of plan.endpointsToUpdate) {
    try {
      const patchBody: Record<string, any> = {
        config: u.newConfig,
      };
      if (u.newName) {
        patchBody.name = u.newName;
      }
      await api.patch(`/endpoints/${u.endpoint.id}`, patchBody);
      updatedEndpointsCount++;
    } catch {
      // ignore
    }
  }

  return {
    deletedEndpointsCount,
    deletedServicesCount,
    createdServicesCount,
    createdEndpointsCount,
    updatedEndpointsCount,
  };
}
