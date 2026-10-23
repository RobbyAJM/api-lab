import type {
  CollectionFolder,
  Endpoint,
  GrpcServiceSummary,
} from '@api-lab/api-types';
import { getDescendantFolderIds } from './folderTree.ts';
import { splitServiceName } from './grpcReflectionGenerator.ts';

/**
 * Resolves the dot-separated path of a folder relative to rootFolderId.
 * Traverses parent_folder_id until reaching rootFolderId.
 * E.g. root (NuTrade) -> nutrade -> Client -> ClientAccountAPI
 * Returns: "nutrade.Client.ClientAccountAPI"
 */
export function getFolderDotPath(
  folderId: string,
  rootFolderId: string,
  foldersById: Map<string, CollectionFolder>
): string {
  const parts: string[] = [];
  let curr = foldersById.get(folderId);
  while (curr && curr.id !== rootFolderId) {
    parts.unshift(curr.name);
    if (!curr.parent_folder_id) break;
    curr = foldersById.get(curr.parent_folder_id);
  }
  return parts.join('.');
}

/**
 * Finds the folder representing a specific gRPC service within a root folder's hierarchy.
 * Matches case-sensitively by folder dot-path or by endpoint config service.
 */
export function findServiceFolder(
  serviceName: string,
  rootFolderId: string,
  folders: CollectionFolder[],
  endpoints: Endpoint[]
): CollectionFolder | undefined {
  const foldersById = new Map<string, CollectionFolder>(folders.map((f) => [f.id, f]));
  const descendantIds = getDescendantFolderIds(folders, rootFolderId);
  descendantIds.delete(rootFolderId);

  // 1. Direct dot-path match
  for (const fid of descendantIds) {
    const f = foldersById.get(fid);
    if (!f) continue;
    if (getFolderDotPath(f.id, rootFolderId, foldersById) === serviceName) {
      return f;
    }
  }

  // 2. Endpoint config match fallback
  for (const ep of endpoints) {
    if (ep.folder_id && descendantIds.has(ep.folder_id) && ep.config?.service === serviceName) {
      return foldersById.get(ep.folder_id);
    }
  }

  return undefined;
}

/**
 * Reconciles an existing payload with a fresh sample payload derived from reflection:
 * 1. Retains existing values for fields that still exist in fresh schema.
 * 2. Removes fields that no longer exist in the fresh schema.
 * 3. Appends new fields from the fresh schema with generated matching values.
 */
export function reconcilePayload(
  existingPayload: any,
  freshSamplePayload: any
): { updatedPayload: any; changed: boolean } {
  // If either is not an object or is an array, compare directly
  if (
    typeof existingPayload !== 'object' ||
    existingPayload === null ||
    typeof freshSamplePayload !== 'object' ||
    freshSamplePayload === null ||
    Array.isArray(existingPayload) ||
    Array.isArray(freshSamplePayload)
  ) {
    return {
      updatedPayload: freshSamplePayload,
      changed: JSON.stringify(existingPayload) !== JSON.stringify(freshSamplePayload),
    };
  }

  const updated: Record<string, any> = {};
  let changed = false;

  const freshKeys = Object.keys(freshSamplePayload);
  const existingKeys = Object.keys(existingPayload);

  // Check removed keys
  for (const ek of existingKeys) {
    if (!freshKeys.includes(ek)) {
      changed = true; // Field was removed in updated method
    }
  }

  // Populate fields from fresh schema
  for (const key of freshKeys) {
    if (Object.prototype.hasOwnProperty.call(existingPayload, key)) {
      // Key exists in both: recursively reconcile if object
      const oldVal = existingPayload[key];
      const freshVal = freshSamplePayload[key];

      if (
        typeof oldVal === 'object' &&
        oldVal !== null &&
        typeof freshVal === 'object' &&
        freshVal !== null &&
        !Array.isArray(oldVal) &&
        !Array.isArray(freshVal)
      ) {
        const nested = reconcilePayload(oldVal, freshVal);
        updated[key] = nested.updatedPayload;
        if (nested.changed) changed = true;
      } else {
        // Keep existing value
        updated[key] = oldVal;
      }
    } else {
      // Key is new in schema: append new field with generated random value
      updated[key] = freshSamplePayload[key];
      changed = true;
    }
  }

  return {
    updatedPayload: updated,
    changed,
  };
}

export interface SyncPlan {
  servicesToDelete: { folderId: string; serviceName: string }[];
  servicesToCreate: GrpcServiceSummary[];
  methodsToCreate: {
    folderId: string;
    serviceName: string;
    methodName: string;
    streamType: string;
  }[];
  methodsToDelete: { endpointId: string; methodName: string }[];
  methodsToUpdate: {
    endpoint: Endpoint;
    newPayload: any;
    newStreamType: string;
    newServerAddress?: string;
  }[];
}

/**
 * Plans the reflection reconciliation between existing local folders/endpoints
 * and the freshly queried gRPC reflection services.
 * Handles nested folder hierarchies matching dot-separated service names case-sensitively.
 */
export function planReflectionSync(
  rootFolderId: string,
  existingFolders: CollectionFolder[],
  existingEndpoints: Endpoint[],
  freshServices: GrpcServiceSummary[],
  freshPayloads: Record<string, any> = {}, // key format: "{service}/{method}"
  targetServerAddress?: string
): SyncPlan {
  const foldersById = new Map<string, CollectionFolder>(existingFolders.map((f) => [f.id, f]));
  const descendantIds = getDescendantFolderIds(existingFolders, rootFolderId);
  descendantIds.delete(rootFolderId);

  const descendantFolders = existingFolders.filter((f) => descendantIds.has(f.id));

  // Determine which descendant folders have child folders
  const parentFolderIds = new Set<string>();
  for (const f of descendantFolders) {
    if (f.parent_folder_id) {
      parentFolderIds.add(f.parent_folder_id);
    }
  }

  const freshServiceMap = new Map<string, GrpcServiceSummary>();
  for (const s of freshServices) {
    freshServiceMap.set(s.name, s);
  }

  // Map each service to its existing folder if found
  const serviceFolderMap = new Map<string, CollectionFolder>();
  const recognizedFolderIds = new Set<string>();

  for (const s of freshServices) {
    const foundFolder = findServiceFolder(s.name, rootFolderId, existingFolders, existingEndpoints);
    if (foundFolder) {
      serviceFolderMap.set(s.name, foundFolder);
      recognizedFolderIds.add(foundFolder.id);
    }
  }

  const servicesToDelete: { folderId: string; serviceName: string }[] = [];
  const servicesToCreate: GrpcServiceSummary[] = [];
  const methodsToCreate: SyncPlan['methodsToCreate'] = [];
  const methodsToDelete: SyncPlan['methodsToDelete'] = [];
  const methodsToUpdate: SyncPlan['methodsToUpdate'] = [];

  // 1. Detect deleted services:
  // Folders under root that represent a service (either hold endpoints or are leaf folders),
  // but are not in freshServiceMap.
  const inspectedFolderIds = new Set<string>();

  for (const sf of descendantFolders) {
    if (recognizedFolderIds.has(sf.id)) continue;
    if (inspectedFolderIds.has(sf.id)) continue;

    const folderEndpoints = existingEndpoints.filter((e) => e.folder_id === sf.id);
    const dotPath = getFolderDotPath(sf.id, rootFolderId, foldersById);
    const epService = folderEndpoints.find((e) => e.config?.service)?.config?.service;
    const inferredServiceName = epService || dotPath;

    const isLeaf = !parentFolderIds.has(sf.id);
    const isServiceFolder = folderEndpoints.length > 0 || isLeaf;

    if (isServiceFolder && inferredServiceName && !freshServiceMap.has(inferredServiceName)) {
      servicesToDelete.push({ folderId: sf.id, serviceName: inferredServiceName });
      inspectedFolderIds.add(sf.id);
    }
  }

  // 2. Detect new services
  for (const fs of freshServices) {
    if (!serviceFolderMap.has(fs.name)) {
      servicesToCreate.push(fs);
    }
  }

  // 3. For existing services: reconcile methods and payloads
  for (const [serviceName, sf] of serviceFolderMap.entries()) {
    const freshService = freshServiceMap.get(serviceName);
    if (!freshService) continue;

    const folderEndpoints = existingEndpoints.filter((e) => e.folder_id === sf.id);
    const existingEpMap = new Map<string, Endpoint>();
    for (const ep of folderEndpoints) {
      existingEpMap.set(ep.name, ep);
    }

    const freshMethodMap = new Map<string, any>();
    for (const m of freshService.methods) {
      freshMethodMap.set(m.name, m);
    }

    // Methods to delete
    for (const ep of folderEndpoints) {
      if (!freshMethodMap.has(ep.name)) {
        methodsToDelete.push({ endpointId: ep.id, methodName: ep.name });
      }
    }

    // Methods to create or update
    for (const fm of freshService.methods) {
      const existingEp = existingEpMap.get(fm.name);
      const streamType = fm.stream_type || 'unary';
      const freshPayload = freshPayloads[`${serviceName}/${fm.name}`] || {};

      if (!existingEp) {
        methodsToCreate.push({
          folderId: sf.id,
          serviceName: serviceName,
          methodName: fm.name,
          streamType,
        });
      } else {
        // Method exists: reconcile payload
        const currentPayload = existingEp.config?.payload || {};
        const { updatedPayload, changed } = reconcilePayload(
          currentPayload,
          freshPayload
        );
        const currentStreamType = existingEp.config?.stream_type || 'unary';
        const cleanTargetAddr = targetServerAddress && targetServerAddress.trim() ? targetServerAddress.trim() : undefined;
        const addressChanged = Boolean(
          cleanTargetAddr &&
          existingEp.config?.server_address !== cleanTargetAddr
        );

        if (changed || currentStreamType !== streamType || addressChanged) {
          methodsToUpdate.push({
            endpoint: existingEp,
            newPayload: updatedPayload,
            newStreamType: streamType,
            newServerAddress: cleanTargetAddr,
          });
        }
      }
    }
  }

  return {
    servicesToDelete,
    servicesToCreate,
    methodsToCreate,
    methodsToDelete,
    methodsToUpdate,
  };
}

export interface SyncApiCaller {
  post: (path: string, body: any) => Promise<any>;
  patch: (path: string, body: any) => Promise<any>;
  delete: (path: string) => Promise<any>;
}

export interface SyncExecutionResult {
  servicesDeleted: number;
  servicesCreated: number;
  methodsDeleted: number;
  methodsCreated: number;
  methodsUpdated: number;
}

/**
 * Ensures that the nested folder hierarchy for segments exists under rootFolderId.
 * Reuses existing folders where names match case-sensitively.
 * Returns the ID of the leaf folder.
 */
export async function ensureFolderPath(
  collectionId: string,
  rootFolderId: string,
  segments: string[],
  foldersList: CollectionFolder[],
  api: SyncApiCaller
): Promise<string> {
  let currentParentId = rootFolderId;

  for (const seg of segments) {
    let match = foldersList.find(
      (f) => f.parent_folder_id === currentParentId && f.name === seg
    );

    if (match) {
      currentParentId = match.id;
    } else {
      const created = await api.post(`/collections/${collectionId}/folders`, {
        name: seg,
        parent_folder_id: currentParentId,
      });
      const newFolder: CollectionFolder = {
        id: created.id,
        collection_id: collectionId,
        parent_folder_id: currentParentId,
        name: seg,
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      foldersList.push(newFolder);
      currentParentId = newFolder.id;
    }
  }

  return currentParentId;
}

/**
 * Executes the planned reflection sync actions against the workspace API.
 * Preserves nested folder structure for new services and prunes empty intermediate folders.
 */
export async function executeReflectionSync(
  collectionId: string,
  rootFolderId: string,
  serverAddress: string,
  plan: SyncPlan,
  freshPayloads: Record<string, any>,
  api: SyncApiCaller,
  existingFolders: CollectionFolder[] = []
): Promise<SyncExecutionResult> {
  let servicesDeleted = 0;
  let servicesCreated = 0;
  let methodsDeleted = 0;
  let methodsCreated = 0;
  let methodsUpdated = 0;

  const localFolders = [...existingFolders];

  // 1. Delete removed services (cascades to their endpoints)
  const deletedFolderIds = new Set<string>();
  for (const s of plan.servicesToDelete) {
    await api.delete(`/folders/${s.folderId}`);
    deletedFolderIds.add(s.folderId);
    servicesDeleted++;

    // Prune empty intermediate ancestor folders up to rootFolderId
    let curr = localFolders.find((f) => f.id === s.folderId);
    while (curr && curr.parent_folder_id && curr.parent_folder_id !== rootFolderId) {
      const parentId = curr.parent_folder_id;
      const hasOtherChildren = localFolders.some(
        (f) => f.parent_folder_id === parentId && !deletedFolderIds.has(f.id)
      );
      if (!hasOtherChildren) {
        await api.delete(`/folders/${parentId}`);
        deletedFolderIds.add(parentId);
        curr = localFolders.find((f) => f.id === parentId);
      } else {
        break;
      }
    }
  }

  // 2. Delete removed methods in existing services
  for (const m of plan.methodsToDelete) {
    await api.delete(`/endpoints/${m.endpointId}`);
    methodsDeleted++;
  }

  // 3. Create new services and their methods
  for (const s of plan.servicesToCreate) {
    const segments = splitServiceName(s.name);
    const leafFolderId = await ensureFolderPath(
      collectionId,
      rootFolderId,
      segments,
      localFolders,
      api
    );
    servicesCreated++;

    for (const m of s.methods) {
      const payload = freshPayloads[`${s.name}/${m.name}`] || {};
      await api.post(`/collections/${collectionId}/endpoints`, {
        name: m.name,
        protocol: 'grpc',
        folder_id: leafFolderId,
        config: {
          server_address: serverAddress,
          service: s.name,
          method: m.name,
          stream_type: m.stream_type || 'unary',
          metadata: {},
          payload,
          auth: { auth_type: 'inherit' },
        },
      });
      methodsCreated++;
    }
  }

  // 4. Create new methods in existing services
  for (const m of plan.methodsToCreate) {
    const payload = freshPayloads[`${m.serviceName}/${m.methodName}`] || {};
    await api.post(`/collections/${collectionId}/endpoints`, {
      name: m.methodName,
      protocol: 'grpc',
      folder_id: m.folderId,
      config: {
        server_address: serverAddress,
        service: m.serviceName,
        method: m.methodName,
        stream_type: m.streamType || 'unary',
        metadata: {},
        payload,
        auth: { auth_type: 'inherit' },
      },
    });
    methodsCreated++;
  }

  // 5. Update changed method payloads & stream types & server_address
  for (const u of plan.methodsToUpdate) {
    const updatedConfig: Record<string, any> = {
      ...u.endpoint.config,
      stream_type: u.newStreamType,
      payload: u.newPayload,
    };
    const effectiveAddr = u.newServerAddress || (serverAddress && serverAddress.trim() ? serverAddress.trim() : undefined);
    if (effectiveAddr) {
      updatedConfig.server_address = effectiveAddr;
    }
    await api.patch(`/endpoints/${u.endpoint.id}`, {
      version: u.endpoint.version,
      config: updatedConfig,
    });
    methodsUpdated++;
  }

  return {
    servicesDeleted,
    servicesCreated,
    methodsDeleted,
    methodsCreated,
    methodsUpdated,
  };
}
