import { DEFAULT_AUTH_REDIRECT } from './auth-redirect';
import { clearClientAuthStorage } from './auth-storage';
import { insforge } from './insforge';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export type AuthResetReason = 'session_reset' | 'session_expired' | 'session_recovery_failed';
const FORCED_REAUTH_REASON_KEY = 'forced_reauth_reason';

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    if (!payload.exp) return false;
    return Date.now() / 1000 > payload.exp - 60;
  } catch {
    return true;
  }
}

let refreshPromise: Promise<string | null> | null = null;
let authResetPromise: Promise<void> | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

async function tryRefreshToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh' }),
      credentials: 'include',
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.accessToken) return null;

    // Cache so subsequent getAccessToken() calls skip SDK + refresh
    try {
      const parts = data.accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp) {
          cachedToken = { value: data.accessToken, expiresAt: payload.exp };
        }
      }
    } catch {
      // Cache is best-effort
    }

    try {
      insforge.getHttpClient?.().setAuthToken?.(data.accessToken);
    } catch {
      // SDK client mutation is best-effort.
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('insforge-auth-token', data.accessToken);
        if (data.user) {
          window.localStorage.setItem('insforge-auth-user', JSON.stringify(data.user));
        }
      } catch {
        // localStorage might be unavailable.
      }
    }

    return data.accessToken;
  } catch {
    return null;
  }
}

function clearAuthRedirectState(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem('auth_redirect');
  } catch {
    // sessionStorage might be unavailable.
  }
}

export function consumeForcedReauthReason(): AuthResetReason | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.sessionStorage.getItem(FORCED_REAUTH_REASON_KEY);
    if (value === 'session_reset' || value === 'session_expired' || value === 'session_recovery_failed') {
      window.sessionStorage.removeItem(FORCED_REAUTH_REASON_KEY);
      return value;
    }
  } catch {
    // sessionStorage might be unavailable.
  }

  return null;
}

function currentAppPath(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_AUTH_REDIRECT;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function buildAuthResetRedirectUrl(reason: AuthResetReason): string {
  if (typeof window === 'undefined') {
    return `/login?error=${reason}&redirect=${encodeURIComponent(DEFAULT_AUTH_REDIRECT)}`;
  }

  const isAuthPage = /^\/(login|signup|verify-email|forgot-password|reset-password)(\/|$)/.test(window.location.pathname);
  const redirect = isAuthPage ? DEFAULT_AUTH_REDIRECT : currentAppPath();
  const params = new URLSearchParams({
    error: reason,
    redirect,
  });

  return `/login?${params.toString()}`;
}

function clearClientAuthState(): void {
  cachedToken = null;
  clearClientAuthStorage();
  clearAuthRedirectState();

  try {
    insforge.getHttpClient?.().setAuthToken?.('');
  } catch {
    // Best-effort cleanup only.
  }
}

export async function resetStaleAuthState(reason: AuthResetReason = 'session_reset'): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (!authResetPromise) {
    authResetPromise = (async () => {
      try {
        window.sessionStorage.setItem(FORCED_REAUTH_REASON_KEY, reason);
      } catch {
        // sessionStorage might be unavailable.
      }

      clearClientAuthState();

      try {
        await insforge.auth.signOut();
      } catch {
        // SDK sign-out is best-effort. Continue clearing server cookies below.
      }

      try {
        await fetch('/api/auth', {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch {
        // Cookie cleanup is best-effort; redirect still recovers the session.
      }

      window.location.replace(buildAuthResetRedirectUrl(reason));
    })().finally(() => {
      authResetPromise = null;
    });
  }

  return authResetPromise;
}

export async function getAccessToken(): Promise<string | null> {
  try {
    // Return cached token from a previous refresh (avoids redundant SDK/refresh calls)
    if (cachedToken && !isTokenExpired(cachedToken.value)) {
      return cachedToken.value;
    }
    cachedToken = null;

    // Try SDK first (guard against hanging with 5s timeout)
    const result = await Promise.race([
      insforge.auth.getCurrentSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    const token = result?.data?.session?.accessToken;
    if (token && !isTokenExpired(token)) {
      return token;
    }

    // SDK returned null or expired token. This happens when the SDK's
    // internal refresh fails (cross-domain cookie issue with Server Proxy).
    // Fall through to our own Server Proxy refresh which uses httpOnly
    // cookies on our domain.
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().finally(() => {
        refreshPromise = null;
      });
    }

    return refreshPromise;
  } catch {
    return null;
  }
}

// =============================================================================
// Password Reset Functions (Code-based flow) - These always used SDK directly
// =============================================================================

export async function sendPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await insforge.auth.sendResetPasswordEmail({ email });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: data?.success ?? false };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function exchangeResetPasswordCode(
  email: string,
  code: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const { data, error } = await insforge.auth.exchangeResetPasswordToken({
      email,
      code,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.token) {
      return { success: false, error: 'Invalid reset code' };
    }

    return { success: true, token: data.token };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/** @internal Exposed for test isolation only. */
export function _resetAuthStateForTesting(): void {
  cachedToken = null;
  refreshPromise = null;
  authResetPromise = null;
}

export async function resetPassword(
  newPassword: string,
  otp: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await insforge.auth.resetPassword({
      newPassword,
      otp,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: !!data?.message };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
