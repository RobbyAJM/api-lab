import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Avatar } from '../common/Avatar';
import { sortPresenceUsers, filterOtherPresenceUsers, getAvatarStackPreview } from '../../utils/presence';

export const OnlineUsersPopover: React.FC = () => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const onlineUsers = useAppStore((s) => s.onlineUsers);
  const currentUser = useAppStore((s) => s.user);

  const otherUsers = filterOtherPresenceUsers(onlineUsers, currentUser?.id);
  const sortedUsers = sortPresenceUsers(onlineUsers, currentUser?.id);
  const { visible, overflowCount } = getAvatarStackPreview(otherUsers, 3);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

  if (otherUsers.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center -space-x-1.5 p-1 rounded hover:bg-zinc-800/60 transition group focus:outline-none"
        title="View people in workspace"
        aria-label="View people in workspace"
      >
        {visible.map((user) => (
          <Avatar
            key={user.user_id}
            avatar={user.avatar}
            name={user.name}
            size={20}
            className="ring-1 ring-zinc-950 group-hover:border-zinc-500"
          />
        ))}

        {overflowCount > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-800 text-[10px] font-mono font-medium text-zinc-300 ring-1 ring-zinc-950 border border-zinc-700/60">
            +{overflowCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-md border border-zinc-800 bg-zinc-900 shadow-xl z-50 py-1.5 select-none animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 border-b border-zinc-800/80 flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              People in the workspace
            </span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.2 rounded">
              {onlineUsers.length} online
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-zinc-800/40">
            {sortedUsers.map((user) => {
              const isSelf = user.user_id === currentUser?.id;
              return (
                <div
                  key={user.user_id}
                  className="px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800/50 transition"
                >
                  <Avatar
                    avatar={user.avatar}
                    name={user.name}
                    size={24}
                    showPresenceIndicator
                    isOnline
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-zinc-200 truncate">
                        {user.name}
                      </span>
                      {isSelf && (
                        <span className="text-[10px] text-zinc-400 font-normal">
                          (You)
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      {user.email}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
