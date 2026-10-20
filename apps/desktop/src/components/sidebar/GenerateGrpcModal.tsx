import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../api/client';
import {
  discoverNativeGrpcServices,
  generateNativeGrpcSamplePayload,
} from '../../api/native';
import {
  planGrpcHierarchy,
  executeGrpcHierarchyCreation,
  shouldAutoDetectTls,
} from '../../utils/grpcReflectionGenerator';
import { VariableInput } from '../common/VariableInput';
import { X, RefreshCw, FolderPlus, Radio, CheckCircle2 } from 'lucide-react';
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
  const [serverAddress, setServerAddress] = useState('localhost:9091');
  const [folderName, setFolderName] = useState('gRPC Services');
  const [useTls, setUseTls] = useState(false);
  const [generatePayloads, setGeneratePayloads] = useState(true);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    resolveVariables().then(setActiveVariables);
  }, [activeEnvironmentId, isOpen]);

  if (!isOpen) return null;

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
    setStatusText('Discovering services via reflection...');

    try {
      const activeVars = await resolveVariables();
      const effectiveTls = useTls || shouldAutoDetectTls(serverAddress, activeVars);

      const reflection = await discoverNativeGrpcServices(
        { server_address: serverAddress.trim(), use_tls: effectiveTls },
        activeVars
      );

      if (reflection.error) {
        throw new Error(reflection.error);
      }

      if (!reflection.services || reflection.services.length === 0) {
        throw new Error('No services discovered via gRPC server reflection.');
      }

      setStatusText(`Found ${reflection.services.length} services. Generating sample payloads...`);

      // Optionally generate sample payloads for methods
      const samplePayloads: Record<string, any> = {};
      if (generatePayloads) {
        for (const svc of reflection.services) {
          for (const method of svc.methods) {
            try {
              const res = await generateNativeGrpcSamplePayload(
                {
                  server_address: serverAddress.trim(),
                  service: svc.name,
                  method: method.name,
                  use_tls: effectiveTls,
                },
                activeVars
              );
              if (res.payload) {
                samplePayloads[`${svc.name}/${method.name}`] = res.payload;
              }
            } catch {
              // fallback to empty object if individual method payload generation fails
            }
          }
        }
      }

      setStatusText('Generating folder hierarchy and endpoints...');

      const planned = planGrpcHierarchy({
        folderName: folderName.trim(),
        serverAddress: serverAddress.trim(),
        useTls: effectiveTls,
        services: reflection.services,
        samplePayloads,
      });

      const apiCaller = {
        post: (path: string, body: any) =>
          apiRequest(path, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
      };

      const result = await executeGrpcHierarchyCreation(collectionId, planned, apiCaller);

      // Link server address to generated root folder in collection settings (Feature 3)
      try {
        const coll = await apiRequest<any>(`/collections/${collectionId}`);
        const currentSources = coll.settings?.grpc_sources || {};
        currentSources[result.rootFolderId] = {
          server_address: serverAddress.trim(),
          use_tls: useTls,
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
      setErrorText(err.message || 'Failed to generate gRPC collection');
    } finally {
      setLoading(false);
      setStatusText(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-secondary" />
            <h2 className="text-xs font-semibold text-zinc-100">
              Generate gRPC
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
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
                placeholder="localhost:9091, nu-trade.dev.dxtr.asia, or {{GRPC_HOST}}"
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

          {statusText && (
            <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-300 text-xs font-mono flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin text-primary" />
              <span>{statusText}</span>
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
              onClick={onClose}
              disabled={loading}
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
    </div>
  );
};
