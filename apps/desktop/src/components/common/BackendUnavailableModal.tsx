import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ServerOff,
  RefreshCw,
  Settings,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  getServerUrl,
  setServerUrl,
  resetServerUrl,
  testServerConnection,
  type ServerConnectionTestResult,
} from '../../utils/serverConfig';

export const BackendUnavailableModal: React.FC = () => {
  const queryClient = useQueryClient();
  const { backendUnavailable, setBackendUnavailable } = useAppStore();

  const [currentUrl, setCurrentUrl] = useState(getServerUrl());
  const [showConfig, setShowConfig] = useState(false);
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<ServerConnectionTestResult | null>(null);

  // Auto-poll server connectivity every 4 seconds when locked
  useEffect(() => {
    if (!backendUnavailable) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await testServerConnection(getServerUrl());
        if (res.ok && isMounted) {
          setBackendUnavailable(false);
          queryClient.invalidateQueries();
        }
      } catch {
        // keep polling
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [backendUnavailable, setBackendUnavailable, queryClient]);

  if (!backendUnavailable) return null;

  async function handleRetry() {
    setIsRetrying(true);
    setRetryResult(null);
    try {
      const res = await testServerConnection(getServerUrl());
      setRetryResult(res);
      if (res.ok) {
        setBackendUnavailable(false);
        queryClient.invalidateQueries();
      }
    } catch (err: any) {
      setRetryResult({
        ok: false,
        message: err.message || 'Connection failed',
      });
    } finally {
      setIsRetrying(false);
    }
  }

  function handleSaveUrl(e: React.FormEvent) {
    e.preventDefault();
    const saved = setServerUrl(urlInput);
    setCurrentUrl(saved);
    setUrlInput(saved);
    setShowConfig(false);
    handleRetry();
  }

  function handleResetUrl() {
    const def = resetServerUrl();
    setCurrentUrl(def);
    setUrlInput(def);
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 select-none"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-md p-6 max-w-md w-full shadow-2xl space-y-4 text-zinc-200">
        {/* Header with Server Alert Icon */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-red-950/70 border border-red-800/60 text-red-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ServerOff size={20} />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-zinc-100 leading-snug">
              Backend Server Unavailable
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              API Lab desktop cannot communicate with the backend server. Workspace synchronization and data operations are locked until the server is restored.
            </p>
          </div>
        </div>

        {/* Server Address Pill */}
        <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800/80 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2 truncate">
            <span className="text-zinc-500 font-sans text-[11px]">Server:</span>
            <span className="text-zinc-300 truncate">{currentUrl}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-900 transition flex items-center gap-1 text-[11px] font-sans flex-shrink-0"
            title="Configure server address"
          >
            <Settings size={12} />
            <span>{showConfig ? 'Hide' : 'Configure'}</span>
          </button>
        </div>

        {/* URL Configuration Form */}
        {showConfig && (
          <form onSubmit={handleSaveUrl} className="p-3 bg-zinc-950/80 border border-zinc-800/70 rounded space-y-2.5 text-xs">
            <label className="block text-[11px] font-medium text-zinc-400">
              Custom Server URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="http://localhost:8080"
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              />
              <button
                type="submit"
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded text-xs transition"
              >
                Apply
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleResetUrl}
                className="text-[11px] text-zinc-500 hover:text-zinc-400 underline"
              >
                Reset to default
              </button>
            </div>
          </form>
        )}

        {/* Feedback Alert if Retry Failed */}
        {retryResult && !retryResult.ok && (
          <div className="p-2.5 rounded bg-red-950/40 border border-red-900/60 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
            <span className="truncate">{retryResult.message}</span>
          </div>
        )}

        {retryResult && retryResult.ok && (
          <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-900/60 text-emerald-300 text-xs flex items-center gap-2">
            <Check size={13} className="text-emerald-400 flex-shrink-0" />
            <span className="truncate">Connected! Restoring workspace...</span>
          </div>
        )}

        {/* Primary Action Button */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-full py-2 px-4 rounded bg-primary hover:bg-primary-hover text-white text-xs font-medium transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={13} className={isRetrying ? 'animate-spin' : ''} />
            <span>{isRetrying ? 'Checking Connection...' : 'Refresh Connection'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
