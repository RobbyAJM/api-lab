import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ArrowDownUp,
  ArrowLeftRight,
  Search,
  X,
  Shield,
  Edit2,
  Check,
  FolderPlus,
  ChevronsDownUp,
  RefreshCw,
  Keyboard,
} from 'lucide-react';
import { GenerateGrpcModal } from './GenerateGrpcModal';
import { CollectionSettingsModal } from '../collections/CollectionSettingsModal';
import { SyncReflectionModal } from '../collections/SyncReflectionModal';
import {
  buildFolderTree,
  filterCollectionTree,
  type FolderTreeNode,
} from '../../utils/folderTree';

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
    setMembersModalOpen,
    setCommandPaletteOpen,
    setShortcutsHelpOpen,
  } = useAppStore();

  const [newCollectionName, setNewCollectionName] = useState('');
  const [showAddCollection, setShowAddCollection] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [showAddWs, setShowAddWs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapseSignal, setCollapseSignal] = useState(0);

  // Resizable sidebar state (New Feature 2)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('api_lab_sidebar_width');
    return saved ? Math.max(180, Math.min(500, Number(saved))) : 256;
  });
  const isResizingRef = useRef(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const next = Math.max(180, Math.min(500, moveEvent.clientX));
      setSidebarWidth(next);
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setSidebarWidth((w) => {
        localStorage.setItem('api_lab_sidebar_width', String(w));
        return w;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

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
  useEffect(() => {
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

  // Create Workspace
  const createWsMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest(`/workspaces`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setActiveWorkspaceId(data.id);
      setNewWsName('');
      setShowAddWs(false);
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

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className="relative bg-zinc-950 border-r border-zinc-800/80 flex flex-col h-full select-none text-zinc-300 flex-shrink-0"
    >
      {/* Workspace Switcher */}
      <div className="p-3 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex-1 mr-2 flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-300 border border-zinc-700/60 font-mono flex-shrink-0">
            {workspaces.find((w) => w.id === activeWorkspaceId)?.name?.[0]?.toUpperCase() || 'W'}
          </span>
          <select
            value={activeWorkspaceId || ''}
            onChange={(e) => setActiveWorkspaceId(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-semibold text-zinc-100 focus:outline-none focus:border-indigo-500 truncate"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name} ({ws.role})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowAddWs(!showAddWs)}
          className="p-1 hover:text-white rounded hover:bg-zinc-800 text-zinc-400"
          title="Create New Workspace"
        >
          <Plus size={14} />
        </button>
      </div>

      {showAddWs && (
        <div className="p-2 border-b border-zinc-800 flex gap-1 bg-zinc-900/60">
          <input
            type="text"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            placeholder="New workspace..."
            className="flex-1 bg-zinc-950 border border-zinc-700/60 rounded px-2 py-0.5 text-xs text-zinc-200"
          />
          <button
            onClick={() => newWsName.trim() && createWsMutation.mutate(newWsName.trim())}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded text-xs"
          >
            Add
          </button>
        </div>
      )}

      {/* Searchbar in Collection (Feature 5) */}
      <div className="px-3 py-2 border-b border-zinc-800/80 bg-zinc-900/40">
        <div className="relative flex items-center">
          <Search size={12} className="absolute left-2.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search collections & endpoints..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded pl-7 pr-12 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-zinc-500 hover:text-zinc-300"
            >
              <X size={11} />
            </button>
          ) : (
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="absolute right-1.5 flex items-center hover:opacity-80 transition"
              title="Open Command Palette (Ctrl+K)"
            >
              <kbd className="text-[9px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 select-none">
                Ctrl+K
              </kbd>
            </button>
          )}
        </div>
      </div>

      {/* Collections Header (Result V3) */}
      <div className="flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
          <span>Collections</span>
        </div>
        <div className="flex items-center gap-1 text-zinc-400">
          <button
            onClick={() => setCollapseSignal((s) => s + 1)}
            className="hover:text-zinc-200 p-0.5 rounded transition"
            title="Collapse All"
          >
            <ChevronsDownUp size={13} />
          </button>
          <button
            onClick={() => setShowAddCollection(!showAddCollection)}
            className="hover:text-zinc-200 p-0.5 rounded transition"
            title="New Collection"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {showAddCollection && (
        <div className="px-3 pb-2 flex gap-1">
          <input
            type="text"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="Collection name..."
            className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded px-2 py-0.5 text-xs text-zinc-200"
          />
          <button
            onClick={() =>
              newCollectionName.trim() &&
              createCollectionMutation.mutate(newCollectionName.trim())
            }
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded text-xs"
          >
            Add
          </button>
        </div>
      )}

      {/* Collections & Folders List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {collections.map((coll) => (
          <CollectionNode
            key={coll.id}
            collection={coll}
            searchQuery={searchQuery}
            collapseSignal={collapseSignal}
            onDelete={() => deleteCollectionMutation.mutate(coll.id)}
          />
        ))}
      </div>

      {/* Footer / User Profile (Result V3) */}
      <div className="p-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded bg-zinc-800 border border-zinc-700/80 flex items-center justify-center font-medium text-zinc-200 text-xs flex-shrink-0">
            {user?.name?.slice(0, 2).toUpperCase() || 'AD'}
          </div>
          <div className="truncate">
            <div className="font-medium text-zinc-200 truncate">{user?.name || 'Admin'}</div>
            <div className="text-[10px] text-zinc-500 font-mono truncate">{user?.email || 'admin@nutrade.internal'}</div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-zinc-400">
          <button
            onClick={() => setShortcutsHelpOpen(true)}
            className="p-1 hover:text-indigo-400 hover:bg-zinc-900 rounded transition"
            title="Keyboard Shortcuts (Ctrl+/)"
          >
            <Keyboard size={13} />
          </button>
          <button
            onClick={() => setMembersModalOpen(true)}
            className="p-1 hover:text-zinc-200 hover:bg-zinc-900 rounded transition"
            title="Workspace Members"
          >
            <Users size={13} />
          </button>
          <button
            onClick={logout}
            className="p-1 hover:text-red-400 hover:bg-zinc-900 rounded transition"
            title="Logout"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>

      {/* Horizontal Resizable Splitter Handle (New Feature 2) */}
      <div
        onMouseDown={startResizing}
        className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/80 active:bg-indigo-500 transition-colors z-40"
        title="Drag to resize sidebar width"
      />
    </aside>
  );
};

// Collection Node
const CollectionNode: React.FC<{
  collection: Collection;
  searchQuery: string;
  collapseSignal?: number;
  onDelete: () => void;
}> = ({ collection, searchQuery, collapseSignal = 0, onDelete }) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [showGrpcModal, setShowGrpcModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Collapse Collections/Folders button trigger (Feature 1)
  useEffect(() => {
    if (collapseSignal > 0) {
      setIsOpen(false);
    }
  }, [collapseSignal]);

  // Right-click context menu state (Fix for Bug 2)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Inline rename state (Fix for Bug 2)
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(collection.name);

  const [folderName, setFolderName] = useState('');
  const [endpointName, setEndpointName] = useState('');
  const [endpointProtocol, setEndpointProtocol] = useState<'http' | 'grpc' | 'grpc_reflection'>('http');
  const { activeEnvironmentId } = useAppStore();

  // Close context menu on outside click
  useEffect(() => {
    const handleClose = () => setContextMenuPos(null);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, []);

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

  const { activeEndpointId, setActiveEndpoint } = useAppStore();

  // Auto-restore last active endpoint strictly once on initial boot
  const hasAttemptedRestoreRef = useRef(false);
  useEffect(() => {
    if (!hasAttemptedRestoreRef.current && !activeEndpointId && endpoints.length > 0) {
      const savedId = localStorage.getItem('api_lab_active_endpoint_id');
      if (savedId) {
        const found = endpoints.find((ep) => ep.id === savedId);
        if (found) {
          hasAttemptedRestoreRef.current = true;
          setActiveEndpoint(found);
        }
      }
    }
  }, [endpoints, activeEndpointId, setActiveEndpoint]);

  const renameMutation = useMutation({
    mutationFn: (newName: string) =>
      apiRequest(`/collections/${collection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setIsRenaming(false);
    },
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
              : { server_address: 'localhost:50051', service: '', method: '', stream_type: 'unary', metadata: {}, payload: {} },
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints', collection.id] });
      setEndpointName('');
      setShowAddEndpoint(false);
    },
  });

  // Build recursive tree and apply search filter (Feature 2 & Feature 5)
  const fullTree = buildFolderTree(folders, endpoints);
  const { filteredTree, matchedFolderIds } = filterCollectionTree(fullTree, searchQuery);

  const hasCollectionMatch =
    !searchQuery ||
    collection.name.toLowerCase().includes(searchQuery.trim().toLowerCase());

  const hasItems =
    filteredTree.rootEndpoints.length > 0 || filteredTree.rootFolders.length > 0;

  const isExpanded = searchQuery ? hasCollectionMatch || hasItems : isOpen;

  if (searchQuery && !hasCollectionMatch && !hasItems) {
    return null;
  }

  function handleSaveRename() {
    if (renameValue.trim() && renameValue.trim() !== collection.name) {
      renameMutation.mutate(renameValue.trim());
    } else {
      setIsRenaming(false);
    }
  }

  return (
    <div
      className="rounded border border-zinc-900 bg-zinc-900/30 relative"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenuPos({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="flex items-center justify-between px-2 py-1.5 text-xs hover:bg-zinc-800/40 rounded group">
        {isRenaming ? (
          <div className="flex items-center gap-1 flex-1 py-0.5">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              autoFocus
              className="bg-zinc-950 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-zinc-100 flex-1 focus:outline-none"
            />
            <button onClick={handleSaveRename} className="p-1 hover:text-emerald-400 text-zinc-400">
              <Check size={12} />
            </button>
            <button onClick={() => setIsRenaming(false)} className="p-1 hover:text-zinc-200 text-zinc-500">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 text-zinc-200 font-medium truncate flex-1 text-left py-0.5"
          >
            {isExpanded ? (
              <ChevronDown size={13} className="text-zinc-400 flex-shrink-0" />
            ) : (
              <ChevronRight size={13} className="text-zinc-400 flex-shrink-0" />
            )}
            <span className="truncate font-semibold">{collection.name}</span>
            {collection.settings?.auth && collection.settings.auth.auth_type !== 'none' && (
              <span title="Shared Auth configured">
                <Shield size={11} className="text-indigo-400 flex-shrink-0" />
              </span>
            )}
          </button>
        )}

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
          <button
            onClick={() => setShowSettingsModal(true)}
            title="Collection Setting"
            className="p-1 hover:text-indigo-400 text-zinc-400"
          >
            <Settings size={12} />
          </button>
          <button
            onClick={() => setShowAddEndpoint(!showAddEndpoint)}
            title="Add Endpoint"
            className="p-1 hover:text-indigo-400 text-zinc-400"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={() => setShowAddFolder(!showAddFolder)}
            title="Add Folder"
            className="p-1 hover:text-amber-400 text-zinc-400"
          >
            <Folder size={12} />
          </button>
          <button onClick={onDelete} title="Delete Collection" className="p-1 hover:text-red-400 text-zinc-400">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Right-click Context Menu (Fix for Bug 2) */}
      {contextMenuPos && (
        <div
          style={{ top: `${contextMenuPos.y}px`, left: `${contextMenuPos.x}px` }}
          className="fixed z-50 bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl py-1 w-44 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setContextMenuPos(null);
              setIsRenaming(true);
              setRenameValue(collection.name);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <Edit2 size={12} className="text-zinc-400" />
            <span>Rename</span>
          </button>
          <button
            onClick={() => {
              setContextMenuPos(null);
              setShowSettingsModal(true);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <Settings size={12} className="text-indigo-400" />
            <span>Setting</span>
          </button>
          <div className="h-px bg-zinc-800 my-1" />
          <button
            onClick={() => {
              setContextMenuPos(null);
              setIsOpen(true);
              setShowAddEndpoint(true);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <Plus size={12} className="text-indigo-400" />
            <span>Add Endpoint</span>
          </button>
          <button
            onClick={() => {
              setContextMenuPos(null);
              setIsOpen(true);
              setShowAddFolder(true);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <Folder size={12} className="text-amber-400" />
            <span>Add Folder</span>
          </button>
          <button
            onClick={() => {
              setContextMenuPos(null);
              setShowGrpcModal(true);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <FolderPlus size={12} className="text-purple-400" />
            <span>Generate gRPC</span>
          </button>
          <button
            onClick={() => {
              setContextMenuPos(null);
              setShowSyncModal(true);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <RefreshCw size={12} className="text-cyan-400" />
            <span>Sync Reflection</span>
          </button>
          <div className="h-px bg-zinc-800 my-1" />
          <button
            onClick={() => {
              setContextMenuPos(null);
              onDelete();
            }}
            className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-950/40 flex items-center gap-2"
          >
            <Trash2 size={12} />
            <span>Delete Collection</span>
          </button>
        </div>
      )}

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
              onChange={(e) => {
                const val = e.target.value as 'http' | 'grpc' | 'grpc_reflection';
                setEndpointProtocol(val);
                if (val === 'grpc_reflection') {
                  setShowGrpcModal(true);
                }
              }}
              className="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-xs font-mono"
            >
              <option value="http">HTTP</option>
              <option value="grpc">gRPC</option>
              <option value="grpc_reflection">Generate gRPC</option>
            </select>
            {endpointProtocol !== 'grpc_reflection' && (
              <input
                type="text"
                value={endpointName}
                onChange={(e) => setEndpointName(e.target.value)}
                placeholder="Endpoint name"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
              />
            )}
            <button
              onClick={() => {
                if (endpointProtocol === 'grpc_reflection') {
                  setShowGrpcModal(true);
                } else if (endpointName.trim()) {
                  createEndpointMutation.mutate({
                    name: endpointName.trim(),
                    protocol: endpointProtocol,
                  });
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-500 px-2 rounded text-xs text-white"
              title={endpointProtocol === 'grpc_reflection' ? 'Generate gRPC' : 'Add Endpoint'}
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Generate gRPC Modal (Feature 3) */}
      <GenerateGrpcModal
        collectionId={collection.id}
        isOpen={showGrpcModal}
        onClose={() => {
          setShowGrpcModal(false);
          setShowAddEndpoint(false);
          setEndpointProtocol('http');
        }}
        activeEnvironmentId={activeEnvironmentId}
      />

      {/* Collection Settings Modal (Feature 4) */}
      <CollectionSettingsModal
        collection={collection}
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      {/* Sync Reflection Modal (Feature 3) */}
      <SyncReflectionModal
        collection={collection}
        folders={folders}
        endpoints={endpoints}
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
      />

      {/* Recursive Multi-Level Tree Rendering (Feature 2) */}
      {isExpanded && (
        <div className="pl-3 pr-1 pb-1 space-y-0.5">
          {/* Direct Collection Endpoints */}
          {filteredTree.rootEndpoints.map((endpoint) => (
            <EndpointItem key={endpoint.id} endpoint={endpoint} />
          ))}

          {/* Root Folders and their recursive children */}
          {filteredTree.rootFolders.map((node) => (
            <FolderTreeNodeComponent
              key={node.folder.id}
              node={node}
              collectionId={collection.id}
              expandedFolderIds={matchedFolderIds}
              collapseSignal={collapseSignal}
              level={0}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Recursive Folder Tree Node Component (Feature 2)
const FolderTreeNodeComponent: React.FC<{
  node: FolderTreeNode;
  collectionId: string;
  expandedFolderIds: Set<string>;
  collapseSignal?: number;
  level?: number;
}> = ({ node, collectionId, expandedFolderIds, collapseSignal = 0, level = 0 }) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [showAddSubFolder, setShowAddSubFolder] = useState(false);
  const [showAddSubEndpoint, setShowAddSubEndpoint] = useState(false);
  const [subFolderName, setSubFolderName] = useState('');
  const [subEndpointName, setSubEndpointName] = useState('');
  const [subEndpointProtocol, setSubEndpointProtocol] = useState<'http' | 'grpc'>('http');

  const isAutoExpanded = expandedFolderIds.has(node.folder.id) || isOpen;

  // Collapse Collections/Folders button trigger (Feature 1)
  useEffect(() => {
    if (collapseSignal > 0) {
      setIsOpen(false);
    }
  }, [collapseSignal]);

  const createSubFolderMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest(`/collections/${collectionId}/folders`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          parent_folder_id: node.folder.id,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', collectionId] });
      setSubFolderName('');
      setShowAddSubFolder(false);
    },
  });

  const createSubEndpointMutation = useMutation({
    mutationFn: (payload: { name: string; protocol: 'http' | 'grpc' }) =>
      apiRequest(`/collections/${collectionId}/endpoints`, {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          protocol: payload.protocol,
          folder_id: node.folder.id,
          config:
            payload.protocol === 'http'
              ? { method: 'GET', url: 'https://httpbin.org/get', headers: {}, query_params: [], body: '' }
              : { server_address: 'localhost:50051', service: '', method: '', stream_type: 'unary', metadata: {}, payload: {} },
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints', collectionId] });
      setSubEndpointName('');
      setShowAddSubEndpoint(false);
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/folders/${node.folder.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['endpoints', collectionId] });
    },
  });

  return (
    <div className="pl-1">
      <div className="flex items-center justify-between w-full py-1 text-xs text-zinc-400 hover:text-zinc-200 group rounded hover:bg-zinc-800/30 px-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 truncate flex-1 text-left"
        >
          {isAutoExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Folder size={12} className="text-amber-400/80 flex-shrink-0" />
          <span className="truncate">{node.folder.name}</span>
        </button>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
          <button
            onClick={() => setShowAddSubEndpoint(!showAddSubEndpoint)}
            title="Add Endpoint in this folder"
            className="p-0.5 hover:text-indigo-400"
          >
            <Plus size={11} />
          </button>
          <button
            onClick={() => setShowAddSubFolder(!showAddSubFolder)}
            title="Add Subfolder"
            className="p-0.5 hover:text-amber-400"
          >
            <Folder size={11} />
          </button>
          <button
            onClick={() => deleteFolderMutation.mutate()}
            title="Delete Folder"
            className="p-0.5 hover:text-red-400"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {showAddSubFolder && (
        <div className="p-1 pl-4 flex gap-1 bg-zinc-900/60 border-t border-zinc-800 my-1 rounded">
          <input
            type="text"
            value={subFolderName}
            onChange={(e) => setSubFolderName(e.target.value)}
            placeholder="Subfolder name"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
          />
          <button
            onClick={() => subFolderName.trim() && createSubFolderMutation.mutate(subFolderName.trim())}
            className="bg-indigo-600 px-2 rounded text-xs text-white"
          >
            +
          </button>
        </div>
      )}

      {showAddSubEndpoint && (
        <div className="p-1 pl-4 flex gap-1 bg-zinc-900/60 border-t border-zinc-800 my-1 rounded">
          <select
            value={subEndpointProtocol}
            onChange={(e) => setSubEndpointProtocol(e.target.value as any)}
            className="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-xs font-mono"
          >
            <option value="http">HTTP</option>
            <option value="grpc">gRPC</option>
          </select>
          <input
            type="text"
            value={subEndpointName}
            onChange={(e) => setSubEndpointName(e.target.value)}
            placeholder="Endpoint name"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
          />
          <button
            onClick={() =>
              subEndpointName.trim() &&
              createSubEndpointMutation.mutate({
                name: subEndpointName.trim(),
                protocol: subEndpointProtocol,
              })
            }
            className="bg-indigo-600 px-2 rounded text-xs text-white"
          >
            +
          </button>
        </div>
      )}

      {isAutoExpanded && (
        <div className="pl-3 space-y-0.5 border-l border-zinc-800/60 ml-2">
          {/* Child Endpoints */}
          {node.endpoints.map((ep) => (
            <EndpointItem key={ep.id} endpoint={ep} />
          ))}

          {/* Recursive Child Folders */}
          {node.children.map((childNode) => (
            <FolderTreeNodeComponent
              key={childNode.folder.id}
              node={childNode}
              collectionId={collectionId}
              expandedFolderIds={expandedFolderIds}
              collapseSignal={collapseSignal}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Individual Endpoint item with 3 gRPC stream icons (Feature 1 & Feature 2)
const EndpointItem: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const { activeEndpointId, setActiveEndpoint } = useAppStore();
  const isActive = activeEndpointId === endpoint.id;

  const method = endpoint.protocol === 'http' ? endpoint.config?.method || 'GET' : 'gRPC';
  const streamType = endpoint.config?.stream_type || 'unary';

  return (
    <button
      onClick={() => {
        setActiveEndpoint(endpoint);
        localStorage.setItem('api_lab_active_endpoint_id', endpoint.id);
      }}
      className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition text-left group ${
        isActive
          ? 'bg-indigo-950/50 text-indigo-100 font-medium border border-indigo-500/40 shadow-sm shadow-indigo-950/50'
          : 'hover:bg-zinc-900 text-zinc-300 hover:text-white'
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
        ) : streamType === 'bidi_stream' ? (
          /* gRPC Stream Bidirectional Icon (Yellow badge) */
          <span
            title="gRPC Bidirectional Stream"
            className="text-[9px] font-bold font-mono px-1 rounded text-amber-300 bg-amber-950/60 border border-amber-800/60 flex items-center gap-0.5"
          >
            <ArrowLeftRight size={9} /> STREAM
          </span>
        ) : streamType === 'omni_stream' ? (
          /* gRPC Stream Omnidirectional Icon (Yellow badge) */
          <span
            title="gRPC Omnidirectional Stream"
            className="text-[9px] font-bold font-mono px-1 rounded text-amber-300 bg-amber-950/60 border border-amber-800/60 flex items-center gap-0.5"
          >
            <ArrowDownUp size={9} /> STREAM
          </span>
        ) : (
          /* gRPC Unary Icon (Indigo badge) */
          <span
            title="gRPC Unary Call"
            className="text-[9px] font-bold font-mono px-1 rounded text-indigo-300 bg-indigo-950/70 border border-indigo-700/50 flex items-center gap-0.5"
          >
            <Radio size={9} /> gRPC
          </span>
        )}
        <span className="truncate">{endpoint.name}</span>
      </div>

      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30 flex-shrink-0 ml-1" />
      )}
    </button>
  );
};
