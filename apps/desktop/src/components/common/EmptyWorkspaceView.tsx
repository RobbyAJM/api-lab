import React from 'react';
import appLogo from '../../assets/api-lab-logo.png';
import { useAppStore } from '../../store/useAppStore';

export const EmptyWorkspaceView: React.FC = () => {
  const { setCommandPaletteOpen, setShortcutsHelpOpen } = useAppStore();

  const isMac =
    typeof navigator !== 'undefined' &&
    (/Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
      (navigator as any).userAgentData?.platform === 'macOS');
  const modKey = isMac ? '⌘' : 'Ctrl';

  const actions = [
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
      {/* Primary API Lab Logo & Emblem */}
      <div className="w-28 h-28 md:w-32 md:h-32 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-center mb-8 shadow-2xl relative group p-5">
        <img
          src={appLogo}
          alt="API Lab Logo"
          className="w-full h-full object-contain filter drop-shadow-md group-hover:scale-105 transition-transform duration-200"
        />
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
      </div>

      {/* Action Shortcuts Menu */}
      <div className="w-72 md:w-80 space-y-2">
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
    </div>
  );
};
