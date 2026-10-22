import React, { useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import { tokenizeVariables, type VariableSource } from '../../utils/variableHighlight';
import { findHoveredVariableToken, type BoundingBox } from '../../utils/variableHover';
import { VariableHoverCard } from './VariableHoverCard';
import type { Environment, VariableResponse } from '@api-lab/api-types';

interface VariableInputProps {
  value: string;
  onChange: (val: string) => void;
  variables?: VariableSource;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export const VariableInput: React.FC<VariableInputProps> = ({
  value,
  onChange,
  variables,
  placeholder,
  className = '',
  inputClassName = '',
  disabled = false,
}) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimerRef = useRef<any>(null);

  const { activeWorkspaceId, activeEnvironmentId } = useAppStore();

  const [hoverState, setHoverState] = useState<{
    varName: string;
    rect: BoundingBox;
  } | null>(null);
  const [variableCompletion, setVariableCompletion] = useState<{
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

  function updateVariableCompletion(nextValue: string, cursor: number) {
    const match = nextValue.slice(0, cursor).match(/\{\{([A-Za-z0-9_]*)$/);
    if (!match) {
      setVariableCompletion(null);
      return;
    }
    const query = match[1].toLowerCase();
    const items = getVariableNames()
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 8);
    setVariableCompletion(items.length > 0 ? {
      items,
      start: cursor - match[1].length,
      selected: 0,
    } : null);
  }

  function insertVariable(name: string) {
    const input = inputRef.current;
    if (!input || !variableCompletion) return;
    const before = value.slice(0, variableCompletion.start);
    const after = value.slice(input.selectionStart ?? value.length);
    const inserted = `${name}}}`;
    const nextValue = `${before}${inserted}${after}`;
    const nextCursor = variableCompletion.start + inserted.length;
    setVariableCompletion(null);
    onChange(nextValue);
    requestAnimationFrame(() => {
      input.setSelectionRange(nextCursor, nextCursor);
      input.focus();
    });
  }

  function handleScroll(e: React.UIEvent<HTMLInputElement>) {
    if (backdropRef.current) {
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }

  function scheduleClear() {
    clearTimerRef.current = setTimeout(() => {
      setHoverState(null);
    }, 200);
  }

  function cancelClear() {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
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
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

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

            if (token.isDefined) {
              return (
                <span
                  key={idx}
                  data-var-name={token.name}
                  className="text-emerald-300 font-semibold bg-emerald-950/70 border border-emerald-800/60 rounded px-1 inline-block -my-0.5"
                >
                  {token.text}
                </span>
              );
            }

            return (
              <span
                key={idx}
                data-var-name={token.name}
                className="text-rose-300 font-semibold bg-rose-950/70 border border-rose-800/60 rounded px-1 inline-block -my-0.5"
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
          updateVariableCompletion(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onKeyDown={(e) => {
          if (hoverState && (e.key === 'Escape' || e.key === 'Enter')) {
            setHoverState(null);
          }
          if (variableCompletion && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const delta = e.key === 'ArrowDown' ? 1 : -1;
            setVariableCompletion((prev) => prev && {
              ...prev,
              selected: (prev.selected + delta + prev.items.length) % prev.items.length,
            });
          } else if (variableCompletion && (e.key === 'Enter' || e.key === 'Tab')) {
            e.preventDefault();
            insertVariable(variableCompletion.items[variableCompletion.selected]);
          } else if (e.key === 'Escape') {
            setVariableCompletion(null);
          }
        }}
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
        className={`w-full h-full px-3 py-1.5 font-mono text-xs bg-transparent text-transparent caret-zinc-100 focus:outline-none placeholder-transparent selection:bg-primary/40 ${inputClassName}`}
      />

      {variableCompletion && (
        <div className="absolute z-30 left-0 top-full mt-1 min-w-48 max-w-72 border border-zinc-700 bg-zinc-900 shadow-xl rounded overflow-hidden">
          {variableCompletion.items.map((name, index) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertVariable(name);
              }}
              className={`block w-full text-left px-2.5 py-1.5 font-mono text-[11px] ${index === variableCompletion.selected ? 'bg-primary/20 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
            >
              {`{{${name}}}`}
            </button>
          ))}
          <div className="border-t border-zinc-800 px-2 py-1 text-[10px] text-zinc-500">Enter / Tab to insert</div>
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
