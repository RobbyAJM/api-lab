import type { Role } from '@api-lab/api-types';

export interface CreateInvitationPayload {
  role: Role;
  expires_at: string | null;
  never_expires: boolean;
}

export function formatLocalDateToYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDefaultExpirationDate(daysFromNow: number = 7, baseDate: Date = new Date()): string {
  const target = new Date(baseDate.getTime() + daysFromNow * 24 * 60 * 60 * 1000);
  return formatLocalDateToYmd(target);
}

export function getMinExpirationDate(baseDate: Date = new Date()): string {
  return formatLocalDateToYmd(baseDate);
}

export function buildCreateInvitationPayload(params: {
  role: Role;
  neverExpires: boolean;
  expirationDate?: string | null;
  now?: Date;
}): CreateInvitationPayload {
  const { role, neverExpires, expirationDate, now = new Date() } = params;

  if (neverExpires) {
    return {
      role,
      expires_at: null,
      never_expires: true,
    };
  }

  if (expirationDate && /^\d{4}-\d{2}-\d{2}$/.test(expirationDate.trim())) {
    const isoDate = `${expirationDate.trim()}T23:59:59.999Z`;
    return {
      role,
      expires_at: isoDate,
      never_expires: false,
    };
  }

  // Fallback to 7 days from now if expirationDate is absent or invalid
  const fallback = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    role,
    expires_at: fallback,
    never_expires: false,
  };
}

export function formatInvitationExpiration(expiresAt: string | null | undefined): string {
  if (!expiresAt) {
    return 'Never expires';
  }
  const date = new Date(expiresAt);
  if (isNaN(date.getTime())) {
    return 'Invalid expiration date';
  }
  return `Expires ${date.toLocaleDateString()}`;
}
