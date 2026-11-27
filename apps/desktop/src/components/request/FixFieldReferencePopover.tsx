import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Info, Search, X } from 'lucide-react';
import {
  calculateFixPopoverPosition,
  type FixFieldReference,
} from '../../utils/fixParsedMessage';
import { Z_INDEX } from '../../utils/floatingPosition';
import {
  composeOverlayClassName,
  getPopoverMotionClass,
} from '../../utils/overlayMotion';

export function FieldReferenceButton({
  label,
  className,
  onClick,
}: {
  label: string;
  className: string;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/ref inline-flex max-w-full items-center gap-1 text-left text-[10px] underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:decoration-current ${className}`}
      title={`View FIX definition for ${label}`}
      aria-haspopup="dialog"
    >
      <span className="truncate">{label}</span>
      <Info
        size={9}
        className="flex-shrink-0 opacity-0 text-zinc-500 transition group-hover/ref:opacity-100 group-focus-visible/ref:opacity-100"
      />
    </button>
  );
}

export function FieldReferencePopover({
  reference,
  anchor,
  onClose,
  onSelectEnumValue,
}: {
  reference: FixFieldReference;
  anchor: DOMRect;
  onClose: () => void;
  onSelectEnumValue?: (value: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState(() => calculatePopoverPosition(anchor));

  useEffect(() => {
    function updatePosition() {
      setPosition(calculatePopoverPosition(anchor));
    }
    function handlePointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    function handleScroll(event: Event) {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    }
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchor, onClose]);

  const filteredEnums = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return reference.enumValues;
    return reference.enumValues.filter((value) =>
      `${value.value} ${value.name} ${value.description}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [query, reference.enumValues]);

  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.left,
    width: position.width,
    maxHeight: position.maxHeight,
    zIndex: Z_INDEX.HOVER_CARD,
    ...(position.placement === 'below'
      ? { top: anchor.bottom + 6 }
      : { bottom: window.innerHeight - anchor.top + 6 }),
  };

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`FIX field ${reference.tag} ${reference.name}`}
      data-tauri-no-drag=""
      tabIndex={-1}
      style={style}
      className={composeOverlayClassName(
        'overflow-y-auto border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/60 outline-none',
        getPopoverMotionClass(position.placement, 'popover')
      )}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
              {reference.tag}
            </span>
            <span className="truncate text-sm font-semibold text-zinc-100">
              {reference.name}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] font-mono text-zinc-500">
            {reference.type && (
              <span className="rounded-sm border border-zinc-800 bg-zinc-900/60 px-1 py-0.5">
                {reference.type}
              </span>
            )}
            <span className="rounded-sm border border-zinc-800 bg-zinc-900/60 px-1 py-0.5">
              {reference.dictionaryVersion}
            </span>
            {reference.isGroupCounter && (
              <span className="rounded-sm border border-amber-900/60 bg-amber-950/30 px-1 py-0.5 text-amber-300">
                group count
              </span>
            )}
            {reference.groupContext && (
              <span className="rounded-sm border border-zinc-800 bg-zinc-900/60 px-1 py-0.5 text-zinc-400">
                {reference.groupContext}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-zinc-500 hover:text-zinc-200"
          title="Close field reference"
          aria-label="Close field reference"
        >
          <X size={12} />
        </button>
      </div>

      <div className="px-3 py-2 space-y-3">
        <section>
          <p className="text-[11px] leading-relaxed text-zinc-300">
            {reference.description ||
              'No prose description is available for this field in the active FIX dictionary.'}
          </p>
          {reference.typeDescription && (
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
              Datatype {reference.type}: {reference.typeDescription}
            </p>
          )}
          {reference.messageName && (
            <p className="mt-1 text-[10px] text-zinc-500">
              Observed in{' '}
              <span className="font-mono text-zinc-400">{reference.messageName}</span>
            </p>
          )}
        </section>

        <section className="border-t border-zinc-900 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
              Possible values
              <span className="ml-1 font-mono text-zinc-600">
                {reference.enumValues.length}
              </span>
              {onSelectEnumValue && reference.enumValues.length > 0 && (
                <span className="ml-1.5 font-normal normal-case tracking-normal text-zinc-500">
                  · click to apply
                </span>
              )}
            </h4>
            {reference.currentValue !== undefined && (
              <span className="font-mono text-[9px] text-zinc-500">
                current: {reference.currentValue || '(empty)'}
              </span>
            )}
          </div>

          {reference.enumValues.length === 0 ? (
            <p className="mt-1.5 text-[10px] text-zinc-500">
              This field has no enumerated values in {reference.dictionaryVersion}.
            </p>
          ) : (
            <>
              {reference.enumValues.length > 8 && (
                <div className="relative mt-1.5">
                  <Search
                    size={11}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter enum values"
                    className="h-6 w-full border border-zinc-800 bg-zinc-900/60 pl-6 pr-2 text-[10px] font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                  />
                </div>
              )}
              <div className="mt-1.5 border border-zinc-800/80">
                {filteredEnums.length === 0 ? (
                  <p className="px-2 py-3 text-center text-[10px] text-zinc-600">
                    No enum values match the filter.
                  </p>
                ) : (
                  filteredEnums.map((value) => {
                    const active = reference.currentEnum?.value === value.value;
                    const rowClass = `grid w-full text-left grid-cols-[46px_minmax(0,1fr)] gap-2 border-b border-zinc-900/70 px-2 py-1.5 last:border-b-0 ${
                      active ? 'bg-blue-950/25' : 'hover:bg-zinc-900/50'
                    }`;
                    const content = (
                      <>
                        <span
                          className={`font-mono text-[10px] ${
                            active ? 'text-blue-300' : 'text-zinc-500'
                          }`}
                        >
                          {value.value}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-zinc-300">
                            {value.name.replace(/_+/g, ' ')}
                            {active && <Check size={10} className="text-blue-300" />}
                          </span>
                          <span className="block text-[10px] leading-snug text-zinc-500">
                            {value.description}
                          </span>
                        </span>
                      </>
                    );

                    if (onSelectEnumValue) {
                      return (
                        <button
                          key={`${value.value}-${value.name}`}
                          type="button"
                          onClick={() => {
                            onSelectEnumValue(value.value);
                            onClose();
                          }}
                          className={`${rowClass} cursor-pointer focus-visible:bg-zinc-900 focus-visible:outline-none`}
                        >
                          {content}
                        </button>
                      );
                    }

                    return (
                      <div key={`${value.value}-${value.name}`} className={rowClass}>
                        {content}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="border-t border-zinc-900 px-3 py-1.5 text-[9px] text-zinc-600">
        Dictionary {reference.dictionaryVersion} · field descriptions from FIX Orchestra
      </div>
    </div>,
    document.body
  );
}

function calculatePopoverPosition(anchor: DOMRect) {
  return calculateFixPopoverPosition(
    {
      top: anchor.top,
      right: anchor.right,
      bottom: anchor.bottom,
      left: anchor.left,
    },
    {
      width: typeof window === 'undefined' ? 1440 : window.innerWidth,
      height: typeof window === 'undefined' ? 900 : window.innerHeight,
    }
  );
}
