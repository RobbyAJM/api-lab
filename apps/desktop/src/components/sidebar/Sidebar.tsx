import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type {
  Collection,
  CollectionFolder,
  Endpoint,
  Environment,
} from '@api-lab/api-types';
import {
  Folder,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Users,
  Settings,
  LogOut,
  Radio,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    user,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeEnvironmentId,
    setActiveEnvironmentId,
    logout,
    setEnvModalOpen,
    setMembersModalOpen,
  } = useAppStore();

  const [newCollectionName, setNewCollectionName] = useState('');
  const [showAddCollection, setShowAddCollection] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [showAddWs, setShowAddWs] = useState(false);

  // 1. Fetch environments for active workspace
  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest(`/workspaces/${activeWorkspaceId}/environments`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId,
  });

  // Auto-select default environment if none selected
  React.useEffect(() => {
    if (environments.length > 0 && !activeEnvironmentId) {
      const def = environments.find((e) => e.is_default) || environments[0];
      setActiveEnvironmentId(def.id);
    }
  }, [environments, activeEnvironmentId, setActiveEnvironmentId]);

  // 2. Fetch collections for active workspace
  const { data: collections = [] } = useQuery<Collection[]>({
    queryKey: ['collections', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest(`/workspaces/${activeWorkspaceId}/collections`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId,
  });

  // Create Collection
  const createCollectionMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest<Collection>(`/workspaces/${activeWorkspaceId}/collections`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections', activeWorkspaceId] });
      setNewCollectionName('');
      setShowAddCollection(false);
    },
  });

  // Delete Collection
  const deleteCollectionMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/collections/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections', activeWorkspaceId] });
    },
  });

  // Create Workspace
  const createWsMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest<any>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setActiveWorkspaceId(data.id);
      setNewWsName('');
      setShowAddWs(false);
    },
  });

  return (
    <aside className="w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col h-screen select-none text-zinc-300">
      {/* Top Header: Workspace & Environment */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold tracking-wider uppercase text-zinc-500">
            Workspace
          </label>
          <button
            onClick={() => setShowAddWs(!showAddWs)}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
            title="Create workspace"
          >
            <Plus size={12} /> New
          </button>
        </div>

        {showAddWs && (
          <div className="flex gap-1 pb-1">
            <input
              type="text"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="Workspace name"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => newWsName.trim() && createWsMutation.mutate(newWsName.trim())}
              className="bg-indigo-600 px-2 py-1 rounded text-xs text-white"
            >
              Add
            </button>
          </div>
        )}

        <select
          value={activeWorkspaceId || ''}
          onChange={(e) => setActiveWorkspaceId(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-100 font-medium focus:outline-none focus:border-indigo-500"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.role})
            </option>
          ))}
        </select>

        {/* Environment Selector */}
        <div className="flex items-center gap-1.5 pt-1">
          <select
            value={activeEnvironmentId || ''}
            onChange={(e) => setActiveEnvironmentId(e.target.value || null)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="">No Environment</option>
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name} {env.is_default ? '★' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => setEnvModalOpen(true)}
            title="Manage Environments"
            className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between text-xs">
        <span className="font-semibold text-zinc-400">Collections</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMembersModalOpen(true)}
            title="Workspace Members"
            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded flex items-center gap-1"
          >
            <Users size={13} />
            <span className="text-[11px]">Members</span>
          </button>
          <button
            onClick={() => setShowAddCollection(!showAddCollection)}
            title="New Collection"
            className="p-1 hover:bg-zinc-800 text-indigo-400 hover:text-indigo-300 rounded flex items-center gap-0.5"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {showAddCollection && (
        <div className="p-2 border-b border-zinc-800 bg-zinc-900/50 flex gap-1">
          <input
            type="text"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="Collection name"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() =>
              newCollectionName.trim() && createCollectionMutation.mutate(newCollectionName.trim())
            }
            className="bg-indigo-600 px-2 py-1 rounded text-xs text-white"
          >
            Add
          </button>
        </div>
      )}

      {/* Collection Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {collections.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs">
            No collections yet. Click + to create one.
          </div>
        ) : (
          collections.map((coll) => (
            <CollectionNode
              key={coll.id}
              collection={coll}
              onDelete={() => deleteCollectionMutation.mutate(coll.id)}
            />
          ))
        )}
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-zinc-800 flex items-center justify-between bg-zinc-950/80 text-xs">
        <div className="truncate pr-2">
          <div className="font-medium text-zinc-200 truncate">{user?.name}</div>
          <div className="text-[10px] text-zinc-500 truncate">{user?.email}</div>
        </div>
        <button
          onClick={logout}
          title="Sign Out"
          className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 rounded transition"
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
};

// Sub-component for individual collection
const CollectionNode: React.FC<{
  collection: Collection;
  onDelete: () => void;
}> = ({ collection, onDelete }) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [endpointName, setEndpointName] = useState('');
  const [endpointProtocol, setEndpointProtocol] = useState<'http' | 'grpc'>('http');

  // Fetch Folders
  const { data: folders = [] } = useQuery<CollectionFolder[]>({
    queryKey: ['folders', collection.id],
    queryFn: () => apiRequest(`/collections/${collection.id}/folders`),
  });

  // Fetch Endpoints
  const { data: endpoints = [] } = useQuery<Endpoint[]>({
    queryKey: ['endpoints', collection.id],
    queryFn: () => apiRequest(`/collections/${collection.id}/endpoints`),
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest(`/collections/${collection.id}/folders`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', collection.id] });
      setFolderName('');
      setShowAddFolder(false);
    },
  });

  const createEndpointMutation = useMutation({
    mutationFn: (payload: { name: string; protocol: 'http' | 'grpc' }) =>
      apiRequest(`/collections/${collection.id}/endpoints`, {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          protocol: payload.protocol,
          folder_id: null,
          config:
            payload.protocol === 'http'
              ? { method: 'GET', url: 'https://httpbin.org/get', headers: {}, query_params: [], body: '' }
              : { server_address: 'localhost:50051', service: '', method: '', metadata: {}, payload: {} },
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints', collection.id] });
      setEndpointName('');
      setShowAddEndpoint(false);
    },
  });

  return (
    <div className="rounded border border-zinc-900 bg-zinc-900/30">
      <div className="flex items-center justify-between px-2 py-1.5 text-xs hover:bg-zinc-800/40 rounded group">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 text-zinc-200 font-medium truncate flex-1 text-left"
        >
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className="truncate">{collection.name}</span>
        </button>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
          <button
            onClick={() => setShowAddEndpoint(!showAddEndpoint)}
            title="Add Endpoint"
            className="p-1 hover:text-indigo-400"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={() => setShowAddFolder(!showAddFolder)}
            title="Add Folder"
            className="p-1 hover:text-amber-400"
          >
            <Folder size={12} />
          </button>
          <button onClick={onDelete} title="Delete Collection" className="p-1 hover:text-red-400">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {showAddFolder && (
        <div className="p-1.5 pl-4 flex gap-1 bg-zinc-900/60 border-t border-zinc-800">
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Folder name"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
          />
          <button
            onClick={() => folderName.trim() && createFolderMutation.mutate(folderName.trim())}
            className="bg-indigo-600 px-2 rounded text-xs text-white"
          >
            +
          </button>
        </div>
      )}

      {showAddEndpoint && (
        <div className="p-1.5 pl-4 flex flex-col gap-1 bg-zinc-900/60 border-t border-zinc-800">
          <div className="flex gap-1">
            <select
              value={endpointProtocol}
              onChange={(e) => setEndpointProtocol(e.target.value as any)}
              className="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-xs font-mono"
            >
              <option value="http">HTTP</option>
              <option value="grpc">gRPC</option>
            </select>
            <input
              type="text"
              value={endpointName}
              onChange={(e) => setEndpointName(e.target.value)}
              placeholder="Endpoint name"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
            />
            <button
              onClick={() =>
                endpointName.trim() &&
                createEndpointMutation.mutate({
                  name: endpointName.trim(),
                  protocol: endpointProtocol,
                })
              }
              className="bg-indigo-600 px-2 rounded text-xs text-white"
            >
              +
            </button>
          </div>
        </div>
      )}

      {isOpen && (
        <div className="pl-3 pr-1 pb-1 space-y-0.5">
          {/* Direct Collection Endpoints */}
          {endpoints
            .filter((e) => !e.folder_id)
            .map((endpoint) => (
              <EndpointItem key={endpoint.id} endpoint={endpoint} />
            ))}

          {/* Folders */}
          {folders.map((folder) => (
            <FolderNode key={folder.id} folder={folder} endpoints={endpoints} />
          ))}
        </div>
      )}
    </div>
  );
};

// Folder item
const FolderNode: React.FC<{
  folder: CollectionFolder;
  endpoints: Endpoint[];
}> = ({ folder, endpoints }) => {
  const [isOpen, setIsOpen] = useState(true);
  const folderEndpoints = endpoints.filter((e) => e.folder_id === folder.id);

  return (
    <div className="pl-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 w-full text-left py-1 text-xs text-zinc-400 hover:text-zinc-200"
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Folder size={12} className="text-amber-400/80" />
        <span className="truncate">{folder.name}</span>
      </button>
      {isOpen && (
        <div className="pl-3 space-y-0.5">
          {folderEndpoints.map((ep) => (
            <EndpointItem key={ep.id} endpoint={ep} />
          ))}
        </div>
      )}
    </div>
  );
};

// Individual Endpoint item
const EndpointItem: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const { activeEndpointId, setActiveEndpoint } = useAppStore();
  const isActive = activeEndpointId === endpoint.id;

  const method = endpoint.protocol === 'http' ? endpoint.config?.method || 'GET' : 'gRPC';

  return (
    <button
      onClick={() => setActiveEndpoint(endpoint)}
      className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition text-left group ${
        isActive
          ? 'bg-indigo-950/70 text-indigo-200 font-medium border border-indigo-800/60'
          : 'hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200'
      }`}
    >
      <div className="flex items-center gap-1.5 truncate">
        {endpoint.protocol === 'http' ? (
          <span
            className={`text-[9px] font-bold font-mono px-1 rounded ${
              method === 'GET'
                ? 'text-emerald-400 bg-emerald-950/50'
                : method === 'POST'
                ? 'text-blue-400 bg-blue-950/50'
                : method === 'PUT' || method === 'PATCH'
                ? 'text-amber-400 bg-amber-950/50'
                : 'text-red-400 bg-red-950/50'
            }`}
          >
            {method}
          </span>
        ) : (
          <span className="text-[9px] font-bold font-mono px-1 rounded text-purple-400 bg-purple-950/50 flex items-center gap-0.5">
            <Radio size={9} /> gRPC
          </span>
        )}
        <span className="truncate">{endpoint.name}</span>
      </div>
    </button>
  );
};
