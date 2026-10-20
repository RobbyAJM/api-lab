import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../store/useAppStore';
import {
  resolveVariableMeta,
  maskSensitiveValue,
  calculateHoverCardPosition,
  type BoundingBox,
} from '../../utils/variableHover';
import type { VariableResponse } from '@api-lab/api-types';
import type { VariableSource } from '../../utils/variableHighlight';
import {
  Lock,
  Eye,
  EyeOff,
  Edit2,
  Copy,
  Check,
  AlertCircle,
  PlusCircle,
} from 'lucide-react';

interface VariableHoverCardProps {
  varName: string;
  rect: BoundingBox;
  variables?: VariableSource | VariableResponse[] | null;
  activeEnv?: { id?: string; name?: string } | null;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const VariableHoverCard: React.FC<VariableHoverCardProps> = ({
  varName,
  rect,
  variables,
  activeEnv,
  onClose,
  onMouseEnter,
  onMouseLeave,
}) => {
  const { openEditVariableModal } = useAppStore();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const meta = resolveVariableMeta(varName, variables, activeEnv);

  const cardWidth = 290;
  const cardHeight = meta.exists ? 130 : 110;

  const pos = calculateHoverCardPosition(
    rect,
    { width: cardWidth, height: cardHeight },
    {
      width: typeof window !== 'undefined' ? window.innerWidth : 1200,
      height: typeof window !== 'undefined' ? window.innerHeight : 800,
    }
  );

  function handleCopy() {
    if (!meta.value) return;
    navigator.clipboard.writeText(meta.value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleEdit() {
    openEditVariableModal({
      key: varName,
      value: meta.value,
      isSensitive: meta.isSensitive,
      variableId: meta.id,
      environmentId: meta.environmentId,
      environmentName: meta.environmentName,
    });
    onClose();
  }

  const displayedValue = meta.isSensitive && !revealed
    ? maskSensitiveValue(meta.value)
    : meta.value;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${cardWidth}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="z-50 bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl overflow-hidden font-sans text-xs text-zinc-100 animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[11px]">
        <div className="flex items-center gap-1.5 font-mono min-w-0">
          <span className="text-secondary font-bold truncate">
            {`{{${varName}}}`}
          </span>
          {meta.isSensitive && (
            <span
              title="Sensitive variable (encrypted at rest)"
              className="flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-950/60 border border-amber-800/50 text-amber-300 text-[9px] flex-shrink-0"
            >
              <Lock size={9} />
              <span>secret</span>
            </span>
          )}
        </div>

        {meta.environmentName && (
          <span className="text-zinc-400 text-[10px] font-mono truncate max-w-[100px]">
            {meta.environmentName}
          </span>
        )}
      </div>

      {/* Body: Value or Undefined notice */}
      <div className="p-2.5 space-y-2">
        {meta.exists ? (
          <div>
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
              <span>Current value</span>
              {meta.isSensitive && (
                <button
                  type="button"
                  onClick={() => setRevealed(!revealed)}
                  className="flex items-center gap-1 text-primary hover:text-primary-hover font-medium transition cursor-pointer"
                  title={revealed ? 'Mask sensitive value' : 'Show plain value'}
                >
                  {revealed ? <EyeOff size={11} /> : <Eye size={11} />}
                  <span>{revealed ? 'Hide' : 'Reveal'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800/80 rounded px-2 py-1 font-mono text-[11px] text-zinc-200">
              <span className="truncate flex-1 select-text">
                {displayedValue || <span className="text-zinc-500 italic">&lt;empty&gt;</span>}
              </span>

              <button
                type="button"
                onClick={handleCopy}
                disabled={!meta.value}
                className="ml-1.5 p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition disabled:opacity-30 cursor-pointer flex-shrink-0"
                title="Copy variable value"
              >
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-rose-300 text-[11px] py-1">
            <AlertCircle size={13} className="flex-shrink-0" />
            <span>Undefined variable in environment</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end pt-1 border-t border-zinc-900">
          <button
            type="button"
            onClick={handleEdit}
            className="flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded text-[11px] font-medium border border-zinc-800 hover:border-zinc-700 transition cursor-pointer"
          >
            {meta.exists ? (
              <>
                <Edit2 size={11} className="text-primary" />
                <span>Edit</span>
              </>
            ) : (
              <>
                <PlusCircle size={11} className="text-emerald-400" />
                <span>Define</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
