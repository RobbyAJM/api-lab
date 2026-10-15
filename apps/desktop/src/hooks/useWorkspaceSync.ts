import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import type { WsSyncEvent } from '@api-lab/api-types';

export function useWorkspaceSync() {
  const queryClient = useQueryClient();
  const token = useAppStore((s) => s.token);
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token || !workspaceId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let isMounted = true;
    let reconnectTimeout: any = null;

    function connect() {
      if (!isMounted) return;
      const url = `ws://localhost:8080/api/v1/workspaces/${workspaceId}/ws?token=${token}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const syncEvent: WsSyncEvent = JSON.parse(event.data);
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
  }, [token, workspaceId, queryClient]);
}
