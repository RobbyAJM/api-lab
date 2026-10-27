import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import {
  HTTP_METHODS,
  HttpMethod,
  getHttpMethodBadgeClass,
  normalizeHttpMethod,
  navigateMethodIndex,
  findMethodIndexByChar,
} from '../../utils/httpMethodUtils';

// ponytail: custom user-defined HTTP verbs skipped; add when WebDAV or custom gateway protocols are needed.

export interface HttpMethodDropdownProps {
  method: string;
  onChange: (method: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function HttpMethodDropdown({
  method,
  onChange,
  disabled = false,
  className = '',
  id = 'http-method-selector',
}: HttpMethodDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const normMethod = normalizeHttpMethod(method) || 'GET';
  const selectedIndex = HTTP_METHODS.indexOf(normMethod as HttpMethod);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(
    selectedIndex >= 0 ? selectedIndex : 0
  );

  const selectMethod = useCallback(
    (newMethod: string) => {
      onChange(newMethod);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onChange]
  );

  // Sync highlighted index when opened or method changed externally
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [isOpen, selectedIndex]);

  // Outside click to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation when open
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setIsOpen(true);
      } else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        const nextIdx = findMethodIndexByChar(e.key, HTTP_METHODS, selectedIndex);
        if (nextIdx >= 0) {
          e.preventDefault();
          selectMethod(HTTP_METHODS[nextIdx]);
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        navigateMethodIndex(prev, 'down', HTTP_METHODS.length)
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        navigateMethodIndex(prev, 'up', HTTP_METHODS.length)
      );
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlightedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHighlightedIndex(HTTP_METHODS.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < HTTP_METHODS.length) {
        selectMethod(HTTP_METHODS[highlightedIndex]);
      }
    } else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      const nextIdx = findMethodIndexByChar(e.key, HTTP_METHODS, highlightedIndex);
      if (nextIdx >= 0) {
        e.preventDefault();
        setHighlightedIndex(nextIdx);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative h-full flex-shrink-0 flex items-center ${className}`}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`HTTP Method: ${normMethod}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`h-full w-[94px] px-2 flex items-center justify-between gap-1.5 bg-transparent hover:bg-zinc-800/40 focus:bg-zinc-800/50 rounded-l transition cursor-pointer select-none group focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'bg-zinc-800/50' : ''
        }`}
      >
        <span
          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border transition-colors ${getHttpMethodBadgeClass(
            normMethod,
            isOpen
          )}`}
        >
          {normMethod}
        </span>
        <ChevronDown
          size={12}
          className={`text-zinc-500 transition-transform duration-150 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-zinc-300' : 'group-hover:text-zinc-300'
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="HTTP Methods"
          className="absolute top-[calc(100%+4px)] left-0 z-50 w-36 bg-zinc-950 border border-zinc-800 rounded p-1 space-y-0.5 font-mono shadow-2xl focus:outline-none animate-in fade-in zoom-in-95 duration-100"
        >
          {HTTP_METHODS.map((m, idx) => {
            const isSelected = m === normMethod;
            const isHighlighted = idx === highlightedIndex;
            return (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => selectMethod(m)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition cursor-pointer select-none border ${
                  isHighlighted
                    ? 'bg-zinc-900 border-zinc-700/60 text-zinc-100'
                    : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${getHttpMethodBadgeClass(
                      m,
                      isSelected
                    )}`}
                  >
                    {m}
                  </span>
                </div>
                {isSelected && (
                  <Check size={12} className="text-primary flex-shrink-0 ml-1.5" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
