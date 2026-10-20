import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../api/client';
import {
  discoverNativeGrpcServices,
  generateNativeGrpcSamplePayload,
} from '../../api/native';
import {
  planReflectionSync,
  executeReflectionSync,
  type SyncPlan,
} from '../../utils/grpcReflectionSync';
import { shouldAutoDetectTls } from '../../utils/grpcReflectionGenerator';
import { resolveRootFolderId } from '../../utils/folderTree';
import { VariableInput } from '../common/VariableInput';
import { Select } from '../common/Select';
import { EnvironmentDropdown } from '../environments/EnvironmentDropdown';
import { useAppStore } from '../../store/useAppStore';
import type { Collection, CollectionFolder, Endpoint, Environment, VariableResponse } from '@api-lab/api-types';
import {
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  MinusCircle,
  FileEdit,
  ArrowRight,
} from 'lucide-react';

interface SyncReflectionModalProps {
  collection: Collection;
  folders: CollectionFolder[];
  endpoints: Endpoint[];
  isOpen: boolean;
  onClose: () => void;
  activeVariables?: Record<string, string>;
  initialFolderId?: string;
}

export const SyncReflectionModal: React.FC<SyncReflectionModalProps> = ({
  collection,
  folders,
  endpoints,
  isOpen,
  onClose,
  activeVariables,
  initialFolderId,
}) => {
  const queryClient = useQueryClient();
  const { activeWorkspaceId, activeEnvironmentId, setActiveEnvironmentId } = useAppStore();

  // Find root folders in this collection
  const rootFolders = useMemo(() => folders.filter((f) => !f.parent_folder_id), [folders]);

  // Query workspace environments to know available environments
  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest<Environment[]>(`/workspaces/${activeWorkspaceId}/environments`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId && isOpen,
  });

  // Effective environment ID: stored, or default, or first
  const effectiveEnvId = useMemo(() => {
    if (activeEnvironmentId) return activeEnvironmentId;
    const def = environments.find((e) => e.is_default) || environments[0];
    return def ? def.id : null;
  }, [activeEnvironmentId, environments]);

  // Query environment variables for the effective environment
  const { data: envVars = [] } = useQuery<VariableResponse[]>({
    queryKey: ['variables', effectiveEnvId],
    queryFn: () =>
      effectiveEnvId
        ? apiRequest<VariableResponse[]>(`/environments/${effectiveEnvId}/variables`)
        : Promise.resolve([]),
    enabled: !!effectiveEnvId && isOpen,
  });

  const effectiveVariables = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of envVars) {
      map[v.key] = v.value;
    }
    if (activeVariables) {
      Object.assign(map, activeVariables);
    }
    return map;
  }, [envVars, activeVariables]);

  // Pick default root folder and resolve server address
  const [selectedRootFolderId, setSelectedRootFolderId] = useState<string>(
    rootFolders[0]?.id || ''
  );
  const [serverAddress, setServerAddress] = useState<string>('localhost:9091');
  const [useTls, setUseTls] = useState<boolean>(false);

  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [freshPayloads, setFreshPayloads] = useState<Record<string, any>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  // Auto-detect or sync selected root folder using ancestor resolver
  useEffect(() => {
    if (!isOpen) return;
    if (initialFolderId) {
      const rootId = resolveRootFolderId(folders, initialFolderId);
      if (rootId) {
        setSelectedRootFolderId(rootId);
        return;
      }
    }
    if (rootFolders.length > 0 && (!selectedRootFolderId || !rootFolders.some((rf) => rf.id === selectedRootFolderId))) {
      setSelectedRootFolderId(rootFolders[0].id);
    }
  }, [isOpen, initialFolderId, folders, rootFolders, selectedRootFolderId]);

  useEffect(() => {
    if (!selectedRootFolderId) return;

    // Check root folder grpc_url first
    const rootFolder = folders.find((f) => f.id === selectedRootFolderId);
    if (rootFolder?.grpc_url) {
      setServerAddress(rootFolder.grpc_url);
      const sources = (collection.settings as any)?.grpc_sources || {};
      if (sources[selectedRootFolderId]?.use_tls !== undefined) {
        setUseTls(Boolean(sources[selectedRootFolderId].use_tls));
      }
      return;
    }

    // Check collection.settings.grpc_sources next
    const sources = (collection.settings as any)?.grpc_sources || {};
    if (sources[selectedRootFolderId]?.server_address) {
      setServerAddress(sources[selectedRootFolderId].server_address);
      setUseTls(Boolean(sources[selectedRootFolderId].use_tls));
      return;
    }

    // Fallback: inspect any gRPC endpoint inside this root folder hierarchy
    const childFolderIds = new Set(
      folders.filter((f) => f.parent_folder_id === selectedRootFolderId).map((f) => f.id)
    );
    childFolderIds.add(selectedRootFolderId);

    const matchEp = endpoints.find(
      (e) => e.folder_id && childFolderIds.has(e.folder_id) && e.config?.server_address
    );

    if (matchEp?.config?.server_address) {
      setServerAddress(matchEp.config.server_address);
      if (matchEp.config.use_tls !== undefined) {
        setUseTls(Boolean(matchEp.config.use_tls));
      }
    }
  }, [selectedRootFolderId, collection.settings, folders, endpoints]);

  if (!isOpen) return null;

  async function handleScanAndCompare() {
    if (!serverAddress.trim() || !selectedRootFolderId) {
      setErrorMessage('Please specify server address and select a root folder');
      return;
    }

    setScanning(true);
    setErrorMessage(null);
    setStatusMessage('Querying fresh gRPC reflection...');
    setPlan(null);

    const effectiveTls = useTls || shouldAutoDetectTls(serverAddress, effectiveVariables);

    try {
      const res = await discoverNativeGrpcServices(
        { server_address: serverAddress.trim(), use_tls: effectiveTls },
        effectiveVariables
      );

      if (res.error) {
        throw new Error(res.error);
      }
      if (!res.services || res.services.length === 0) {
        throw new Error('No services discovered via gRPC server reflection.');
      }

      setStatusMessage(`Found ${res.services.length} services. Generating schema payloads...`);

      // Pre-generate sample payloads for all fresh methods
      const payloads: Record<string, any> = {};
      for (const s of res.services) {
        for (const m of s.methods) {
          try {
            const pRes = await generateNativeGrpcSamplePayload(
              {
                server_address: serverAddress.trim(),
                service: s.name,
                method: m.name,
                use_tls: effectiveTls,
              },
              effectiveVariables
            );
            if (pRes.payload) {
              payloads[`${s.name}/${m.name}`] = pRes.payload;
            }
          } catch {
            // fallback empty object
          }
        }
      }
      setFreshPayloads(payloads);

      setStatusMessage('Comparing schema against workspace folders & endpoints...');

      const calculatedPlan = planReflectionSync(
        selectedRootFolderId,
        folders,
        endpoints,
        res.services,
        payloads
      );

      setPlan(calculatedPlan);
      setStatusMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to scan reflection');
      setStatusMessage(null);
    } finally {
      setScanning(false);
    }
  }

  async function handleApplySync() {
    if (!plan || !selectedRootFolderId) return;

    setSyncing(true);
    setErrorMessage(null);
    setStatusMessage('Applying sync changes to workspace...');

    try {
      const apiCaller = {
        post: (path: string, body: any) =>
          apiRequest(path, { method: 'POST', body: JSON.stringify(body) }),
        patch: (path: string, body: any) =>
          apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) }),
        delete: (path: string) => apiRequest(path, { method: 'DELETE' }),
      };

      const result = await executeReflectionSync(
        collection.id,
        selectedRootFolderId,
        serverAddress.trim(),
        plan,
        freshPayloads,
        apiCaller
      );

      // Save/update root folder gRPC server address in folder and collection.settings
      try {
        await apiRequest(`/folders/${selectedRootFolderId}`, {
          method: 'PATCH',
          body: JSON.stringify({ grpc_url: serverAddress.trim() }),
        });
      } catch {
        // ignore
      }

      const currentSources = (collection.settings as any)?.grpc_sources || {};
      currentSources[selectedRootFolderId] = {
        server_address: serverAddress.trim(),
        use_tls: useTls,
      };

      await apiRequest(`/collections/${collection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          settings: {
            ...collection.settings,
            grpc_sources: currentSources,
          },
        }),
      });

      queryClient.invalidateQueries({ queryKey: ['folders', collection.id] });
      queryClient.invalidateQueries({ queryKey: ['endpoints', collection.id] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });

      setSuccessInfo(
        `Sync completed: +${result.servicesCreated} services, -${result.servicesDeleted} services, +${result.methodsCreated} methods, ~${result.methodsUpdated} updated, -${result.methodsDeleted} removed.`
      );

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to apply reflection sync');
    } finally {
      setSyncing(false);
      setStatusMessage(null);
    }
  }

  const hasChanges =
    plan &&
    (plan.servicesToCreate.length > 0 ||
      plan.servicesToDelete.length > 0 ||
      plan.methodsToCreate.length > 0 ||
      plan.methodsToDelete.length > 0 ||
      plan.methodsToUpdate.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={() => !syncing && onClose()}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-md max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCw size={15} className="text-secondary flex-shrink-0" />
            <h2 className="text-xs font-semibold text-zinc-100 truncate">
              Sync Reflection — {collection.name}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {environments.length > 0 && (
              <EnvironmentDropdown
                environments={environments}
                value={effectiveEnvId}
                onChange={(val) => setActiveEnvironmentId(val)}
                size="xs"
                align="right"
                showManageShortcut={false}
              />
            )}
            <button onClick={onClose} disabled={syncing} className="text-zinc-400 hover:text-zinc-200 p-1">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5 text-xs overflow-y-auto flex-1">
          <div>
            <label className="block text-zinc-400 mb-1">Target Root Group / Folder</label>
            <Select
              value={selectedRootFolderId}
              onChange={setSelectedRootFolderId}
              options={rootFolders.map((rf) => ({ value: rf.id, label: rf.name }))}
              fontMono
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">gRPC Server Address</label>
            <div className="bg-zinc-950 border border-zinc-800 rounded focus-within:border-zinc-700 h-8">
              <VariableInput
                value={serverAddress}
                onChange={(val) => {
                  setServerAddress(val);
                  if (shouldAutoDetectTls(val, effectiveVariables)) {
                    setUseTls(true);
                  }
                }}
                variables={effectiveVariables}
                placeholder="localhost:9091, grpcb.in:9001, or {{GRPC_HOST}}"
                className="w-full h-full"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useTls}
              onChange={(e) => setUseTls(e.target.checked)}
              className="rounded bg-zinc-950 border-zinc-700 text-primary"
            />
            <span className="text-zinc-300">Use TLS</span>
          </label>

          <button
            onClick={handleScanAndCompare}
            disabled={scanning || syncing}
            className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded text-xs font-medium flex items-center justify-center gap-1.5 border border-zinc-700/60 transition"
          >
            <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
            <span>{scanning ? 'Scanning Reflection...' : 'Scan & Compare Changes'}</span>
          </button>

          {errorMessage && (
            <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-xs font-mono break-all flex items-start gap-1.5">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && (
            <div className="p-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-300 text-xs font-mono flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin text-primary" />
              <span>{statusMessage}</span>
            </div>
          )}

          {successInfo && (
            <div className="p-2.5 bg-emerald-950/50 border border-emerald-800/60 rounded text-emerald-300 text-xs font-mono flex items-center gap-2">
              <CheckCircle2 size={13} />
              <span>{successInfo}</span>
            </div>
          )}

          {/* Sync Plan Diff View */}
          {plan && (
            <div className="space-y-2 border-t border-zinc-800 pt-3">
              <span className="text-xs font-semibold text-zinc-300 block">
                Reflection Changes Detected:
              </span>

              {!hasChanges ? (
                <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded text-center text-zinc-400 text-xs">
                  All services and method payloads are up to date. No changes detected.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {/* Services to Create */}
                  {plan.servicesToCreate.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] p-1 bg-emerald-950/30 rounded border border-emerald-900/40">
                      <PlusCircle size={12} />
                      <span>Add Service: <strong>{s.name}</strong> ({s.methods.length} methods)</span>
                    </div>
                  ))}

                  {/* Services to Delete */}
                  {plan.servicesToDelete.map((s) => (
                    <div key={s.folderId} className="flex items-center gap-1.5 text-red-400 font-mono text-[11px] p-1 bg-red-950/30 rounded border border-red-900/40">
                      <MinusCircle size={12} />
                      <span>Remove Service: <strong>{s.serviceName}</strong></span>
                    </div>
                  ))}

                  {/* Methods to Create */}
                  {plan.methodsToCreate.map((m) => (
                    <div key={`${m.serviceName}-${m.methodName}`} className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] p-1 bg-emerald-950/30 rounded border border-emerald-900/40">
                      <PlusCircle size={12} />
                      <span>Add Method: {m.serviceName} → <strong>{m.methodName}</strong></span>
                    </div>
                  ))}

                  {/* Methods to Delete */}
                  {plan.methodsToDelete.map((m) => (
                    <div key={m.endpointId} className="flex items-center gap-1.5 text-red-400 font-mono text-[11px] p-1 bg-red-950/30 rounded border border-red-900/40">
                      <MinusCircle size={12} />
                      <span>Remove Method: <strong>{m.methodName}</strong></span>
                    </div>
                  ))}

                  {/* Methods to Update */}
                  {plan.methodsToUpdate.map((u) => (
                    <div key={u.endpoint.id} className="flex items-center gap-1.5 text-amber-400 font-mono text-[11px] p-1 bg-amber-950/30 rounded border border-amber-900/40">
                      <FileEdit size={12} />
                      <span>Update Payload: <strong>{u.endpoint.name}</strong> (schema reconciled)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 p-3 border-t border-zinc-800 bg-zinc-950/50">
          <button
            type="button"
            onClick={onClose}
            disabled={syncing}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-medium transition"
          >
            Close
          </button>
          {plan && hasChanges && (
            <button
              type="button"
              onClick={handleApplySync}
              disabled={syncing}
              className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow transition"
            >
              {syncing ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <span>Apply Sync</span>
                  <ArrowRight size={12} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
