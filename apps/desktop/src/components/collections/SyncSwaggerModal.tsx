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

  // Auto-detect or sync selected root folder
  useEffect(() => {
    if (!isOpen) {
      setShowCancelConfirm(false);
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
                <div className="space-y-2 text-xs">
                  {/* Services to create */}
                  {plan.servicesToCreate.map((s) => (
                    <div
                      key={s.name}
                      className="p-2 bg-emerald-950/20 border border-emerald-800/40 rounded flex items-center justify-between text-emerald-300"
                    >
                      <div className="flex items-center gap-2">
                        <PlusCircle size={13} className="text-emerald-400" />
                        <span className="font-medium">Service Folder: {s.name}</span>
                      </div>
                      <span className="text-[10px] text-zinc-400">+{s.endpoints.length} endpoints</span>
                    </div>
                  ))}

                  {/* Services to delete */}
                  {plan.servicesToDelete.map((s) => (
                    <div
                      key={s.folderId}
                      className="p-2 bg-red-950/20 border border-red-800/40 rounded flex items-center gap-2 text-red-300"
                    >
                      <MinusCircle size={13} className="text-red-400" />
                      <span>Remove Service Folder: {s.serviceName}</span>
                    </div>
                  ))}

                  {/* Endpoints to create */}
                  {plan.endpointsToCreate.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-emerald-950/20 border border-emerald-800/40 rounded flex items-center gap-2 text-emerald-300"
                    >
                      <PlusCircle size={13} className="text-emerald-400" />
                      <span className="font-mono text-[10px] uppercase font-bold text-emerald-400">
                        {m.endpoint.method}
                      </span>
                      <span className="truncate">{m.endpoint.name}</span>
                      <span className="text-[10px] text-zinc-500 ml-auto">{m.serviceName}</span>
                    </div>
                  ))}

                  {/* Endpoints to update */}
                  {plan.endpointsToUpdate.map((u) => (
                    <div
                      key={u.endpoint.id}
                      className="p-2 bg-amber-950/20 border border-amber-800/40 rounded flex items-center gap-2 text-amber-300"
                    >
                      <FileEdit size={13} className="text-amber-400" />
                      <span className="font-mono text-[10px] uppercase font-bold text-amber-400">
                        {u.endpoint.config?.method || 'HTTP'}
                      </span>
                      <span className="truncate">{u.endpoint.name}</span>
                      <span className="text-[10px] text-amber-500/80 ml-auto">payload/url update</span>
                    </div>
                  ))}

                  {/* Endpoints to delete */}
                  {plan.endpointsToDelete.map((d) => (
                    <div
                      key={d.endpointId}
                      className="p-2 bg-red-950/20 border border-red-800/40 rounded flex items-center gap-2 text-red-300"
                    >
                      <MinusCircle size={13} className="text-red-400" />
                      <span>Remove Endpoint: {d.endpointName}</span>
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
