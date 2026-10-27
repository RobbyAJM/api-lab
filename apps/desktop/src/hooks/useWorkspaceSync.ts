import { useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import { getWsBaseUrl } from '../api/client';
import { computeCurrentLocation } from '../utils/presence';
import type { WsSyncEvent, PresenceUser } from '@api-lab/api-types';

export function useWorkspaceSync() {
  const queryClient = useQueryClient();
  const token = useAppStore((s) => s.token);
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const currentUser = useAppStore((s) => s.user);
  const setOnlineUsers = useAppStore((s) => s.setOnlineUsers);
  const addOnlineUser = useAppStore((s) => s.addOnlineUser);
  const removeOnlineUser = useAppStore((s) => s.removeOnlineUser);

  const activeEndpoint = useAppStore((s) => s.activeEndpoint);
  const appSettingsOpen = useAppStore((s) => s.appSettingsOpen);
  const workspaceModalOpen = useAppStore((s) => s.workspaceModalOpen);
  const membersModalOpen = useAppStore((s) => s.membersModalOpen);
  const envModalOpen = useAppStore((s) => s.envModalOpen);
  const collectionSettingsModal = useAppStore((s) => s.collectionSettingsModal);
  const folderSettingsModal = useAppStore((s) => s.folderSettingsModal);

  const wsRef = useRef<WebSocket | null>(null);

  const currentLocation = useMemo(() => {
    return computeCurrentLocation({
      activeEndpoint,
      appSettingsOpen,
      workspaceModalOpen,
      membersModalOpen,
      envModalOpen,
      collectionSettingsModal,
      folderSettingsModal,
    });
  }, [
    activeEndpoint,
    appSettingsOpen,
    workspaceModalOpen,
    membersModalOpen,
    envModalOpen,
    collectionSettingsModal,
    folderSettingsModal,
  ]);

  const currentLocationRef = useRef(currentLocation);
  currentLocationRef.current = currentLocation;

  // Sync current location whenever view/endpoint changes
  useEffect(() => {
    if (currentUser?.id) {
      const existing = useAppStore.getState().onlineUsers.find((u) => u.user_id === currentUser.id);
      if (existing && JSON.stringify(existing.current_location) !== JSON.stringify(currentLocation)) {
        addOnlineUser({
          ...existing,
          current_location: currentLocation,
        });
      }
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'presence_location',
            location: currentLocation,
          })
        );
      } catch {
        // ignore send errors
      }
    }
  }, [
    currentLocation,
    currentUser?.id,
    addOnlineUser,
  ]);

  useEffect(() => {
    if (!token || !workspaceId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setOnlineUsers([]);
      return;
    }

    let isMounted = true;
    let reconnectTimeout: any = null;

    function connect() {
      if (!isMounted) return;
      const wsBase = getWsBaseUrl();
      const url = `${wsBase}/workspaces/${workspaceId}/ws?token=${token}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        try {
          ws.send(
            JSON.stringify({
              type: 'presence_location',
              location: currentLocationRef.current,
            })
          );
        } catch {
          // ignore send error
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Presence messages
          if (data.type === 'presence_state' && Array.isArray(data.users)) {
            const users = (data.users as PresenceUser[]).map((u) => {
              if (currentUser?.id && u.user_id === currentUser.id && !u.current_location) {
                return { ...u, current_location: currentLocationRef.current };
              }
              return u;
            });
            setOnlineUsers(users);
            return;
          }
          if (data.type === 'presence_join' && data.user) {
            addOnlineUser(data.user);
            return;
          }
          if (data.type === 'presence_update' && data.user) {
            addOnlineUser(data.user);
            return;
          }
          if (data.type === 'presence_leave' && data.user_id) {
            removeOnlineUser(data.user_id);
            return;
          }

          const syncEvent: WsSyncEvent = data;
          if (syncEvent.workspace_id === workspaceId) {
            // Invalidate relevant TanStack queries
            if (syncEvent.entity === 'workspace') {
              queryClient.invalidateQueries({ queryKey: ['workspaces'] });
              queryClient.invalidateQueries({ queryKey: ['auth_me'] });
            } else if (syncEvent.entity === 'collection' || syncEvent.entity === 'folder') {
              queryClient.invalidateQueries({ queryKey: ['collections', workspaceId] });
            } else if (syncEvent.entity === 'endpoint') {
              queryClient.invalidateQueries({ queryKey: ['collections', workspaceId] });
              queryClient.invalidateQueries({ queryKey: ['endpoints'] });
            } else if (syncEvent.entity === 'environment' || syncEvent.entity === 'variable') {
              queryClient.invalidateQueries({ queryKey: ['environments', workspaceId] });
              queryClient.invalidateQueries({ queryKey: ['variables'] });
            } else if (syncEvent.entity === 'member') {
              queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
            } else if (syncEvent.entity === 'saved_response') {
              queryClient.invalidateQueries({ queryKey: ['saved_response', syncEvent.entity_id] });
            }
          }
        } catch {
          // ignore non-json
        }
      };

      ws.onclose = () => {
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token, workspaceId, queryClient, currentUser?.id, setOnlineUsers, addOnlineUser, removeOnlineUser]);
}
