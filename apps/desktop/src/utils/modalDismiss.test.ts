import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldDismissOnBackdropClick,
  shouldDismissOnEscape,
  createBackdropClickHandler,
} from './modalDismiss.ts';

test('shouldDismissOnBackdropClick: true when direct backdrop hit', () => {
  const backdrop = { id: 'backdrop' };
  assert.equal(shouldDismissOnBackdropClick(backdrop, backdrop), true);
  assert.equal(shouldDismissOnBackdropClick(backdrop, backdrop, true), true);
});

test('shouldDismissOnBackdropClick: false when click bubbles from inside modal content', () => {
  const backdrop = { id: 'backdrop' };
  const modalBox = { id: 'modalBox' };
  const button = { id: 'button' };

  assert.equal(shouldDismissOnBackdropClick(modalBox, backdrop), false);
  assert.equal(shouldDismissOnBackdropClick(button, backdrop), false);
});

test('shouldDismissOnBackdropClick: false when disabled/busy', () => {
  const backdrop = { id: 'backdrop' };
  assert.equal(shouldDismissOnBackdropClick(backdrop, backdrop, false), false);
});

test('shouldDismissOnEscape: matches Escape when enabled', () => {
  assert.equal(shouldDismissOnEscape('Escape'), true);
  assert.equal(shouldDismissOnEscape('Escape', true), true);
  assert.equal(shouldDismissOnEscape('Enter'), false);
  assert.equal(shouldDismissOnEscape('Tab'), false);
  assert.equal(shouldDismissOnEscape('Escape', false), false);
});

test('createBackdropClickHandler: dispatches onClose only on direct non-disabled backdrop click', () => {
  let closed = 0;
  const onClose = () => {
    closed++;
  };

  const handler = createBackdropClickHandler(onClose);
  const backdrop = { id: 'backdrop' };
  const content = { id: 'content' };

  // Direct click -> closes
  handler({ target: backdrop, currentTarget: backdrop });
  assert.equal(closed, 1);

  // Click on modal content -> ignored
  handler({ target: content, currentTarget: backdrop });
  assert.equal(closed, 1);

  // Disabled handler -> ignored even on direct backdrop click
  const disabledHandler = createBackdropClickHandler(onClose, { disabled: true });
  disabledHandler({ target: backdrop, currentTarget: backdrop });
  assert.equal(closed, 1);
});
