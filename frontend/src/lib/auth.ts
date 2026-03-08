import { DEFAULT_AUTH_REDIRECT } from './auth-redirect';
import { clearClientAuthStorage } from './auth-storage';
import { insforge } from './insforge';
import { isJwtExpired } from './auth-token';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export type AuthResetReason = 'session_reset' | 'session_expired' | 'session_recovery_failed';
export type AccessTokenResolutionState = 'authenticated' | 'no_session' | 'transient_failure';
const FORCED_REAUTH_REASON_KEY = 'forced_reauth_reason';
const REFRESH_RETRY_DELAYS_MS = [300, 900] as const;

interface ClientSessionUser {
  id: string;
  email?: string | null;
  profile?: unknown;
}

interface SessionBridgePayload {
  accessToken: string;
  csrfToken?: string | null;
}

interface AccessTokenResolution {
  token: string | null;
  state: AccessTokenResolutionState;
}

export function isTokenExpired(token: string): boolean {
  return isJwtExpired(token);
}

let refreshPromise: Promise<AccessTokenResolution> | null = null;
let authResetPromise: Promise<void> | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

function cacheAccessToken(accessToken: string): void {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) {
      cachedToken = null;
      return;
    }

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp) {
      cachedToken = { value: accessToken, expiresAt: payload.exp };
      return;
    }
  } catch {
    // Best-effort cache only.
  }

  cachedToken = null;
}

export function syncClientAuthSession(accessToken: string, user?: ClientSessionUser | null): void {
  cacheAccessToken(accessToken);

  try {
    insforge.getHttpClient?.().setAuthToken?.(accessToken);
  } catch {
    // SDK client mutation is best-effort.
  }

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem('insforge-auth-token', accessToken);
    if (user) {
      window.localStorage.setItem('insforge-auth-user', JSON.stringify(user));
    }
  } catch {
    // localStorage might be unavailable.
  }
}

export async function bridgeAuthSessionToCookies(
  payload: SessionBridgePayload
): Promise<{ success: boolean; user?: ClientSessionUser; error?: string }> {
  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'bridge-session',
        accessToken: payload.accessToken,
        csrfToken: payload.csrfToken,
      }),
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        success: false,
        error: data.error || 'Failed to bridge auth session',
      };
    }

    const data = await response.json().catch(() => ({}));
    return {
      success: true,
      user: data.user,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bridge auth session',
    };
  }
}

async function refreshOnce(): Promise<AccessTokenResolution> {
  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh' }),
      credentials: 'include',
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { token: null, state: 'no_session' };
      }
      return { token: null, state: 'transient_failure' };
    }

    const data = await response.json();
    if (!data.accessToken) {
      return { token: null, state: 'transient_failure' };
    }
    syncClientAuthSession(data.accessToken, data.user);

    return { token: data.accessToken, state: 'authenticated' };
  } catch {
    return { token: null, state: 'transient_failure' };
  }
}

async function tryRefreshToken(): Promise<AccessTokenResolution> {
  for (let attempt = 0; attempt <= REFRESH_RETRY_DELAYS_MS.length; attempt++) {
    const result = await refreshOnce();
    if (result.state !== 'transient_failure') {
      return result;
    }

    const retryDelay = REFRESH_RETRY_DELAYS_MS[attempt];
    if (retryDelay === undefined) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  return { token: null, state: 'transient_failure' };
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

export function cleanupAuthCallbackUrlParams(): boolean {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') {
    return false;
  }

  const url = new URL(window.location.href);
  const callbackParams = ['insforge_code', 'access_token', 'user_id', 'email'];
  let changed = false;

  for (const param of callbackParams) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  }

  if (!changed) {
    return false;
  }

  window.history.replaceState({}, document.title, url.toString());
  return true;
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

export async function clearStaleAuthStateWithoutRedirect(): Promise<void> {
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
    // Cookie cleanup is best-effort.
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

      await clearStaleAuthStateWithoutRedirect();
      window.location.replace(buildAuthResetRedirectUrl(reason));
    })().finally(() => {
      authResetPromise = null;
    });
  }

  return authResetPromise;
}

export async function getAccessTokenResolution(
  { forceRefresh = false }: { forceRefresh?: boolean } = {}
): Promise<AccessTokenResolution> {
  try {
    if (!forceRefresh && cachedToken && !isTokenExpired(cachedToken.value)) {
      return { token: cachedToken.value, state: 'authenticated' };
    }
    if (cachedToken && isTokenExpired(cachedToken.value)) {
      cachedToken = null;
    }

    // Check localStorage for a valid token
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const storedToken = window.localStorage.getItem('insforge-auth-token');
        if (storedToken && !isTokenExpired(storedToken)) {
          cacheAccessToken(storedToken);
          return { token: storedToken, state: 'authenticated' };
        }
      } catch {
        // localStorage might be unavailable.
      }
    }

    // Token missing or expired — refresh via Server Proxy
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().finally(() => {
        refreshPromise = null;
      });
    }

    return refreshPromise;
  } catch {
    return { token: null, state: 'transient_failure' };
  }
}

export async function getAccessToken(): Promise<string | null> {
  const result = await getAccessTokenResolution();
  return result.token;
}

/** @internal Exposed for test isolation only. */
export function _resetAuthStateForTesting(): void {
  cachedToken = null;
  refreshPromise = null;
  authResetPromise = null;
}

/** @internal Exposed for tests that verify retry behavior. */
export const _authTimingForTesting = {
  REFRESH_RETRY_DELAYS_MS: [...REFRESH_RETRY_DELAYS_MS],
};

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
