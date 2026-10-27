import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { findConflictingUsers, formatConflictWarning } from '../../utils/presence';

interface EndpointConflictAlertProps {
  endpointId: string;
}

export const EndpointConflictAlert: React.FC<EndpointConflictAlertProps> = ({ endpointId }) => {
  const onlineUsers = useAppStore((s) => s.onlineUsers);
  const currentUser = useAppStore((s) => s.user);

  const conflicts = findConflictingUsers(onlineUsers, currentUser?.id, endpointId);
  if (conflicts.length === 0) {
    return null;
  }

  const warning = formatConflictWarning(conflicts);

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/50 border border-amber-800/70 text-amber-300 font-mono text-[10px] select-none cursor-help"
      title={warning.fullMessage}
      role="status"
      aria-label={warning.fullMessage}
    >
      <AlertTriangle size={11} className="text-amber-400 flex-shrink-0" />
      <span>{warning.shortLabel}</span>
    </div>
  );
};
