import type {
  CollectionFolder,
  Endpoint,
  GrpcServiceSummary,
} from '@api-lab/api-types';

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
  }[];
}

/**
 * Plans the reflection reconciliation between existing local folders/endpoints
 * and the freshly queried gRPC reflection services.
 */
export function planReflectionSync(
  rootFolderId: string,
  existingFolders: CollectionFolder[],
  existingEndpoints: Endpoint[],
  freshServices: GrpcServiceSummary[],
  freshPayloads: Record<string, any> // key format: "{service}/{method}"
): SyncPlan {
  const serviceFolders = existingFolders.filter(
    (f) => f.parent_folder_id === rootFolderId
  );

  const freshServiceMap = new Map<string, GrpcServiceSummary>();
  for (const s of freshServices) {
    freshServiceMap.set(s.name, s);
  }

  const existingFolderMap = new Map<string, CollectionFolder>();
  for (const sf of serviceFolders) {
    existingFolderMap.set(sf.name, sf);
  }

  const servicesToDelete: { folderId: string; serviceName: string }[] = [];
  const servicesToCreate: GrpcServiceSummary[] = [];
  const methodsToCreate: SyncPlan['methodsToCreate'] = [];
  const methodsToDelete: SyncPlan['methodsToDelete'] = [];
  const methodsToUpdate: SyncPlan['methodsToUpdate'] = [];

  // 1. Detect deleted services
  for (const sf of serviceFolders) {
    if (!freshServiceMap.has(sf.name)) {
      servicesToDelete.push({ folderId: sf.id, serviceName: sf.name });
    }
  }

  // 2. Detect new services
  for (const fs of freshServices) {
    if (!existingFolderMap.has(fs.name)) {
      servicesToCreate.push(fs);
    }
  }

  // 3. For existing services: reconcile methods and payloads
  for (const sf of serviceFolders) {
    const freshService = freshServiceMap.get(sf.name);
    if (!freshService) continue; // Will be deleted

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
      const freshPayload = freshPayloads[`${sf.name}/${fm.name}`] || {};

      if (!existingEp) {
        methodsToCreate.push({
          folderId: sf.id,
          serviceName: sf.name,
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

        if (changed || currentStreamType !== streamType) {
          methodsToUpdate.push({
            endpoint: existingEp,
            newPayload: updatedPayload,
            newStreamType: streamType,
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
 * Executes the planned reflection sync actions against the workspace API.
 */
export async function executeReflectionSync(
  collectionId: string,
  rootFolderId: string,
  serverAddress: string,
  plan: SyncPlan,
  freshPayloads: Record<string, any>,
  api: SyncApiCaller
): Promise<SyncExecutionResult> {
  let servicesDeleted = 0;
  let servicesCreated = 0;
  let methodsDeleted = 0;
  let methodsCreated = 0;
  let methodsUpdated = 0;

  // 1. Delete removed services (cascades to their endpoints)
  for (const s of plan.servicesToDelete) {
    await api.delete(`/folders/${s.folderId}`);
    servicesDeleted++;
  }

  // 2. Delete removed methods in existing services
  for (const m of plan.methodsToDelete) {
    await api.delete(`/endpoints/${m.endpointId}`);
    methodsDeleted++;
  }

  // 3. Create new services and their methods
  for (const s of plan.servicesToCreate) {
    const folderRes = await api.post(`/collections/${collectionId}/folders`, {
      name: s.name,
      parent_folder_id: rootFolderId,
    });
    servicesCreated++;

    for (const m of s.methods) {
      const payload = freshPayloads[`${s.name}/${m.name}`] || {};
      await api.post(`/collections/${collectionId}/endpoints`, {
        name: m.name,
        protocol: 'grpc',
        folder_id: folderRes.id,
        config: {
          server_address: serverAddress,
          service: s.name,
          method: m.name,
          stream_type: m.stream_type || 'unary',
          metadata: {},
          payload,
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
      },
    });
    methodsCreated++;
  }

  // 5. Update changed method payloads & stream types
  for (const u of plan.methodsToUpdate) {
    await api.patch(`/endpoints/${u.endpoint.id}`, {
      version: u.endpoint.version,
      config: {
        ...u.endpoint.config,
        stream_type: u.newStreamType,
        payload: u.newPayload,
      },
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
