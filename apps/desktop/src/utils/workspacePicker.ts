import type { WorkspaceSummary } from '@api-lab/api-types';

export function filterWorkspaces(
  workspaces: WorkspaceSummary[],
  query: string
): WorkspaceSummary[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return workspaces;
  return workspaces.filter((w) => w.name.toLowerCase().includes(trimmed));
}

export function sortWorkspaces(
  workspaces: WorkspaceSummary[],
  activeId?: string | null,
  favoriteIds: string[] = []
): WorkspaceSummary[] {
  return [...workspaces].sort((a, b) => {
    // 1. Active workspace first
    if (activeId) {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
    }
    // 2. Favorites next
    const aFav = favoriteIds.includes(a.id);
    const bFav = favoriteIds.includes(b.id);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;

    // 3. Alphabetical
    return a.name.localeCompare(b.name);
  });
}
