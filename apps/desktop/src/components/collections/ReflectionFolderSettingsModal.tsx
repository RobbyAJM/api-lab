import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { VariableInput } from '../common/VariableInput';
import { getFolderGrpcUrl } from '../../utils/folderTree';
import type { Collection, CollectionFolder, VariableResponse } from '@api-lab/api-types';
import { X, Settings, Save, Info } from 'lucide-react';

export const ReflectionFolderSettingsModal: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    reflectionSettingsModal,
    closeReflectionSettingsModal,
    activeEnvironmentId,
  } = useAppStore();

  const folderId = reflectionSettingsModal?.folderId;
  const collectionId = reflectionSettingsModal?.collectionId;
  const isOpen = Boolean(reflectionSettingsModal?.isOpen && folderId && collectionId);

  // Fetch folders of collection
  const { data: folders = [] } = useQuery<CollectionFolder[]>({
    queryKey: ['folders', collectionId],
    queryFn: () => apiRequest<CollectionFolder[]>(`/collections/${collectionId}/folders`),
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

  const folder = folders.find((f) => f.id === folderId);

  const [folderName, setFolderName] = useState('');
  const [serverAddress, setServerAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (folder) {
      setFolderName(folder.name || '');
      const addr = getFolderGrpcUrl(folder, collection?.settings) || '';
      setServerAddress(addr);
      setError(null);
    }
  }, [folder, collection]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = folderName.trim();
      const trimmedAddr = serverAddress.trim();
      if (!trimmedName) {
        throw new Error('Folder name cannot be empty');
      }
      if (!trimmedAddr) {
        throw new Error('gRPC server address cannot be empty');
      }

      // 1. Update folder direct grpc_url and name
      const updatedFolder = await apiRequest<CollectionFolder>(`/folders/${folderId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmedName,
          grpc_url: trimmedAddr,
        }),
      });

      // 2. Also sync collection.settings.grpc_sources for backward compatibility
      if (collection) {
        const currentSettings = (collection.settings as any) || {};
        const sources = { ...(currentSettings.grpc_sources || {}) };
        if (sources[folderId!]) {
          sources[folderId!] = {
            ...sources[folderId!],
            server_address: trimmedAddr,
          };
          await apiRequest(`/collections/${collectionId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              settings: {
                ...currentSettings,
                grpc_sources: sources,
              },
            }),
          });
        }
      }

      return updatedFolder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['endpoints', collectionId] });
      closeReflectionSettingsModal();
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to update reflection settings');
    },
  });

  if (!isOpen || !folder) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 font-sans"
      onClick={closeReflectionSettingsModal}
      onKeyDown={(e) => {
        if (e.key === 'Escape') closeReflectionSettingsModal();
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
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-xs">
              <Settings size={13} />
            </div>
            <h2 className="text-xs font-semibold text-zinc-200">
              Reflection Settings — {folder.name}
            </h2>
          </div>
          <button
            onClick={closeReflectionSettingsModal}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition"
          >
            <X size={14} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 space-y-3.5 text-xs">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/50 border border-rose-800/60 text-rose-300 text-[11px]">
              {error}
            </div>
          )}

          {/* Folder Name */}
          <div>
            <label className="block text-zinc-400 font-medium mb-1 text-[11px]">
              Folder Name
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Reflection Folder Name"
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 text-xs focus:border-primary focus:outline-none"
            />
          </div>

          {/* gRPC Server Address */}
          <div>
            <label className="block text-zinc-400 font-medium mb-1 text-[11px]">
              gRPC Server Address
            </label>
            <div className="rounded border border-zinc-800 bg-zinc-900 focus-within:border-primary transition">
              <VariableInput
                value={serverAddress}
                onChange={setServerAddress}
                variables={envVars}
                placeholder="localhost:50051 or {{GRPC_HOST}}"
                className="w-full h-8 px-2.5"
                inputClassName="text-xs"
              />
            </div>
          </div>

          {/* Informational banner about inheritance */}
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-zinc-900/80 border border-zinc-800/80 text-zinc-400 text-[11px] leading-relaxed">
            <Info size={14} className="text-primary mt-0.5 flex-shrink-0" />
            <span>
              All endpoints inside this reflection folder automatically inherit this gRPC server address.
              Updating it here updates all descendant endpoints at once.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-800/80 bg-zinc-900/40 select-none">
          <span className="text-[10px] text-zinc-500 font-mono">
            Ctrl+Enter to save
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeReflectionSettingsModal}
              disabled={saveMutation.isPending}
              className="px-3 py-1 text-zinc-400 hover:text-zinc-200 text-xs rounded hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !folderName.trim() || !serverAddress.trim()}
              className="flex items-center gap-1.5 px-3 py-1 bg-primary hover:bg-primary-hover text-primary-foreground font-medium text-xs rounded transition disabled:opacity-50 cursor-pointer"
            >
              <Save size={12} />
              <span>{saveMutation.isPending ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
