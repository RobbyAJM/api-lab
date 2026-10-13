import React, { useRef } from 'react';
import { tokenizeVariables, type VariableSource } from '../../utils/variableHighlight';

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

  function handleScroll(e: React.UIEvent<HTMLInputElement>) {
    if (backdropRef.current) {
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }

  const tokens = tokenizeVariables(value, variables);

  return (
    <div
      className={`relative inline-flex items-center overflow-hidden font-mono text-xs ${className}`}
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
                  title={`Defined: ${token.value ?? ''}`}
                  className="text-emerald-300 font-semibold bg-emerald-950/70 border border-emerald-800/60 rounded px-1 inline-block -my-0.5"
                >
                  {token.text}
                </span>
              );
            }

            return (
              <span
                key={idx}
                title="Undefined variable in current environment"
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
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
        className={`w-full h-full px-3 py-1.5 font-mono text-xs bg-transparent text-transparent caret-zinc-100 focus:outline-none placeholder-transparent selection:bg-indigo-600/40 ${inputClassName}`}
      />
    </div>
  );
};
