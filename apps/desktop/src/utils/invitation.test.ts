import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLocalDateToYmd,
  getDefaultExpirationDate,
  getMinExpirationDate,
  buildCreateInvitationPayload,
  formatInvitationExpiration,
} from './invitation.ts';

test('formatLocalDateToYmd: correctly formats Date to YYYY-MM-DD', () => {
  const d = new Date(2026, 9, 27); // Month is 0-indexed (9 = Oct)
  assert.equal(formatLocalDateToYmd(d), '2026-10-27');
});

test('getDefaultExpirationDate: offsets date by specified days', () => {
  const base = new Date(2026, 9, 27);
  assert.equal(getDefaultExpirationDate(7, base), '2026-11-03');
  assert.equal(getDefaultExpirationDate(1, base), '2026-10-28');
});

test('getMinExpirationDate: returns base date YYYY-MM-DD', () => {
  const base = new Date(2026, 9, 27);
  assert.equal(getMinExpirationDate(base), '2026-10-27');
});

test('buildCreateInvitationPayload: neverExpires = true produces null expires_at', () => {
  const payload = buildCreateInvitationPayload({
    role: 'developer',
    neverExpires: true,
    expirationDate: '2026-11-15',
  });
  assert.equal(payload.role, 'developer');
  assert.equal(payload.expires_at, null);
  assert.equal(payload.never_expires, true);
});

test('buildCreateInvitationPayload: specific expiration date produces ISO end-of-day UTC timestamp', () => {
  const payload = buildCreateInvitationPayload({
    role: 'admin',
    neverExpires: false,
    expirationDate: '2026-12-31',
  });
  assert.equal(payload.role, 'admin');
  assert.equal(payload.expires_at, '2026-12-31T23:59:59.999Z');
  assert.equal(payload.never_expires, false);
});

test('buildCreateInvitationPayload: fallback when expiration date is omitted or empty', () => {
  const fixedNow = new Date('2026-10-27T10:00:00.000Z');
  const payload = buildCreateInvitationPayload({
    role: 'developer',
    neverExpires: false,
    expirationDate: '',
    now: fixedNow,
  });
  assert.equal(payload.role, 'developer');
  assert.equal(payload.expires_at, '2026-11-03T10:00:00.000Z');
  assert.equal(payload.never_expires, false);
});

test('formatInvitationExpiration: handles null, undefined, and valid timestamps', () => {
  assert.equal(formatInvitationExpiration(null), 'Never expires');
  assert.equal(formatInvitationExpiration(undefined), 'Never expires');
  assert.equal(formatInvitationExpiration(''), 'Never expires');

  const formatted = formatInvitationExpiration('2026-11-15T23:59:59.999Z');
  assert.match(formatted, /^Expires /);
  assert.ok(formatted.includes('2026') || formatted.includes('11') || formatted.includes('15'));
});
