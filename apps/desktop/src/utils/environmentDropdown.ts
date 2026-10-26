// ponytail: custom icon mapping skipped; add when environments support icons/tags.

/**
 * Returns Tailwind size classes for the environment dropdown button.
 */
export function getEnvironmentDropdownSizeClass(size: 'xs' | 'sm' | 'md' = 'sm'): string {
  switch (size) {
    case 'xs':
      return 'px-2 py-0.5 text-[11px]';
    case 'md':
      return 'px-3 py-1.5 text-xs';
    case 'sm':
    default:
      return 'px-2.5 py-1 text-xs';
  }
}

/**
 * Returns display label for the active environment.
 */
export function getEnvironmentDropdownLabel(activeEnv?: { name: string } | null): string {
  return activeEnv?.name?.trim() || 'No Environment';
}

/**
 * Returns tooltip description for the environment dropdown button.
 */
export function getEnvironmentDropdownTitle(activeEnv?: { name: string } | null): string {
  const name = activeEnv?.name?.trim();
  return name ? `Active Environment: ${name}` : 'No Environment active';
}

/**
 * Resolves active environment from environments list.
 */
export function findActiveEnvironment<T extends { id: string }>(
  environments: T[],
  activeId?: string | null
): T | undefined {
  if (!activeId || !environments || environments.length === 0) {
    return undefined;
  }
  return environments.find((env) => env.id === activeId);
}
