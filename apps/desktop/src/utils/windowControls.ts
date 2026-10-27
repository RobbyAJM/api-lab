/**
 * Detects whether platform is macOS based on user agent string.
 */
export function isMacOS(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '') ?? '';
  return /Mac|iPhone|iPod|iPad/i.test(ua);
}

/**
 * Returns accessible title and aria label for maximize/restore toggle button.
 */
export function getMaximizeButtonLabels(isMaximized: boolean): {
  title: string;
  ariaLabel: string;
} {
  return {
    title: isMaximized ? 'Restore Down' : 'Maximize',
    ariaLabel: isMaximized ? 'Restore window' : 'Maximize window',
  };
}
