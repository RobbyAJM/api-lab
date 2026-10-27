export interface TokenValidationResult {
  valid: boolean;
  error: string | null;
  token: string;
}

export function validateInvitationToken(rawToken: string): TokenValidationResult {
  const token = (rawToken || '').trim();

  if (!token) {
    return {
      valid: false,
      error: 'Invitation token is required.',
      token: '',
    };
  }

  if (token.length !== 64) {
    return {
      valid: false,
      error: `Invitation token must be exactly 64 characters (currently ${token.length}).`,
      token,
    };
  }

  if (!/^[0-9a-fA-F]{64}$/.test(token)) {
    return {
      valid: false,
      error: 'Invitation token must contain only hexadecimal characters (0-9, a-f).',
      token,
    };
  }

  return {
    valid: true,
    error: null,
    token: token.toLowerCase(),
  };
}

export function formatJoinErrorMessage(err: unknown): string {
  if (!err) return 'Failed to join workspace. Please verify your token.';

  const message = typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message: unknown }).message)
    : String(err);

  const lower = message.toLowerCase();

  if (lower.includes('already a member')) {
    return 'You are already a member of this workspace.';
  }

  if (lower.includes('format')) {
    return 'Invalid invitation token format. Expected 64 hexadecimal characters.';
  }

  if (lower.includes('expired') || lower.includes('no longer valid')) {
    return 'This invitation has expired or is no longer valid.';
  }

  if (lower.includes('invalid') || lower.includes('not found')) {
    return 'Invalid invitation token.';
  }

  return message || 'Failed to join workspace. Please verify your token.';
}
