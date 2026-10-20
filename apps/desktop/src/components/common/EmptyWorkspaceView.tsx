import React from 'react';
import appLogo from '../../assets/api-lab-logo.png';
import { useAppStore } from '../../store/useAppStore';

// ponytail: Static actions list; upgrade to dynamic recent requests or collection shortcuts when store supports it
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
      description: 'Search endpoints, collections, and environments',
      keyLabel: `${modKey} K`,
      onClick: () => setCommandPaletteOpen(true),
    },
    {
      label: 'Keyboard shortcuts',
      description: 'View workbench hotkeys and navigation chords',
      keyLabel: `${modKey} /`,
      onClick: () => setShortcutsHelpOpen(true),
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 select-none bg-zinc-950 text-zinc-300 min-h-0 overflow-y-auto">
      {/* Precision Emblem Tile */}
      <div className="w-16 h-16 rounded border border-zinc-800 bg-zinc-900/80 flex items-center justify-center mb-5 p-3.5">
        <img
          src={appLogo}
          alt="API Lab"
          className="w-full h-full object-contain filter brightness-95"
        />
      </div>

      <div className="text-center mb-6">
        <h2 className="text-sm font-semibold text-zinc-200 tracking-tight">API Lab Workbench</h2>
        <p className="text-xs text-zinc-500 mt-1">Select an endpoint from sidebar or trigger a command</p>
      </div>

      {/* High-density Action List */}
      <div className="w-full max-w-sm border border-zinc-800/80 rounded divide-y divide-zinc-800/60 bg-zinc-900/40">
        {actions.map((act) => (
          <button
            key={act.label}
            onClick={act.onClick}
            type="button"
            className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-850/80 transition-colors group"
          >
            <div>
              <div className="text-xs font-medium text-zinc-200 group-hover:text-white">
                {act.label}
              </div>
              <div className="text-[11px] text-zinc-500">
                {act.description}
              </div>
            </div>
            <kbd className="text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-750 px-2 py-0.5 rounded ml-3 flex-shrink-0">
              {act.keyLabel}
            </kbd>
          </button>
        ))}
      </div>
    </div>
  );
};
