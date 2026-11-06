import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../api/client';
import {
  generateSwaggerCollection,
  combineSwaggerUrl,
  DEFAULT_SWAGGER_BASE_URL,
  DEFAULT_SWAGGER_PATH,
  DEFAULT_SWAGGER_FOLDER_NAME,
  type SwaggerProgressInfo,
} from '../../utils/swaggerGenerator';
import { VariableInput } from '../common/VariableInput';
import { X, RefreshCw, FolderPlus, Globe, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { VariableResponse } from '@api-lab/api-types';

interface GenerateSwaggerModalProps {
  collectionId: string;
  isOpen: boolean;
  onClose: () => void;
  activeEnvironmentId?: string | null;
}

export const GenerateSwaggerModal: React.FC<GenerateSwaggerModalProps> = ({
  collectionId,
  isOpen,
  onClose,
  activeEnvironmentId,
}) => {
  const queryClient = useQueryClient();
  const [folderName, setFolderName] = useState(DEFAULT_SWAGGER_FOLDER_NAME);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_SWAGGER_BASE_URL);
  const [swaggerPath, setSwaggerPath] = useState(DEFAULT_SWAGGER_PATH);
  const [loading, setLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const abortRef = useRef({ aborted: false });
  const [progressInfo, setProgressInfo] = useState<SwaggerProgressInfo | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) {
      setShowCancelConfirm(false);
      return;
    }
    abortRef.current = { aborted: false };
    resolveVariables().then(setActiveVariables);
  }, [activeEnvironmentId, isOpen]);

  if (!isOpen) return null;

  function handleRequestClose() {
    if (loading) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  }

  async function resolveVariables(): Promise<Record<string, string>> {
    const vars: Record<string, string> = {};
    if (activeEnvironmentId) {
      const envVars = queryClient.getQueryData<VariableResponse[]>([
        'variables',
        activeEnvironmentId,
      ]);
      if (envVars) {
        for (const v of envVars) {
          vars[v.key] = v.value;
        }
      } else {
        try {
          const fetched = await apiRequest<VariableResponse[]>(
            `/environments/${activeEnvironmentId}/variables`
          );
          for (const v of fetched) {
            vars[v.key] = v.value;
          }
        } catch {
          // ignore
        }
      }
    }
    return vars;
  }

  const fullSwaggerUrl = combineSwaggerUrl(baseUrl, swaggerPath);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!baseUrl.trim() || !swaggerPath.trim() || !folderName.trim()) {
      setErrorText('Please specify folder name, base URL / hostname, and Swagger path');
      return;
    }

    setLoading(true);
    setErrorText(null);
    abortRef.current = { aborted: false };
    setProgressInfo({ message: 'Fetching Swagger specification...', percent: 10 });

    try {
      const activeVars = await resolveVariables();
      const apiCaller = {
        post: (path: string, body: any) =>
          apiRequest(path, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
      };

      const result = await generateSwaggerCollection({
        collectionId,
        folderName: folderName.trim(),
        swaggerUrl: fullSwaggerUrl,
        baseUrl: baseUrl.trim(),
        variables: activeVars,
        timeoutMs: 60_000,
        signal: abortRef.current,
        onProgress: (info) => {
          if (typeof info === 'string') {
            setProgressInfo({ message: info, percent: 30 });
          } else {
            setProgressInfo(info);
          }
        },
        apiCaller,
      });

      if (abortRef.current.aborted) {
        return;
      }

      // Link Swagger URL to generated root folder in collection settings
      try {
        const coll = await apiRequest<any>(`/collections/${collectionId}`);
        const currentSources = coll.settings?.swagger_sources || {};
        currentSources[result.rootFolderId] = {
          swagger_url: fullSwaggerUrl,
        };
        await apiRequest(`/collections/${collectionId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            settings: {
              ...coll.settings,
              swagger_sources: currentSources,
            },
          }),
        });
      } catch {
        // ignore
      }

      queryClient.invalidateQueries({ queryKey: ['folders', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['endpoints', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });

      setSuccessInfo(
        `Generated ${result.createdServiceFoldersCount} service folders and ${result.createdEndpointsCount} HTTP endpoints under "${folderName.trim()}".`
      );

      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      if (!abortRef.current.aborted) {
        setErrorText(err.message || 'Failed to generate Swagger collection');
      }
    } finally {
      setLoading(false);
      setProgressInfo(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={handleRequestClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-md max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-emerald-400" />
            <h2 className="text-xs font-semibold text-zinc-100">
              Generate Swagger Folder
            </h2>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="text-zinc-400 hover:text-zinc-200 p-1"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {errorText && (
            <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-200">
              {errorText}
            </div>
          )}

          {successInfo && (
            <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
              <span>{successInfo}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Folder Name (Root Group)
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              disabled={loading}
              placeholder="e.g. NuTrade APIs"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Base URL / Hostname
            </label>
            <div className="w-full bg-zinc-950 border border-zinc-800 rounded focus-within:border-zinc-600 transition h-8 flex items-center">
              <VariableInput
                value={baseUrl}
                onChange={setBaseUrl}
                variables={activeVariables}
                disabled={loading}
                placeholder="https://httpbin.dmuth.org or localhost:9091"
                className="w-full h-full"
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              Supports ports (e.g. localhost:9091) and variables like {'{{API_HOST}}'}.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Swagger / OpenAPI Path
            </label>
            <input
              type="text"
              value={swaggerPath}
              onChange={(e) => setSwaggerPath(e.target.value)}
              disabled={loading}
              placeholder="openapi.json"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 font-medium"
            />
            <p className="mt-1 text-[10px] text-zinc-500 truncate">
              Resolved: <span className="font-mono text-zinc-400">{fullSwaggerUrl || '—'}</span>
            </p>
          </div>

          {loading && progressInfo && (
            <div className="py-1 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span className="truncate pr-2">{progressInfo.message}</span>
                <span className="text-emerald-400 font-medium flex-shrink-0">{progressInfo.percent}%</span>
              </div>
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-200"
                  style={{ width: `${Math.max(5, Math.min(100, progressInfo.percent))}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-2 border-t border-zinc-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !baseUrl.trim() || !swaggerPath.trim() || !folderName.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <FolderPlus size={12} />
                  <span>Generate Endpoints</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Stop Generation Confirmation Dialog */}
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
                <h3 className="text-xs font-semibold text-zinc-100">Stop Generating Swagger?</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  By stopping this operation, some endpoints that already generated will not be deleted.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition"
              >
                Continue Generating
              </button>
              <button
                type="button"
                onClick={() => {
                  abortRef.current.aborted = true;
                  setShowCancelConfirm(false);
                  setLoading(false);
                  queryClient.invalidateQueries({ queryKey: ['folders', collectionId] });
                  queryClient.invalidateQueries({ queryKey: ['endpoints', collectionId] });
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
