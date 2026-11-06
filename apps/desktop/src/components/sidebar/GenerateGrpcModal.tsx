import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../api/client';
import {
  discoverNativeGrpcServices,
  generateNativeGrpcSamplePayload,
} from '../../api/native';
import {
  generateGrpcCollection,
  shouldAutoDetectTls,
  DEFAULT_GRPC_SERVER_ADDRESS,
  DEFAULT_GRPC_FOLDER_NAME,
  DEFAULT_GRPC_USE_TLS,
  type GrpcProgressInfo,
} from '../../utils/grpcReflectionGenerator';
import { VariableInput } from '../common/VariableInput';
import { X, RefreshCw, FolderPlus, Radio, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { VariableResponse } from '@api-lab/api-types';

interface GenerateGrpcModalProps {
  collectionId: string;
  isOpen: boolean;
  onClose: () => void;
  activeEnvironmentId?: string | null;
}

export const GenerateGrpcModal: React.FC<GenerateGrpcModalProps> = ({
  collectionId,
  isOpen,
  onClose,
  activeEnvironmentId,
}) => {
  const queryClient = useQueryClient();
  const [serverAddress, setServerAddress] = useState(DEFAULT_GRPC_SERVER_ADDRESS);
  const [folderName, setFolderName] = useState(DEFAULT_GRPC_FOLDER_NAME);
  const [useTls, setUseTls] = useState(DEFAULT_GRPC_USE_TLS);
  const [generatePayloads, setGeneratePayloads] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const abortRef = useRef({ aborted: false });
  const [progressInfo, setProgressInfo] = useState<GrpcProgressInfo | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) {
      setShowCancelConfirm(false);
      return;
    }
    abortRef.current = { aborted: false };
    resolveVariables().then(setActiveVariables);
  }, [activeEnvironmentId, isOpen]);

  if (!isOpen) return null;

  function handleRequestClose() {
    if (loading) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  }

  async function resolveVariables(): Promise<Record<string, string>> {
    const activeVariables: Record<string, string> = {};
    if (activeEnvironmentId) {
      const envVars = queryClient.getQueryData<VariableResponse[]>([
        'variables',
        activeEnvironmentId,
      ]);
      if (envVars) {
        for (const v of envVars) {
          activeVariables[v.key] = v.value;
        }
      } else {
        try {
          const fetched = await apiRequest<VariableResponse[]>(
            `/environments/${activeEnvironmentId}/variables`
          );
          for (const v of fetched) {
            activeVariables[v.key] = v.value;
          }
        } catch {
          // ignore
        }
      }
    }
    return activeVariables;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serverAddress.trim() || !folderName.trim()) {
      setErrorText('Please specify both server address and folder name');
      return;
    }

    setLoading(true);
    setErrorText(null);
    abortRef.current = { aborted: false };
    setProgressInfo({ message: 'Discovering services via server reflection...', percent: 10 });

    try {
      const activeVars = await resolveVariables();
      const apiCaller = {
        post: (path: string, body: any) =>
          apiRequest(path, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
      };

      const result = await generateGrpcCollection({
        collectionId,
        folderName: folderName.trim(),
        serverAddress: serverAddress.trim(),
        useTls,
        generatePayloads,
        variables: activeVars,
        timeoutMs: 60_000,
        signal: abortRef.current,
        onProgress: (info) => {
          if (typeof info === 'string') {
            setProgressInfo({ message: info, percent: 25 });
          } else {
            setProgressInfo(info);
          }
        },
        discoverServices: discoverNativeGrpcServices,
        generateSamplePayload: generateNativeGrpcSamplePayload,
        apiCaller,
      });

      if (abortRef.current.aborted) {
        return;
      }

      // Link server address to generated root folder in collection settings (Feature 3)
      try {
        const coll = await apiRequest<any>(`/collections/${collectionId}`);
        const currentSources = coll.settings?.grpc_sources || {};
        currentSources[result.rootFolderId] = {
          server_address: serverAddress.trim(),
          use_tls: result.effectiveTls,
        };
        await apiRequest(`/collections/${collectionId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            settings: {
              ...coll.settings,
              grpc_sources: currentSources,
            },
          }),
        });
      } catch {
        // ignore
      }

      queryClient.invalidateQueries({ queryKey: ['folders', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['endpoints', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });

      setSuccessInfo(
        `Generated ${result.createdServiceFoldersCount} service folders and ${result.createdEndpointsCount} gRPC method endpoints under "${folderName.trim()}".`
      );

      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      if (!abortRef.current.aborted) {
        setErrorText(err.message || 'Failed to generate gRPC collection');
      }
    } finally {
      setLoading(false);
      setProgressInfo(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={handleRequestClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-md max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-secondary" />
            <h2 className="text-xs font-semibold text-zinc-100">
              Generate gRPC
            </h2>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="text-zinc-400 hover:text-zinc-200 p-1"
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">
              Folder Name (Root Group)
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g. NuTrade Services or Payment API"
              disabled={loading}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Creates folder structure: {folderName || '{folder}'} / {'{service}'} / {'{method}'}
            </p>
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1">
              gRPC Server Address
            </label>
            <div className="bg-zinc-950 border border-zinc-800 rounded focus-within:border-zinc-700">
              <VariableInput
                value={serverAddress}
                onChange={(val) => {
                  setServerAddress(val);
                  if (shouldAutoDetectTls(val, activeVariables)) {
                    setUseTls(true);
                  }
                }}
                variables={activeVariables}
                disabled={loading}
                placeholder={`${DEFAULT_GRPC_SERVER_ADDRESS} or {{GRPC_HOST}}`}
                className="w-full h-8"
              />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              Supports environment variables like {'{{GRPC_HOST}}'}.
            </p>
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useTls}
                onChange={(e) => setUseTls(e.target.checked)}
                disabled={loading}
                className="rounded bg-zinc-950 border-zinc-700 text-primary focus:ring-0"
              />
              <span className="text-zinc-300">Use TLS (Transport Layer Security)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={generatePayloads}
                onChange={(e) => setGeneratePayloads(e.target.checked)}
                disabled={loading}
                className="rounded bg-zinc-950 border-zinc-700 text-primary focus:ring-0"
              />
              <span className="text-zinc-300">
                Pre-generate sample JSON payloads from protobuf schemas
              </span>
            </label>
          </div>

          {errorText && (
            <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-xs font-mono break-all">
              {errorText}
            </div>
          )}

          {loading && progressInfo && (
            <div className="py-1 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span className="truncate pr-2">{progressInfo.message}</span>
                <span className="text-emerald-400 font-medium flex-shrink-0">{progressInfo.percent}%</span>
              </div>
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-200"
                  style={{ width: `${Math.max(5, Math.min(100, progressInfo.percent))}%` }}
                />
              </div>
            </div>
          )}

          {successInfo && (
            <div className="p-2.5 bg-emerald-950/50 border border-emerald-800/60 rounded text-emerald-300 text-xs font-mono flex items-center gap-2">
              <CheckCircle2 size={13} />
              <span>{successInfo}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded font-medium text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded font-medium text-xs flex items-center gap-1.5 shadow transition"
            >
              {loading ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <FolderPlus size={12} />
                  <span>Generate gRPC</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Stop Generation Confirmation Dialog */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 font-sans animate-in fade-in duration-100"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl p-4 space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400 flex-shrink-0">
                <AlertTriangle size={16} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-zinc-100">Stop Generating gRPC?</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  By stopping this operation, some endpoints that already generated will not be deleted.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition"
              >
                Continue Generating
              </button>
              <button
                type="button"
                onClick={() => {
                  abortRef.current.aborted = true;
                  setShowCancelConfirm(false);
                  setLoading(false);
                  queryClient.invalidateQueries({ queryKey: ['folders', collectionId] });
                  queryClient.invalidateQueries({ queryKey: ['endpoints', collectionId] });
                  queryClient.invalidateQueries({ queryKey: ['collections'] });
                  onClose();
                }}
                className="px-3 py-1.5 rounded text-xs bg-red-600 hover:bg-red-500 text-white font-medium transition"
              >
                Stop & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
