import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../api/client';
import { generateSwaggerCollection } from '../../utils/swaggerGenerator';
import { VariableInput } from '../common/VariableInput';
import { X, RefreshCw, FolderPlus, Globe, CheckCircle2 } from 'lucide-react';
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
  const [swaggerUrl, setSwaggerUrl] = useState('http://localhost:9090/swagger/combined/nutrade.swagger.json');
  const [folderName, setFolderName] = useState('Swagger APIs');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    resolveVariables().then(setActiveVariables);
  }, [activeEnvironmentId, isOpen]);

  if (!isOpen) return null;

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!swaggerUrl.trim() || !folderName.trim()) {
      setErrorText('Please specify both Swagger URL and folder name');
      return;
    }

    setLoading(true);
    setErrorText(null);
    setStatusText('Fetching Swagger specification...');

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
        swaggerUrl: swaggerUrl.trim(),
        variables: activeVars,
        timeoutMs: 60_000,
        onProgress: (status) => setStatusText(status),
        apiCaller,
      });

      // Link Swagger URL to generated root folder in collection settings
      try {
        const coll = await apiRequest<any>(`/collections/${collectionId}`);
        const currentSources = coll.settings?.swagger_sources || {};
        currentSources[result.rootFolderId] = {
          swagger_url: swaggerUrl.trim(),
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
      setErrorText(err.message || 'Failed to generate Swagger collection');
    } finally {
      setLoading(false);
      setStatusText(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-md max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-100"
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
            onClick={onClose}
            disabled={loading}
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
              Swagger / OpenAPI URL
            </label>
            <VariableInput
              value={swaggerUrl}
              onChange={setSwaggerUrl}
              variables={activeVariables}
              placeholder="http://localhost:9090/swagger/combined/nutrade.swagger.json"
              className="font-mono text-xs"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Direct JSON URL for Swagger 2.0 or OpenAPI 3.x specifications.
            </p>
          </div>

          {statusText && (
            <div className="text-center py-2 text-xs text-emerald-400 font-mono animate-pulse">
              {statusText}
            </div>
          )}

          {/* Footer */}
          <div className="pt-2 border-t border-zinc-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !swaggerUrl.trim() || !folderName.trim()}
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
    </div>
  );
};
