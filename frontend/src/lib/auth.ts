import { clearClientAuthStorage, INSFORGE_AUTH_TOKEN_KEY, INSFORGE_AUTH_USER_KEY } from './auth-storage';
import { insforge } from './insforge';

let _cachedToken: string | null = null;

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

export async function signUp(
  email: string,
  password: string,
  name?: string,
): Promise<AuthResult> {
  try {
    const { data, error } = await insforge.auth.signUp({ email, password, name });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.user) {
      return {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email || email,
          name: data.user.profile?.name || '',
        },
      };
    }

    return {
      success: false,
      error: '注册失败，请重试',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function signIn(
  email: string,
  password: string,
  rememberMe: boolean = true,
): Promise<AuthResult> {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password, rememberMe }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Sign in failed' };
    }

    syncClientAuthSession(data.accessToken, data.user);

    return {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email || email,
        name: data.user.profile?.name || '',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof window === 'undefined') {
      return { success: false, error: 'OAuth can only be initiated in browser' };
    }

    const finalDestination = sessionStorage.getItem('auth_redirect') || '/today';
    const redirectTo = `${window.location.origin}${finalDestination}`;

    const { error } = await insforge.auth.signInWithOAuth({
      provider: 'google',
      redirectTo,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function updateProfile(profile: { name?: string }): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const { data, error } = await insforge.auth.setProfile(profile);

    if (error) {
      return { success: false, error: error.message };
    }

    const session = await insforge.auth.getCurrentSession();
    const sessionUser = session?.data?.session?.user;
    if (!sessionUser) {
      return { success: false, error: 'Session expired. Please sign in again.' };
    }

    return {
      success: true,
      user: {
        id: sessionUser.id,
        email: sessionUser.email || '',
        name: data?.profile?.name,
        avatarUrl: data?.profile?.avatar_url,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function signOut(): Promise<{ success: boolean; error?: string }> {
  setCachedToken(null);
  clearClientAuthStorage();

  try {
    const { error } = await insforge.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

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

let _refreshPromise: Promise<string | null> | null = null;

export function setCachedToken(token: string | null): void {
  _cachedToken = token;
}

export function syncClientAuthSession(
  accessToken: string,
  user?: { id: string; email?: string | null; profile?: unknown } | null,
): void {
  _cachedToken = accessToken;

  try {
    insforge.getHttpClient().setAuthToken(accessToken);
  } catch {
    // Best-effort SDK sync.
  }

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(INSFORGE_AUTH_TOKEN_KEY, accessToken);
    if (user) {
      window.localStorage.setItem(INSFORGE_AUTH_USER_KEY, JSON.stringify(user));
    }
  } catch {
    // localStorage might be unavailable.
  }
}

export async function clearStaleAuthStateWithoutRedirect(): Promise<void> {
  setCachedToken(null);
  clearClientAuthStorage();

  try {
    insforge.getHttpClient().setAuthToken('');
  } catch {
    // Best-effort cleanup only.
  }

  try {
    await insforge.auth.signOut();
  } catch {
    // Best-effort cleanup only.
  }

  try {
    await fetch('/api/auth', {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch {
    // Best-effort cleanup only.
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

export async function getAccessToken(): Promise<string | null> {
  if (_cachedToken && !isTokenExpired(_cachedToken)) {
    return _cachedToken;
  }
  _cachedToken = null;

  try {
    const result = await insforge.auth.getCurrentSession();
    const token = result?.data?.session?.accessToken;
    if (token && !isTokenExpired(token)) {
      _cachedToken = token;
      return token;
    }
  } catch {
    // SDK session unavailable.
  }

  // After page reload, InsforgeBrowserProvider may have recovered sdk.user from
  // localStorage without populating the standalone @insforge/sdk tokenManager.
  // Check localStorage before falling back to the full cookie round-trip.
  try {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(INSFORGE_AUTH_TOKEN_KEY);
      if (stored && !isTokenExpired(stored)) {
        _cachedToken = stored;
        try {
          insforge.getHttpClient().setAuthToken(stored);
        } catch {
          // Best-effort SDK sync.
        }
        return stored;
      }
    }
  } catch {
    // localStorage unavailable.
  }

  if (!_refreshPromise) {
    _refreshPromise = recoverTokenFromCookies().finally(() => {
      _refreshPromise = null;
    });
  }

  const token = await _refreshPromise;
  if (token) {
    _cachedToken = token;
  }
  return token;
}

async function recoverTokenFromCookies(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/session');
    if (!res.ok) return null;

    const data = await res.json();
    if (data.authenticated && data.accessToken && !isTokenExpired(data.accessToken)) {
      syncClientAuthSession(data.accessToken, data.user);
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

export function _resetAuthStateForTesting(): void {
  _cachedToken = null;
  _refreshPromise = null;
}

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
  code: string,
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

export async function resetPassword(
  newPassword: string,
  otp: string,
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
