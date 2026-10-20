import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// ponytail: virtualized scrolling and multi-select skipped; add when options exceed 100 items or multi-choice is required.

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  badge?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
  title?: string;
  fontMono?: boolean;
  size?: 'xs' | 'sm' | 'md';
  id?: string;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className = '',
  menuClassName = '',
  align = 'left',
  title,
  fontMono = false,
  size = 'md',
  id,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

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

  const sizeClasses =
    size === 'xs'
      ? 'px-2 py-0.5 text-[11px]'
      : size === 'sm'
      ? 'px-2 py-1 text-xs'
      : 'px-2.5 py-1.5 text-xs';

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        title={title}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 rounded transition cursor-pointer select-none group focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/40 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${
          fontMono ? 'font-mono' : 'font-sans'
        } ${isOpen ? 'border-zinc-700 bg-zinc-850 ring-1 ring-zinc-700/50' : ''}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {selectedOption?.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
          <span className={`truncate ${!selectedOption ? 'text-zinc-500' : ''}`}>
            {selectedOption ? selectedOption.label : placeholder}
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
          role="listbox"
          className={`absolute z-50 mt-1 min-w-full max-h-56 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl p-1 space-y-0.5 font-sans animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${menuClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-zinc-500 italic select-none">
              No options available
            </div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setIsOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs transition text-left ${
                    isSelected
                      ? 'bg-zinc-900 text-white font-medium border border-zinc-800'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-900/60 border border-transparent'
                  } ${option.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
                    fontMono ? 'font-mono' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 truncate">
                    {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                    <span className="truncate">{option.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                    {option.badge && (
                      <span className="text-[10px] text-zinc-500 font-mono px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800/80">
                        {option.badge}
                      </span>
                    )}
                    {isSelected && <Check size={12} className="text-primary flex-shrink-0" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
