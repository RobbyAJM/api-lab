import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  ArrowLeftRight,
  Radio,
  Sparkles,
  Zap,
  Database,
  Globe,
  Activity,
  Layers,
} from 'lucide-react';

export const EmptyWorkspaceView: React.FC = () => {
  const { setCommandPaletteOpen, setShortcutsHelpOpen } = useAppStore();

  const isMac =
    typeof navigator !== 'undefined' &&
    (/Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
      (navigator as any).userAgentData?.platform === 'macOS');
  const modKey = isMac ? '⌘' : 'Ctrl';

  const actions = [
    {
      label: 'Create new',
      keyLabel: `${modKey} N`,
      onClick: () => setCommandPaletteOpen(true),
    },
    {
      label: 'Import',
      keyLabel: `${modKey} O`,
      onClick: () => setCommandPaletteOpen(true),
    },
    {
      label: 'Find in workspace',
      keyLabel: `${modKey} K`,
      onClick: () => setCommandPaletteOpen(true),
    },
    {
      label: 'Open keyboard shortcuts',
      keyLabel: `${modKey} /`,
      onClick: () => setShortcutsHelpOpen(true),
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 select-none text-zinc-400 bg-zinc-950 min-h-0 overflow-y-auto">
      {/* Astronaut / API Explorer Emblem */}
      <div className="w-32 h-32 md:w-36 md:h-36 rounded-full bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-center mb-8 shadow-inner shadow-black/60 relative group">
        <svg
          viewBox="0 0 200 200"
          className="w-20 h-20 text-zinc-600/70 group-hover:text-zinc-500/90 transition-colors"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Stylized Floating Explorer / Astronaut Silhouette */}
          <circle cx="100" cy="54" r="22" stroke="currentColor" fill="rgba(39, 39, 42, 0.4)" />
          {/* Visor */}
          <path d="M92 48h16a8 8 0 0 1 8 8v2a8 8 0 0 1-8 8H92a8 8 0 0 1-8-8v-2a8 8 0 0 1 8-8z" fill="currentColor" opacity="0.3" />
          {/* Body */}
          <path d="M78 86c0-6 8-10 22-10s22 4 22 10v46c0 4-4 8-10 8H88c-6 0-10-4-10-8V86z" fill="rgba(39, 39, 42, 0.3)" />
          {/* Backpack */}
          <rect x="66" y="82" width="12" height="42" rx="4" fill="rgba(39, 39, 42, 0.5)" />
          {/* Limbs / Jet Pack Thrusters */}
          <path d="M88 140l-12 36" />
          <path d="M112 140l12 36" />
          <path d="M78 98l-18 20" />
          <path d="M122 98l20 22" />
        </svg>
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />
      </div>

      {/* Action Shortcuts Menu */}
      <div className="w-72 md:w-80 space-y-2 mb-10">
        {actions.map((act) => (
          <button
            key={act.label}
            onClick={act.onClick}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900/60 transition group text-left"
          >
            <span className="text-sm font-medium tracking-wide group-hover:translate-x-0.5 transition-transform">
              {act.label}
            </span>
            <kbd className="text-[11px] font-mono text-zinc-400 bg-zinc-900/90 border border-zinc-800/90 px-2 py-0.5 rounded shadow-sm">
              {act.keyLabel}
            </kbd>
          </button>
        ))}
      </div>

      {/* Bottom Protocol Icons Row */}
      <div className="flex items-center gap-5 text-zinc-600 pt-2 border-t border-zinc-900/80">
        <span title="HTTP / REST">
          <Globe size={15} className="hover:text-zinc-400 transition cursor-default" />
        </span>
        <span title="gRPC Unary & Streams">
          <Radio size={15} className="hover:text-zinc-400 transition cursor-default" />
        </span>
        <span title="Bidirectional Streams">
          <ArrowLeftRight size={15} className="hover:text-zinc-400 transition cursor-default" />
        </span>
        <span title="Real-time Events / WebSocket">
          <Zap size={15} className="hover:text-zinc-400 transition cursor-default" />
        </span>
        <span title="Server-Sent Events">
          <Activity size={15} className="hover:text-zinc-400 transition cursor-default" />
        </span>
        <span title="Payload Reflection">
          <Sparkles size={15} className="hover:text-zinc-400 transition cursor-default" />
        </span>
        <span title="Mock Storage / Cache">
          <Database size={15} className="hover:text-zinc-400 transition cursor-default" />
        </span>
        <span title="Workspace Collections">
          <Layers size={15} className="hover:text-zinc-400 transition cursor-default" />
        </span>
      </div>
    </div>
  );
};
