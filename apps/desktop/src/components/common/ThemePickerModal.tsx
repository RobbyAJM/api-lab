import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { THEMES, getThemeById } from '../../utils/theme';
import { createBackdropClickHandler } from '../../utils/modalDismiss';
import { Check, Palette, Search, X } from 'lucide-react';

export const ThemePickerModal: React.FC = () => {
  const { themeModalOpen, setThemeModalOpen, activeThemeId, setTheme } = useAppStore();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const filteredThemes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return THEMES;
    return THEMES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.isLight ? 'light' : 'dark').includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (themeModalOpen) {
      setQuery('');
      setTimeout(() => {
        inputRef.current?.focus();
        itemRefs.current[activeThemeId]?.scrollIntoView({ block: 'nearest' });
      }, 50);
    }
  }, [themeModalOpen, activeThemeId]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (filteredThemes.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentIndex = filteredThemes.findIndex((t) => t.id === activeThemeId);
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % filteredThemes.length;
      const nextTheme = filteredThemes[nextIndex];
      setTheme(nextTheme.id);
      itemRefs.current[nextTheme.id]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIndex = filteredThemes.findIndex((t) => t.id === activeThemeId);
      const prevIndex =
        currentIndex <= 0 ? filteredThemes.length - 1 : (currentIndex - 1) % filteredThemes.length;
      const prevTheme = filteredThemes[prevIndex];
      setTheme(prevTheme.id);
      itemRefs.current[prevTheme.id]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setThemeModalOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setThemeModalOpen(false);
    }
  }

  if (!themeModalOpen) return null;

  return (
    <div
      onClick={createBackdropClickHandler(() => setThemeModalOpen(false))}
      className="fixed inset-0 z-50 bg-black/15 flex items-end sm:items-center justify-start p-4 select-none"
    >
      <div
        onKeyDown={handleKeyDown}
        className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl flex flex-col max-h-[500px] overflow-hidden text-zinc-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <Palette size={14} className="text-primary" />
            <span className="font-semibold text-xs tracking-tight text-zinc-100">
              Workbench Themes
            </span>
          </div>
          <button
            onClick={() => setThemeModalOpen(false)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            title="Close (Escape)"
          >
            <X size={13} />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-2 border-b border-zinc-800/80 bg-zinc-900/30">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus-within:border-primary transition">
            <Search size={13} className="text-zinc-500 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search (use ↑/↓ keys for live preview)..."
              className="bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 outline-none w-full font-sans"
            />
          </div>
        </div>

        {/* Themes List */}
        <div className="overflow-y-auto p-1.5 space-y-1 flex-1">
          {filteredThemes.map((theme) => {
            const isSelected = theme.id === activeThemeId;
            return (
              <button
                key={theme.id}
                ref={(el) => {
                  itemRefs.current[theme.id] = el;
                }}
                onClick={() => {
                  setTheme(theme.id);
                  setThemeModalOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-xs transition group text-left ${
                  isSelected
                    ? 'bg-zinc-850 text-zinc-100 border border-zinc-700'
                    : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Color Swatch Preview */}
                  <div
                    className="w-5 h-5 rounded border border-zinc-700 flex items-center justify-center p-0.5 shadow-sm flex-shrink-0"
                    style={{ backgroundColor: theme.palette.neutral }}
                    title={`Background: ${theme.palette.neutral}`}
                  >
                    <div className="flex gap-0.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: theme.palette.primary }}
                      />
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            theme.palette.accent ?? theme.palette.info,
                        }}
                      />
                    </div>
                  </div>

                  <div className="truncate flex items-center gap-1.5">
                    <span className="font-medium text-xs truncate">
                      {theme.name}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1 py-0.2 rounded border ${
                        theme.isLight
                          ? 'border-amber-500/40 text-amber-300 bg-amber-950/30'
                          : 'border-zinc-700/60 text-zinc-400 bg-zinc-900/60'
                      }`}
                    >
                      {theme.isLight ? 'Light' : 'Dark'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isSelected && (
                    <Check size={13} className="text-primary font-bold" />
                  )}
                </div>
              </button>
            );
          })}

          {filteredThemes.length === 0 && (
            <div className="p-4 text-center text-xs text-zinc-500">
              No matching themes found
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-3 py-1.5 border-t border-zinc-800 bg-zinc-900/40 text-[10px] text-zinc-500 flex items-center justify-between">
          <span>
            {THEMES.length} themes • Navigate with ↑/↓
          </span>
          <span className="font-mono text-zinc-400">
            Active: {getThemeById(activeThemeId).name}
          </span>
        </div>
      </div>
    </div>
  );
};
