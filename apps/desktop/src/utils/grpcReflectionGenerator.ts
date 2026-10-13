import type { GrpcServiceSummary } from '@api-lab/api-types';

export interface PlannedEndpoint {
  name: string;
  protocol: 'grpc';
  service: string;
  method: string;
  config: {
    server_address: string;
    service: string;
    method: string;
    stream_type?: 'unary' | 'omni_stream' | 'bidi_stream';
    metadata: Record<string, string>;
    payload: any;
  };
}

export interface PlannedServiceFolder {
  name: string;
  endpoints: PlannedEndpoint[];
}

export interface PlannedHierarchy {
  rootFolderName: string;
  serviceFolders: PlannedServiceFolder[];
  totalEndpoints: number;
}

/**
 * Plans the folder and endpoint hierarchy:
 * {folderName}/
 * |-- {service}
 *     |-- {method}
 */
export function planGrpcHierarchy(options: {
  folderName: string;
  serverAddress: string;
  services: GrpcServiceSummary[];
  samplePayloads?: Record<string, any>; // key format: "{service}/{method}"
}): PlannedHierarchy {
  const rootFolderName = options.folderName.trim() || 'gRPC Services';
  const serviceFolders: PlannedServiceFolder[] = [];
  let totalEndpoints = 0;

  for (const svc of options.services) {
    if (!svc.name) continue;
    const endpoints: PlannedEndpoint[] = [];

    for (const method of svc.methods) {
      if (!method.name) continue;
      const key = `${svc.name}/${method.name}`;
      const payload = options.samplePayloads?.[key] ?? {};

      endpoints.push({
        name: method.name,
        protocol: 'grpc',
        service: svc.name,
        method: method.name,
        config: {
          server_address: options.serverAddress,
          service: svc.name,
          method: method.name,
          stream_type: method.stream_type || 'unary',
          metadata: {},
          payload,
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
    serviceFolders,
    totalEndpoints,
  };
}

export interface ApiCaller {
  post: (path: string, body: any) => Promise<any>;
}

/**
 * Executes creation of folders and endpoints inside the specified collection.
 */
export async function executeGrpcHierarchyCreation(
  collectionId: string,
  planned: PlannedHierarchy,
  api: ApiCaller
): Promise<{
  rootFolderId: string;
  createdServiceFoldersCount: number;
  createdEndpointsCount: number;
}> {
  // 1. Create root folder {folderName}
  const rootFolder = await api.post(`/collections/${collectionId}/folders`, {
    name: planned.rootFolderName,
    parent_folder_id: null,
  });

  const rootFolderId = rootFolder.id;
  let createdServiceFoldersCount = 0;
  let createdEndpointsCount = 0;

  // 2. Create service subfolders and their endpoints
  for (const sFolder of planned.serviceFolders) {
    const childFolder = await api.post(`/collections/${collectionId}/folders`, {
      name: sFolder.name,
      parent_folder_id: rootFolderId,
    });
    createdServiceFoldersCount++;

    for (const ep of sFolder.endpoints) {
      await api.post(`/collections/${collectionId}/endpoints`, {
        name: ep.name,
        protocol: 'grpc',
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
