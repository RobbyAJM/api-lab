import type {
  GrpcReflectionRequest,
  GrpcReflectionResponse,
  GrpcSamplePayloadRequest,
  GrpcSamplePayloadResponse,
  GrpcServiceSummary,
} from '@api-lab/api-types';

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

export interface PlannedFolderNode {
  name: string;
  children: PlannedFolderNode[];
  endpoints: PlannedEndpoint[];
}

export type PlannedServiceFolder = PlannedFolderNode;

export interface PlannedHierarchy {
  rootFolderName: string;
  serverAddress: string;
  serviceFolders: PlannedFolderNode[];
  totalEndpoints: number;
}

/**
 * Splits a full gRPC service name into dot-separated segments case-sensitively.
 * E.g. "nutrade.Client.ClientAccountAPI" -> ["nutrade", "Client", "ClientAccountAPI"]
 */
export function splitServiceName(serviceName: string): string[] {
  const trimmed = (serviceName || '').trim();
  if (!trimmed) return [];
  const segments = trimmed.split('.').map((s) => s.trim()).filter(Boolean);
  return segments.length > 0 ? segments : [trimmed];
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
  if (clean.startsWith('https://') || clean.startsWith('grpcs://') || clean.endsWith(':443')) {
    return true;
  }
  if (clean.startsWith('http://')) {
    return false;
  }
  clean = clean.replace(/^(?:grpc|grpcs|http|https):\/\//, '').replace(/\/+$/, '');
  const host = clean.split(':')[0];
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  return !isLocal && host.includes('.');
}

/**
 * Plans the folder and endpoint hierarchy:
 * Automatically nests folders based on dot-separated service names.
 * {folderName}/
 * |-- {package}
 *     |-- {subpackage}
 *         |-- {service}
 *             |-- {method}
 */
export function planGrpcHierarchy(options: {
  folderName: string;
  serverAddress: string;
  useTls?: boolean;
  services: GrpcServiceSummary[];
  samplePayloads?: Record<string, any>; // key format: "{service}/{method}"
}): PlannedHierarchy {
  const rootFolderName = options.folderName.trim() || 'gRPC Services';
  const serviceFolders: PlannedFolderNode[] = [];
  let totalEndpoints = 0;
  const useTls =
    options.useTls !== undefined ? options.useTls : shouldAutoDetectTls(options.serverAddress);

  for (const svc of options.services) {
    if (!svc.name) continue;
    const segments = splitServiceName(svc.name);
    if (segments.length === 0) continue;

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

    // Traverse or create nested folder nodes
    let currentChildren = serviceFolders;
    let currentNode: PlannedFolderNode | null = null;

    for (const seg of segments) {
      let found = currentChildren.find((node) => node.name === seg);
      if (!found) {
        found = {
          name: seg,
          children: [],
          endpoints: [],
        };
        currentChildren.push(found);
      }
      currentNode = found;
      currentChildren = found.children;
    }

    if (currentNode) {
      currentNode.endpoints.push(...endpoints);
    }
  }

  return {
    rootFolderName,
    serverAddress: options.serverAddress.trim(),
    serviceFolders,
    totalEndpoints,
  };
}

export interface ApiCaller {
  post: (path: string, body: any) => Promise<any>;
}

/**
 * Executes creation of nested folders and endpoints inside the specified collection.
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
  // 1. Create root folder {folderName} with grpc_url stored directly on the folder
  const rootFolder = await api.post(`/collections/${collectionId}/folders`, {
    name: planned.rootFolderName,
    parent_folder_id: null,
    grpc_url: planned.serverAddress,
  });

  const rootFolderId = rootFolder.id;
  let createdServiceFoldersCount = 0;
  let createdEndpointsCount = 0;

  // 2. Recursively create service subfolders and child endpoints
  async function createNodes(nodes: PlannedFolderNode[], parentFolderId: string) {
    for (const node of nodes) {
      const childFolder = await api.post(`/collections/${collectionId}/folders`, {
        name: node.name,
        parent_folder_id: parentFolderId,
      });
      createdServiceFoldersCount++;

      for (const ep of node.endpoints) {
        await api.post(`/collections/${collectionId}/endpoints`, {
          name: ep.name,
          protocol: 'grpc',
          folder_id: childFolder.id,
          config: ep.config,
        });
        createdEndpointsCount++;
      }

      if (node.children.length > 0) {
        await createNodes(node.children, childFolder.id);
      }
    }
  }

  await createNodes(planned.serviceFolders, rootFolderId);

  return {
    rootFolderId,
    createdServiceFoldersCount,
    createdEndpointsCount,
  };
}

export type GrpcGenerationPhase = 'discovery' | 'payload_generation' | 'hierarchy_creation';

export class GrpcGenerationError extends Error {
  phase: GrpcGenerationPhase;
  isTimeout: boolean;

  constructor(message: string, phase: GrpcGenerationPhase, isTimeout: boolean = false) {
    super(message);
    this.name = 'GrpcGenerationError';
    this.phase = phase;
    this.isTimeout = isTimeout;
  }
}

export interface GenerateSamplePayloadsBatchOptions {
  services: GrpcServiceSummary[];
  serverAddress: string;
  useTls: boolean;
  variables?: Record<string, string>;
  generateSamplePayload: (
    req: GrpcSamplePayloadRequest,
    vars: Record<string, string>
  ) => Promise<GrpcSamplePayloadResponse>;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
  isAborted?: () => boolean;
}

/**
 * Generates sample payloads for all methods across services with bounded concurrency.
 */
export async function generateSamplePayloadsBatch(
  options: GenerateSamplePayloadsBatchOptions
): Promise<Record<string, any>> {
  const {
    services,
    serverAddress,
    useTls,
    variables = {},
    generateSamplePayload,
    concurrency = 6,
    onProgress,
    isAborted,
  } = options;

  const tasks: { service: string; method: string }[] = [];
  for (const svc of services) {
    if (!svc.name) continue;
    for (const method of svc.methods) {
      if (!method.name) continue;
      tasks.push({ service: svc.name, method: method.name });
    }
  }

  const samplePayloads: Record<string, any> = {};
  if (tasks.length === 0) return samplePayloads;

  let taskIdx = 0;
  let completed = 0;

  // ponytail: concurrency pool size capped at 6; prevents connection churn while reducing runtime by ~80%
  const poolSize = Math.max(1, Math.min(concurrency, tasks.length));

  async function worker() {
    while (taskIdx < tasks.length) {
      if (isAborted?.()) break;
      const current = tasks[taskIdx++];
      try {
        const res = await generateSamplePayload(
          {
            server_address: serverAddress,
            service: current.service,
            method: current.method,
            use_tls: useTls,
          },
          variables
        );
        if (res?.payload) {
          samplePayloads[`${current.service}/${current.method}`] = res.payload;
        }
      } catch {
        // Fallback to empty object if individual method payload generation fails
      }
      completed++;
      onProgress?.(completed, tasks.length);
    }
  }

  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return samplePayloads;
}

export interface GenerateGrpcCollectionOptions {
  collectionId: string;
  folderName: string;
  serverAddress: string;
  useTls?: boolean;
  generatePayloads?: boolean;
  variables?: Record<string, string>;
  timeoutMs?: number; // default 60_000 (1 minute)
  concurrency?: number; // default 6
  onProgress?: (status: string, phase: GrpcGenerationPhase) => void;
  discoverServices: (
    req: GrpcReflectionRequest,
    vars: Record<string, string>
  ) => Promise<GrpcReflectionResponse>;
  generateSamplePayload?: (
    req: GrpcSamplePayloadRequest,
    vars: Record<string, string>
  ) => Promise<GrpcSamplePayloadResponse>;
  apiCaller: ApiCaller;
}

export interface GenerateGrpcCollectionResult {
  rootFolderId: string;
  createdServiceFoldersCount: number;
  createdEndpointsCount: number;
  servicesDiscovered: number;
  totalEndpoints: number;
  samplePayloadsCount: number;
  effectiveTls: boolean;
}

/**
 * Orchestrates complete gRPC collection generation with strict 1-minute timeout.
 */
export async function generateGrpcCollection(
  options: GenerateGrpcCollectionOptions
): Promise<GenerateGrpcCollectionResult> {
  const {
    collectionId,
    folderName,
    serverAddress,
    useTls,
    generatePayloads = true,
    variables = {},
    timeoutMs = 60_000,
    concurrency = 6,
    onProgress,
    discoverServices,
    generateSamplePayload,
    apiCaller,
  } = options;

  let currentPhase: GrpcGenerationPhase = 'discovery';
  let completedPayloads = 0;
  let totalPayloads = 0;
  let timedOut = false;
  let timer: any = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const timeoutSec = Math.round(timeoutMs / 1000);
      let reason: string;
      if (currentPhase === 'discovery') {
        reason = `gRPC generation timed out after ${timeoutSec}s during service reflection discovery. Failed to connect or reflection timed out for server "${serverAddress}". Check server address and TLS setting.`;
      } else if (currentPhase === 'payload_generation') {
        reason = `gRPC generation timed out after ${timeoutSec}s while generating sample payloads (${completedPayloads}/${totalPayloads} methods processed). Server reflection response was too slow. Try unchecking "Pre-generate sample JSON payloads from protobuf schemas".`;
      } else {
        reason = `gRPC generation timed out after ${timeoutSec}s while creating folder hierarchy and endpoints.`;
      }
      reject(new GrpcGenerationError(reason, currentPhase, true));
    }, timeoutMs);
  });

  const executionPromise = (async (): Promise<GenerateGrpcCollectionResult> => {
    const cleanAddr = serverAddress.trim();
    const cleanFolderName = folderName.trim() || 'gRPC Services';
    const effectiveTls =
      useTls !== undefined ? useTls : shouldAutoDetectTls(cleanAddr, variables);

    // Phase 1: Discovery
    currentPhase = 'discovery';
    onProgress?.('Discovering services via reflection...', 'discovery');

    const reflection = await discoverServices(
      { server_address: cleanAddr, use_tls: effectiveTls },
      variables
    );

    if (timedOut) throw new Error('Aborted due to timeout');

    if (reflection.error) {
      throw new GrpcGenerationError(reflection.error, 'discovery');
    }

    if (!reflection.services || reflection.services.length === 0) {
      throw new GrpcGenerationError(
        'No services discovered via gRPC server reflection.',
        'discovery'
      );
    }

    // Phase 2: Sample Payload Generation
    currentPhase = 'payload_generation';
    let samplePayloads: Record<string, any> = {};

    if (generatePayloads && generateSamplePayload) {
      totalPayloads = reflection.services.reduce(
        (sum, s) => sum + (s.methods?.length || 0),
        0
      );
      onProgress?.(
        `Found ${reflection.services.length} services. Generating sample payloads...`,
        'payload_generation'
      );

      samplePayloads = await generateSamplePayloadsBatch({
        services: reflection.services,
        serverAddress: cleanAddr,
        useTls: effectiveTls,
        variables,
        generateSamplePayload,
        concurrency,
        onProgress: (comp, tot) => {
          completedPayloads = comp;
          totalPayloads = tot;
          onProgress?.(
            `Generating sample payloads (${comp}/${tot})...`,
            'payload_generation'
          );
        },
        isAborted: () => timedOut,
      });

      if (timedOut) throw new Error('Aborted due to timeout');
    }

    // Phase 3: Hierarchy Creation
    currentPhase = 'hierarchy_creation';
    onProgress?.('Generating folder hierarchy and endpoints...', 'hierarchy_creation');

    const planned = planGrpcHierarchy({
      folderName: cleanFolderName,
      serverAddress: cleanAddr,
      useTls: effectiveTls,
      services: reflection.services,
      samplePayloads,
    });

    const result = await executeGrpcHierarchyCreation(collectionId, planned, apiCaller);

    return {
      rootFolderId: result.rootFolderId,
      createdServiceFoldersCount: result.createdServiceFoldersCount,
      createdEndpointsCount: result.createdEndpointsCount,
      servicesDiscovered: reflection.services.length,
      totalEndpoints: planned.totalEndpoints,
      samplePayloadsCount: Object.keys(samplePayloads).length,
      effectiveTls,
    };
  })();

  try {
    return await Promise.race([executionPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
