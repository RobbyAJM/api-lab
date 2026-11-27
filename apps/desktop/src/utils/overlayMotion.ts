/**
 * Crisp Operate-mode motion tokens and class helpers for desktop overlays
 * (modals, dialogs, palettes, popovers, dropdowns, context menus, and tooltips).
 *
 * Durations intentionally stay <= 150ms with 0ms delay so rapid keyboard workflows
 * never feel slowed down.
 */
export const OVERLAY_MOTION_TIMINGS = {
  delayMs: 0,
  backdropMs: 110,
  modalMs: 130,
  paletteMs: 110,
  popoverMs: 95,
  tooltipMs: 85,
  reducedMs: 60,
  maxAllowedMs: 150,
} as const;

export const OVERLAY_MOTION_CLASSES = {
  backdrop: 'overlay-backdrop-enter',
  modal: 'overlay-modal-enter',
  palette: 'overlay-palette-enter',
  popoverBottom: 'overlay-popover-enter-bottom',
  popoverTop: 'overlay-popover-enter-top',
  tooltipBottom: 'overlay-tooltip-enter-bottom',
  tooltipTop: 'overlay-tooltip-enter-top',
} as const;

export type ModalMotionVariant = 'modal' | 'palette';
export type PopoverMotionVariant = 'popover' | 'tooltip';
export type OverlayPlacement = 'bottom' | 'top' | 'below' | 'above';

export interface ModalMotionClassSet {
  backdrop: string;
  panel: string;
}

/**
 * Returns the entrance motion classes for a modal backdrop and its panel.
 */
export function getModalMotionClasses(
  variant: ModalMotionVariant = 'modal'
): ModalMotionClassSet {
  return {
    backdrop: OVERLAY_MOTION_CLASSES.backdrop,
    panel:
      variant === 'palette'
        ? OVERLAY_MOTION_CLASSES.palette
        : OVERLAY_MOTION_CLASSES.modal,
  };
}

/**
 * Returns a placement-aware entrance motion class for an anchored floating surface.
 * Supports both FloatingPortal ('bottom' | 'top') and FIX popover ('below' | 'above') conventions.
 */
export function getPopoverMotionClass(
  placement: OverlayPlacement,
  variant: PopoverMotionVariant = 'popover'
): string {
  const opensUpward = placement === 'top' || placement === 'above';
  if (variant === 'tooltip') {
    return opensUpward
      ? OVERLAY_MOTION_CLASSES.tooltipTop
      : OVERLAY_MOTION_CLASSES.tooltipBottom;
  }
  return opensUpward
    ? OVERLAY_MOTION_CLASSES.popoverTop
    : OVERLAY_MOTION_CLASSES.popoverBottom;
}

/**
 * Cleanly joins base and overlay motion class strings without empty segments or extra spaces.
 */
export function composeOverlayClassName(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
    .join(' ');
}
