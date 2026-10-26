import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Check, Settings } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { apiRequest } from '../../api/client';
import type { Environment } from '@api-lab/api-types';
import {
  getEnvironmentDropdownSizeClass,
  getEnvironmentDropdownTitle,
  getEnvironmentDropdownLabel,
  findActiveEnvironment,
} from '../../utils/environmentDropdown';

// ponytail: environment search filter skipped; add when workspaces exceed 20 environments.

export interface EnvironmentDropdownProps {
  className?: string;
  align?: 'left' | 'right';
  size?: 'xs' | 'sm' | 'md';
  showManageShortcut?: boolean;
  value?: string | null;
  onChange?: (id: string | null) => void;
  environments?: Environment[];
}

export function EnvironmentDropdown({
  className = '',
  align = 'right',
  size = 'sm',
  showManageShortcut = true,
  value: propValue,
  onChange: propOnChange,
  environments: propEnvironments,
}: EnvironmentDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const {
    activeWorkspaceId,
    activeEnvironmentId: storeEnvId,
    setActiveEnvironmentId: setStoreEnvId,
    setEnvModalOpen,
  } = useAppStore();

  const activeEnvironmentId = propValue !== undefined ? propValue : storeEnvId;
  const setActiveEnvironmentId = propOnChange || setStoreEnvId;

  // Query workspace environments if not provided via props
  const { data: fetchedEnvironments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? apiRequest(`/workspaces/${activeWorkspaceId}/environments`)
        : Promise.resolve([]),
    enabled: !propEnvironments && !!activeWorkspaceId,
  });

  const environments = propEnvironments || fetchedEnvironments;
  const activeEnv = findActiveEnvironment(environments, activeEnvironmentId);

  // Close on outside click
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

  // Keyboard navigation: Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const sizeClasses = getEnvironmentDropdownSizeClass(size);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-200 rounded-md font-mono transition cursor-pointer select-none group focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/40 ${sizeClasses} ${
          isOpen ? 'border-zinc-700 bg-zinc-850 ring-1 ring-zinc-700/50' : ''
        }`}
        title={getEnvironmentDropdownTitle(activeEnv)}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              activeEnv
                ? 'bg-emerald-400 ring-2 ring-emerald-400/20'
                : 'bg-zinc-600'
            }`}
          />
          <span className={`truncate max-w-[120px] font-medium ${!activeEnv ? 'text-zinc-400' : 'text-zinc-200'}`}>
            {getEnvironmentDropdownLabel(activeEnv)}
          </span>
        </div>
        <ChevronDown
          size={12}
          className={`text-zinc-500 group-hover:text-zinc-300 transition-transform duration-150 flex-shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 mt-1.5 w-56 bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl p-1 font-sans animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider font-mono flex items-center justify-between select-none">
            <span>Environments</span>
            {environments.length > 0 && (
              <span className="text-[9px] text-zinc-600 font-normal">
                {environments.length} total
              </span>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {/* No Environment option */}
            <button
              type="button"
              onClick={() => {
                setActiveEnvironmentId(null);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition text-left cursor-pointer ${
                !activeEnvironmentId
                  ? 'bg-zinc-900 text-white font-medium border border-zinc-800'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 flex-shrink-0" />
                <span className="truncate font-mono">No Environment</span>
              </div>
              {!activeEnvironmentId && (
                <Check size={12} className="text-primary flex-shrink-0 ml-1" />
              )}
            </button>

            {/* List of environments */}
            {environments.map((env) => {
              const isSelected = env.id === activeEnvironmentId;
              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => {
                    setActiveEnvironmentId(env.id);
                    setIsOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition text-left cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 text-white font-medium border border-zinc-800'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-900/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isSelected ? 'bg-emerald-400' : 'bg-zinc-600'
                      }`}
                    />
                    <span className="truncate font-mono font-medium">{env.name}</span>
                    {env.is_default && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono">
                        def
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Check size={12} className="text-primary flex-shrink-0 ml-1" />
                  )}
                </button>
              );
            })}
          </div>

          {showManageShortcut && (
            <>
              <div className="h-px bg-zinc-800/80 my-1" />
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setEnvModalOpen(true);
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Settings size={12} className="text-zinc-400" />
                  <span>Manage Environments</span>
                </div>
                <span className="text-[10px] text-zinc-600 font-mono">Ctrl+E</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
