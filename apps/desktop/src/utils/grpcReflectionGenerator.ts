import type { GrpcServiceSummary } from '@api-lab/api-types';

export interface PlannedEndpoint {
  name: string;
  protocol: 'grpc';
  service: string;
  method: string;
  config: {
    server_address: string;
    use_tls?: boolean;
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
 * Auto-detects whether an address should default to TLS.
 * Defaults to true for remote domain names (e.g. nu-trade.dev.dxtr.asia), https, and :443.
 */
export function shouldAutoDetectTls(addr: string, variables?: Record<string, string>): boolean {
  let clean = (addr || '').trim().toLowerCase();
  if (variables) {
    clean = clean.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, key) => {
      const val = variables[key] ?? variables[key.toLowerCase()] ?? variables[key.toUpperCase()];
      return (val || '').trim().toLowerCase();
    });
  }
  if (clean.startsWith('https://') || clean.endsWith(':443')) {
    return true;
  }
  if (clean.startsWith('http://')) {
    return false;
  }
  const host = clean.split(':')[0];
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  return !isLocal && host.includes('.');
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
  useTls?: boolean;
  services: GrpcServiceSummary[];
  samplePayloads?: Record<string, any>; // key format: "{service}/{method}"
}): PlannedHierarchy {
  const rootFolderName = options.folderName.trim() || 'gRPC Services';
  const serviceFolders: PlannedServiceFolder[] = [];
  let totalEndpoints = 0;
  const useTls =
    options.useTls !== undefined ? options.useTls : shouldAutoDetectTls(options.serverAddress);

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
          use_tls: useTls,
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
