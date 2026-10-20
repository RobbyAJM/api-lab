// ponytail: simple target===currentTarget check. Upgrade if shadow DOM or portal bubbling needs custom composedPath check.
/**
 * Determines whether a click event qualifies as a backdrop dismissal click.
 * True only when user directly clicks the outer backdrop element (target === currentTarget)
 * and dismissal is enabled (e.g. not in the middle of a non-cancelable async operation).
 */
export function shouldDismissOnBackdropClick(
  target: unknown,
  currentTarget: unknown,
  isDismissible: boolean = true
): boolean {
  if (!isDismissible) return false;
  return target === currentTarget;
}

/**
 * Determines whether a keyboard event qualifies as an Escape dismissal.
 */
export function shouldDismissOnEscape(
  key: string,
  isDismissible: boolean = true
): boolean {
  if (!isDismissible) return false;
  return key === 'Escape';
}

/**
 * Creates an onClick handler for modal backdrops.
 */
export function createBackdropClickHandler(
  onClose: () => void,
  options?: { disabled?: boolean }
): (e: { target: unknown; currentTarget: unknown }) => void {
  return (e) => {
    if (shouldDismissOnBackdropClick(e.target, e.currentTarget, !options?.disabled)) {
      onClose();
    }
  };
}
