import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Z_INDEX,
  calculateFloatingPosition,
  isAnchorWithinClipBounds,
  type FloatingAnchorRect,
  type FloatingPositionResult,
} from '../../utils/floatingPosition';

export interface FloatingPortalProps {
  isOpen: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
  anchorKey?: string | number;
  getAnchorRect?: () => FloatingAnchorRect | null;
  onClose: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  preferredPlacement?: 'bottom' | 'top';
  offset?: number;
  viewportPadding?: number;
  matchTriggerWidth?: 'none' | 'min' | 'exact';
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  estimatedHeight?: number;
  zIndex?: number;
  className?: string;
  role?: React.AriaRole;
  ariaLabel?: string;
  closeOnOutsideClick?: boolean;
  closeOnEscape?: boolean;
  restoreFocusOnEscape?: boolean;
  ignoreRefs?: Array<React.RefObject<HTMLElement | null>>;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
}

function toAnchorRect(rect: DOMRect): FloatingAnchorRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function collectClipAncestorRects(el: HTMLElement | null): FloatingAnchorRect[] {
  const rects: FloatingAnchorRect[] = [];
  if (!el || typeof window === 'undefined') return rects;

  let current = el.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
    if (/(auto|scroll|hidden|clip)/.test(overflow)) {
      rects.push(toAnchorRect(current.getBoundingClientRect()));
    }
    current = current.parentElement;
  }
  return rects;
}

function positionsEqual(
  a: FloatingPositionResult | null,
  b: FloatingPositionResult | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.width === b.width &&
    a.minWidth === b.minWidth &&
    a.maxWidth === b.maxWidth &&
    a.maxHeight === b.maxHeight &&
    a.placement === b.placement
  );
}

export const FloatingPortal: React.FC<FloatingPortalProps> = ({
  isOpen,
  anchorRef,
  anchorKey,
  getAnchorRect,
  onClose,
  children,
  align = 'left',
  preferredPlacement = 'bottom',
  offset = 4,
  viewportPadding = 8,
  matchTriggerWidth = 'none',
  width,
  minWidth,
  maxWidth,
  maxHeight = 320,
  estimatedHeight,
  zIndex = Z_INDEX.DROPDOWN,
  className = '',
  role,
  ariaLabel,
  closeOnOutsideClick = true,
  closeOnEscape = true,
  restoreFocusOnEscape = true,
  ignoreRefs,
  panelRef: externalPanelRef,
  onClick,
  onMouseDown,
  onKeyDown,
}) => {
  const internalPanelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<FloatingPositionResult | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const ignoreRefsRef = useRef(ignoreRefs);
  ignoreRefsRef.current = ignoreRefs;

  const getAnchorRectRef = useRef(getAnchorRect);
  getAnchorRectRef.current = getAnchorRect;

  const setPanelNode = useCallback(
    (node: HTMLDivElement | null) => {
      internalPanelRef.current = node;
      if (externalPanelRef) {
        (externalPanelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [externalPanelRef]
  );

  const resolveAnchorRect = useCallback((): FloatingAnchorRect | null => {
    if (getAnchorRectRef.current) {
      return getAnchorRectRef.current();
    }
    const el = anchorRef?.current;
    if (!el) return null;
    return toAnchorRect(el.getBoundingClientRect());
  }, [anchorRef]);

  const computePosition = useCallback(
    (measurePanel: boolean): FloatingPositionResult | null => {
      if (typeof window === 'undefined') return null;
      const anchor = resolveAnchorRect();
      if (!anchor) return null;

      let measuredWidth: number | undefined;
      let measuredHeight: number | undefined;

      if (measurePanel && internalPanelRef.current) {
        const panelEl = internalPanelRef.current;
        if (panelEl.offsetWidth > 0) {
          measuredWidth = panelEl.offsetWidth;
        }
        const innerScrollable = panelEl.querySelector<HTMLElement>('[class*="overflow-y-auto"]');
        const innerOverflow = innerScrollable
          ? Math.max(0, innerScrollable.scrollHeight - innerScrollable.clientHeight)
          : 0;
        const naturalHeight = Math.max(
          panelEl.offsetHeight + innerOverflow,
          panelEl.scrollHeight
        );
        if (naturalHeight > 0) {
          measuredHeight = naturalHeight;
        }
      }

      return calculateFloatingPosition(
        anchor,
        { width: window.innerWidth, height: window.innerHeight },
        {
          align,
          preferredPlacement,
          offset,
          viewportPadding,
          matchTriggerWidth,
          width,
          minWidth,
          maxWidth,
          measuredWidth,
          measuredHeight,
          estimatedHeight,
          maxHeight,
        }
      );
    },
    [
      resolveAnchorRect,
      align,
      preferredPlacement,
      offset,
      viewportPadding,
      matchTriggerWidth,
      width,
      minWidth,
      maxWidth,
      estimatedHeight,
      maxHeight,
    ]
  );

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    const next = computePosition(true);
    setPosition((prev) => (positionsEqual(prev, next) ? prev : next));
  }, [isOpen, anchorKey, computePosition]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    let rafId: number | null = null;

    const scheduleReposition = (checkVisibility: boolean) => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const anchor = resolveAnchorRect();
        if (!anchor) {
          onCloseRef.current();
          return;
        }

        if (checkVisibility) {
          const clipRects = collectClipAncestorRects(anchorRef?.current ?? null);
          const visible = isAnchorWithinClipBounds(anchor, clipRects, {
            width: window.innerWidth,
            height: window.innerHeight,
          });
          if (!visible) {
            onCloseRef.current();
            return;
          }
        }

        const next = computePosition(true);
        setPosition((prev) => (positionsEqual(prev, next) ? prev : next));
      });
    };

    const handleResize = () => scheduleReposition(false);

    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && internalPanelRef.current?.contains(target)) {
        return;
      }
      scheduleReposition(true);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduleReposition(false));
      if (anchorRef?.current) resizeObserver.observe(anchorRef.current);
      if (internalPanelRef.current) resizeObserver.observe(internalPanelRef.current);
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      resizeObserver?.disconnect();
    };
  }, [isOpen, anchorRef, resolveAnchorRect, computePosition]);

  // Outside-click dismissal (capture phase so stopPropagation inside modals cannot block dismissal)
  useEffect(() => {
    if (!isOpen || !closeOnOutsideClick || typeof window === 'undefined') return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (internalPanelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      if (ignoreRefsRef.current?.some((ref) => ref.current?.contains(target))) return;
      onCloseRef.current();
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    return () => window.removeEventListener('mousedown', handleMouseDown, true);
  }, [isOpen, closeOnOutsideClick, anchorRef]);

  // Escape dismissal in window capture phase so only the dropdown closes (never the enclosing modal)
  useEffect(() => {
    if (!isOpen || !closeOnEscape || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
      if (restoreFocusOnEscape) {
        anchorRef?.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, closeOnEscape, restoreFocusOnEscape, anchorRef]);

  if (!isOpen || typeof document === 'undefined') return null;

  const activePosition = position ?? computePosition(false);
  if (!activePosition) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    left: activePosition.left,
    maxWidth: activePosition.maxWidth,
    maxHeight: activePosition.maxHeight,
    zIndex,
    ...(activePosition.placement === 'bottom'
      ? { top: activePosition.top }
      : { bottom: activePosition.bottom }),
    ...(activePosition.width !== undefined ? { width: activePosition.width } : {}),
    ...(activePosition.minWidth !== undefined ? { minWidth: activePosition.minWidth } : {}),
  };

  return createPortal(
    <div
      ref={setPanelNode}
      role={role}
      aria-label={ariaLabel}
      data-tauri-no-drag=""
      style={style}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body
  );
};
