import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInvitationToken, formatJoinErrorMessage } from './workspaceJoin.ts';

test('validateInvitationToken: rejects empty or whitespace-only token', () => {
  const res1 = validateInvitationToken('');
  assert.equal(res1.valid, false);
  assert.equal(res1.error, 'Invitation token is required.');

  const res2 = validateInvitationToken('   ');
  assert.equal(res2.valid, false);
  assert.equal(res2.error, 'Invitation token is required.');
});

test('validateInvitationToken: rejects tokens with invalid length', () => {
  const shortToken = 'a'.repeat(63);
  const res1 = validateInvitationToken(shortToken);
  assert.equal(res1.valid, false);
  assert.match(res1.error || '', /exactly 64 characters \(currently 63\)/);

  const longToken = 'b'.repeat(65);
  const res2 = validateInvitationToken(longToken);
  assert.equal(res2.valid, false);
  assert.match(res2.error || '', /exactly 64 characters \(currently 65\)/);
});

test('validateInvitationToken: rejects non-hex characters', () => {
  const nonHex = 'g'.repeat(64);
  const res = validateInvitationToken(nonHex);
  assert.equal(res.valid, false);
  assert.equal(res.error, 'Invitation token must contain only hexadecimal characters (0-9, a-f).');

  const withSpecial = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde!';
  const res2 = validateInvitationToken(withSpecial);
  assert.equal(res2.valid, false);
});

test('validateInvitationToken: accepts valid 64-char hex token and trims whitespace', () => {
  const validHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const res = validateInvitationToken(`  ${validHex.toUpperCase()}  `);
  assert.equal(res.valid, true);
  assert.equal(res.error, null);
  assert.equal(res.token, validHex);
});

test('formatJoinErrorMessage: provides user-friendly error messages', () => {
  assert.equal(
    formatJoinErrorMessage({ message: 'invitation has expired or is no longer valid' }),
    'This invitation has expired or is no longer valid.'
  );

  assert.equal(
    formatJoinErrorMessage(new Error('user is already a member of this workspace')),
    'You are already a member of this workspace.'
  );

  assert.equal(
    formatJoinErrorMessage({ message: 'invalid invitation token format' }),
    'Invalid invitation token format. Expected 64 hexadecimal characters.'
  );

  assert.equal(
    formatJoinErrorMessage({ message: 'invalid token provided' }),
    'Invalid invitation token.'
  );

  assert.equal(
    formatJoinErrorMessage('Some generic failure'),
    'Some generic failure'
  );

  assert.equal(
    formatJoinErrorMessage(null),
    'Failed to join workspace. Please verify your token.'
  );
});
