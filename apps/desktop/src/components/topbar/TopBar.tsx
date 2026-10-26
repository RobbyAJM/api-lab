import React from 'react';
import {
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  Search,
  UserPlus,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/useAppStore';
import { WorkspaceDropdown } from './WorkspaceDropdown';
import { OnlineUsersPopover } from './OnlineUsersPopover';
import { NotificationPopover } from './NotificationPopover';
import { ProfileDropdown } from './ProfileDropdown';
import { WindowControls } from '../common/WindowControls';

export const TopBar: React.FC = () => {
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setMembersModalOpen = useAppStore((s) => s.setMembersModalOpen);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, [data-tauri-no-drag]')) {
      return;
    }
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      getCurrentWindow()
        .startDragging()
        .catch(() => {
          invoke('start_dragging_window').catch(() => {});
        });
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, [data-tauri-no-drag]')) {
      return;
    }
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      invoke('toggle_maximize_window').catch(() => {});
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className="h-9 w-full bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between px-2 select-none flex-shrink-0 z-30 cursor-default"
    >
      {/* Left: Navigation & Workspace */}
      <div className="flex items-center gap-1 min-w-0" data-tauri-no-drag>
        {/* Navigation arrows */}
        <div className="flex items-center text-zinc-500 mr-1">
          <button
            type="button"
            className="p-1 hover:text-zinc-300 hover:bg-zinc-800/50 rounded transition"
            title="Menu"
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            className="p-1 hover:text-zinc-300 hover:bg-zinc-800/50 rounded transition opacity-50 cursor-default"
            title="Back"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            type="button"
            className="p-1 hover:text-zinc-300 hover:bg-zinc-800/50 rounded transition opacity-50 cursor-default"
            title="Forward"
          >
            <ArrowRight size={13} />
          </button>
        </div>

        {/* Divider */}
        <div className="h-3.5 w-px bg-zinc-800 mr-1" />

        {/* Workspace Switcher */}
        <WorkspaceDropdown />
      </div>

      {/* Flexible Drag Region between left and center */}
      <div
        data-tauri-drag-region
        className="flex-1 h-full min-w-4 cursor-default"
      />

      {/* Center: Global Search Bar */}
      <div className="w-80 max-w-sm mx-2" data-tauri-no-drag>
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full h-6 px-2.5 bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-700 rounded flex items-center justify-between text-xs text-zinc-400 transition group focus:outline-none"
          title="Search workspaces, requests, collections (Ctrl+K)"
        >
          <div className="flex items-center gap-2 truncate">
            <Search size={12} className="text-zinc-500 group-hover:text-zinc-400" />
            <span className="truncate">Search API Lab...</span>
          </div>
          <kbd className="px-1.5 py-0.2 bg-zinc-950 border border-zinc-800 rounded text-[10px] font-mono text-zinc-500 group-hover:text-zinc-400 flex-shrink-0">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Flexible Drag Region between center and right */}
      <div
        data-tauri-drag-region
        className="flex-1 h-full min-w-4 cursor-default"
      />

      {/* Right: Presence, Invite, Notification, Profile, Window Controls */}
      <div className="flex items-center gap-1.5 h-full" data-tauri-no-drag>
        {/* Online users in workspace */}
        <OnlineUsersPopover />

        {/* Invite team members button */}
        {activeWorkspaceId && (
          <button
            type="button"
            onClick={() => setMembersModalOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition"
            title="Invite collaborators to workspace"
          >
            <UserPlus size={12} className="text-zinc-400" />
            <span>Invite</span>
          </button>
        )}

        {/* Notifications */}
        <NotificationPopover />

        {/* User profile dropdown */}
        <ProfileDropdown />

        {/* Native frameless window controls (Minimize, Maximize, Close) */}
        <div className="h-full ml-1 border-l border-zinc-800/60 pl-1">
          <WindowControls />
        </div>
      </div>
    </header>
  );
};
