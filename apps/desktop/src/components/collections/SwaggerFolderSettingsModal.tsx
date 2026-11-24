import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { VariableInput } from '../common/VariableInput';
import {
  getFolderSwaggerConfig,
  cascadeUpdateFolderSwaggerBaseUrl,
  getDescendantFolderIds,
} from '../../utils/folderTree';
import {
  combineSwaggerUrl,
  normalizeSwaggerUrl,
  DEFAULT_SWAGGER_BASE_URL,
  DEFAULT_SWAGGER_PATH,
} from '../../utils/swaggerGenerator';
import type { Collection, CollectionFolder, Endpoint, VariableResponse } from '@api-lab/api-types';
import { X, Settings, Save, Info } from 'lucide-react';

export const SwaggerFolderSettingsModal: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    swaggerSettingsModal,
    closeSwaggerSettingsModal,
    activeEnvironmentId,
    clearEndpointDraft,
    syncOpenEndpoints,
  } = useAppStore();

  const folderId = swaggerSettingsModal?.folderId;
  const collectionId = swaggerSettingsModal?.collectionId;
  const isOpen = Boolean(swaggerSettingsModal?.isOpen && folderId && collectionId);

  // Fetch folders of collection
  const { data: folders = [] } = useQuery<CollectionFolder[]>({
    queryKey: ['folders', collectionId],
    queryFn: () => apiRequest<CollectionFolder[]>(`/collections/${collectionId}/folders`),
    enabled: isOpen,
  });

  // Fetch endpoints of collection to cascade Base URL template updates
  const { data: endpoints = [] } = useQuery<Endpoint[]>({
    queryKey: ['endpoints', collectionId],
    queryFn: () => apiRequest<Endpoint[]>(`/collections/${collectionId}/endpoints`),
    enabled: isOpen,
  });

  // Fetch collection for fallback settings
  const { data: collection } = useQuery<Collection>({
    queryKey: ['collection', collectionId],
    queryFn: () => apiRequest<Collection>(`/collections/${collectionId}`),
    enabled: isOpen,
  });

  // Active environment variables for syntax highlighting
  const { data: envVars = [] } = useQuery<VariableResponse[]>({
    queryKey: ['variables', activeEnvironmentId],
    queryFn: () =>
      activeEnvironmentId
        ? apiRequest<VariableResponse[]>(`/environments/${activeEnvironmentId}/variables`)
        : Promise.resolve([]),
    enabled: !!activeEnvironmentId && isOpen,
  });

  const previewVariables = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of envVars) {
      map[v.key] = v.is_sensitive ? '••••••' : v.value;
    }
    return map;
  }, [envVars]);

  const folder = folders.find((f) => f.id === folderId);

  const [folderName, setFolderName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [swaggerPath, setSwaggerPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (folder) {
      setFolderName(folder.name || '');
      const cfg = getFolderSwaggerConfig(folder, collection?.settings);
      setBaseUrl(cfg?.baseUrl || '');
      setSwaggerPath(cfg?.swaggerPath || '');
      setError(null);
    }
  }, [folder, collection]);

  const fullSwaggerUrl = combineSwaggerUrl(baseUrl, swaggerPath);
  const resolvedPreviewUrl = normalizeSwaggerUrl(fullSwaggerUrl, previewVariables);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = folderName.trim();
      const trimmedBaseUrl = baseUrl.trim();
      const trimmedPath = swaggerPath.trim();
      if (!trimmedName) {
        throw new Error('Folder name cannot be empty');
      }
      if (!trimmedBaseUrl) {
        throw new Error('Base URL cannot be empty');
      }
      if (!trimmedPath) {
        throw new Error('Swagger JSON Path cannot be empty');
      }

      const combinedUrl = combineSwaggerUrl(trimmedBaseUrl, trimmedPath);
      const existingSettings = (folder?.settings as Record<string, any>) || {};

      // 1. Update folder name, combined swagger_url, and separated settings
      await apiRequest<CollectionFolder>(`/folders/${folderId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmedName,
          swagger_url: combinedUrl,
          settings: {
            ...existingSettings,
            swagger_base_url: trimmedBaseUrl,
            swagger_path: trimmedPath,
          },
        }),
      });

      // 2. Also sync collection.settings.swagger_sources for backward compatibility
      if (collection) {
        const currentSettings = (collection.settings as any) || {};
        const sources = { ...(currentSettings.swagger_sources || {}) };
        sources[folderId!] = {
          ...sources[folderId!],
          swagger_url: combinedUrl,
          base_url: trimmedBaseUrl,
          swagger_path: trimmedPath,
        };
        await apiRequest(`/collections/${collectionId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            settings: {
              ...currentSettings,
              swagger_sources: sources,
            },
          }),
        });
      }

      // 3. Cascade Base URL template to all descendant HTTP endpoints
      const apiCaller = {
        patch: (path: string, body: any) =>
          apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) }),
      };
      return cascadeUpdateFolderSwaggerBaseUrl(
        folderId!,
        trimmedBaseUrl,
        folders,
        endpoints,
        apiCaller
      );
    },
    onSuccess: (cascadeResult) => {
      if (folderId) {
        const descendantIds = getDescendantFolderIds(folders, folderId);
        for (const ep of endpoints) {
          if (ep.folder_id && descendantIds.has(ep.folder_id)) {
            clearEndpointDraft(ep.id);
          }
        }
      }
      if (cascadeResult?.updatedEndpoints?.length) {
        syncOpenEndpoints(cascadeResult.updatedEndpoints);
      }
      queryClient.invalidateQueries({ queryKey: ['folders', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['endpoints', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      closeSwaggerSettingsModal();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update Swagger folder settings');
    },
  });

  if (!isOpen || !folder) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={closeSwaggerSettingsModal}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-md max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-emerald-400" />
            <h2 className="text-xs font-semibold text-zinc-100">
              Swagger Folder Settings
            </h2>
          </div>
          <button
            onClick={closeSwaggerSettingsModal}
            className="text-zinc-400 hover:text-zinc-200 p-1"
          >
            <X size={14} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Folder Name
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 font-medium"
              placeholder="e.g. NuTrade APIs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Base URL
            </label>
            <div className="w-full bg-zinc-950 border border-zinc-800 rounded focus-within:border-zinc-600 transition h-8 flex items-center">
              <VariableInput
                value={baseUrl}
                onChange={setBaseUrl}
                variables={envVars}
                disabled={saveMutation.isPending}
                placeholder={`e.g. ${DEFAULT_SWAGGER_BASE_URL} or localhost:8080 or {{BASE_URL}}`}
                className="w-full h-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Swagger JSON Path
            </label>
            <div className="w-full bg-zinc-950 border border-zinc-800 rounded focus-within:border-zinc-600 transition h-8 flex items-center">
              <VariableInput
                value={swaggerPath}
                onChange={setSwaggerPath}
                variables={envVars}
                disabled={saveMutation.isPending}
                placeholder={`e.g. ${DEFAULT_SWAGGER_PATH} or swagger/doc.json`}
                className="w-full h-full"
              />
            </div>
            <div className="mt-1.5 text-[10px] text-zinc-500 font-mono space-y-0.5">
              <div className="truncate">
                <span className="font-sans text-zinc-400 mr-1">Spec URL:</span>
                <span className="text-zinc-300">{fullSwaggerUrl || '—'}</span>
              </div>
              {fullSwaggerUrl.includes('{{') && resolvedPreviewUrl && resolvedPreviewUrl !== fullSwaggerUrl && (
                <div className="truncate">
                  <span className="font-sans text-zinc-400 mr-1">Active Env:</span>
                  <span className="text-emerald-400/90">{resolvedPreviewUrl}</span>
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-zinc-500 flex items-start gap-1">
              <Info size={11} className="flex-shrink-0 mt-0.5" />
              <span>
                All endpoints in this folder inherit the Base URL on-the-fly. Variables like <code className="text-zinc-400 font-mono">&#123;&#123;BASE_URL&#125;&#125;</code> update automatically when switching environments.
              </span>
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950/40 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeSwaggerSettingsModal}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5"
          >
            <Save size={13} />
            <span>{saveMutation.isPending ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
