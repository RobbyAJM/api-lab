import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../api/client';
import {
  parseSwaggerSpec,
} from '../../utils/swaggerParser';
import {
  fetchSwaggerSpec,
  DEFAULT_SWAGGER_URL,
} from '../../utils/swaggerGenerator';
import {
  planSwaggerSync,
  executeSwaggerSync,
  type SwaggerSyncPlan,
  type SwaggerSyncProgressInfo,
} from '../../utils/swaggerSync';
import { resolveRootFolderId, getFolderSwaggerUrl } from '../../utils/folderTree';
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

interface SyncSwaggerModalProps {
  collection: Collection;
  folders: CollectionFolder[];
  endpoints: Endpoint[];
  isOpen: boolean;
  onClose: () => void;
  activeVariables?: Record<string, string>;
  initialFolderId?: string;
}

export const SyncSwaggerModal: React.FC<SyncSwaggerModalProps> = ({
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

  // Root folders in this collection
  const rootFolders = useMemo(() => folders.filter((f) => !f.parent_folder_id), [folders]);

  // Query workspace environments
  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest<Environment[]>(`/workspaces/${activeWorkspaceId}/environments`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId && isOpen,
  });

  const effectiveEnvId = useMemo(() => {
    if (activeEnvironmentId) return activeEnvironmentId;
    const def = environments.find((e) => e.is_default) || environments[0];
    return def ? def.id : null;
  }, [activeEnvironmentId, environments]);

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

  const [selectedRootFolderId, setSelectedRootFolderId] = useState<string>(
    rootFolders[0]?.id || ''
  );
  const [swaggerUrl, setSwaggerUrl] = useState<string>('');

  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const abortRef = useRef({ aborted: false });
  const [plan, setPlan] = useState<SwaggerSyncPlan | null>(null);
  const [progressInfo, setProgressInfo] = useState<SwaggerSyncProgressInfo | null>(null);
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

  // Auto-detect or sync selected root folder
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
    const rootFolder = folders.find((f) => f.id === selectedRootFolderId);
    if (rootFolder) {
      const url = getFolderSwaggerUrl(rootFolder, collection?.settings) || '';
      setSwaggerUrl(url);
    }
  }, [selectedRootFolderId, collection.settings, folders]);

  if (!isOpen) return null;

  function handleRequestClose() {
    if (scanning || syncing) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  }

  async function handleScanAndCompare() {
    if (!swaggerUrl.trim() || !selectedRootFolderId) {
      setErrorMessage('Please specify Swagger URL and select a root folder');
      return;
    }

    setScanning(true);
    setErrorMessage(null);
    abortRef.current = { aborted: false };
    setProgressInfo({ message: 'Fetching fresh Swagger specification...', percent: 10 });
    setPlan(null);
    setExpandedIds(new Set());

    try {
      const doc = await fetchSwaggerSpec(swaggerUrl.trim(), {
        variables: effectiveVariables,
      });

      if (abortRef.current.aborted) return;

      setProgressInfo({ message: 'Parsing endpoints and schemas...', percent: 25 });
      const spec = parseSwaggerSpec(doc, swaggerUrl.trim());

      if (spec.services.length === 0 || spec.totalEndpoints === 0) {
        throw new Error('No endpoints discovered in Swagger specification.');
      }

      if (abortRef.current.aborted) return;

      setProgressInfo({ message: 'Calculating reconciliation diff...', percent: 40 });
      const p = planSwaggerSync(selectedRootFolderId, folders, endpoints, spec);
      setPlan(p);
    } catch (err: any) {
      if (!abortRef.current.aborted) {
        setErrorMessage(err.message || 'Failed to scan and compare Swagger specification');
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
    setProgressInfo({ message: 'Applying synchronization changes...', percent: 40 });

    try {
      const apiCaller = {
        post: (path: string, body: any) =>
          apiRequest(path, { method: 'POST', body: JSON.stringify(body) }),
        patch: (path: string, body: any) =>
          apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) }),
        delete: (path: string) => apiRequest(path, { method: 'DELETE' }),
      };

      const result = await executeSwaggerSync(
        collection.id,
        selectedRootFolderId,
        plan,
        apiCaller,
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

      // Also persist swagger_url on root folder
      try {
        await apiRequest(`/folders/${selectedRootFolderId}`, {
          method: 'PATCH',
          body: JSON.stringify({ swagger_url: swaggerUrl.trim() }),
        });
      } catch {
        // ignore
      }

      queryClient.invalidateQueries({ queryKey: ['folders', collection.id] });
      queryClient.invalidateQueries({ queryKey: ['endpoints', collection.id] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });

      setSuccessInfo(
        `Sync completed: +${result.createdServicesCount} services, +${result.createdEndpointsCount} endpoints, ` +
          `-${result.deletedServicesCount} services, -${result.deletedEndpointsCount} endpoints, ` +
          `~${result.updatedEndpointsCount} modified.`
      );

      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      if (!abortRef.current.aborted) {
        setErrorMessage(err.message || 'Failed to apply synchronization changes');
      }
    } finally {
      setSyncing(false);
      setProgressInfo(null);
    }
  }

  const hasChanges =
    plan &&
    (plan.servicesToDelete.length > 0 ||
      plan.servicesToCreate.length > 0 ||
      plan.endpointsToCreate.length > 0 ||
      plan.endpointsToDelete.length > 0 ||
      plan.endpointsToUpdate.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={handleRequestClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-md max-w-lg w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-100 flex flex-col max-h-[90vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-emerald-400" />
            <h2 className="text-xs font-semibold text-zinc-100">
              Sync Swagger Folder ({collection.name})
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
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-200 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successInfo && (
            <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-200 flex items-start gap-2">
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5 text-emerald-400" />
              <span>{successInfo}</span>
            </div>
          )}

          {/* Configuration Form */}
          <div className="space-y-3 bg-zinc-950/50 p-3 rounded border border-zinc-800">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Target Swagger Root Folder
              </label>
              <Select
                value={selectedRootFolderId}
                onChange={(val) => {
                  setSelectedRootFolderId(val);
                  setPlan(null);
                  setExpandedIds(new Set());
                }}
                options={rootFolders.map((f) => ({
                  value: f.id,
                  label: f.name,
                }))}
                size="sm"
                className="w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-zinc-400">
                  Swagger URL
                </label>
              </div>
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded focus-within:border-zinc-700 transition h-8 flex items-center">
                <VariableInput
                  value={swaggerUrl}
                  onChange={(val) => {
                    setSwaggerUrl(val);
                    setPlan(null);
                    setExpandedIds(new Set());
                  }}
                  variables={envVars}
                  disabled={scanning || syncing}
                  placeholder={DEFAULT_SWAGGER_URL}
                  className="w-full h-full"
                />
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                disabled={scanning || syncing || !swaggerUrl.trim() || !selectedRootFolderId}
                onClick={handleScanAndCompare}
                className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 py-1.5 px-3 rounded text-xs font-medium flex items-center justify-center gap-2 transition"
              >
                <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
                <span>{scanning ? 'Scanning Swagger...' : 'Scan & Compare Diff'}</span>
              </button>
            </div>
          </div>

          {/* Diff Plan Display */}
          {plan && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                <h3 className="text-xs font-semibold text-zinc-200">Reconciliation Diff</h3>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {hasChanges ? 'Changes detected' : 'Already in sync'}
                </span>
              </div>

              {!hasChanges ? (
                <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-950/30 rounded border border-zinc-800">
                  <CheckCircle2 size={16} className="mx-auto mb-1 text-emerald-400" />
                  Your local Swagger folder endpoints are identical to the Swagger specification.
                </div>
              ) : (
                <div className="space-y-1.5 text-xs">
                  {/* Services to create */}
                  {plan.servicesToCreate.map((s) => {
                    const isExp = expandedIds.has(`create-s-${s.name}`);
                    return (
                      <div
                        key={s.name}
                        className="rounded border border-emerald-900/40 bg-emerald-950/20 overflow-hidden transition"
                      >
                        <button
                          type="button"
                          onClick={() => toggleExpand(`create-s-${s.name}`)}
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
                            +{s.endpoints.length} endpoints
                          </span>
                        </button>
                        {isExp && (
                          <div className="p-2 border-t border-emerald-900/30 bg-zinc-950/60 space-y-1 text-[11px] font-mono">
                            <div className="text-zinc-500 font-sans text-[9px] uppercase font-bold tracking-wider">
                              Endpoints in Service:
                            </div>
                            <div className="space-y-0.5 pl-1.5">
                              {s.endpoints.map((ep) => (
                                <div key={ep.name} className="flex items-center justify-between text-zinc-300">
                                  <span className="truncate">• {ep.name}</span>
                                  <span className="text-[10px] uppercase font-bold text-emerald-400 flex-shrink-0 ml-2">
                                    {ep.method}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Services to delete */}
                  {plan.servicesToDelete.map((s) => (
                    <div
                      key={s.folderId}
                      className="flex items-center gap-1.5 text-red-400 font-mono text-[11px] p-1.5 bg-red-950/20 rounded border border-red-900/40"
                    >
                      <MinusCircle size={12} className="flex-shrink-0" />
                      <span>Remove Service: <strong>{s.serviceName}</strong></span>
                    </div>
                  ))}

                  {/* Endpoints to create */}
                  {plan.endpointsToCreate.map((m, idx) => {
                    const itemKey = `create-ep-${m.folderId}-${m.endpoint.name}-${idx}`;
                    const isExp = expandedIds.has(itemKey);
                    let samplePayload = m.payload;
                    if (!samplePayload && m.endpoint.body) {
                      try {
                        samplePayload = JSON.parse(m.endpoint.body);
                      } catch {
                        samplePayload = m.endpoint.body;
                      }
                    }
                    const hasQueryParams = m.endpoint.queryParams && m.endpoint.queryParams.length > 0;
                    return (
                      <div
                        key={itemKey}
                        className="rounded border border-emerald-900/40 bg-emerald-950/20 overflow-hidden transition"
                      >
                        <button
                          type="button"
                          onClick={() => toggleExpand(itemKey)}
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
                            <span className="font-mono text-[10px] uppercase font-bold text-emerald-400 px-1 py-0.2 rounded bg-emerald-950/80 border border-emerald-800/60 flex-shrink-0">
                              {m.endpoint.method}
                            </span>
                            <span className="truncate">Add: <strong>{m.endpoint.name}</strong></span>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono flex-shrink-0 ml-2">
                            {m.serviceName}
                          </span>
                        </button>
                        {isExp && (
                          <div className="p-2.5 pt-1.5 border-t border-emerald-900/30 bg-zinc-950/70 space-y-2 text-xs">
                            <div className="text-[11px] font-mono p-1.5 bg-zinc-900/90 rounded border border-zinc-800 break-all text-zinc-300">
                              <span className="text-zinc-500 mr-1.5 font-sans text-[10px] uppercase font-bold">URL:</span>
                              {m.endpoint.fullUrl}
                            </div>
                            {hasQueryParams && (
                              <div className="p-1.5 bg-zinc-900/60 rounded border border-zinc-800/80 space-y-1">
                                <div className="text-zinc-500 font-sans text-[9px] uppercase font-bold tracking-wider">
                                  Query Parameters:
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {m.endpoint.queryParams.map(([k, v], qIdx) => (
                                    <span
                                      key={qIdx}
                                      className="px-1.5 py-0.2 font-mono text-[10px] rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300"
                                    >
                                      {k}{v ? `=${v}` : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {samplePayload && (
                              <div className="p-2 bg-zinc-900/90 rounded border border-zinc-800/80 space-y-1 font-mono text-[10px]">
                                <div className="text-zinc-500 font-sans text-[9px] uppercase font-bold tracking-wider">
                                  Sample Request Payload:
                                </div>
                                <pre className="text-emerald-300/90 overflow-x-auto max-h-36 scrollbar-thin">
                                  {typeof samplePayload === 'object' && samplePayload !== null
                                    ? JSON.stringify(samplePayload, null, 2)
                                    : String(samplePayload)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Endpoints to update */}
                  {plan.endpointsToUpdate.map((u) => {
                    const isExp = expandedIds.has(`update-${u.endpoint.id}`);
                    const diff = u.diffSummary;
                    const addedCount =
                      (diff?.bodyDiff?.added.length || 0) +
                      (diff?.queryParamsDiff?.added.length || 0) +
                      (diff?.headersDiff?.added.length || 0);
                    const removedCount =
                      (diff?.bodyDiff?.removed.length || 0) +
                      (diff?.queryParamsDiff?.removed.length || 0) +
                      (diff?.headersDiff?.removed.length || 0);
                    const methodChanged = Boolean(diff?.methodChange);
                    const urlChanged = Boolean(diff?.urlChange);
                    const nameChanged = Boolean(diff?.nameChange);
                    const summaryChanged = Boolean(diff?.summaryChange);
                    const bodyChanged = Boolean(
                      (diff?.bodyDiff?.changed && diff.bodyDiff.changed.length > 0) ||
                      (diff?.bodyDiff && (diff.bodyDiff.added.length > 0 || diff.bodyDiff.removed.length > 0))
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
                            <span className="font-mono text-[10px] uppercase font-bold text-amber-400 px-1 py-0.2 rounded bg-amber-950/80 border border-amber-800/60 flex-shrink-0">
                              {u.newConfig?.method || u.endpoint.config?.method || 'HTTP'}
                            </span>
                            <span className="truncate">
                              Update: <strong>{u.endpoint.name}</strong>
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
                            {methodChanged && (
                              <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                                method
                              </span>
                            )}
                            {urlChanged && (
                              <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                                url
                              </span>
                            )}
                            {bodyChanged && (
                              <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                                body
                              </span>
                            )}
                            {nameChanged && (
                              <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                                name
                              </span>
                            )}
                            {summaryChanged && (
                              <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                                summary
                              </span>
                            )}
                          </div>
                        </button>

                        {isExp && (
                          <div className="p-2.5 pt-1.5 border-t border-amber-900/30 bg-zinc-950/70 space-y-2 text-xs">
                            {diff?.methodChange && (
                              <div className="flex items-center gap-2 text-[11px] font-mono p-1.5 bg-zinc-900/90 rounded border border-zinc-800">
                                <span className="text-zinc-500 font-sans text-[10px] uppercase font-bold">Method:</span>
                                <span className="text-red-400 line-through">{diff.methodChange.old}</span>
                                <ArrowRight size={10} className="text-zinc-500 flex-shrink-0" />
                                <span className="text-emerald-400">{diff.methodChange.new}</span>
                              </div>
                            )}

                            {diff?.urlChange && (
                              <div className="flex items-center gap-2 text-[11px] font-mono p-1.5 bg-zinc-900/90 rounded border border-zinc-800">
                                <span className="text-zinc-500 font-sans text-[10px] uppercase font-bold">URL:</span>
                                <span className="text-red-400 line-through truncate max-w-[160px]">
                                  {diff.urlChange.old}
                                </span>
                                <ArrowRight size={10} className="text-zinc-500 flex-shrink-0" />
                                <span className="text-emerald-400 truncate max-w-[160px]">
                                  {diff.urlChange.new}
                                </span>
                              </div>
                            )}

                            {diff?.nameChange && (
                              <div className="flex items-center gap-2 text-[11px] font-mono p-1.5 bg-zinc-900/90 rounded border border-zinc-800">
                                <span className="text-zinc-500 font-sans text-[10px] uppercase font-bold">Name:</span>
                                <span className="text-red-400 line-through">{diff.nameChange.old}</span>
                                <ArrowRight size={10} className="text-zinc-500 flex-shrink-0" />
                                <span className="text-emerald-400">{diff.nameChange.new}</span>
                              </div>
                            )}

                            {diff?.summaryChange && (
                              <div className="flex items-center gap-2 text-[11px] font-mono p-1.5 bg-zinc-900/90 rounded border border-zinc-800">
                                <span className="text-zinc-500 font-sans text-[10px] uppercase font-bold">Summary:</span>
                                <span className="text-red-400 line-through truncate max-w-[160px]">
                                  {diff.summaryChange.old}
                                </span>
                                <ArrowRight size={10} className="text-zinc-500 flex-shrink-0" />
                                <span className="text-emerald-400 truncate max-w-[160px]">
                                  {diff.summaryChange.new}
                                </span>
                              </div>
                            )}

                            {((diff?.queryParamsDiff &&
                              (diff.queryParamsDiff.added.length > 0 || diff.queryParamsDiff.removed.length > 0)) ||
                              (diff?.headersDiff &&
                                (diff.headersDiff.added.length > 0 || diff.headersDiff.removed.length > 0))) && (
                              <div className="space-y-1 p-1.5 bg-zinc-900/60 rounded border border-zinc-800/80">
                                {diff?.queryParamsDiff?.added && diff.queryParamsDiff.added.length > 0 && (
                                  <div className="flex items-start gap-1.5 text-[11px] font-mono">
                                    <span className="text-emerald-400 font-bold flex-shrink-0">+ Query Params:</span>
                                    <span className="text-emerald-300 break-all">
                                      {diff.queryParamsDiff.added.join(', ')}
                                    </span>
                                  </div>
                                )}
                                {diff?.queryParamsDiff?.removed && diff.queryParamsDiff.removed.length > 0 && (
                                  <div className="flex items-start gap-1.5 text-[11px] font-mono">
                                    <span className="text-red-400 font-bold flex-shrink-0">- Query Params:</span>
                                    <span className="text-red-300 break-all">
                                      {diff.queryParamsDiff.removed.join(', ')}
                                    </span>
                                  </div>
                                )}
                                {diff?.headersDiff?.added && diff.headersDiff.added.length > 0 && (
                                  <div className="flex items-start gap-1.5 text-[11px] font-mono">
                                    <span className="text-emerald-400 font-bold flex-shrink-0">+ Headers:</span>
                                    <span className="text-emerald-300 break-all">
                                      {diff.headersDiff.added.join(', ')}
                                    </span>
                                  </div>
                                )}
                                {diff?.headersDiff?.removed && diff.headersDiff.removed.length > 0 && (
                                  <div className="flex items-start gap-1.5 text-[11px] font-mono">
                                    <span className="text-red-400 font-bold flex-shrink-0">- Headers:</span>
                                    <span className="text-red-300 break-all">
                                      {diff.headersDiff.removed.join(', ')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {diff?.bodyDiff &&
                              (diff.bodyDiff.added.length > 0 ||
                                diff.bodyDiff.removed.length > 0 ||
                                diff.bodyDiff.changed.length > 0) && (
                                <div className="space-y-1 p-1.5 bg-zinc-900/60 rounded border border-zinc-800/80">
                                  {diff.bodyDiff.added.length > 0 && (
                                    <div className="flex items-start gap-1.5 text-[11px] font-mono">
                                      <span className="text-emerald-400 font-bold flex-shrink-0">+ Added Body Fields:</span>
                                      <span className="text-emerald-300 break-all">{diff.bodyDiff.added.join(', ')}</span>
                                    </div>
                                  )}
                                  {diff.bodyDiff.removed.length > 0 && (
                                    <div className="flex items-start gap-1.5 text-[11px] font-mono">
                                      <span className="text-red-400 font-bold flex-shrink-0">- Removed Body Fields:</span>
                                      <span className="text-red-300 break-all">{diff.bodyDiff.removed.join(', ')}</span>
                                    </div>
                                  )}
                                  {diff.bodyDiff.changed.length > 0 && (
                                    <div className="flex items-start gap-1.5 text-[11px] font-mono">
                                      <span className="text-amber-400 font-bold flex-shrink-0">~ Changed Body Fields:</span>
                                      <span className="text-amber-300 break-all">{diff.bodyDiff.changed.join(', ')}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                            {((diff?.oldBody !== undefined && (typeof diff.oldBody === 'object' ? Object.keys(diff.oldBody).length > 0 : Boolean(diff.oldBody))) ||
                              (diff?.newBody !== undefined && (typeof diff.newBody === 'object' ? Object.keys(diff.newBody).length > 0 : Boolean(diff.newBody))) ||
                              Boolean(
                                diff?.bodyDiff &&
                                  (diff.bodyDiff.added.length > 0 ||
                                    diff.bodyDiff.removed.length > 0 ||
                                    diff.bodyDiff.changed.length > 0)
                              )) && (
                              <div className="grid grid-cols-2 gap-2 pt-0.5 font-mono text-[10px]">
                                <div className="p-2 bg-zinc-900/90 rounded border border-zinc-800/80 space-y-1">
                                  <div className="text-zinc-500 font-sans text-[9px] uppercase font-bold tracking-wider">
                                    Current Local Payload
                                  </div>
                                  <pre className="text-zinc-400 overflow-x-auto max-h-36 scrollbar-thin">
                                    {typeof diff?.oldBody === 'object' && diff?.oldBody !== null
                                      ? JSON.stringify(diff.oldBody, null, 2)
                                      : String(diff?.oldBody ?? '{}')}
                                  </pre>
                                </div>
                                <div className="p-2 bg-zinc-900/90 rounded border border-zinc-800/80 space-y-1">
                                  <div className="text-emerald-400 font-sans text-[9px] uppercase font-bold tracking-wider">
                                    Reconciled Fresh Payload
                                  </div>
                                  <pre className="text-emerald-300/90 overflow-x-auto max-h-36 scrollbar-thin">
                                    {typeof diff?.newBody === 'object' && diff?.newBody !== null
                                      ? JSON.stringify(diff.newBody, null, 2)
                                      : String(diff?.newBody ?? '{}')}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Endpoints to delete */}
                  {plan.endpointsToDelete.map((d) => (
                    <div
                      key={d.endpointId}
                      className="flex items-center gap-1.5 text-red-400 font-mono text-[11px] p-1.5 bg-red-950/20 rounded border border-red-900/40"
                    >
                      <MinusCircle size={12} className="flex-shrink-0" />
                      <span>Remove Endpoint: <strong>{d.endpointName}</strong></span>
                    </div>
                  ))}
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
                {progressInfo?.message || (scanning ? 'Scanning Swagger...' : 'Applying sync changes...')}
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

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950/40 flex justify-end gap-2">
          <button
            type="button"
            disabled={scanning || syncing}
            onClick={handleRequestClose}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!hasChanges || syncing || scanning}
            onClick={handleApplySync}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5"
          >
            <ArrowRight size={13} />
            <span>{syncing ? 'Applying Sync...' : 'Apply Reconciliation'}</span>
          </button>
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
                <h3 className="text-xs font-semibold text-zinc-100">Stop Syncing Swagger?</h3>
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
