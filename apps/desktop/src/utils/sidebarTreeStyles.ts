export interface FolderHighlightState {
  isHighlighted: boolean;
  isTargetRevealed: boolean;
}

/**
 * Row classes for a Collection header in the sidebar.
 * Highlighted collections remain flat (no boxed border or dot) and use theme-safe ink tokens.
 */
export function getCollectionRowClasses(isHighlighted: boolean): string {
  const base = 'flex items-center justify-between px-2 py-1 text-xs rounded-md group transition';
  if (isHighlighted) {
    return `${base} hover:bg-zinc-900/70 text-zinc-100`;
  }
  return `${base} hover:bg-zinc-900/70 text-zinc-300`;
}

/**
 * Label text classes for a Collection name (theme-safe across both dark and light themes).
 */
export function getCollectionLabelClasses(isHighlighted: boolean): string {
  return isHighlighted ? 'truncate font-semibold text-zinc-100' : 'truncate font-semibold text-zinc-200';
}

/**
 * Chevron icon classes for a Collection or Folder node.
 */
export function getTreeChevronClasses(isHighlighted: boolean): string {
  return isHighlighted ? 'text-zinc-300 flex-shrink-0' : 'text-zinc-500 flex-shrink-0';
}

/**
 * Row classes for a Folder node in the sidebar tree.
 * - `isTargetRevealed`: transient ring highlight (zero border shift) when jumping to a folder.
 * - `isHighlighted` (ancestor of active endpoint): clean flat row with elevated typography only.
 * - Default: muted text with subtle hover surface.
 */
export function getFolderRowClasses({
  isHighlighted,
  isTargetRevealed,
}: FolderHighlightState): string {
  const base = 'flex items-center justify-between w-full py-1 text-xs group rounded-md px-1.5 transition';
  if (isTargetRevealed) {
    return `${base} bg-primary/15 text-zinc-100 ring-1 ring-inset ring-primary/50 font-medium`;
  }
  if (isHighlighted) {
    return `${base} text-zinc-100 hover:bg-zinc-900/50 font-medium`;
  }
  return `${base} text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50`;
}

/**
 * Vertical indent guide classes for expanded folder children.
 * Subtly highlights the active ancestor path without boxing folder headers.
 */
export function getFolderGuideClasses({
  isHighlighted,
  isTargetRevealed,
}: FolderHighlightState): string {
  const borderClass =
    isHighlighted || isTargetRevealed ? 'border-primary/35' : 'border-zinc-800/40';
  return `pl-3 space-y-0.5 border-l ${borderClass} ml-2`;
}

/**
 * Row classes for an Endpoint item in the sidebar.
 * Active endpoints use a crisp flat tinted surface with an inset hairline ring (no thick border-l).
 */
export function getEndpointRowClasses(isActive: boolean): string {
  const base =
    'w-full flex items-center justify-between px-2 py-1 rounded-md text-xs transition text-left cursor-pointer';
  if (isActive) {
    return `${base} bg-primary/15 text-zinc-100 font-medium ring-1 ring-inset ring-primary/30`;
  }
  return `${base} hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200`;
}
