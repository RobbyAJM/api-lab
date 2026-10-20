import test from 'node:test';
import assert from 'node:assert/strict';
import { closeAllContextMenus, CONTEXT_MENU_CLOSE_EVENT } from './contextMenu.ts';

test('closeAllContextMenus: dispatches CONTEXT_MENU_CLOSE_EVENT', () => {
  let eventDispatched = false;

  // Mock global window event listener
  const mockListener = () => {
    eventDispatched = true;
  };

  (globalThis as any).window = {
    dispatchEvent: (evt: CustomEvent) => {
      if (evt.type === CONTEXT_MENU_CLOSE_EVENT) {
        mockListener();
      }
    },
  };

  closeAllContextMenus();
  assert.equal(eventDispatched, true);

  delete (globalThis as any).window;
});
