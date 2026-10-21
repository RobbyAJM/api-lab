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
      className={`relative flex items-center overflow-hidden font-mono text-xs cursor-text ${className}`}
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
        onChange={(e) => onChange(e.target.value)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onKeyDown={(e) => {
          if (hoverState && (e.key === 'Escape' || e.key === 'Enter')) {
            setHoverState(null);
          }
        }}
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
        className={`w-full h-full px-3 py-1.5 font-mono text-xs bg-transparent text-transparent caret-zinc-100 focus:outline-none placeholder-transparent selection:bg-primary/40 ${inputClassName}`}
      />

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
