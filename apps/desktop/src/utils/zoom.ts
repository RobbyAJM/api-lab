// ponytail: step zoom clamped 0.5x - 2.0x in 0.1 increments. upgrade to custom wheel listener if users ask.
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.0;
export const ZOOM_STEP = 0.1;
export const DEFAULT_ZOOM = 1.0;
export const ZOOM_STORAGE_KEY = 'api_lab_ui_zoom';

export type ZoomAction = 'in' | 'out' | 'reset';

export function calculateNextZoom(current: number, action: ZoomAction): number {
  if (action === 'reset') return DEFAULT_ZOOM;
  const delta = action === 'in' ? ZOOM_STEP : -ZOOM_STEP;
  const next = Math.round((current + delta) * 10) / 10;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
}

export function parseStoredZoom(raw: string | null): number {
  if (!raw) return DEFAULT_ZOOM;
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed) || parsed < MIN_ZOOM || parsed > MAX_ZOOM) return DEFAULT_ZOOM;
  return Math.round(parsed * 10) / 10;
}

export function formatZoomPercentage(factor: number): string {
  return `${Math.round(factor * 100)}%`;
}

export async function applyZoom(
  factor: number,
  setter?: (val: number) => Promise<void> | void
): Promise<number> {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(factor * 10) / 10));
  try {
    if (setter) {
      await setter(clamped);
    } else {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      await getCurrentWebview().setZoom(clamped);
    }
  } catch {
    if (typeof document !== 'undefined') {
      document.documentElement.style.zoom = String(clamped);
    }
  }
  return clamped;
}
