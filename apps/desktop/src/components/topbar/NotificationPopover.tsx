import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Trash2 } from 'lucide-react';
import { apiRequest } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { NotificationItem } from '@api-lab/api-types';
import {
  filterNotifications,
  countUnreadNotifications,
  formatNotificationTime,
} from '../../utils/notifications';

export const NotificationPopover: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'direct' | 'watching' | 'all'>('direct');
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const token = useAppStore((s) => s.token);

  const { data: notifications = [] } = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<NotificationItem[]>('/notifications'),
    enabled: !!token,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<NotificationItem>(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ message: string }>('/notifications/mark-all-read', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ message: string }>(`/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

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

  const counts = countUnreadNotifications(notifications);
  const filtered = filterNotifications(notifications, tab);

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded transition group focus:outline-none"
        title="Notifications"
        aria-label="View notifications"
      >
        <Bell size={15} />
        {counts.all > 0 && (
          <span className="absolute 0 top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-amber-500 text-zinc-950 text-[9px] font-bold flex items-center justify-center leading-none ring-1 ring-zinc-950">
            {counts.all > 99 ? '99+' : counts.all}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 rounded-md border border-zinc-800 bg-zinc-900 shadow-xl z-50 flex flex-col overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-100">Notifications</span>
            {counts.all > 0 && (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition"
                title="Mark all as read"
              >
                <Check size={12} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Sub-tabs */}
          <div className="flex items-center px-2 pt-1 border-b border-zinc-800/60 bg-zinc-900/50 gap-1 text-xs">
            <button
              type="button"
              onClick={() => setTab('direct')}
              className={`px-2.5 py-1.5 border-b-2 text-xs font-medium transition flex items-center gap-1.5 ${
                tab === 'direct'
                  ? 'border-blue-500 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <span>Direct</span>
              <span className="text-[10px] opacity-70">{counts.direct}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('watching')}
              className={`px-2.5 py-1.5 border-b-2 text-xs font-medium transition flex items-center gap-1.5 ${
                tab === 'watching'
                  ? 'border-blue-500 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <span>Watching</span>
              <span className="text-[10px] opacity-70">{counts.watching}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`px-2.5 py-1.5 border-b-2 text-xs font-medium transition flex items-center gap-1.5 ${
                tab === 'all'
                  ? 'border-blue-500 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <span>All</span>
              <span className="text-[10px] opacity-70">{notifications.length}</span>
            </button>
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800/50">
            {filtered.length > 0 ? (
              filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (!item.read) markReadMutation.mutate(item.id);
                  }}
                  className={`px-3 py-2.5 flex items-start gap-2.5 transition group cursor-pointer ${
                    item.read ? 'hover:bg-zinc-800/30' : 'bg-zinc-800/25 hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="pt-0.5">
                    <span
                      className={`block w-2 h-2 rounded-full ${
                        item.read ? 'bg-transparent' : 'bg-amber-400'
                      }`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium text-zinc-200 truncate">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-zinc-500 flex-shrink-0">
                        {formatNotificationTime(item.created_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">
                      {item.message}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition"
                    title="Delete notification"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            ) : (
              <div className="py-8 px-4 text-center">
                <p className="text-xs text-zinc-300 font-medium">You're all caught up 🎉</p>
                <p className="text-[11px] text-zinc-500 mt-1">No notifications in this category</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
