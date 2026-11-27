import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, X } from 'lucide-react';
import { calculateFixPopoverPosition } from '../../utils/fixParsedMessage';
import { Z_INDEX } from '../../utils/floatingPosition';
import {
  composeOverlayClassName,
  getPopoverMotionClass,
} from '../../utils/overlayMotion';

export interface FixComboboxOption {
  value: string;
  code?: string;
  label: string;
  description?: string;
  badge?: string;
  badgeTone?: 'required' | 'conditional' | 'group' | 'neutral';
  section?: string;
  meta?: string;
}

export interface FixSearchableComboboxProps {
  getOptions: (query: string) => FixComboboxOption[];
  selectedValue?: string;
  selectedValues?: Set<string>;
  onSelect: (option: FixComboboxOption) => void;
  renderTrigger: (args: {
    open: boolean;
    toggle: () => void;
    triggerRef: React.RefObject<HTMLButtonElement>;
  }) => React.ReactNode;
  searchPlaceholder?: string;
  emptyMessage?: string;
  footerHint?: string;
  preferredWidth?: number;
  preferredMaxHeight?: number;
  ariaLabel: string;
  keepOpenOnSelect?: boolean;
}

export const FixSearchableCombobox: React.FC<FixSearchableComboboxProps> = ({
  getOptions,
  selectedValue,
  selectedValues,
  onSelect,
  renderTrigger,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No matching items.',
  footerHint = '↑↓ navigate · Enter select · Esc close',
  preferredWidth = 360,
  preferredMaxHeight = 320,
  ariaLabel,
  keepOpenOnSelect = false,
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const options = useMemo(() => (open ? getOptions(query) : []), [open, getOptions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;

    function refreshAnchor() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchorRect(rect);
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleScroll(event: Event) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    refreshAnchor();
    const timer = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    window.addEventListener('resize', refreshAnchor);
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleWindowKeyDown, true);

    return () => {
      window.cancelAnimationFrame(timer);
      window.removeEventListener('resize', refreshAnchor);
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleWindowKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.querySelector<HTMLElement>(
      `[data-combobox-index="${activeIndex}"]`
    );
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchorRect(rect);
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
  }

  function handleCommit(option: FixComboboxOption) {
    onSelect(option);
    if (!keepOpenOnSelect) {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      if (options.length > 0) {
        setActiveIndex((current) => (current + 1) % options.length);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      if (options.length > 0) {
        setActiveIndex((current) => (current - 1 + options.length) % options.length);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const target = options[activeIndex];
      if (target) handleCommit(target);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  const position = useMemo(() => {
    if (!anchorRect) return null;
    return calculateFixPopoverPosition(
      {
        top: anchorRect.top,
        right: anchorRect.right,
        bottom: anchorRect.bottom,
        left: anchorRect.left,
      },
      {
        width: typeof window === 'undefined' ? 1440 : window.innerWidth,
        height: typeof window === 'undefined' ? 900 : window.innerHeight,
      },
      preferredWidth,
      preferredMaxHeight
    );
  }, [anchorRect, preferredWidth, preferredMaxHeight]);

  const panelStyle: React.CSSProperties | undefined =
    open && anchorRect && position
      ? {
          position: 'fixed',
          left: position.left,
          width: position.width,
          maxHeight: position.maxHeight,
          zIndex: Z_INDEX.COMBOBOX,
          ...(position.placement === 'below'
            ? { top: anchorRect.bottom + 4 }
            : { bottom: window.innerHeight - anchorRect.top + 4 }),
        }
      : undefined;

  return (
    <>
      {renderTrigger({ open, toggle, triggerRef })}
      {open &&
        panelStyle &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel}
            data-tauri-no-drag=""
            style={panelStyle}
            className={composeOverlayClassName(
              'flex flex-col overflow-hidden rounded-sm border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/60',
              getPopoverMotionClass(position.placement, 'popover')
            )}
          >
            <div className="relative flex items-center border-b border-zinc-800 bg-zinc-950 px-2 py-1.5 flex-shrink-0">
              <Search size={11} className="text-zinc-500 flex-shrink-0 mr-1.5" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                spellCheck={false}
                className="w-full bg-transparent text-[11px] font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="ml-1 p-0.5 text-zinc-500 hover:text-zinc-200"
                  aria-label="Clear search"
                >
                  <X size={10} />
                </button>
              )}
            </div>

            <div
              ref={listRef}
              role="listbox"
              aria-label={ariaLabel}
              className="flex-1 overflow-y-auto py-1"
            >
              {options.length === 0 ? (
                <div className="px-3 py-4 text-center text-[11px] text-zinc-500">
                  {emptyMessage}
                </div>
              ) : (
                options.map((option, index) => {
                  const prevSection = index > 0 ? options[index - 1].section : undefined;
                  const showSectionHeader =
                    option.section && option.section !== prevSection;
                  const isHighlighted = index === activeIndex;
                  const isSelected = selectedValues
                    ? selectedValues.has(option.value)
                    : selectedValue === option.value;

                  return (
                    <React.Fragment key={`${option.section || ''}-${option.value}-${index}`}>
                      {showSectionHeader && (
                        <div className="px-2.5 pt-1.5 pb-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500 border-t border-zinc-900 first:border-t-0 first:pt-1">
                          {option.section}
                        </div>
                      )}
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-combobox-index={index}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleCommit(option);
                        }}
                        className={`flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition ${
                          isHighlighted
                            ? 'bg-zinc-850 text-zinc-100'
                            : isSelected
                            ? 'bg-blue-950/30 text-zinc-100'
                            : 'text-zinc-300 hover:bg-zinc-900'
                        }`}
                      >
                        {option.code !== undefined && (
                          <span
                            className={`mt-0.5 min-w-[34px] flex-shrink-0 rounded-sm border px-1 py-0.5 text-center font-mono text-[10px] font-semibold ${
                              isSelected
                                ? 'border-blue-700/70 bg-blue-950/50 text-blue-200'
                                : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                            }`}
                          >
                            {option.code}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-[11px] font-medium text-zinc-200">
                              {option.label}
                            </span>
                            {option.badge && (
                              <span
                                className={`flex-shrink-0 rounded-sm border px-1 py-0 text-[9px] font-mono uppercase ${badgeClassName(
                                  option.badgeTone
                                )}`}
                              >
                                {option.badge}
                              </span>
                            )}
                          </div>
                          {(option.description || option.meta) && (
                            <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                              {option.meta && (
                                <span className="font-mono text-zinc-400">
                                  {option.meta}
                                </span>
                              )}
                              {option.meta && option.description ? ' · ' : ''}
                              {option.description}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <Check size={11} className="mt-1 flex-shrink-0 text-blue-300" />
                        )}
                      </button>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {footerHint && (
              <div className="border-t border-zinc-900 bg-zinc-950 px-2.5 py-1 text-[9px] font-mono text-zinc-500 flex-shrink-0">
                {footerHint}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

function badgeClassName(tone?: FixComboboxOption['badgeTone']): string {
  switch (tone) {
    case 'required':
      return 'border-blue-800/70 bg-blue-950/40 text-blue-300';
    case 'conditional':
      return 'border-amber-800/60 bg-amber-950/30 text-amber-300';
    case 'group':
      return 'border-amber-700/60 bg-amber-950/40 text-amber-200';
    default:
      return 'border-zinc-800 bg-zinc-900 text-zinc-400';
  }
}
