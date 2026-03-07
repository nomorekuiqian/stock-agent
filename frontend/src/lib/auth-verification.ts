import { DEFAULT_AUTH_REDIRECT, sanitizeRedirectPath } from './auth-redirect';

const PENDING_EMAIL_KEY = 'pending_verification_email';
const PENDING_NAME_KEY = 'pending_verification_name';

export interface PendingVerificationState {
  email: string;
  name?: string;
}

export function buildVerifyEmailPath(redirectPath?: string): string {
  const redirect = sanitizeRedirectPath(redirectPath, DEFAULT_AUTH_REDIRECT);
  const params = new URLSearchParams({ redirect });
  return `/verify-email?${params.toString()}`;
}

export function buildAbsoluteVerifyEmailUrl(origin: string, redirectPath?: string): string {
  return new URL(buildVerifyEmailPath(redirectPath), origin).toString();
}

export function storePendingVerification(state: PendingVerificationState): void {
  if (typeof window === 'undefined') {
    return;
  }

  sessionStorage.setItem(PENDING_EMAIL_KEY, state.email);
  if (state.name?.trim()) {
    sessionStorage.setItem(PENDING_NAME_KEY, state.name.trim());
  } else {
    sessionStorage.removeItem(PENDING_NAME_KEY);
  }
}

export function getPendingVerification(): PendingVerificationState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const email = sessionStorage.getItem(PENDING_EMAIL_KEY);
  if (!email) {
    return null;
  }

  const name = sessionStorage.getItem(PENDING_NAME_KEY) || undefined;
  return { email, name };
}

export function clearPendingVerification(): void {
  if (typeof window === 'undefined') {
    return;
  }

  sessionStorage.removeItem(PENDING_EMAIL_KEY);
  sessionStorage.removeItem(PENDING_NAME_KEY);
}
