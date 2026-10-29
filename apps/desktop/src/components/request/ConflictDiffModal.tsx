import React from 'react';
import type { Endpoint } from '@api-lab/api-types';
import { AlertTriangle, X } from 'lucide-react';
import { computeConflictDiffs } from '../../utils/conflictDetector';

interface ConflictDiffModalProps {
  isOpen: boolean;
  localEndpoint: Endpoint;
  remoteEndpoint: Endpoint;
  localConfig: any;
  onOverwrite: () => void;
  onDiscardLocal: () => void;
  onClose: () => void;
}

export const ConflictDiffModal: React.FC<ConflictDiffModalProps> = ({
  isOpen,
  localEndpoint,
  remoteEndpoint,
  localConfig,
  onOverwrite,
  onDiscardLocal,
  onClose,
}) => {
  if (!isOpen) return null;

  const diffs = computeConflictDiffs(localEndpoint, remoteEndpoint, localConfig);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs select-none p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl flex flex-col overflow-hidden text-xs text-zinc-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <AlertTriangle size={16} />
            <span>Request Conflict Detected</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-200 rounded transition"
          >
            <X size={14} />
          </button>
        </div>

        {/* Warning text */}
        <div className="p-4 space-y-3">
          <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded text-amber-200 text-xs">
            Another user has modified and saved this request on the server (Server v{remoteEndpoint.version} vs Local v{localEndpoint.version}).
            Saving now will overwrite the server changes.
          </div>

          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Detected Differences ({diffs.length}):
          </div>

          <div className="max-h-64 overflow-y-auto border border-zinc-800 rounded divide-y divide-zinc-800/80 bg-zinc-950/40 font-mono text-[11px]">
            {diffs.length > 0 ? (
              diffs.map((d) => (
                <div key={d.field} className="p-2.5 space-y-1">
                  <div className="font-semibold text-zinc-300 font-sans">{d.field}</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="p-1.5 bg-zinc-900 rounded border border-zinc-800/80">
                      <div className="text-zinc-500 font-sans text-[9px] uppercase font-bold mb-0.5">Your Local Edit</div>
                      <div className="text-amber-300 break-all">{d.localVal}</div>
                    </div>
                    <div className="p-1.5 bg-zinc-900 rounded border border-zinc-800/80">
                      <div className="text-zinc-500 font-sans text-[9px] uppercase font-bold mb-0.5">Server Version</div>
                      <div className="text-blue-300 break-all">{d.remoteVal}</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-zinc-500 font-sans">
                Configuration values are identical, but server version was incremented.
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between p-3 border-t border-zinc-800 bg-zinc-950/60">
          <button
            type="button"
            onClick={onDiscardLocal}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-medium transition"
          >
            Discard Local & Load Server
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded text-xs transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onOverwrite}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded text-xs transition"
            >
              Overwrite Server
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
