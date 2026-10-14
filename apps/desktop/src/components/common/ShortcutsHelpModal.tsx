import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getAllShortcuts } from '../../utils/shortcuts';
import { Keyboard, X } from 'lucide-react';

export const ShortcutsHelpModal: React.FC = () => {
  const { shortcutsHelpOpen, setShortcutsHelpOpen } = useAppStore();

  if (!shortcutsHelpOpen) return null;

  const shortcuts = getAllShortcuts();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

  const categories: ('Request' | 'Navigation' | 'General')[] = ['Request', 'Navigation', 'General'];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setShortcutsHelpOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 select-none">
          <div className="flex items-center gap-2">
            <Keyboard size={16} className="text-indigo-400" />
            <h3 className="text-xs font-semibold text-zinc-100">Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={() => setShortcutsHelpOpen(false)}
            className="text-zinc-500 hover:text-zinc-300 p-0.5"
          >
            <X size={14} />
          </button>
        </div>

        {/* Shortcuts List by Category */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {categories.map((cat) => {
            const catItems = shortcuts.filter((s) => s.category === cat);
            if (catItems.length === 0) return null;

            return (
              <div key={cat} className="space-y-1.5">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  {cat}
                </span>
                <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-lg divide-y divide-zinc-800/60">
                  {catItems.map((sc) => (
                    <div
                      key={sc.id}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                    >
                      <span className="text-zinc-300">{sc.description}</span>
                      <kbd className="font-mono text-[11px] font-semibold px-2 py-0.5 bg-zinc-800 border border-zinc-700/80 rounded text-zinc-200 shadow-sm flex-shrink-0 select-none">
                        {isMac ? sc.macKeyLabel : sc.keyLabel}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/40 text-[11px] text-zinc-500 flex justify-between items-center select-none">
          <span>Shortcuts are active across workspace</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
            Esc to close
          </kbd>
        </div>
      </div>
    </div>
  );
};
