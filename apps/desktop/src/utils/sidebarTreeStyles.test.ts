import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCollectionRowClasses,
  getCollectionLabelClasses,
  getTreeChevronClasses,
  getFolderRowClasses,
  getFolderGuideClasses,
  getEndpointRowClasses,
} from './sidebarTreeStyles.ts';

test('collection highlight stays flat without bordered box or hardcoded white text', () => {
  const highlightedRow = getCollectionRowClasses(true);
  const idleRow = getCollectionRowClasses(false);

  assert.ok(!highlightedRow.includes('border '), 'highlighted collection must not add a box border');
  assert.ok(!highlightedRow.includes('bg-zinc-900/80'), 'highlighted collection must not use a boxed fill');
  assert.ok(highlightedRow.includes('text-zinc-100'));
  assert.ok(idleRow.includes('text-zinc-300'));

  const highlightedLabel = getCollectionLabelClasses(true);
  assert.ok(!highlightedLabel.includes('text-white'), 'collection label must stay theme-safe for light themes');
  assert.ok(highlightedLabel.includes('text-zinc-100'));
});

test('folder highlight stays clean and borderless while revealed state remains distinct', () => {
  const highlighted = getFolderRowClasses({ isHighlighted: true, isTargetRevealed: false });
  const idle = getFolderRowClasses({ isHighlighted: false, isTargetRevealed: false });
  const revealed = getFolderRowClasses({ isHighlighted: true, isTargetRevealed: true });

  assert.ok(!highlighted.includes('border '), 'ancestor folder must not add a bordered box');
  assert.ok(!highlighted.includes('bg-zinc-900/80'), 'ancestor folder must not stack dark pills');
  assert.ok(highlighted.includes('text-zinc-100'));
  assert.ok(highlighted.includes('font-medium'));

  assert.ok(idle.includes('text-zinc-400'));
  assert.ok(!idle.includes('font-medium'));

  assert.ok(revealed.includes('bg-primary/15'));
  assert.ok(revealed.includes('ring-inset'));
});

test('folder guide rail illuminates subtly on active ancestor branch', () => {
  const activeGuide = getFolderGuideClasses({ isHighlighted: true, isTargetRevealed: false });
  const revealedGuide = getFolderGuideClasses({ isHighlighted: false, isTargetRevealed: true });
  const idleGuide = getFolderGuideClasses({ isHighlighted: false, isTargetRevealed: false });

  assert.ok(activeGuide.includes('border-primary/35'));
  assert.ok(revealedGuide.includes('border-primary/35'));
  assert.ok(idleGuide.includes('border-zinc-800/40'));
});

test('chevron classes brighten on highlighted ancestor rows', () => {
  assert.ok(getTreeChevronClasses(true).includes('text-zinc-300'));
  assert.ok(getTreeChevronClasses(false).includes('text-zinc-500'));
});

test('endpoint row uses flat inset highlight without thick left accent border', () => {
  const active = getEndpointRowClasses(true);
  const idle = getEndpointRowClasses(false);

  assert.ok(active.includes('bg-primary/15'));
  assert.ok(active.includes('ring-inset'));
  assert.ok(!/\bborder-l-\d/.test(active), 'active endpoint must not use thick left accent borders');
  assert.ok(idle.includes('text-zinc-400'));
});
