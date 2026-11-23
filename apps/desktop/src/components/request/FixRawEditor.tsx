import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import type { Environment, VariableResponse } from '@api-lab/api-types';
import { AlertTriangle } from 'lucide-react';
import { apiRequest } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { FixDictionary } from '../../utils/fixDictionary';
import {
  buildFixRawHoverInfo,
  calculateFixRawEditorHeight,
  findHoveredFixFieldToken,
  FIX_RAW_MIN_HEIGHT_PX,
  getFixRawTokenClassName,
  isFixRawMultiline,
  tokenizeFixRaw,
  type FixRawHoverInfo,
} from '../../utils/fixHighlight';
import { calculateFixPopoverPosition } from '../../utils/fixParsedMessage';
import type { VariableSource } from '../../utils/variableHighlight';
import {
  createHoverTimerController,
  findHoveredVariableToken,
  type BoundingBox,
} from '../../utils/variableHover';
import { VariableHoverCard } from '../common/VariableHoverCard';

export interface FixRawEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  dictionary?: FixDictionary | null;
  variables?: VariableSource;
  placeholder?: string;
  ariaLabel?: string;
}

interface VariableCompletionState {
  items: string[];
  start: number;
  selected: number;
  anchor: DOMRect;
}

interface FixFieldTooltipState {
  info: FixRawHoverInfo;
  rect: BoundingBox;
}

export const FixRawEditor: React.FC<FixRawEditorProps> = ({
  value,
  onChange,
  dictionary,
  variables,
  placeholder = '35=D|11=ORDER-1|55=AAPL|54=1|38=10|40=2',
  ariaLabel = 'FIX application message',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const varHoverTimer = useRef(createHoverTimerController()).current;

  const { activeWorkspaceId, activeEnvironmentId } = useAppStore();

  const [editorHeight, setEditorHeight] = useState<number>(FIX_RAW_MIN_HEIGHT_PX);
  const [textareaClientWidth, setTextareaClientWidth] = useState<number>(0);
  const [varHoverState, setVarHoverState] = useState<{
    varName: string;
    rect: BoundingBox;
  } | null>(null);
  const [fixTooltip, setFixTooltip] = useState<FixFieldTooltipState | null>(null);
  const [completion, setCompletion] = useState<VariableCompletionState | null>(null);

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

  const activeEnv = environments.find((env) => env.id === activeEnvironmentId);
  const effectiveVars = variables !== undefined ? variables : envVars;

  const multiline = useMemo(() => isFixRawMultiline(value), [value]);

  const tokens = useMemo(
    () => tokenizeFixRaw(value, dictionary, effectiveVars),
    [value, dictionary, effectiveVars]
  );

  const variableNames = useMemo(() => {
    const names = new Set<string>();
    if (Array.isArray(effectiveVars)) {
      for (const item of effectiveVars) names.add(item.key);
    } else if (effectiveVars instanceof Set) {
      for (const item of effectiveVars) names.add(item);
    } else if (effectiveVars instanceof Map) {
      for (const key of effectiveVars.keys()) names.add(key);
    } else if (effectiveVars) {
      for (const key of Object.keys(effectiveVars)) names.add(key);
    }
    for (const item of envVars) names.add(item.key);
    return Array.from(names);
  }, [effectiveVars, envVars]);

  // Keep <pre> width strictly locked to textarea.clientWidth so appearing vertical
  // scrollbars never shift soft-wrap breakpoints between backdrop and caret.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const updateWidth = () => {
      setTextareaClientWidth(textarea.clientWidth);
    };
    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  // Auto-grow smoothly from measured backdrop content height without resetting
  // textarea height (prevents scroll jump flicker during typing).
  useLayoutEffect(() => {
    const measureEl = contentMeasureRef.current;
    if (!measureEl) return;
    // py-2 adds 16px (8px top + 8px bottom)
    const naturalHeight = measureEl.offsetHeight + 16;
    const nextHeight = calculateFixRawEditorHeight(naturalHeight, multiline);
    setEditorHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, [value, multiline, textareaClientWidth]);

  useEffect(() => {
    return () => {
      varHoverTimer.cancel();
    };
  }, [varHoverTimer]);

  function scheduleClearVarHover() {
    varHoverTimer.schedule(() => {
      setVarHoverState(null);
    }, 300);
  }

  function cancelClearVarHover() {
    varHoverTimer.cancel();
  }

  function handleScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    if (preRef.current) {
      preRef.current.scrollTop = event.currentTarget.scrollTop;
      preRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
    setFixTooltip(null);
    setVarHoverState(null);
  }

  function updateVariableCompletion(nextValue: string, cursor: number) {
    const match = nextValue.slice(0, cursor).match(/\{\{([A-Za-z0-9_]*)$/);
    if (!match) {
      setCompletion(null);
      return;
    }
    const query = match[1].toLowerCase();
    const items = variableNames
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 8);
    if (items.length === 0) {
      setCompletion(null);
      return;
    }
    const anchor = containerRef.current?.getBoundingClientRect();
    if (!anchor) {
      setCompletion(null);
      return;
    }
    setCompletion({
      items,
      start: cursor - match[1].length,
      selected: 0,
      anchor,
    });
  }

  function insertVariable(name: string) {
    const textarea = textareaRef.current;
    if (!textarea || !completion) return;
    const cursor = textarea.selectionStart ?? value.length;
    const before = value.slice(0, completion.start);
    const after = value.slice(cursor);
    const inserted = `${name}}}`;
    const nextValue = `${before}${inserted}${after}`;
    const nextCursor = completion.start + inserted.length;
    setCompletion(null);
    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.setSelectionRange(nextCursor, nextCursor);
      textarea.focus();
    });
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = event.target.value;
    onChange(nextValue);
    updateVariableCompletion(nextValue, event.target.selectionStart ?? nextValue.length);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    setFixTooltip(null);
    if (varHoverState && (event.key === 'Escape' || event.key === 'Enter')) {
      setVarHoverState(null);
    }

    // Never intercept Ctrl+Enter / Cmd+Enter (handled by parent Send shortcut)
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      setCompletion(null);
      return;
    }

    if (!completion) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setCompletion(
        (prev) =>
          prev && {
            ...prev,
            selected: (prev.selected + delta + prev.items.length) % prev.items.length,
          }
      );
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      const selectedName = completion.items[completion.selected];
      if (selectedName) insertVariable(selectedName);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setCompletion(null);
    }
  }

  function handleMouseMove(event: React.MouseEvent<HTMLTextAreaElement>) {
    if (event.buttons !== 0) {
      setFixTooltip(null);
      return;
    }

    // Priority 1: {{VARIABLE}} hover card
    const varHit = findHoveredVariableToken(preRef.current, event.clientX, event.clientY);
    if (varHit) {
      cancelClearVarHover();
      setFixTooltip(null);
      setVarHoverState({ varName: varHit.name, rect: varHit.rect });
      return;
    }

    if (varHoverState) {
      scheduleClearVarHover();
    }

    // Priority 2: FIX dictionary tag / value / syntax error tooltip
    const fixHit = findHoveredFixFieldToken(preRef.current, event.clientX, event.clientY);
    if (fixHit) {
      const info = buildFixRawHoverInfo(fixHit, dictionary);
      setFixTooltip({ info, rect: fixHit.rect });
    } else {
      setFixTooltip(null);
    }
  }

  function handleMouseLeave() {
    scheduleClearVarHover();
    setFixTooltip(null);
  }

  const trailingNewlineSentinel = value.endsWith('\n') || value.endsWith('\r');

  return (
    <div
      ref={containerRef}
      style={{ height: editorHeight }}
      className="relative flex-1 min-w-0 overflow-hidden bg-transparent"
    >
      {/* Syntax Highlight Backdrop */}
      <pre
        ref={preRef}
        aria-hidden="true"
        style={textareaClientWidth > 0 ? { width: textareaClientWidth } : undefined}
        className="absolute top-0 bottom-0 left-0 m-0 px-3 py-2 pointer-events-none overflow-hidden font-mono text-xs leading-5 whitespace-pre-wrap break-all select-none text-zinc-200"
      >
        <div ref={contentMeasureRef}>
          {value === '' ? (
            <span className="text-zinc-600">{placeholder}</span>
          ) : (
            <>
              {tokens.map((token) => (
                <span
                  key={`${token.start}-${token.end}-${token.kind}`}
                  data-var-name={token.kind === 'variable' ? token.varName : undefined}
                  data-fix-tag={token.fieldTag !== undefined ? String(token.fieldTag) : undefined}
                  data-fix-val={token.fieldRawValue}
                  data-fix-error={token.errorReason}
                  className={getFixRawTokenClassName(token)}
                >
                  {token.text}
                </span>
              ))}
              {trailingNewlineSentinel && ' '}
            </>
          )}
        </div>
      </pre>

      {/* Transparent Editable Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onBlur={() => {
          setFixTooltip(null);
          window.setTimeout(() => setCompletion(null), 150);
        }}
        spellCheck={false}
        aria-label={ariaLabel}
        className="absolute inset-0 w-full h-full m-0 px-3 py-2 overflow-y-auto resize-none bg-transparent font-mono text-xs leading-5 whitespace-pre-wrap break-all text-transparent caret-zinc-100 placeholder-transparent focus:outline-none selection:bg-primary/40 select-text"
      />

      {/* {{VARIABLE}} Hover Card */}
      {varHoverState && (
        <VariableHoverCard
          varName={varHoverState.varName}
          rect={varHoverState.rect}
          variables={envVars.length > 0 ? envVars : effectiveVars}
          activeEnv={activeEnv}
          onClose={() => setVarHoverState(null)}
          onMouseEnter={cancelClearVarHover}
          onMouseLeave={scheduleClearVarHover}
        />
      )}

      {/* Lightweight FIX Tag / Enum / Error Hover Tooltip */}
      {fixTooltip && !varHoverState && !completion && (
        <FixRawFieldTooltip info={fixTooltip.info} rect={fixTooltip.rect} />
      )}

      {/* {{VARIABLE}} Autocomplete Dropdown */}
      {completion && (
        <FixRawVariableCompletionMenu
          completion={completion}
          onSelect={insertVariable}
        />
      )}
    </div>
  );
};

function FixRawFieldTooltip({
  info,
  rect,
}: {
  info: FixRawHoverInfo;
  rect: BoundingBox;
}) {
  const position = calculateFixPopoverPosition(
    {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
    },
    {
      width: typeof window === 'undefined' ? 1440 : window.innerWidth,
      height: typeof window === 'undefined' ? 900 : window.innerHeight,
    },
    340,
    220
  );

  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.left,
    maxWidth: position.width,
    zIndex: 90,
    ...(position.placement === 'below'
      ? { top: rect.bottom + 6 }
      : { bottom: window.innerHeight - rect.top + 6 }),
  };

  return createPortal(
    <div
      role="tooltip"
      style={style}
      className="pointer-events-none rounded-sm border border-zinc-700 bg-zinc-950 px-2.5 py-2 shadow-2xl shadow-black/60 space-y-1"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {info.tag !== undefined && (
          <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-1 py-0 font-mono text-[10px] font-semibold text-zinc-200 flex-shrink-0">
            {info.tag}
          </span>
        )}
        <span className="truncate text-[11px] font-semibold text-zinc-100">
          {info.name}
        </span>
        {info.type && (
          <span className="ml-auto rounded-sm border border-zinc-800 bg-zinc-900/70 px-1 py-0 font-mono text-[9px] text-zinc-400 flex-shrink-0">
            {info.type}
          </span>
        )}
      </div>

      {info.errorReason && (
        <div className="flex items-start gap-1 text-[10px] text-red-300">
          <AlertTriangle size={10} className="mt-0.5 flex-shrink-0 text-red-400" />
          <span>{info.errorReason}</span>
        </div>
      )}

      {info.valueLabel && (
        <div className="text-[10px] font-mono text-teal-300">
          <span>{info.rawValue}</span>
          <span className="text-zinc-500"> · </span>
          <span className="font-sans font-medium text-zinc-200">{info.valueLabel}</span>
        </div>
      )}

      {info.enumDescription && (
        <p className="text-[10px] leading-snug text-zinc-400 line-clamp-2">
          {info.enumDescription}
        </p>
      )}

      {!info.enumDescription && info.description && (
        <p className="text-[10px] leading-snug text-zinc-400 line-clamp-2">
          {info.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[9px] font-mono">
        {info.isEnvelope && (
          <span className="rounded-sm border border-sky-900/70 bg-sky-950/35 px-1 py-0 text-sky-300">
            auto-generated on send
          </span>
        )}
        {info.isGroupCounter && (
          <span className="rounded-sm border border-amber-800/60 bg-amber-950/35 px-1 py-0 text-amber-300">
            repeating group count
          </span>
        )}
        {info.isSensitive && (
          <span className="rounded-sm border border-amber-800/60 bg-amber-950/35 px-1 py-0 text-amber-300">
            sensitive credential
          </span>
        )}
        {info.isUnknownTag && (
          <span className="rounded-sm border border-zinc-800 bg-zinc-900 px-1 py-0 text-zinc-400">
            custom / non-standard tag
          </span>
        )}
        {info.dictionaryVersion && (
          <span className="text-zinc-500">{info.dictionaryVersion}</span>
        )}
      </div>
    </div>,
    document.body
  );
}

function FixRawVariableCompletionMenu({
  completion,
  onSelect,
}: {
  completion: VariableCompletionState;
  onSelect: (name: string) => void;
}) {
  const position = calculateFixPopoverPosition(
    {
      top: completion.anchor.top,
      right: completion.anchor.right,
      bottom: completion.anchor.bottom,
      left: completion.anchor.left + 12,
    },
    {
      width: typeof window === 'undefined' ? 1440 : window.innerWidth,
      height: typeof window === 'undefined' ? 900 : window.innerHeight,
    },
    260,
    240
  );

  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.left,
    width: position.width,
    maxHeight: position.maxHeight,
    zIndex: 95,
    ...(position.placement === 'below'
      ? { top: completion.anchor.bottom + 4 }
      : { bottom: window.innerHeight - completion.anchor.top + 4 }),
  };

  return createPortal(
    <div
      role="listbox"
      aria-label="Insert environment variable"
      style={style}
      className="overflow-y-auto rounded-sm border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/60"
    >
      {completion.items.map((name, index) => (
        <button
          key={name}
          type="button"
          role="option"
          aria-selected={index === completion.selected}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(name);
          }}
          className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left font-mono text-[11px] transition ${
            index === completion.selected
              ? 'bg-primary/20 text-zinc-100'
              : 'text-zinc-300 hover:bg-zinc-900'
          }`}
        >
          <span className="truncate">{`{{${name}}}`}</span>
          <span className="text-[9px] font-sans text-zinc-500">env</span>
        </button>
      ))}
      <div className="border-t border-zinc-900 px-2.5 py-1 text-[9px] font-mono text-zinc-500">
        Enter / Tab to insert · Esc close
      </div>
    </div>,
    document.body
  );
}
