import React, { useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { tokenizeVariables, getVariableTokenClassName, type VariableSource } from '../../utils/variableHighlight';
import { findHoveredVariableToken, createHoverTimerController, type BoundingBox } from '../../utils/variableHover';
import { VariableHoverCard } from './VariableHoverCard';
import type { Environment, VariableResponse } from '@api-lab/api-types';

interface VariableInputProps {
  value: string;
  onChange: (val: string) => void;
  variables?: VariableSource;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export const VariableInput: React.FC<VariableInputProps> = ({
  value,
  onChange,
  variables,
  suggestions,
  placeholder,
  className = '',
  inputClassName = '',
  disabled = false,
}) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hoverTimer = useRef(createHoverTimerController()).current;

  const { activeWorkspaceId, activeEnvironmentId } = useAppStore();

  const [hoverState, setHoverState] = useState<{
    varName: string;
    rect: BoundingBox;
  } | null>(null);
  const [completionState, setCompletionState] = useState<{
    isVariable: boolean;
    items: string[];
    start: number;
    selected: number;
  } | null>(null);

  // Fetch active environment variables for rich metadata (is_sensitive, id, etc.)
  const { data: envVars = [] } = useQuery<VariableResponse[]>({
    queryKey: ['variables', activeEnvironmentId],
    queryFn: () =>
      activeEnvironmentId
        ? apiRequest<VariableResponse[]>(`/environments/${activeEnvironmentId}/variables`)
        : Promise.resolve([]),
    enabled: !!activeEnvironmentId,
  });

  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest<Environment[]>(`/workspaces/${activeWorkspaceId}/environments`)
        : Promise.resolve([]),
    enabled: !!activeWorkspaceId,
  });

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);

  // Prefer provided variables if explicitly given; otherwise use envVars
  const effectiveVars = variables !== undefined ? variables : envVars;

  function getVariableNames(): string[] {
    if (Array.isArray(effectiveVars)) return effectiveVars.map((v) => v.key);
    if (effectiveVars instanceof Set) return Array.from(effectiveVars);
    if (effectiveVars instanceof Map) return Array.from(effectiveVars.keys());
    return effectiveVars ? Object.keys(effectiveVars) : [];
  }

  function updateCompletion(nextValue: string, cursor: number) {
    const varMatch = nextValue.slice(0, cursor).match(/\{\{([A-Za-z0-9_]*)$/);
    if (varMatch) {
      const query = varMatch[1].toLowerCase();
      const items = getVariableNames()
        .filter((name) => name.toLowerCase().includes(query))
        .slice(0, 8);
      setCompletionState(
        items.length > 0
          ? {
              isVariable: true,
              items,
              start: cursor - varMatch[1].length,
              selected: 0,
            }
          : null
      );
      return;
    }

    if (suggestions && suggestions.length > 0) {
      const trimmed = nextValue.trim().toLowerCase();
      const filtered = trimmed
        ? suggestions.filter((s) => s.toLowerCase().includes(trimmed))
        : suggestions;
      setCompletionState(
        filtered.length > 0
          ? {
              isVariable: false,
              items: filtered.slice(0, 8),
              start: 0,
              selected: 0,
            }
          : null
      );
      return;
    }

    setCompletionState(null);
  }

  function handleSelectCompletion(item: string) {
    if (!completionState) return;
    if (completionState.isVariable) {
      insertVariable(item);
    } else {
      insertSuggestion(item);
    }
  }

  function insertVariable(name: string) {
    const input = inputRef.current;
    if (!input || !completionState) return;
    const before = value.slice(0, completionState.start);
    const after = value.slice(input.selectionStart ?? value.length);
    const inserted = `${name}}}`;
    const nextValue = `${before}${inserted}${after}`;
    const nextCursor = completionState.start + inserted.length;
    setCompletionState(null);
    onChange(nextValue);
    requestAnimationFrame(() => {
      input.setSelectionRange(nextCursor, nextCursor);
      input.focus();
    });
  }

  function insertSuggestion(val: string) {
    setCompletionState(null);
    onChange(val);
    const input = inputRef.current;
    if (input) {
      requestAnimationFrame(() => {
        input.setSelectionRange(val.length, val.length);
        input.focus();
      });
    }
  }

  function handleScroll(e: React.UIEvent<HTMLInputElement>) {
    if (backdropRef.current) {
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }

  function scheduleClear() {
    hoverTimer.schedule(() => {
      setHoverState(null);
    }, 300);
  }

  function cancelClear() {
    hoverTimer.cancel();
  }

  function handleMouseMove(e: React.MouseEvent<HTMLInputElement>) {
    const hit = findHoveredVariableToken(backdropRef.current, e.clientX, e.clientY);
    if (hit) {
      cancelClear();
      setHoverState({ varName: hit.name, rect: hit.rect });
    } else {
      if (hoverState) {
        scheduleClear();
      }
    }
  }

  function handleMouseLeave() {
    scheduleClear();
  }

  useEffect(() => {
    return () => {
      hoverTimer.cancel();
    };
  }, [hoverTimer]);

  const tokens = tokenizeVariables(value, effectiveVars);

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={`relative flex items-center overflow-visible font-mono text-xs cursor-text ${className}`}
    >
      {/* Syntax Highlight Backdrop */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="absolute inset-0 flex items-center px-3 py-1.5 whitespace-pre pointer-events-none overflow-hidden select-none"
      >
        {tokens.length === 0 ? (
          <span className="text-zinc-500">{placeholder || ''}</span>
        ) : (
          tokens.map((token, idx) => {
            if (!token.isVariable) {
              return (
                <span key={idx} className="text-zinc-200">
                  {token.text}
                </span>
              );
            }

            return (
              <span
                key={idx}
                data-var-name={token.name}
                className={getVariableTokenClassName(token.isDefined ?? false, false)}
              >
                {token.text}
              </span>
            );
          })
        )}
      </div>

      {/* Actual Input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          updateCompletion(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onFocus={() => {
          if (suggestions && suggestions.length > 0) {
            updateCompletion(value, value.length);
          }
        }}
        onBlur={() => {
          setTimeout(() => setCompletionState(null), 150);
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onKeyDown={(e) => {
          if (hoverState && (e.key === 'Escape' || e.key === 'Enter')) {
            setHoverState(null);
          }
          if (completionState && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const delta = e.key === 'ArrowDown' ? 1 : -1;
            setCompletionState((prev) => prev && {
              ...prev,
              selected: (prev.selected + delta + prev.items.length) % prev.items.length,
            });
          } else if (completionState && (e.key === 'Enter' || e.key === 'Tab')) {
            e.preventDefault();
            handleSelectCompletion(completionState.items[completionState.selected]);
          } else if (e.key === 'Escape') {
            setCompletionState(null);
          }
        }}
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
        className={`w-full h-full px-3 py-1.5 font-mono text-xs bg-transparent text-transparent caret-zinc-100 focus:outline-none placeholder-transparent selection:bg-primary/40 ${inputClassName}`}
      />

      {completionState && (
        <div className="absolute z-30 left-0 top-full mt-1 min-w-48 max-w-80 border border-zinc-700 bg-zinc-900 shadow-xl rounded overflow-hidden">
          {completionState.items.map((name, index) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectCompletion(name);
              }}
              className={`flex items-center justify-between w-full text-left px-2.5 py-1.5 font-mono text-[11px] ${
                index === completionState.selected ? 'bg-primary/20 text-white' : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <span>{completionState.isVariable ? `{{${name}}}` : name}</span>
              {!completionState.isVariable && (
                <span className="text-[9px] font-sans px-1 py-0.2 rounded bg-zinc-800 text-emerald-400 border border-zinc-700">
                  enum
                </span>
              )}
            </button>
          ))}
          <div className="border-t border-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
            Enter / Tab to insert
          </div>
        </div>
      )}

      {/* Variable Hover Card */}
      {hoverState && (
        <VariableHoverCard
          varName={hoverState.varName}
          rect={hoverState.rect}
          variables={envVars.length > 0 ? envVars : effectiveVars}
          activeEnv={activeEnv}
          onClose={() => setHoverState(null)}
          onMouseEnter={cancelClear}
          onMouseLeave={scheduleClear}
        />
      )}
    </div>
  );
};
