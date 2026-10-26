import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { VariableInput } from '../common/VariableInput';
import { Select } from '../common/Select';
import {
  isReflectionFolder,
  getFolderGrpcUrl,
  isSwaggerFolder,
  getFolderSwaggerUrl,
  cascadeUpdateFolderGrpcAddress,
  getDescendantFolderIds,
} from '../../utils/folderTree';
import { resolveInheritedAuth } from '../../utils/folderSettings';
import { DEFAULT_GRPC_SERVER_ADDRESS } from '../../utils/grpcReflectionGenerator';
import { DEFAULT_SWAGGER_URL } from '../../utils/swaggerGenerator';
import type {
  Collection,
  CollectionFolder,
  CollectionAuthSettings,
  Endpoint,
  VariableResponse,
} from '@api-lab/api-types';
import { X, Settings, Shield, Save, Folder } from 'lucide-react';

export const FolderSettingsModal: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    folderSettingsModal,
    closeFolderSettingsModal,
    activeEnvironmentId,
    clearEndpointDraft,
  } = useAppStore();

  const folderId = folderSettingsModal?.folderId;
  const collectionId = folderSettingsModal?.collectionId;
  const isOpen = Boolean(folderSettingsModal?.isOpen && folderId && collectionId);

  // Fetch folders of collection
  const { data: folders = [] } = useQuery<CollectionFolder[]>({
    queryKey: ['folders', collectionId],
    queryFn: () => apiRequest<CollectionFolder[]>(`/collections/${collectionId}/folders`),
    enabled: isOpen,
  });

  // Fetch endpoints of collection to cascade address updates
  const { data: endpoints = [] } = useQuery<Endpoint[]>({
    queryKey: ['endpoints', collectionId],
    queryFn: () => apiRequest<Endpoint[]>(`/collections/${collectionId}/endpoints`),
    enabled: isOpen,
  });

  // Fetch collection
  const { data: collection } = useQuery<Collection>({
    queryKey: ['collection', collectionId],
    queryFn: () => apiRequest<Collection>(`/collections/${collectionId}`),
    enabled: isOpen,
  });

  // Environment variables for variable highlight
  const { data: envVars = [] } = useQuery<VariableResponse[]>({
    queryKey: ['variables', activeEnvironmentId],
    queryFn: () =>
      activeEnvironmentId
        ? apiRequest<VariableResponse[]>(`/environments/${activeEnvironmentId}/variables`)
        : Promise.resolve([]),
    enabled: !!activeEnvironmentId && isOpen,
  });

  const activeVariables = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of envVars) {
      map[v.key] = v.value;
    }
    return map;
  }, [envVars]);

  const folder = folders.find((f) => f.id === folderId);

  const [activeTab, setActiveTab] = useState<'general' | 'auth'>('general');
  const [folderName, setFolderName] = useState('');
  const [serverAddress, setServerAddress] = useState('');
  const [swaggerUrl, setSwaggerUrl] = useState('');

  // Auth state
  const [authType, setAuthType] = useState<CollectionAuthSettings['auth_type']>('inherit');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [headerName, setHeaderName] = useState('Authorization');
  const [headerValue, setHeaderValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isReflection = folder ? isReflectionFolder(folder, collection?.settings) : false;
  const isSwagger = folder ? isSwaggerFolder(folder, collection?.settings) : false;

  useEffect(() => {
    if (folderSettingsModal?.initialTab) {
      setActiveTab(folderSettingsModal.initialTab);
    } else {
      setActiveTab('general');
    }
  }, [folderSettingsModal?.initialTab, folderSettingsModal?.folderId]);

  useEffect(() => {
    if (folder) {
      setFolderName(folder.name || '');
      setServerAddress(getFolderGrpcUrl(folder, collection?.settings) || '');
      setSwaggerUrl(getFolderSwaggerUrl(folder, collection?.settings) || '');

      const existingAuth = folder.settings?.auth as CollectionAuthSettings | undefined;
      setAuthType(existingAuth?.auth_type || 'inherit');
      setToken(existingAuth?.token || '');
      setUsername(existingAuth?.username || '');
      setPassword(existingAuth?.password || '');
      setHeaderName(existingAuth?.header_name || 'Authorization');
      setHeaderValue(existingAuth?.header_value || '');
      setError(null);
    }
  }, [folder, collection]);

  // Compute what parent auth would be if inherit is chosen
  const parentResolvedAuth = React.useMemo(() => {
    if (!folder) return null;
    return resolveInheritedAuth(collection, folders, folder.parent_folder_id);
  }, [folder, collection, folders]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = folderName.trim();
      if (!trimmedName) {
        throw new Error('Folder name cannot be empty');
      }

      if (isReflection && !serverAddress.trim()) {
        throw new Error('gRPC server address cannot be empty');
      }
      if (isSwagger && !swaggerUrl.trim()) {
        throw new Error('Swagger URL cannot be empty');
      }

      // Build auth payload
      const authPayload: CollectionAuthSettings = {
        auth_type: authType,
        token: authType === 'bearer' ? token.trim() : undefined,
        username: authType === 'basic' ? username.trim() : undefined,
        password: authType === 'basic' ? password : undefined,
        header_name: authType === 'custom' ? headerName.trim() : undefined,
        header_value: authType === 'custom' ? headerValue.trim() : undefined,
      };

      const existingSettings = (folder?.settings as Record<string, any>) || {};
      const newSettings = {
        ...existingSettings,
        auth: authPayload,
      };

      const patchBody: Record<string, any> = {
        name: trimmedName,
        settings: newSettings,
      };

      if (isReflection) {
        patchBody.grpc_url = serverAddress.trim();
      }
      if (isSwagger) {
        patchBody.swagger_url = swaggerUrl.trim();
      }

      const updated = await apiRequest<CollectionFolder>(`/folders/${folderId}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      });

      // Backward compatibility syncing in collection.settings
      if (collection && isReflection) {
        const curSettings = (collection.settings as any) || {};
        const sources = { ...(curSettings.grpc_sources || {}) };
        if (sources[folderId!]) {
          sources[folderId!] = {
            ...sources[folderId!],
            server_address: serverAddress.trim(),
          };
          await apiRequest(`/collections/${collectionId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              settings: {
                ...curSettings,
                grpc_sources: sources,
              },
            }),
          });
        }
      }

      if (collection && isSwagger) {
        const curSettings = (collection.settings as any) || {};
        const sources = { ...(curSettings.swagger_sources || {}) };
        if (sources[folderId!]) {
          sources[folderId!] = {
            ...sources[folderId!],
            swagger_url: swaggerUrl.trim(),
          };
          await apiRequest(`/collections/${collectionId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              settings: {
                ...curSettings,
                swagger_sources: sources,
              },
            }),
          });
        }
      }

      // Cascade gRPC address to all child endpoints under this reflection folder
      if (isReflection && folderId) {
        const apiCaller = {
          patch: (path: string, body: any) =>
            apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) }),
        };
        await cascadeUpdateFolderGrpcAddress(folderId, serverAddress.trim(), folders, endpoints, apiCaller);
      }

      return updated;
    },
    onSuccess: () => {
      // Clear stale drafts for endpoints in this reflection folder hierarchy
      if (isReflection && folderId) {
        const descendantIds = getDescendantFolderIds(folders, folderId);
        for (const ep of endpoints) {
          if (ep.folder_id && descendantIds.has(ep.folder_id)) {
            clearEndpointDraft(ep.id);
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ['folders', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['endpoints', collectionId] });
      closeFolderSettingsModal();
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to update folder settings');
    },
  });

  if (!isOpen || !folder) return null;

  const folderTitle = isReflection
    ? `Reflection Settings — ${folder.name}`
    : isSwagger
    ? `Swagger Settings — ${folder.name}`
    : `Folder Settings — ${folder.name}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 font-sans"
      onClick={closeFolderSettingsModal}
      onKeyDown={(e) => {
        if (e.key === 'Escape') closeFolderSettingsModal();
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          saveMutation.mutate();
        }
      }}
    >
      <div
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl overflow-hidden flex flex-col text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/60 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-xs flex-shrink-0">
              <Folder size={13} />
            </div>
            <h2 className="text-xs font-semibold text-zinc-200 truncate">
              {folderTitle}
            </h2>
          </div>
          <button
            onClick={closeFolderSettingsModal}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-800/80 bg-zinc-900/40 px-4 text-xs select-none">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-2 px-3 font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'general'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings size={12} />
            <span>General</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('auth')}
            className={`py-2 px-3 font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'auth'
                ? 'border-primary text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Shield size={12} />
            <span>Authorization</span>
            {authType !== 'inherit' && authType !== 'none' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 space-y-3.5 text-xs">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/50 border border-rose-800/60 text-rose-300 text-[11px]">
              {error}
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-3.5">
              {/* Folder Name */}
              <div>
                <label className="block text-zinc-400 font-medium mb-1 text-[11px]">
                  Folder Name
                </label>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Folder Name"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 text-xs focus:border-primary focus:outline-none"
                />
              </div>

              {/* gRPC Server Address (if reflection) */}
              {isReflection && (
                <div>
                  <label className="block text-zinc-400 font-medium mb-1 text-[11px]">
                    gRPC Server Address
                  </label>
                  <div className="rounded border border-zinc-800 bg-zinc-900 focus-within:border-primary transition">
                    <VariableInput
                      value={serverAddress}
                      onChange={setServerAddress}
                      placeholder={`e.g. ${DEFAULT_GRPC_SERVER_ADDRESS} or {{GRPC_HOST}}`}
                      variables={activeVariables}
                      className="px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Swagger URL (if swagger) */}
              {isSwagger && (
                <div>
                  <label className="block text-zinc-400 font-medium mb-1 text-[11px]">
                    Swagger / OpenAPI Spec URL
                  </label>
                  <div className="rounded border border-zinc-800 bg-zinc-900 focus-within:border-primary transition">
                    <VariableInput
                      value={swaggerUrl}
                      onChange={setSwaggerUrl}
                      placeholder={DEFAULT_SWAGGER_URL}
                      variables={activeVariables}
                      className="px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'auth' && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-zinc-400 font-medium mb-1 text-[11px]">
                  Authentication Type
                </label>
                <Select
                  value={authType}
                  onChange={(val) => setAuthType(val as any)}
                  options={[
                    { value: 'inherit', label: 'Inherit auth from parent' },
                    { value: 'none', label: 'No Auth (Disable inheritance)' },
                    { value: 'bearer', label: 'Bearer Token' },
                    { value: 'basic', label: 'Basic Auth' },
                    { value: 'custom', label: 'Custom Header' },
                  ]}
                  fontMono
                />
              </div>

              {authType === 'inherit' && (
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded text-xs space-y-1">
                  <div className="text-zinc-200 font-medium flex items-center gap-1.5">
                    <Shield size={13} className="text-secondary" />
                    <span>
                      {parentResolvedAuth
                        ? `Inherited from ${parentResolvedAuth.sourceType}: ${parentResolvedAuth.sourceName}`
                        : 'No parent authorization configured'}
                    </span>
                  </div>
                  <div className="text-zinc-400 text-[11px]">
                    {parentResolvedAuth
                      ? `Type: ${parentResolvedAuth.auth.auth_type.toUpperCase()}`
                      : 'Endpoints inside this folder will inherit from the nearest parent folder or collection settings.'}
                  </div>
                </div>
              )}

              {authType === 'bearer' && (
                <div className="space-y-1.5">
                  <label className="block text-zinc-400 font-medium text-[11px]">Bearer Token</label>
                  <div className="bg-zinc-900 border border-zinc-800 rounded focus-within:border-primary h-8">
                    <VariableInput
                      value={token}
                      onChange={setToken}
                      variables={activeVariables}
                      placeholder="{{TOKEN}} or raw-token"
                      className="w-full h-full text-xs font-mono px-2.5 py-1"
                    />
                  </div>
                </div>
              )}

              {authType === 'basic' && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1 text-[11px]">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1 text-[11px]">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {authType === 'custom' && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1 text-[11px]">Header Name</label>
                    <input
                      type="text"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                      placeholder="X-API-KEY"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1 text-[11px]">Header Value</label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded focus-within:border-primary h-8">
                      <VariableInput
                        value={headerValue}
                        onChange={setHeaderValue}
                        variables={activeVariables}
                        placeholder="{{API_KEY}}"
                        className="w-full h-full text-xs font-mono px-2.5 py-1"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-800/80 bg-zinc-900/60 select-none">
          <span className="text-[10px] text-zinc-500 font-mono">
            Ctrl+Enter to save
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={closeFolderSettingsModal}
              className="px-2.5 py-1 rounded text-zinc-400 hover:text-zinc-200 text-xs transition"
            >
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary hover:bg-primary-hover text-white text-xs font-medium transition disabled:opacity-50"
            >
              <Save size={12} />
              <span>{saveMutation.isPending ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
