export const CONTEXT_MENU_CLOSE_EVENT = 'api-lab:close-context-menus';

/**
 * Dispatches a global event to close any currently open context menus.
 */
export function closeAllContextMenus(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONTEXT_MENU_CLOSE_EVENT));
  }
}
