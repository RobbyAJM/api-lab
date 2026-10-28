import React, { useState, useEffect, useRef, useCallback } from 'react';
import appLogo from '../../assets/api-lab-logo.png';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { Avatar } from '../common/Avatar';
import type {
  Collection,
  CollectionFolder,
  Endpoint,
  Environment,
} from '@api-lab/api-types';
import {
  Folder,
  FolderSync,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Settings,
  Radio,
  ArrowDownUp,
  ArrowLeftRight,
  X,
  Shield,
  Edit2,
  Check,
  FolderPlus,
  ChevronsDownUp,
  RefreshCw,
  Globe,
} from 'lucide-react';
import { GenerateGrpcModal } from './GenerateGrpcModal';
import { GenerateSwaggerModal } from './GenerateSwaggerModal';
import { Select } from '../common/Select';
import { CollectionSettingsModal } from '../collections/CollectionSettingsModal';
import { SyncReflectionModal } from '../collections/SyncReflectionModal';
import { SyncSwaggerModal } from '../collections/SyncSwaggerModal';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { closeAllContextMenus, CONTEXT_MENU_CLOSE_EVENT } from '../../utils/contextMenu';
import { getHttpMethodColor } from '../../utils/httpMethodUtils';
import {
  buildFolderTree,
  filterCollectionTree,
  isReflectionFolder,
  getFolderGrpcUrl,
  isSwaggerFolder,
  getFolderSwaggerUrl,
  getAncestorFolderIds,
  isCollectionHighlighted,
  type FolderTreeNode,
} from '../../utils/folderTree';
import {
  validateCollectionName,
  buildCreateCollectionPayload,
} from '../../utils/collectionCreation';

export const Sidebar: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    user,
    activeWorkspaceId,
    activeEnvironmentId,
    setActiveEnvironmentId,
    setAppSettingsOpen,
    setAppSettingsTab,
  } = useAppStore();

  const searchQuery = '';
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

  // Delete Collection
  const [collectionToDelete, setCollectionToDelete] = useState<{ id: string; name: string } | null>(null);
  const deleteCollectionMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/collections/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections', activeWorkspaceId] });
      setCollectionToDelete(null);
    },
  });

  // Create Collection
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [createCollectionError, setCreateCollectionError] = useState<string | null>(null);

  const createCollectionMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest(`/workspaces/${activeWorkspaceId}/collections`, {
        method: 'POST',
        body: JSON.stringify(buildCreateCollectionPayload(name)),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections', activeWorkspaceId] });
      setNewCollectionName('');
      setCreateCollectionError(null);
      setIsCreatingCollection(false);
    },
    onError: (err: any) => {
      setCreateCollectionError(err.message || 'Failed to create collection');
    },
  });

  const handleCreateCollection = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeWorkspaceId) return;
    const validation = validateCollectionName(newCollectionName);
    if (!validation.valid) {
      setCreateCollectionError(validation.error || 'Invalid collection name');
      return;
    }
    setCreateCollectionError(null);
    createCollectionMutation.mutate(validation.name);
  };

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className="relative bg-zinc-950 border-r border-zinc-800/60 flex flex-col h-full select-none text-zinc-300 flex-shrink-0"
    >
      {/* Brand Header */}
      <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center justify-between bg-zinc-950">
        <div className="flex items-center gap-2">
          <img src={appLogo} alt="API Lab" className="w-5 h-5 rounded object-contain" />
          <span className="font-semibold text-xs text-zinc-100 tracking-tight">API Lab</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 font-medium">
          v0.1.0
        </span>
      </div>

      {/* Collections Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1 text-[10px] font-semibold text-zinc-500 tracking-wider uppercase select-none">
        <span>Collections</span>
        <div className="flex items-center gap-1 text-zinc-400">
          <button
            onClick={() => {
              setIsCreatingCollection((prev) => !prev);
              setNewCollectionName('');
              setCreateCollectionError(null);
            }}
            className="hover:text-zinc-200 p-0.5 rounded transition"
            title="New Collection"
          >
            <FolderPlus size={13} />
          </button>
          <button
            onClick={() => setCollapseSignal((s) => s + 1)}
            className="hover:text-zinc-200 p-0.5 rounded transition"
            title="Collapse All"
          >
            <ChevronsDownUp size={13} />
          </button>
        </div>
      </div>

      {/* Collections & Folders List */}
      <div className="flex-1 overflow-y-auto pl-2 pr-1.5 space-y-1 min-h-0">
        {isCreatingCollection && (
          <div className="p-1.5 pl-2 flex flex-col gap-1 bg-zinc-900/60 border border-zinc-800 rounded mb-1">
            <div className="flex items-center gap-1">
              <Folder size={12} className="text-zinc-400 flex-shrink-0" />
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => {
                  setNewCollectionName(e.target.value);
                  if (createCollectionError) setCreateCollectionError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateCollection();
                  if (e.key === 'Escape') {
                    setIsCreatingCollection(false);
                    setNewCollectionName('');
                    setCreateCollectionError(null);
                  }
                }}
                placeholder="Collection name..."
                autoFocus
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
              />
              <button
                type="button"
                onClick={() => handleCreateCollection()}
                disabled={!newCollectionName.trim() || createCollectionMutation.isPending}
                className="p-1 hover:text-emerald-400 text-zinc-400 disabled:opacity-40 transition"
                title="Save"
              >
                <Check size={12} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingCollection(false);
                  setNewCollectionName('');
                  setCreateCollectionError(null);
                }}
                className="p-1 hover:text-zinc-200 text-zinc-400 transition"
                title="Cancel"
              >
                <X size={12} />
              </button>
            </div>
            {createCollectionError && (
              <span className="text-[10px] text-red-400 font-mono pl-4">{createCollectionError}</span>
            )}
          </div>
        )}
        {collections.map((coll) => (
          <CollectionNode
            key={coll.id}
            collection={coll}
            searchQuery={searchQuery}
            collapseSignal={collapseSignal}
            onDelete={() => setCollectionToDelete({ id: coll.id, name: coll.name })}
          />
        ))}
      </div>

      {/* Footer / User Profile */}
      <div className="p-2 border-t border-zinc-800/60 flex items-center justify-between text-xs bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar avatar={user?.avatar} name={user?.name} size={24} />
          <div className="truncate min-w-0">
            <div className="font-medium text-zinc-200 text-xs truncate leading-tight">{user?.name || 'Admin'}</div>
            <div className="text-[10px] text-zinc-500 font-mono truncate leading-tight">{user?.email || 'admin@nutrade.internal'}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setAppSettingsTab('profile');
            setAppSettingsOpen(true);
          }}
          className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 rounded transition flex-shrink-0"
          title="App settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Horizontal Resizable Splitter Handle (New Feature 2) */}
      <div
        onMouseDown={startResizing}
        className="absolute top-0 -right-1 bottom-0 w-2 cursor-col-resize hover:bg-zinc-700/60 active:bg-zinc-600 transition-colors z-40"
        title="Drag to resize sidebar width"
      />

      <ConfirmDeleteModal
        isOpen={!!collectionToDelete}
        type="collection"
        name={collectionToDelete?.name}
        isPending={deleteCollectionMutation.isPending}
        onConfirm={async () => {
          if (collectionToDelete) {
            await deleteCollectionMutation.mutateAsync(collectionToDelete.id);
          }
        }}
        onClose={() => setCollectionToDelete(null)}
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
  const [syncTargetFolderId, setSyncTargetFolderId] = useState<string | undefined>(undefined);
  const [showSwaggerModal, setShowSwaggerModal] = useState(false);
  const [showSwaggerSyncModal, setShowSwaggerSyncModal] = useState(false);
  const [syncTargetSwaggerFolderId, setSyncTargetSwaggerFolderId] = useState<string | undefined>(undefined);

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
  const [endpointProtocol, setEndpointProtocol] = useState<'http' | 'grpc' | 'grpc_reflection' | 'swagger'>('http');
  const { activeEnvironmentId } = useAppStore();

  // Close context menu on outside click or global close event
  useEffect(() => {
    const handleClose = () => setContextMenuPos(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener(CONTEXT_MENU_CLOSE_EVENT, handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener(CONTEXT_MENU_CLOSE_EVENT, handleClose);
    };
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

  const { activeEndpointId, activeEndpoint, setActiveEndpoint, revealedFolderId } = useAppStore();
  const isCollHighlighted = isCollectionHighlighted(collection.id, activeEndpoint);
  const containsRevealedFolder = Boolean(revealedFolderId && folders.some((f) => f.id === revealedFolderId));
  const highlightedFolderIds = React.useMemo(() => {
    const ids = isCollHighlighted
      ? getAncestorFolderIds(folders, activeEndpoint?.folder_id)
      : new Set<string>();
    if (containsRevealedFolder && revealedFolderId) {
      const revealedAncestors = getAncestorFolderIds(folders, revealedFolderId);
      for (const id of revealedAncestors) {
        ids.add(id);
      }
    }
    return ids;
  }, [isCollHighlighted, folders, activeEndpoint?.folder_id, containsRevealedFolder, revealedFolderId]);

  useEffect(() => {
    if (isCollHighlighted || containsRevealedFolder) {
      setIsOpen(true);
    }
  }, [isCollHighlighted, containsRevealedFolder, activeEndpointId]);

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
      className="relative"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllContextMenus();
        setContextMenuPos({ x: e.clientX, y: e.clientY });
      }}
    >
      <div
        className={`flex items-center justify-between px-2 py-1 text-xs rounded-md group transition ${
          isCollHighlighted
            ? 'bg-zinc-900/80 border border-zinc-800/80 text-zinc-100'
            : 'hover:bg-zinc-900/70 text-zinc-300'
        }`}
      >
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
              className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-100 flex-1 focus:outline-none"
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
              <ChevronDown size={13} className="text-zinc-500 flex-shrink-0" />
            ) : (
              <ChevronRight size={13} className="text-zinc-500 flex-shrink-0" />
            )}
            <span
              className={`truncate font-semibold ${
                isCollHighlighted ? 'text-white' : 'text-zinc-100'
              }`}
            >
              {collection.name}
            </span>
            {isCollHighlighted && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"
                title="Contains active endpoint"
              />
            )}
            {collection.settings?.auth && collection.settings.auth.auth_type !== 'none' && (
              <span title="Shared Auth configured">
                <Shield size={11} className="text-secondary flex-shrink-0" />
              </span>
            )}
          </button>
        )}

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
          <button
            onClick={() => setShowSettingsModal(true)}
            title="Collection Setting"
            className="p-1 hover:text-zinc-200 text-zinc-500"
          >
            <Settings size={12} />
          </button>
          <button
            onClick={() => setShowAddEndpoint(!showAddEndpoint)}
            title="Add Endpoint"
            className="p-1 hover:text-zinc-200 text-zinc-500"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={() => setShowAddFolder(!showAddFolder)}
            title="Add Folder"
            className="p-1 hover:text-amber-400 text-zinc-500"
          >
            <Folder size={12} />
          </button>
          <button onClick={onDelete} title="Delete Collection" className="p-1 hover:text-red-400 text-zinc-500">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Right-click Context Menu (Fix for Bug 2) */}
      {contextMenuPos && (
        <div
          style={{ top: `${contextMenuPos.y}px`, left: `${contextMenuPos.x}px` }}
          className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl py-1 w-44 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
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
            <Settings size={12} className="text-zinc-400" />
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
            <Plus size={12} className="text-zinc-400" />
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
            <FolderPlus size={12} className="text-secondary" />
            <span>Generate gRPC</span>
          </button>
          <button
            onClick={() => {
              setContextMenuPos(null);
              setShowSwaggerModal(true);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <Globe size={12} className="text-emerald-400" />
            <span>Generate Swagger</span>
          </button>
          <button
            onClick={() => {
              setContextMenuPos(null);
              setShowSyncModal(true);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <RefreshCw size={12} className="text-zinc-400" />
            <span>Sync Reflection</span>
          </button>
          <button
            onClick={() => {
              setContextMenuPos(null);
              setShowSwaggerSyncModal(true);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <RefreshCw size={12} className="text-emerald-400" />
            <span>Sync Swagger</span>
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
            className="bg-primary hover:bg-primary-hover px-2 rounded text-xs text-white"
          >
            +
          </button>
        </div>
      )}

      {showAddEndpoint && (
        <div className="p-1.5 pl-4 flex flex-col gap-1 bg-zinc-900/60 border-t border-zinc-800">
          <div className="flex gap-1 items-center">
            <Select
              value={endpointProtocol}
              onChange={(val) => {
                const p = val as 'http' | 'grpc' | 'grpc_reflection' | 'swagger';
                setEndpointProtocol(p);
                if (p === 'grpc_reflection') {
                  setShowGrpcModal(true);
                } else if (p === 'swagger') {
                  setShowSwaggerModal(true);
                }
              }}
              options={[
                { value: 'http', label: 'HTTP' },
                { value: 'grpc', label: 'gRPC' },
                { value: 'grpc_reflection', label: 'Generate gRPC' },
                { value: 'swagger', label: 'Generate Swagger' },
              ]}
              size="xs"
              fontMono
              className="w-32 flex-shrink-0"
            />
            {endpointProtocol !== 'grpc_reflection' && endpointProtocol !== 'swagger' && (
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
                } else if (endpointProtocol === 'swagger') {
                  setShowSwaggerModal(true);
                } else if (endpointName.trim()) {
                  createEndpointMutation.mutate({
                    name: endpointName.trim(),
                    protocol: endpointProtocol,
                  });
                }
              }}
              className="bg-primary hover:bg-primary-hover px-2 rounded text-xs text-white"
              title={
                endpointProtocol === 'grpc_reflection'
                  ? 'Generate gRPC'
                  : endpointProtocol === 'swagger'
                  ? 'Generate Swagger'
                  : 'Add Endpoint'
              }
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

      {/* Generate Swagger Modal */}
      <GenerateSwaggerModal
        collectionId={collection.id}
        isOpen={showSwaggerModal}
        onClose={() => {
          setShowSwaggerModal(false);
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
        onClose={() => {
          setShowSyncModal(false);
          setSyncTargetFolderId(undefined);
        }}
        initialFolderId={syncTargetFolderId}
      />

      {/* Sync Swagger Modal */}
      <SyncSwaggerModal
        collection={collection}
        folders={folders}
        endpoints={endpoints}
        isOpen={showSwaggerSyncModal}
        onClose={() => {
          setShowSwaggerSyncModal(false);
          setSyncTargetSwaggerFolderId(undefined);
        }}
        initialFolderId={syncTargetSwaggerFolderId}
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
              collectionSettings={collection.settings}
              expandedFolderIds={matchedFolderIds}
              highlightedFolderIds={highlightedFolderIds}
              collapseSignal={collapseSignal}
              level={0}
              onSyncReflection={(folderId) => {
                setSyncTargetFolderId(folderId);
                setShowSyncModal(true);
              }}
              onSyncSwagger={(folderId) => {
                setSyncTargetSwaggerFolderId(folderId);
                setShowSwaggerSyncModal(true);
              }}
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
  collectionSettings?: Record<string, any>;
  expandedFolderIds: Set<string>;
  highlightedFolderIds?: Set<string>;
  collapseSignal?: number;
  level?: number;
  onSyncReflection?: (folderId: string) => void;
  onSyncSwagger?: (folderId: string) => void;
}> = ({
  node,
  collectionId,
  collectionSettings,
  expandedFolderIds,
  highlightedFolderIds,
  collapseSignal = 0,
  level = 0,
  onSyncReflection,
  onSyncSwagger,
}) => {
  const queryClient = useQueryClient();
  const {
    openReflectionSettingsModal,
    openSwaggerSettingsModal,
    openFolderSettingsModal,
    revealedFolderId,
    clearRevealedFolder,
  } = useAppStore();
  const folderRef = useRef<HTMLDivElement>(null);
  const isTargetRevealed = revealedFolderId === node.folder.id;
  const [isOpen, setIsOpen] = useState(true);
  const [showAddSubFolder, setShowAddSubFolder] = useState(false);
  const [showAddSubEndpoint, setShowAddSubEndpoint] = useState(false);
  const [subFolderName, setSubFolderName] = useState('');
  const [subEndpointName, setSubEndpointName] = useState('');
  const [subEndpointProtocol, setSubEndpointProtocol] = useState<'http' | 'grpc'>('http');
  const [folderContextMenuPos, setFolderContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const isFolderHighlighted = Boolean(highlightedFolderIds?.has(node.folder.id));
  const isAutoExpanded = expandedFolderIds.has(node.folder.id) || isOpen;
  const isReflection = isReflectionFolder(node.folder, collectionSettings);
  const grpcUrl = getFolderGrpcUrl(node.folder, collectionSettings);
  const isSwagger = isSwaggerFolder(node.folder, collectionSettings);
  const swaggerUrl = getFolderSwaggerUrl(node.folder, collectionSettings);

  useEffect(() => {
    if (isFolderHighlighted || isTargetRevealed) {
      setIsOpen(true);
    }
  }, [isFolderHighlighted, isTargetRevealed]);

  useEffect(() => {
    if (isTargetRevealed) {
      folderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const timer = setTimeout(() => {
        clearRevealedFolder();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isTargetRevealed, clearRevealedFolder]);

  // Close context menu on outside click or global close event
  useEffect(() => {
    if (!folderContextMenuPos) return;
    const handleClose = () => setFolderContextMenuPos(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener(CONTEXT_MENU_CLOSE_EVENT, handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener(CONTEXT_MENU_CLOSE_EVENT, handleClose);
    };
  }, [folderContextMenuPos]);

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

  const [showDeleteFolderModal, setShowDeleteFolderModal] = useState(false);

  const deleteFolderMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/folders/${node.folder.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['endpoints', collectionId] });
      setShowDeleteFolderModal(false);
    },
  });

  return (
    <div
      ref={folderRef}
      className="pl-1 relative"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllContextMenus();
        setFolderContextMenuPos({ x: e.clientX, y: e.clientY });
      }}
    >
      <div
        className={`flex items-center justify-between w-full py-1 text-xs group rounded-md px-1.5 transition ${
          isTargetRevealed
            ? 'bg-primary/15 text-zinc-100 ring-1 ring-primary/60 font-medium'
            : isFolderHighlighted
            ? 'bg-zinc-900/80 text-zinc-100 border border-zinc-800/80 font-medium'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
        }`}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 truncate flex-1 text-left"
        >
          {isAutoExpanded ? (
            <ChevronDown
              size={12}
              className={isFolderHighlighted ? 'text-zinc-300 flex-shrink-0' : 'text-zinc-500 flex-shrink-0'}
            />
          ) : (
            <ChevronRight
              size={12}
              className={isFolderHighlighted ? 'text-zinc-300 flex-shrink-0' : 'text-zinc-500 flex-shrink-0'}
            />
          )}
          {isReflection ? (
            <span
              title={`gRPC Reflection Folder (${grpcUrl || 'configured'})`}
              className="flex items-center"
            >
              <FolderSync size={13} className="text-secondary flex-shrink-0" />
            </span>
          ) : isSwagger ? (
            <span
              title={`Swagger Folder (${swaggerUrl || 'configured'})`}
              className="flex items-center"
            >
              <FolderSync size={13} className="text-emerald-400 flex-shrink-0" />
            </span>
          ) : (
            <Folder
              size={13}
              className={`${isFolderHighlighted ? 'text-amber-300' : 'text-amber-400/80'} flex-shrink-0`}
            />
          )}
          <span className="truncate">{node.folder.name}</span>
          {isFolderHighlighted && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 ml-auto mr-1"
              title="Contains active endpoint"
            />
          )}
        </button>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
          <button
            onClick={() => setShowAddSubEndpoint(!showAddSubEndpoint)}
            title="Add Endpoint in this folder"
            className="p-0.5 hover:text-zinc-200 text-zinc-500"
          >
            <Plus size={11} />
          </button>
          <button
            onClick={() => setShowAddSubFolder(!showAddSubFolder)}
            title="Add Subfolder"
            className="p-0.5 hover:text-amber-400 text-zinc-500"
          >
            <Folder size={11} />
          </button>
          <button
            onClick={() => setShowDeleteFolderModal(true)}
            title="Delete Folder"
            className="p-0.5 hover:text-red-400 text-zinc-500"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Right-click Context Menu */}
      {folderContextMenuPos && (
        <div
          style={{ top: `${folderContextMenuPos.y}px`, left: `${folderContextMenuPos.x}px` }}
          className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl py-1 w-44 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {isReflection && (
            <>
              {onSyncReflection && (
                <button
                  onClick={() => {
                    setFolderContextMenuPos(null);
                    onSyncReflection(node.folder.id);
                  }}
                  className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                >
                  <RefreshCw size={12} className="text-secondary" />
                  <span>Sync Reflection</span>
                </button>
              )}
              <button
                onClick={() => {
                  setFolderContextMenuPos(null);
                  openReflectionSettingsModal(node.folder.id, collectionId);
                }}
                className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
              >
                <Settings size={12} className="text-zinc-400" />
                <span>Settings</span>
              </button>
              <div className="h-px bg-zinc-800 my-1" />
            </>
          )}
          {isSwagger && (
            <>
              {onSyncSwagger && (
                <button
                  onClick={() => {
                    setFolderContextMenuPos(null);
                    onSyncSwagger(node.folder.id);
                  }}
                  className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                >
                  <RefreshCw size={12} className="text-emerald-400" />
                  <span>Sync Swagger</span>
                </button>
              )}
              <button
                onClick={() => {
                  setFolderContextMenuPos(null);
                  openSwaggerSettingsModal(node.folder.id, collectionId);
                }}
                className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
              >
                <Settings size={12} className="text-zinc-400" />
                <span>Settings</span>
              </button>
              <div className="h-px bg-zinc-800 my-1" />
            </>
          )}
          {!isReflection && !isSwagger && (
            <>
              <button
                onClick={() => {
                  setFolderContextMenuPos(null);
                  openFolderSettingsModal(node.folder.id, collectionId);
                }}
                className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
              >
                <Settings size={12} className="text-zinc-400" />
                <span>Settings</span>
              </button>
              <div className="h-px bg-zinc-800 my-1" />
            </>
          )}
          <button
            onClick={() => {
              setFolderContextMenuPos(null);
              setIsOpen(true);
              setShowAddSubEndpoint(true);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <Plus size={12} className="text-zinc-400" />
            <span>Add Endpoint</span>
          </button>
          <button
            onClick={() => {
              setFolderContextMenuPos(null);
              setIsOpen(true);
              setShowAddSubFolder(true);
            }}
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
          >
            <Folder size={12} className="text-amber-400" />
            <span>Add Subfolder</span>
          </button>
          <div className="h-px bg-zinc-800 my-1" />
          <button
            onClick={() => {
              setFolderContextMenuPos(null);
              setShowDeleteFolderModal(true);
            }}
            className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-950/40 flex items-center gap-2"
          >
            <Trash2 size={12} />
            <span>Delete Folder</span>
          </button>
        </div>
      )}

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
            className="bg-primary hover:bg-primary-hover px-2 rounded text-xs text-white"
          >
            +
          </button>
        </div>
      )}

      {showAddSubEndpoint && (
        <div className="p-1 pl-4 flex gap-1 items-center bg-zinc-900/60 border-t border-zinc-800 my-1 rounded">
          <Select
            value={subEndpointProtocol}
            onChange={(val) => setSubEndpointProtocol(val as any)}
            options={[
              { value: 'http', label: 'HTTP' },
              { value: 'grpc', label: 'gRPC' },
            ]}
            size="xs"
            fontMono
            className="w-24 flex-shrink-0"
          />
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
            className="bg-primary hover:bg-primary-hover px-2 rounded text-xs text-white"
          >
            +
          </button>
        </div>
      )}

      {isAutoExpanded && (
        <div className="pl-3 space-y-0.5 border-l border-zinc-800/40 ml-2">
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
              collectionSettings={collectionSettings}
              expandedFolderIds={expandedFolderIds}
              highlightedFolderIds={highlightedFolderIds}
              collapseSignal={collapseSignal}
              level={level + 1}
              onSyncReflection={onSyncReflection}
              onSyncSwagger={onSyncSwagger}
            />
          ))}
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={showDeleteFolderModal}
        type="folder"
        name={node.folder.name}
        isPending={deleteFolderMutation.isPending}
        onConfirm={async () => {
          await deleteFolderMutation.mutateAsync();
        }}
        onClose={() => setShowDeleteFolderModal(false)}
      />
    </div>
  );
};

// Individual Endpoint item with 3 gRPC stream icons & delete action
const EndpointItem: React.FC<{ endpoint: Endpoint }> = ({ endpoint }) => {
  const queryClient = useQueryClient();
  const { activeEndpointId, setActiveEndpoint, closeEndpoint } = useAppStore();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Close context menu on outside click or global close event
  useEffect(() => {
    if (!contextMenuPos) return;
    const handleClose = () => setContextMenuPos(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener(CONTEXT_MENU_CLOSE_EVENT, handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener(CONTEXT_MENU_CLOSE_EVENT, handleClose);
    };
  }, [contextMenuPos]);

  const deleteEndpointMutation = useMutation({
    mutationFn: () => apiRequest(`/endpoints/${endpoint.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints', endpoint.collection_id] });
      closeEndpoint(endpoint.id);
      setShowDeleteModal(false);
    },
  });

  const isActive = activeEndpointId === endpoint.id;
  const method = endpoint.protocol === 'http' ? endpoint.config?.method || 'GET' : 'gRPC';
  const streamType = endpoint.config?.stream_type || 'unary';

  // Do not display summary in sidebar; show clean operation name or path
  const summary = endpoint.config?.summary || endpoint.config?.specification?.summary;
  let displayName = endpoint.name;
  if (
    (summary && displayName === summary) ||
    (endpoint.config?.specification && displayName.includes(' ') && endpoint.config?.url)
  ) {
    if (endpoint.config?.url) {
      try {
        displayName = new URL(endpoint.config.url).pathname;
      } catch {
        displayName = endpoint.config.url.split('?')[0].replace(/^https?:\/\/[^\/]+/, '') || endpoint.name;
      }
    }
  }

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllContextMenus();
        setContextMenuPos({ x: e.clientX, y: e.clientY });
      }}
      className="relative group"
    >
      <div
        onClick={() => {
          setActiveEndpoint(endpoint);
          localStorage.setItem('api_lab_active_endpoint_id', endpoint.id);
        }}
        className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-xs transition text-left cursor-pointer ${
          isActive
            ? 'bg-primary/10 text-zinc-100 font-medium border-l-2 border-primary pl-1.5'
            : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          {endpoint.protocol === 'http' ? (
            <span
              className={`w-7 text-[9px] font-mono font-bold flex-shrink-0 text-left ${getHttpMethodColor(
                method
              )}`}
            >
              {method.slice(0, 4)}
            </span>
          ) : streamType === 'bidi_stream' ? (
            <span
              title="gRPC Bidirectional Stream"
              className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-amber-400"
            >
              <ArrowLeftRight size={11} />
            </span>
          ) : streamType === 'omni_stream' ? (
            <span
              title="gRPC Stream"
              className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-amber-400"
            >
              <ArrowDownUp size={11} />
            </span>
          ) : (
            <span
              title="gRPC Unary Call"
              className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-zinc-500 group-hover:text-zinc-400"
            >
              <Radio size={11} />
            </span>
          )}
          <span className="truncate">{displayName}</span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteModal(true);
            }}
            title="Delete Endpoint"
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 text-zinc-400 transition"
          >
            <Trash2 size={11} />
          </button>
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary ml-1" />
          )}
        </div>
      </div>

      {/* Right-click Context Menu */}
      {contextMenuPos && (
        <div
          style={{ top: `${contextMenuPos.y}px`, left: `${contextMenuPos.x}px` }}
          className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl py-1 w-40 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setContextMenuPos(null);
              setShowDeleteModal(true);
            }}
            className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-950/40 flex items-center gap-2"
          >
            <Trash2 size={12} />
            <span>Delete Endpoint</span>
          </button>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        type="endpoint"
        name={endpoint.name}
        isPending={deleteEndpointMutation.isPending}
        onConfirm={() => deleteEndpointMutation.mutate()}
        onClose={() => setShowDeleteModal(false)}
      />
    </div>
  );
};
