import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  type SyncProgressInfo,
} from '../../utils/grpcReflectionSync';
import {
  shouldAutoDetectTls,
  DEFAULT_GRPC_SERVER_ADDRESS,
  DEFAULT_GRPC_USE_TLS,
  generateSamplePayloadsBatch,
} from '../../utils/grpcReflectionGenerator';
import { resolveRootFolderId, getDescendantFolderIds } from '../../utils/folderTree';
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
  AlertTriangle,
  ChevronRight,
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
  const [serverAddress, setServerAddress] = useState<string>(DEFAULT_GRPC_SERVER_ADDRESS);
  const [useTls, setUseTls] = useState<boolean>(DEFAULT_GRPC_USE_TLS);

  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const abortRef = useRef({ aborted: false });
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [freshPayloads, setFreshPayloads] = useState<Record<string, any>>({});
  const [progressInfo, setProgressInfo] = useState<SyncProgressInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Auto-detect or sync selected root folder using ancestor resolver
  useEffect(() => {
    if (!isOpen) {
      setShowCancelConfirm(false);
      setExpandedIds(new Set());
      return;
    }
    abortRef.current = { aborted: false };
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
    const childFolderIds = getDescendantFolderIds(folders, selectedRootFolderId);

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

  function handleRequestClose() {
    if (scanning || syncing) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  }

  async function handleScanAndCompare() {
    if (!serverAddress.trim() || !selectedRootFolderId) {
      setErrorMessage('Please specify server address and select a root folder');
      return;
    }

    setScanning(true);
    setErrorMessage(null);
    abortRef.current = { aborted: false };
    setProgressInfo({ message: 'Querying fresh gRPC reflection...', percent: 10 });
    setPlan(null);

    const effectiveTls = useTls || shouldAutoDetectTls(serverAddress, effectiveVariables);

    try {
      const res = await discoverNativeGrpcServices(
        { server_address: serverAddress.trim(), use_tls: effectiveTls },
        effectiveVariables
      );

      if (abortRef.current.aborted) return;

      if (res.error) {
        throw new Error(res.error);
      }
      if (!res.services || res.services.length === 0) {
        throw new Error('No services discovered via gRPC server reflection.');
      }

      setProgressInfo({
        message: `Found ${res.services.length} services. Generating schema payloads...`,
        percent: 25,
      });

      // Pre-generate sample payloads with bounded concurrency
      const payloads = await generateSamplePayloadsBatch({
        services: res.services,
        serverAddress: serverAddress.trim(),
        useTls: effectiveTls,
        variables: effectiveVariables,
        generateSamplePayload: generateNativeGrpcSamplePayload,
        concurrency: 6,
        onProgress: (comp, tot) => {
          setProgressInfo({
            message: `Generating schema payloads (${comp}/${tot})...`,
            percent: 25 + Math.round((comp / Math.max(tot, 1)) * 15),
            current: comp,
            total: tot,
          });
        },
        isAborted: () => abortRef.current.aborted,
      });

      if (abortRef.current.aborted) return;
      setFreshPayloads(payloads);

      setProgressInfo({
        message: 'Comparing schema against workspace folders & endpoints...',
        percent: 40,
      });

      const calculatedPlan = planReflectionSync(
        selectedRootFolderId,
        folders,
        endpoints,
        res.services,
        payloads,
        serverAddress.trim()
      );

      setPlan(calculatedPlan);
    } catch (err: any) {
      if (!abortRef.current.aborted) {
        setErrorMessage(err.message || 'Failed to scan reflection');
      }
    } finally {
      setScanning(false);
      setProgressInfo(null);
    }
  }

  async function handleApplySync() {
    if (!plan || !selectedRootFolderId) return;

    setSyncing(true);
    setErrorMessage(null);
    abortRef.current = { aborted: false };
    setProgressInfo({ message: 'Applying sync changes to workspace...', percent: 40 });

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
        apiCaller,
        folders,
        (info) => {
          if (typeof info === 'string') {
            setProgressInfo({ message: info, percent: 60 });
          } else {
            setProgressInfo(info);
          }
        },
        abortRef.current
      );

      if (abortRef.current.aborted) return;

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
      queryClient.invalidateQueries({ queryKey: ['collection', collection.id] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });

      setSuccessInfo(
        `Sync completed: +${result.servicesCreated} services, -${result.servicesDeleted} services, +${result.methodsCreated} methods, ~${result.methodsUpdated} updated, -${result.methodsDeleted} removed.`
      );

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      if (!abortRef.current.aborted) {
        setErrorMessage(err.message || 'Failed to apply reflection sync');
      }
    } finally {
      setSyncing(false);
      setProgressInfo(null);
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
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={handleRequestClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-md max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-100 relative"
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
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={scanning || syncing}
              className="text-zinc-400 hover:text-zinc-200 p-1"
            >
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
                placeholder={`${DEFAULT_GRPC_SERVER_ADDRESS} or {{GRPC_HOST}}`}
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
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {/* Services to Create */}
                  {plan.servicesToCreate.map((s) => {
                    const isExp = expandedIds.has(`create-svc-${s.name}`);
                    return (
                      <div
                        key={s.name}
                        className="rounded border border-emerald-900/40 bg-emerald-950/20 overflow-hidden transition"
                      >
                        <button
                          type="button"
                          onClick={() => toggleExpand(`create-svc-${s.name}`)}
                          className="w-full flex items-center justify-between p-1.5 text-left hover:bg-emerald-950/40 transition cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] min-w-0">
                            <ChevronRight
                              size={12}
                              className={`flex-shrink-0 transition-transform duration-150 ${
                                isExp ? 'rotate-90 text-emerald-300' : 'text-emerald-500/70'
                              }`}
                            />
                            <PlusCircle size={12} className="flex-shrink-0" />
                            <span className="truncate">Add Service: <strong>{s.name}</strong></span>
                          </div>
                          <span className="text-[10px] text-zinc-400 font-mono flex-shrink-0">
                            +{s.methods.length} methods
                          </span>
                        </button>
                        {isExp && (
                          <div className="p-2 border-t border-emerald-900/30 bg-zinc-950/60 space-y-1 text-[11px] font-mono">
                            <div className="text-zinc-500 font-sans text-[9px] uppercase font-bold tracking-wider">Methods in Service:</div>
                            <div className="space-y-0.5 pl-1.5">
                              {s.methods.map((m) => (
                                <div key={m.name} className="flex items-center justify-between text-zinc-300">
                                  <span>• {m.name}</span>
                                  <span className="text-[10px] text-zinc-500">{m.stream_type || 'unary'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Services to Delete */}
                  {plan.servicesToDelete.map((s) => (
                    <div
                      key={s.folderId}
                      className="flex items-center gap-1.5 text-red-400 font-mono text-[11px] p-1.5 bg-red-950/20 rounded border border-red-900/40"
                    >
                      <MinusCircle size={12} className="flex-shrink-0" />
                      <span>Remove Service: <strong>{s.serviceName}</strong></span>
                    </div>
                  ))}

                  {/* Methods to Create */}
                  {plan.methodsToCreate.map((m) => {
                    const isExp = expandedIds.has(`create-m-${m.serviceName}-${m.methodName}`);
                    return (
                      <div
                        key={`${m.serviceName}-${m.methodName}`}
                        className="rounded border border-emerald-900/40 bg-emerald-950/20 overflow-hidden transition"
                      >
                        <button
                          type="button"
                          onClick={() => toggleExpand(`create-m-${m.serviceName}-${m.methodName}`)}
                          className="w-full flex items-center justify-between p-1.5 text-left hover:bg-emerald-950/40 transition cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] min-w-0">
                            <ChevronRight
                              size={12}
                              className={`flex-shrink-0 transition-transform duration-150 ${
                                isExp ? 'rotate-90 text-emerald-300' : 'text-emerald-500/70'
                              }`}
                            />
                            <PlusCircle size={12} className="flex-shrink-0" />
                            <span className="truncate">Add Method: {m.serviceName} → <strong>{m.methodName}</strong></span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-400/90 px-1.5 py-0.2 bg-emerald-950/60 rounded border border-emerald-800/40 flex-shrink-0">
                            {m.streamType || 'unary'}
                          </span>
                        </button>
                        {isExp && m.payload && (
                          <div className="p-2 border-t border-emerald-900/30 bg-zinc-950/60 space-y-1 font-mono text-[10px]">
                            <div className="text-zinc-500 font-sans text-[9px] uppercase font-bold tracking-wider">Sample JSON Payload:</div>
                            <pre className="text-emerald-300/90 overflow-x-auto max-h-32 p-1.5 bg-zinc-900/80 rounded border border-zinc-800">
                              {JSON.stringify(m.payload, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Methods to Delete */}
                  {plan.methodsToDelete.map((m) => (
                    <div
                      key={m.endpointId}
                      className="flex items-center gap-1.5 text-red-400 font-mono text-[11px] p-1.5 bg-red-950/20 rounded border border-red-900/40"
                    >
                      <MinusCircle size={12} className="flex-shrink-0" />
                      <span>Remove Method: <strong>{m.methodName}</strong></span>
                    </div>
                  ))}

                  {/* Methods to Update */}
                  {plan.methodsToUpdate.map((u) => {
                    const isExp = expandedIds.has(`update-${u.endpoint.id}`);
                    const addedCount = u.diff?.added.length || 0;
                    const removedCount = u.diff?.removed.length || 0;
                    const streamChanged = Boolean(u.oldStreamType && u.oldStreamType !== u.newStreamType);
                    const addrChanged = Boolean(
                      u.newServerAddress && u.oldServerAddress !== u.newServerAddress
                    );

                    return (
                      <div
                        key={u.endpoint.id}
                        className="rounded border border-amber-900/40 bg-amber-950/20 overflow-hidden transition"
                      >
                        <button
                          type="button"
                          onClick={() => toggleExpand(`update-${u.endpoint.id}`)}
                          className="w-full flex items-center justify-between p-1.5 text-left hover:bg-amber-950/40 transition cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-1.5 text-amber-400 font-mono text-[11px] min-w-0">
                            <ChevronRight
                              size={12}
                              className={`flex-shrink-0 transition-transform duration-150 ${
                                isExp ? 'rotate-90 text-amber-300' : 'text-amber-500/70'
                              }`}
                            />
                            <FileEdit size={12} className="flex-shrink-0" />
                            <span className="truncate">
                              Update Payload: <strong>{u.endpoint.name}</strong>
                            </span>
                            <span className="text-[10px] text-amber-500/80 font-sans hidden sm:inline">
                              (schema reconciled)
                            </span>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0 text-[10px] font-mono">
                            {addedCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-400">
                                +{addedCount}
                              </span>
                            )}
                            {removedCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-red-950/80 border border-red-800/60 text-red-400">
                                -{removedCount}
                              </span>
                            )}
                            {streamChanged && (
                              <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                                stream
                              </span>
                            )}
                            {addrChanged && (
                              <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                                address
                              </span>
                            )}
                          </div>
                        </button>

                        {isExp && (
                          <div className="p-2.5 pt-1.5 border-t border-amber-900/30 bg-zinc-950/70 space-y-2 text-xs">
                            {streamChanged && (
                              <div className="flex items-center gap-2 text-[11px] font-mono p-1.5 bg-zinc-900/90 rounded border border-zinc-800">
                                <span className="text-zinc-500">Stream:</span>
                                <span className="text-red-400 line-through">{u.oldStreamType || 'unary'}</span>
                                <ArrowRight size={10} className="text-zinc-500 flex-shrink-0" />
                                <span className="text-emerald-400">{u.newStreamType}</span>
                              </div>
                            )}

                            {addrChanged && (
                              <div className="flex items-center gap-2 text-[11px] font-mono p-1.5 bg-zinc-900/90 rounded border border-zinc-800">
                                <span className="text-zinc-500">Address:</span>
                                <span className="text-red-400 line-through truncate max-w-[140px]">
                                  {u.oldServerAddress || '—'}
                                </span>
                                <ArrowRight size={10} className="text-zinc-500 flex-shrink-0" />
                                <span className="text-emerald-400 truncate max-w-[140px]">
                                  {u.newServerAddress}
                                </span>
                              </div>
                            )}

                            {u.diff && (u.diff.added.length > 0 || u.diff.removed.length > 0) && (
                              <div className="space-y-1 p-1.5 bg-zinc-900/60 rounded border border-zinc-800/80">
                                {u.diff.added.length > 0 && (
                                  <div className="flex items-start gap-1.5 text-[11px] font-mono">
                                    <span className="text-emerald-400 font-bold flex-shrink-0">+ Added:</span>
                                    <span className="text-emerald-300 break-all">{u.diff.added.join(', ')}</span>
                                  </div>
                                )}
                                {u.diff.removed.length > 0 && (
                                  <div className="flex items-start gap-1.5 text-[11px] font-mono">
                                    <span className="text-red-400 font-bold flex-shrink-0">- Removed:</span>
                                    <span className="text-red-300 break-all">{u.diff.removed.join(', ')}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 pt-0.5 font-mono text-[10px]">
                              <div className="p-2 bg-zinc-900/90 rounded border border-zinc-800/80 space-y-1">
                                <div className="text-zinc-500 font-sans text-[9px] uppercase font-bold tracking-wider">
                                  Current Local Payload
                                </div>
                                <pre className="text-zinc-400 overflow-x-auto max-h-36 scrollbar-thin">
                                  {JSON.stringify(u.oldPayload || {}, null, 2)}
                                </pre>
                              </div>
                              <div className="p-2 bg-zinc-900/90 rounded border border-zinc-800/80 space-y-1">
                                <div className="text-emerald-400 font-sans text-[9px] uppercase font-bold tracking-wider">
                                  Reconciled Fresh Payload
                                </div>
                                <pre className="text-emerald-300/90 overflow-x-auto max-h-36 scrollbar-thin">
                                  {JSON.stringify(u.newPayload || {}, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky Progress Bar */}
        {(scanning || syncing) && (
          <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950/70 space-y-1.5 flex-shrink-0">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span className="truncate pr-2">
                {progressInfo?.message || (scanning ? 'Scanning reflection...' : 'Syncing changes...')}
              </span>
              <span className="text-emerald-400 font-medium flex-shrink-0">
                {progressInfo?.percent ?? (scanning ? 10 : 40)}%
              </span>
            </div>
            <div className="w-full bg-zinc-950 border border-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-200"
                style={{
                  width: `${Math.max(5, Math.min(100, progressInfo?.percent ?? (scanning ? 10 : 40)))}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 p-3 border-t border-zinc-800 bg-zinc-950/50">
          <button
            type="button"
            onClick={handleRequestClose}
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

      {/* Stop Sync Confirmation Dialog */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 font-sans animate-in fade-in duration-100"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl p-4 space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400 flex-shrink-0">
                <AlertTriangle size={16} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-zinc-100">Stop Syncing Reflection?</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  By stopping this operation, some changes that already applied will not be reverted.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition"
              >
                Continue Syncing
              </button>
              <button
                type="button"
                onClick={() => {
                  abortRef.current.aborted = true;
                  setShowCancelConfirm(false);
                  setScanning(false);
                  setSyncing(false);
                  queryClient.invalidateQueries({ queryKey: ['folders', collection.id] });
                  queryClient.invalidateQueries({ queryKey: ['endpoints', collection.id] });
                  queryClient.invalidateQueries({ queryKey: ['collection', collection.id] });
                  queryClient.invalidateQueries({ queryKey: ['collections'] });
                  onClose();
                }}
                className="px-3 py-1.5 rounded text-xs bg-red-600 hover:bg-red-500 text-white font-medium transition"
              >
                Stop & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
