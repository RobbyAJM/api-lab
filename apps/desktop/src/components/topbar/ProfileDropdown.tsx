import React, { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, User as UserIcon } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Avatar } from '../common/Avatar';

export const ProfileDropdown: React.FC = () => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const openAuthModal = useAppStore((s) => s.openAuthModal);
  const setAppSettingsOpen = useAppStore((s) => s.setAppSettingsOpen);
  const setAppSettingsTab = useAppStore((s) => s.setAppSettingsTab);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => openAuthModal('login')}
        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-medium transition"
      >
        Sign in
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 p-0.5 rounded-full hover:ring-2 hover:ring-zinc-600 transition focus:outline-none"
        title={user.name}
        aria-label="User profile and settings"
      >
        <Avatar avatar={user.avatar} name={user.name} size={24} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-md border border-zinc-800 bg-zinc-900 shadow-xl z-50 overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100">
          {/* User Info Header */}
          <div className="px-3.5 py-3 border-b border-zinc-800 flex items-center gap-3 bg-zinc-900/60">
            <Avatar avatar={user.avatar} name={user.name} size={36} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-zinc-100 truncate">{user.name}</div>
              <div className="text-[11px] text-zinc-400 truncate">{user.email}</div>
            </div>
          </div>

          {/* Menu Options */}
          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAppSettingsTab('profile');
                setAppSettingsOpen(true);
              }}
              className="w-full px-3.5 py-2 flex items-center gap-2.5 text-xs text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100 transition"
            >
              <Settings size={14} className="text-zinc-400" />
              <span>App settings</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="w-full px-3.5 py-2 flex items-center gap-2.5 text-xs text-zinc-300 hover:bg-zinc-800/80 hover:text-red-400 transition"
            >
              <LogOut size={14} className="text-zinc-400" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
