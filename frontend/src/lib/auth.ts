import { insforge } from './insforge';

// In-memory token cache shared across all auth functions.
// Declared early so signIn/signOut/getAccessToken can all access it.
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
  name?: string
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
      error: '注册失败，请重试'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function signIn(email: string, password: string, rememberMe: boolean = true): Promise<AuthResult> {
  try {
    // Login through our server proxy so the server can capture the refresh
    // token from Insforge's Set-Cookie header (it is NOT in the response body).
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password, rememberMe }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Sign in failed' };
    }

    // Set SDK state so in-session API calls work
    insforge.getHttpClient().setAuthToken(data.accessToken);
    // Cache the token so getAccessToken() returns instantly
    _cachedToken = data.accessToken;

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

    const { data, error } = await insforge.auth.signInWithOAuth({
      provider: 'google',
      redirectTo,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.url) {
      window.location.href = data.url;
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

    // Get session first to ensure we have user identity
    const session = await insforge.auth.getCurrentSession();
    const sessionUser = session?.data?.session?.user;

    if (!sessionUser) {
      return { success: false, error: 'Session expired. Please sign in again.' };
    }

    const updatedUser: User = {
      id: sessionUser.id,
      email: sessionUser.email || '',
      name: data?.profile?.name,
      avatarUrl: data?.profile?.avatar_url,
    };

    return { success: true, user: updatedUser };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function signOut(): Promise<{ success: boolean; error?: string }> {
  _cachedToken = null;
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
    // 60s buffer to avoid edge-case expiry during request flight
    return Date.now() / 1000 > payload.exp - 60;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Token cache & retrieval
// ---------------------------------------------------------------------------
// Prevent concurrent refresh attempts from racing
let _refreshPromise: Promise<string | null> | null = null;

/**
 * Set the cached access token. Called by AuthContext after cookie recovery
 * so that subsequent getAccessToken() calls are instant.
 */
export function setCachedToken(token: string | null): void {
  _cachedToken = token;
}

export async function getAccessToken(): Promise<string | null> {
  // 1. Check in-memory cache (instant, no network call)
  if (_cachedToken && !isTokenExpired(_cachedToken)) {
    return _cachedToken;
  }
  _cachedToken = null;

  // 2. Try SDK tokenManager synchronously via getCurrentSession().
  //    - OAuth users: returns instantly (tokenManager has the session).
  //    - Server-proxy users: tokenManager.getSession() returns null, then
  //      SDK makes a POST /api/auth/refresh to Insforge that always fails
  //      (our cookies are on our domain, not Insforge's). This adds 1-10s
  //      latency but only runs once thanks to the cache.
  try {
    const result = await insforge.auth.getCurrentSession();
    const token = result?.data?.session?.accessToken;
    if (token && !isTokenExpired(token)) {
      _cachedToken = token;
      return token;
    }
  } catch {
    // SDK session unavailable
  }

  // 3. Token expired or missing - try server-side cookie recovery.
  //    Deduplicate concurrent refresh attempts.
  if (!_refreshPromise) {
    _refreshPromise = _recoverTokenFromCookies().finally(() => {
      _refreshPromise = null;
    });
  }
  const token = await _refreshPromise;
  if (token) {
    _cachedToken = token;
  }
  return token;
}

async function _recoverTokenFromCookies(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/session');
    if (!res.ok) return null;

    const data = await res.json();
    if (data.authenticated && data.accessToken && !isTokenExpired(data.accessToken)) {
      insforge.getHttpClient().setAuthToken(data.accessToken);
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// Password Reset Functions (Code-based flow)
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
