export const Z_INDEX = {
  MODAL: 50,
  NESTED_MODAL: 60,
  DROPDOWN: 80,
  HOVER_CARD: 90,
  COMBOBOX: 95,
} as const;

export interface FloatingAnchorRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface FloatingPositionOptions {
  align?: 'left' | 'right';
  preferredPlacement?: 'bottom' | 'top';
  offset?: number;
  viewportPadding?: number;
  matchTriggerWidth?: 'none' | 'min' | 'exact';
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  measuredWidth?: number;
  measuredHeight?: number;
  estimatedHeight?: number;
  maxHeight?: number;
  minHeight?: number;
}

export interface FloatingPositionResult {
  left: number;
  top?: number;
  bottom?: number;
  width?: number;
  minWidth?: number;
  maxWidth: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
}

export interface ContextMenuPoint {
  x: number;
  y: number;
}

export interface Size2D {
  width: number;
  height: number;
}

/**
 * Calculates viewport-safe fixed coordinates for an anchored floating surface
 * (dropdown, popover, autocomplete) rendered in a document.body portal.
 */
export function calculateFloatingPosition(
  anchor: FloatingAnchorRect,
  viewport: ViewportSize,
  options: FloatingPositionOptions = {}
): FloatingPositionResult {
  const align = options.align ?? 'left';
  const preferredPlacement = options.preferredPlacement ?? 'bottom';
  const offset = options.offset ?? 4;
  const padding = options.viewportPadding ?? 8;
  const matchTriggerWidth = options.matchTriggerWidth ?? 'none';

  const availableViewportWidth = Math.max(0, viewport.width - padding * 2);
  const maxWidth =
    options.maxWidth !== undefined
      ? Math.min(options.maxWidth, availableViewportWidth)
      : availableViewportWidth;

  let width: number | undefined;
  let minWidth: number | undefined;
  let effectiveWidth: number;

  if (options.width !== undefined) {
    width = Math.min(options.width, maxWidth);
    effectiveWidth = width;
  } else if (matchTriggerWidth === 'exact') {
    width = Math.min(Math.max(anchor.width, options.minWidth ?? 0), maxWidth);
    effectiveWidth = width;
  } else {
    const baseMinWidth =
      matchTriggerWidth === 'min'
        ? Math.max(anchor.width, options.minWidth ?? 0)
        : options.minWidth;

    if (baseMinWidth !== undefined) {
      minWidth = Math.min(baseMinWidth, maxWidth);
    }

    effectiveWidth = Math.min(
      maxWidth,
      Math.max(minWidth ?? 0, options.measuredWidth ?? 0)
    );
  }

  let left = align === 'right' ? anchor.right - effectiveWidth : anchor.left;

  if (left + effectiveWidth > viewport.width - padding) {
    left = viewport.width - padding - effectiveWidth;
  }
  if (left < padding) {
    left = padding;
  }

  const spaceBelow = Math.max(0, viewport.height - anchor.bottom - offset - padding);
  const spaceAbove = Math.max(0, anchor.top - offset - padding);

  const desiredMaxHeight = options.maxHeight ?? 320;
  const fallbackEstimate = options.estimatedHeight ?? Math.min(desiredMaxHeight, 240);
  const neededHeight =
    options.measuredHeight !== undefined
      ? Math.min(options.measuredHeight, desiredMaxHeight)
      : Math.min(fallbackEstimate, desiredMaxHeight);

  let placement: 'bottom' | 'top' = preferredPlacement;
  if (preferredPlacement === 'bottom') {
    if (spaceBelow < neededHeight && spaceAbove > spaceBelow) {
      placement = 'top';
    }
  } else if (spaceAbove < neededHeight && spaceBelow > spaceAbove) {
    placement = 'bottom';
  }

  const minHeightFloor = options.minHeight ?? 80;
  const availableVertical = placement === 'bottom' ? spaceBelow : spaceAbove;
  const maxHeight = Math.min(
    desiredMaxHeight,
    Math.max(Math.min(minHeightFloor, desiredMaxHeight), availableVertical)
  );

  const result: FloatingPositionResult = {
    left: Math.round(left),
    maxWidth: Math.round(maxWidth),
    maxHeight: Math.round(maxHeight),
    placement,
  };

  if (placement === 'bottom') {
    result.top = Math.round(anchor.bottom + offset);
  } else {
    result.bottom = Math.round(viewport.height - anchor.top + offset);
  }

  if (width !== undefined) {
    result.width = Math.round(width);
  }
  if (minWidth !== undefined) {
    result.minWidth = Math.round(minWidth);
  }

  return result;
}

/**
 * Checks whether an anchor rect is still visible inside both the viewport and
 * all clipping/scrolling ancestor containers. Used to auto-dismiss portaled
 * dropdowns when their trigger scrolls out of a modal or scrollable panel.
 */
export function isAnchorWithinClipBounds(
  anchor: FloatingAnchorRect,
  clipRects: ReadonlyArray<FloatingAnchorRect>,
  viewport: ViewportSize
): boolean {
  const isPoint = anchor.width === 0 && anchor.height === 0;

  if (isPoint) {
    if (
      anchor.top < 0 ||
      anchor.top > viewport.height ||
      anchor.left < 0 ||
      anchor.left > viewport.width
    ) {
      return false;
    }
    for (const clip of clipRects) {
      if (
        anchor.top < clip.top ||
        anchor.top > clip.bottom ||
        anchor.left < clip.left ||
        anchor.left > clip.right
      ) {
        return false;
      }
    }
    return true;
  }

  if (
    anchor.bottom <= 0 ||
    anchor.top >= viewport.height ||
    anchor.right <= 0 ||
    anchor.left >= viewport.width
  ) {
    return false;
  }

  for (const clip of clipRects) {
    if (
      anchor.bottom <= clip.top ||
      anchor.top >= clip.bottom ||
      anchor.right <= clip.left ||
      anchor.left >= clip.right
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Calculates viewport-clamped fixed coordinates for a pointer-anchored context menu.
 */
export function calculateContextMenuPosition(
  point: ContextMenuPoint,
  menuSize: Size2D,
  viewport: ViewportSize,
  padding = 8
): { left: number; top: number } {
  const maxLeft = Math.max(padding, viewport.width - menuSize.width - padding);
  const maxTop = Math.max(padding, viewport.height - menuSize.height - padding);

  const left = Math.min(Math.max(padding, point.x), maxLeft);
  const top = Math.min(Math.max(padding, point.y), maxTop);

  return {
    left: Math.round(left),
    top: Math.round(top),
  };
}
