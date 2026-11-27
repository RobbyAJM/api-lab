import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OVERLAY_MOTION_TIMINGS,
  OVERLAY_MOTION_CLASSES,
  getModalMotionClasses,
  getPopoverMotionClass,
  composeOverlayClassName,
} from './overlayMotion.ts';

test('OVERLAY_MOTION_TIMINGS enforces fast Operate-mode timing budget', () => {
  assert.equal(OVERLAY_MOTION_TIMINGS.delayMs, 0);
  assert.ok(OVERLAY_MOTION_TIMINGS.reducedMs > 0);
  assert.ok(OVERLAY_MOTION_TIMINGS.tooltipMs <= OVERLAY_MOTION_TIMINGS.popoverMs);
  assert.ok(OVERLAY_MOTION_TIMINGS.popoverMs <= OVERLAY_MOTION_TIMINGS.paletteMs);
  assert.ok(OVERLAY_MOTION_TIMINGS.paletteMs <= OVERLAY_MOTION_TIMINGS.modalMs);
  assert.ok(OVERLAY_MOTION_TIMINGS.backdropMs <= OVERLAY_MOTION_TIMINGS.modalMs);
  assert.ok(OVERLAY_MOTION_TIMINGS.modalMs <= OVERLAY_MOTION_TIMINGS.maxAllowedMs);
  assert.ok(OVERLAY_MOTION_TIMINGS.reducedMs <= 80);
});

test('getModalMotionClasses returns backdrop and panel classes for modal and palette variants', () => {
  assert.deepEqual(getModalMotionClasses(), {
    backdrop: OVERLAY_MOTION_CLASSES.backdrop,
    panel: OVERLAY_MOTION_CLASSES.modal,
  });

  assert.deepEqual(getModalMotionClasses('modal'), {
    backdrop: OVERLAY_MOTION_CLASSES.backdrop,
    panel: OVERLAY_MOTION_CLASSES.modal,
  });

  assert.deepEqual(getModalMotionClasses('palette'), {
    backdrop: OVERLAY_MOTION_CLASSES.backdrop,
    panel: OVERLAY_MOTION_CLASSES.palette,
  });
});

test('getPopoverMotionClass maps downward and upward placements for popovers and tooltips', () => {
  assert.equal(getPopoverMotionClass('bottom'), OVERLAY_MOTION_CLASSES.popoverBottom);
  assert.equal(getPopoverMotionClass('below'), OVERLAY_MOTION_CLASSES.popoverBottom);
  assert.equal(getPopoverMotionClass('top'), OVERLAY_MOTION_CLASSES.popoverTop);
  assert.equal(getPopoverMotionClass('above'), OVERLAY_MOTION_CLASSES.popoverTop);

  assert.equal(getPopoverMotionClass('bottom', 'tooltip'), OVERLAY_MOTION_CLASSES.tooltipBottom);
  assert.equal(getPopoverMotionClass('below', 'tooltip'), OVERLAY_MOTION_CLASSES.tooltipBottom);
  assert.equal(getPopoverMotionClass('top', 'tooltip'), OVERLAY_MOTION_CLASSES.tooltipTop);
  assert.equal(getPopoverMotionClass('above', 'tooltip'), OVERLAY_MOTION_CLASSES.tooltipTop);
});

test('composeOverlayClassName joins non-empty classes cleanly', () => {
  assert.equal(
    composeOverlayClassName('bg-zinc-900 ', false, null, undefined, '', '  overlay-modal-enter  '),
    'bg-zinc-900 overlay-modal-enter'
  );
  assert.equal(composeOverlayClassName(undefined, false, '   '), '');
});
