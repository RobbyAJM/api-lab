import React from 'react';
import type { Endpoint } from '@api-lab/api-types';
import { AlertTriangle, X } from 'lucide-react';

interface ConflictDiffModalProps {
  isOpen: boolean;
  localEndpoint: Endpoint;
  remoteEndpoint: Endpoint;
  localConfig: any;
  onOverwrite: () => void;
  onDiscardLocal: () => void;
  onClose: () => void;
}

interface DiffRow {
  field: string;
  localVal: string;
  remoteVal: string;
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

  const isHttp = localEndpoint.protocol === 'http';
  const remoteConfig = remoteEndpoint.config || {};

  const diffs: DiffRow[] = [];

  if (isHttp) {
    if ((localConfig.method || 'GET') !== (remoteConfig.method || 'GET')) {
      diffs.push({
        field: 'Method',
        localVal: String(localConfig.method || 'GET'),
        remoteVal: String(remoteConfig.method || 'GET'),
      });
    }
    if ((localConfig.url || '') !== (remoteConfig.url || '')) {
      diffs.push({
        field: 'URL',
        localVal: String(localConfig.url || ''),
        remoteVal: String(remoteConfig.url || ''),
      });
    }
    const localBody = String(localConfig.body || '').trim();
    const remoteBody = String(remoteConfig.body || '').trim();
    if (localBody !== remoteBody) {
      diffs.push({
        field: 'Body',
        localVal: localBody.length > 200 ? localBody.slice(0, 200) + '...' : localBody || '(empty)',
        remoteVal: remoteBody.length > 200 ? remoteBody.slice(0, 200) + '...' : remoteBody || '(empty)',
      });
    }
    const localPre = String(localConfig.pre_request_script || '').trim();
    const remotePre = String(remoteConfig.pre_request_script || '').trim();
    if (localPre !== remotePre) {
      diffs.push({
        field: 'Pre-request Script',
        localVal: localPre || '(empty)',
        remoteVal: remotePre || '(empty)',
      });
    }
    const localPost = String(localConfig.post_response_script || localConfig.post_request_script || '').trim();
    const remotePost = String(remoteConfig.post_response_script || remoteConfig.post_request_script || '').trim();
    if (localPost !== remotePost) {
      diffs.push({
        field: 'Post-response Script',
        localVal: localPost || '(empty)',
        remoteVal: remotePost || '(empty)',
      });
    }
  } else {
    if ((localConfig.server_address || '') !== (remoteConfig.server_address || '')) {
      diffs.push({
        field: 'Server Address',
        localVal: String(localConfig.server_address || ''),
        remoteVal: String(remoteConfig.server_address || ''),
      });
    }
    if ((localConfig.service || '') !== (remoteConfig.service || '')) {
      diffs.push({
        field: 'Service',
        localVal: String(localConfig.service || ''),
        remoteVal: String(remoteConfig.service || ''),
      });
    }
    if ((localConfig.method || '') !== (remoteConfig.method || '')) {
      diffs.push({
        field: 'Method',
        localVal: String(localConfig.method || ''),
        remoteVal: String(remoteConfig.method || ''),
      });
    }
    const localPayload = JSON.stringify(localConfig.payload || {});
    const remotePayload = JSON.stringify(remoteConfig.payload || {});
    if (localPayload !== remotePayload) {
      diffs.push({
        field: 'Payload',
        localVal: localPayload.length > 200 ? localPayload.slice(0, 200) + '...' : localPayload,
        remoteVal: remotePayload.length > 200 ? remotePayload.slice(0, 200) + '...' : remotePayload,
      });
    }
  }

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
