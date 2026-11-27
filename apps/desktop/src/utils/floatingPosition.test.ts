import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Z_INDEX,
  calculateFloatingPosition,
  isAnchorWithinClipBounds,
  calculateContextMenuPosition,
  type FloatingAnchorRect,
} from './floatingPosition.ts';

function rect(left: number, top: number, width: number, height: number): FloatingAnchorRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

test('Z_INDEX maintains strict overlay layering above modals and nested sub-modals', () => {
  assert.ok(Z_INDEX.MODAL < Z_INDEX.NESTED_MODAL);
  assert.ok(Z_INDEX.NESTED_MODAL < Z_INDEX.DROPDOWN);
  assert.ok(Z_INDEX.DROPDOWN < Z_INDEX.HOVER_CARD);
  assert.ok(Z_INDEX.HOVER_CARD < Z_INDEX.COMBOBOX);
});

test('calculateFloatingPosition: places below trigger aligned left by default', () => {
  const pos = calculateFloatingPosition(
    rect(120, 200, 180, 32),
    { width: 1280, height: 800 },
    { matchTriggerWidth: 'min', maxHeight: 224, offset: 4 }
  );

  assert.equal(pos.placement, 'bottom');
  assert.equal(pos.left, 120);
  assert.equal(pos.top, 236);
  assert.equal(pos.bottom, undefined);
  assert.equal(pos.minWidth, 180);
  assert.equal(pos.maxHeight, 224);
});

test('calculateFloatingPosition: aligns right edge and clamps within viewport', () => {
  const aligned = calculateFloatingPosition(
    rect(400, 100, 100, 28),
    { width: 1280, height: 800 },
    { align: 'right', width: 224, offset: 6 }
  );
  assert.equal(aligned.left, 276); // 500 - 224
  assert.equal(aligned.width, 224);
  assert.equal(aligned.top, 134);

  // Near left edge with right alignment: clamps to padding (8)
  const clampedLeft = calculateFloatingPosition(
    rect(20, 100, 80, 28),
    { width: 1280, height: 800 },
    { align: 'right', width: 224 }
  );
  assert.equal(clampedLeft.left, 8);

  // Near right edge with left alignment: shifts left to fit within viewport
  const clampedRight = calculateFloatingPosition(
    rect(1150, 100, 100, 28),
    { width: 1280, height: 800 },
    { align: 'left', width: 256 }
  );
  assert.equal(clampedRight.left, 1280 - 8 - 256);
});

test('calculateFloatingPosition: flips above anchor when bottom space is insufficient', () => {
  const pos = calculateFloatingPosition(
    rect(300, 720, 200, 32),
    { width: 1280, height: 800 },
    { matchTriggerWidth: 'exact', maxHeight: 288, offset: 4 }
  );

  assert.equal(pos.placement, 'top');
  assert.equal(pos.top, undefined);
  assert.equal(pos.bottom, 800 - 720 + 4);
  assert.equal(pos.width, 200);
  assert.equal(pos.maxHeight, 288);
});

test('calculateFloatingPosition: stays below when measured menu height fits comfortably', () => {
  const pos = calculateFloatingPosition(
    rect(300, 650, 200, 32),
    { width: 1280, height: 800 },
    { measuredHeight: 90, maxHeight: 288, offset: 4 }
  );

  assert.equal(pos.placement, 'bottom');
  assert.equal(pos.top, 686);
});

test('calculateFloatingPosition: clamps maxHeight on tight viewports', () => {
  const pos = calculateFloatingPosition(
    rect(100, 150, 200, 30),
    { width: 500, height: 320 },
    { maxHeight: 300, offset: 4, viewportPadding: 8 }
  );

  // Space above = 150 - 4 - 8 = 138, space below = 320 - 180 - 4 - 8 = 128 -> flips above
  assert.equal(pos.placement, 'top');
  assert.equal(pos.maxHeight, 138);
});

test('calculateFloatingPosition: accounts for measuredWidth wider than trigger on right align', () => {
  const pos = calculateFloatingPosition(
    rect(500, 100, 90, 28),
    { width: 1280, height: 800 },
    { align: 'right', matchTriggerWidth: 'min', measuredWidth: 210 }
  );

  assert.equal(pos.left, 590 - 210);
  assert.equal(pos.minWidth, 90);
});

test('isAnchorWithinClipBounds: allows visible/partially visible anchors and rejects scrolled-away ones', () => {
  const viewport = { width: 1280, height: 800 };
  const modalBody = rect(200, 150, 600, 400); // y: 150..550

  // Fully inside modal scroll area
  assert.equal(isAnchorWithinClipBounds(rect(240, 300, 160, 30), [modalBody], viewport), true);

  // Partially visible near bottom edge of modal scroll area (still visible -> keep open)
  assert.equal(isAnchorWithinClipBounds(rect(240, 535, 160, 30), [modalBody], viewport), true);

  // Scrolled completely past bottom edge of modal scroll area -> close
  assert.equal(isAnchorWithinClipBounds(rect(240, 550, 160, 30), [modalBody], viewport), false);

  // Scrolled completely above top edge of modal scroll area -> close
  assert.equal(isAnchorWithinClipBounds(rect(240, 110, 160, 30), [modalBody], viewport), false);

  // Zero-area point anchor inside vs outside
  assert.equal(isAnchorWithinClipBounds(rect(250, 200, 0, 0), [modalBody], viewport), true);
  assert.equal(isAnchorWithinClipBounds(rect(250, 600, 0, 0), [modalBody], viewport), false);
});

test('calculateContextMenuPosition: clamps pointer menu inside right and bottom viewport edges', () => {
  const normal = calculateContextMenuPosition(
    { x: 100, y: 120 },
    { width: 176, height: 180 },
    { width: 1280, height: 800 }
  );
  assert.deepEqual(normal, { left: 100, top: 120 });

  const clamped = calculateContextMenuPosition(
    { x: 1250, y: 760 },
    { width: 176, height: 180 },
    { width: 1280, height: 800 }
  );
  assert.deepEqual(clamped, { left: 1280 - 176 - 8, top: 800 - 180 - 8 });
});
