import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import {
  getDeleteConfirmationConfig,
  canExecuteDelete,
  type DeleteTargetType,
} from '../../utils/confirmDelete';

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  type: DeleteTargetType;
  name?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  isPending?: boolean;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  type,
  name,
  onConfirm,
  onClose,
  isPending = false,
}) => {
  const [isChecked, setIsChecked] = useState(false);

  // Reset checkbox state whenever dialog opens
  useEffect(() => {
    if (isOpen) {
      setIsChecked(false);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const config = getDeleteConfirmationConfig(type, name);
  const canConfirm = canExecuteDelete(config.requireCheckbox, isChecked, isPending);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5 text-red-400 font-semibold text-sm">
            <div className="p-1 rounded-md bg-red-950/60 border border-red-800/50 text-red-400">
              <AlertTriangle size={16} />
            </div>
            <span>{config.title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded-md transition"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-zinc-300 leading-relaxed">
            {config.message}
          </p>

          {/* Collection confirmation checkbox */}
          {config.requireCheckbox && (
            <label className="flex items-start gap-2.5 p-3 rounded-md bg-red-950/20 border border-red-900/40 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setIsChecked(e.target.checked)}
                className="mt-0.5 rounded border-zinc-700 text-red-600 focus:ring-red-500/20 bg-zinc-950 accent-red-600"
              />
              <span className="text-xs text-red-200/90 font-medium">
                {config.checkboxLabel}
              </span>
            </label>
          )}
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-zinc-950 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 rounded-md transition font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={!canConfirm}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition flex items-center gap-1.5 ${
              canConfirm
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-sm'
                : 'bg-red-950/40 text-red-400/40 border border-red-900/20 cursor-not-allowed'
            }`}
          >
            <Trash2 size={13} />
            <span>{isPending ? 'Deleting...' : config.confirmButtonText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
