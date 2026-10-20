import type { VariableResponse } from '@api-lab/api-types';
import type { VariableSource } from './variableHighlight';

export interface ResolvedVariableDetail {
  key: string;
  exists: boolean;
  value: string;
  isSensitive: boolean;
  id?: string;
  environmentId?: string;
  environmentName?: string;
}

/**
 * Resolves detailed variable metadata from a variety of sources:
 * full VariableResponse array, Record<string, string>, Map, etc.
 */
export function resolveVariableMeta(
  key: string,
  variables?: VariableSource | VariableResponse[] | null,
  activeEnv?: { id?: string; name?: string } | null
): ResolvedVariableDetail {
  const result: ResolvedVariableDetail = {
    key,
    exists: false,
    value: '',
    isSensitive: false,
    environmentId: activeEnv?.id,
    environmentName: activeEnv?.name,
  };

  if (!variables) return result;

  // Case 1: Array of VariableResponse
  if (Array.isArray(variables)) {
    const found = variables.find((v) => v.key === key);
    if (found) {
      result.exists = true;
      result.value = found.value ?? '';
      result.isSensitive = Boolean(found.is_sensitive);
      result.id = found.id;
      result.environmentId = found.environment_id || activeEnv?.id;
    }
    return result;
  }

  // Case 2: Map
  if (variables instanceof Map) {
    if (variables.has(key)) {
      result.exists = true;
      const v = variables.get(key);
      if (typeof v === 'object' && v !== null && 'value' in v) {
        result.value = (v as any).value ?? '';
        result.isSensitive = Boolean((v as any).is_sensitive);
        result.id = (v as any).id;
      } else {
        result.value = String(v ?? '');
      }
    }
    return result;
  }

  // Case 3: Set
  if (variables instanceof Set) {
    if (variables.has(key)) {
      result.exists = true;
    }
    return result;
  }

  // Case 4: Plain object Record<string, any>
  if (typeof variables === 'object' && Object.prototype.hasOwnProperty.call(variables, key)) {
    result.exists = true;
    const v = (variables as Record<string, any>)[key];
    if (typeof v === 'object' && v !== null && 'value' in v) {
      result.value = v.value ?? '';
      result.isSensitive = Boolean(v.is_sensitive);
      result.id = v.id;
      if (v.environment_id) result.environmentId = v.environment_id;
    } else {
      result.value = String(v ?? '');
    }
    return result;
  }

  return result;
}

/**
 * Masks sensitive values into bullet characters.
 */
export function maskSensitiveValue(value: string, maskChar: string = '•', maxDots: number = 10): string {
  if (!value) return '';
  const count = Math.min(value.length, maxDots);
  return maskChar.repeat(Math.max(6, count));
}

export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width?: number;
  height?: number;
}

/**
 * Calculates viewport-constrained fixed coordinates for variable hover card popover.
 * Flips to top if overflowing window bottom.
 */
export function calculateHoverCardPosition(
  tokenRect: BoundingBox,
  cardSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  padding: number = 8
): { x: number; y: number; placement: 'top' | 'bottom' } {
  let x = tokenRect.left;
  // Prevent overflow on right edge
  if (x + cardSize.width > viewportSize.width - padding) {
    x = Math.max(padding, viewportSize.width - cardSize.width - padding);
  }
  // Prevent overflow on left edge
  if (x < padding) {
    x = padding;
  }

  const spaceBelow = viewportSize.height - tokenRect.bottom;
  const spaceAbove = tokenRect.top;

  let y: number;
  let placement: 'top' | 'bottom' = 'bottom';

  if (spaceBelow >= cardSize.height + padding || spaceBelow >= spaceAbove) {
    y = tokenRect.bottom + 6;
    placement = 'bottom';
  } else {
    y = tokenRect.top - cardSize.height - 6;
    placement = 'top';
  }

  // Ensure within screen bounds
  if (y < padding) {
    y = padding;
  }

  return { x: Math.round(x), y: Math.round(y), placement };
}

/**
 * Standalone hit-test function: finds variable token under mouse coordinates.
 */
export function findHoveredVariableToken(
  container: { querySelectorAll: (selector: string) => any } | null,
  clientX: number,
  clientY: number
): { name: string; rect: BoundingBox } | null {
  if (!container) return null;
  const elements = container.querySelectorAll('[data-var-name]');
  for (const el of elements) {
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!rect) continue;
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      const name = el.getAttribute ? el.getAttribute('data-var-name') : el.dataset?.varName;
      if (name) {
        return {
          name,
          rect: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
        };
      }
    }
  }
  return null;
}
