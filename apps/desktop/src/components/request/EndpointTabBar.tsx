import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { Endpoint } from '@api-lab/api-types';
import { X, Radio, ArrowLeftRight, ArrowDownUp } from 'lucide-react';

export const EndpointTabBar: React.FC = () => {
  const { openEndpoints, activeEndpointId, openEndpoint, closeEndpoint } = useAppStore();

  if (openEndpoints.length === 0) {
    return null;
  }

  function renderMethodBadge(ep: Endpoint) {
    if (ep.protocol === 'http') {
      const method = ep.config?.method || 'GET';
      const colorCls =
        method === 'GET'
          ? 'text-emerald-400 bg-emerald-950/60 border-emerald-900/50'
          : method === 'POST'
          ? 'text-blue-400 bg-blue-950/60 border-blue-900/50'
          : method === 'PUT' || method === 'PATCH'
          ? 'text-amber-400 bg-amber-950/60 border-amber-900/50'
          : 'text-red-400 bg-red-950/60 border-red-900/50';

      return (
        <span
          className={`text-[9px] font-mono font-bold px-1 py-0.2 rounded border ${colorCls} select-none`}
        >
          {method}
        </span>
      );
    }

    const streamType = ep.config?.stream_type || 'unary';
    if (streamType === 'bidi_stream') {
      return (
        <span
          title="gRPC Bidirectional Stream"
          className="text-[9px] font-mono font-bold px-1 py-0.2 rounded text-amber-300 bg-amber-950/60 border border-amber-800/60 flex items-center gap-0.5 select-none"
        >
          <ArrowLeftRight size={8} /> STREAM
        </span>
      );
    }

    if (streamType === 'omni_stream') {
      return (
        <span
          title="gRPC Omnidirectional Stream"
          className="text-[9px] font-mono font-bold px-1 py-0.2 rounded text-amber-300 bg-amber-950/60 border border-amber-800/60 flex items-center gap-0.5 select-none"
        >
          <ArrowDownUp size={8} /> STREAM
        </span>
      );
    }

    return (
      <span
        title="gRPC Unary Call"
        className="text-[9px] font-mono font-bold px-1 py-0.2 rounded text-purple-400 bg-purple-950/60 border border-purple-800/60 flex items-center gap-0.5 select-none"
      >
        <Radio size={8} /> gRPC
      </span>
    );
  }

  return (
    <div className="flex items-center h-9 bg-zinc-950 border-b border-zinc-800 overflow-x-auto select-none scrollbar-none flex-shrink-0">
      {openEndpoints.map((ep) => {
        const isActive = ep.id === activeEndpointId;
        return (
          <div
            key={ep.id}
            onClick={() => openEndpoint(ep)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeEndpoint(ep.id);
              }
            }}
            className={`group flex items-center gap-1.5 h-full px-3 text-xs cursor-pointer transition-colors border-r ${
              isActive
                ? 'bg-zinc-900 text-zinc-100 font-medium border-r-zinc-800 border-t-2 border-t-indigo-500 shadow-sm'
                : 'bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border-r-zinc-800/60 border-t-2 border-t-transparent'
            }`}
            title={`${ep.name} (${ep.protocol.toUpperCase()})`}
          >
            {renderMethodBadge(ep)}
            <span className="truncate max-w-[140px] text-xs font-medium">{ep.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeEndpoint(ep.id);
              }}
              className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition opacity-60 group-hover:opacity-100 ml-1"
              title="Close tab (Middle click)"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
