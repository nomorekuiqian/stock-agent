import { insforge, setAuthCache } from './insforge';

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

// ---------------------------------------------------------------------------
// Session persistence helpers
// The Insforge SDK enters "memory mode" when the server returns a csrfToken,
// which actively deletes localStorage data. We re-save the session under the
// SDK's own keys so that getCurrentSession() can recover it after a browser
// restart without relying on third-party cookies for refresh.
// ---------------------------------------------------------------------------
const SDK_TOKEN_KEY = 'insforge-auth-token';
const SDK_USER_KEY = 'insforge-auth-user';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function persistSessionToStorage(accessToken: string, user: any): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SDK_TOKEN_KEY, accessToken);
    localStorage.setItem(SDK_USER_KEY, JSON.stringify(user));
  } catch {
    // localStorage might be full or disabled
  }
}

function clearSessionFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SDK_TOKEN_KEY);
    localStorage.removeItem(SDK_USER_KEY);
  } catch {
    // ignore
  }
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
    const { data, error } = await insforge.auth.signInWithPassword({ email, password });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.user) {
      if (data.accessToken) {
        try {
          const syncResponse = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'sync-token',
              accessToken: data.accessToken,
              refreshToken: data.refreshToken || '',
              rememberMe,
            }),
          });
          if (!syncResponse.ok) {
            return { success: false, error: 'Failed to complete authentication' };
          }
        } catch {
          return { success: false, error: 'Failed to complete authentication' };
        }

        insforge.getHttpClient().setAuthToken(data.accessToken);

        // Re-persist session to localStorage after SDK memory mode clears it.
        // When Insforge returns csrfToken, SDK enters memory mode and deletes
        // localStorage data. We re-save so getCurrentSession() can recover
        // the session after browser restart.
        if (rememberMe) {
          persistSessionToStorage(data.accessToken, data.user);
        }
      }

      return {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email || email,
          name: data.user.profile?.name || '',
        },
      };
    }

    return { success: false, error: 'Sign in failed' };
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
  try {
    const { error } = await insforge.auth.signOut();

    clearSessionFromStorage();
    setAuthCache(null);

    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear-token' }),
      });
    } catch {
      // Non-critical, continue with logout
    }

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

async function recoverSessionFromCookies(): Promise<User | false> {
  try {
    const res = await fetch('/api/auth/session');
    if (!res.ok) return false;

    const data = await res.json();
    if (data.authenticated && data.accessToken) {
      insforge.getHttpClient().setAuthToken(data.accessToken);
      setAuthCache(data.accessToken);
      if (data.user) {
        // Persist recovered session so SDK can find it on next restart
        persistSessionToStorage(data.accessToken, data.user);
        return {
          id: data.user.id,
          email: data.user.email || '',
          name: data.user.profile?.name,
          avatarUrl: data.user.profile?.avatar_url,
        };
      }
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const sessionResult = await insforge.auth.getCurrentSession();
    const sessionData = sessionResult?.data;

    // If SDK has no session, try recovering from httpOnly cookies
    if (!sessionData?.session) {
      const recovered = await recoverSessionFromCookies();
      if (!recovered) {
        return null;
      }
      // Cookie recovery returned user data directly (may include refreshed token)
      if (typeof recovered === 'object') {
        return recovered;
      }
      return null;
    }

    if (sessionData.session.accessToken) {
      insforge.getHttpClient().setAuthToken(sessionData.session.accessToken);
      // Share token with ensureAuth() so DB operations don't re-call
      // getCurrentSession() which can trigger a failed refresh.
      setAuthCache(sessionData.session.accessToken);

      // Keep localStorage in sync so the SDK can recover the session
      // after a browser restart (memory mode clears localStorage).
      if (sessionData.session.user) {
        persistSessionToStorage(sessionData.session.accessToken, sessionData.session.user);
      }
    }

    // Use session user directly if available (avoids extra remote call)
    if (sessionData.session.user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = sessionData.session.user as any;
      return {
        id: u.id,
        email: u.email || '',
        name: u.profile?.name,
        avatarUrl: u.profile?.avatar_url,
      };
    }

    // Fallback: fetch user from API
    const { data, error } = await insforge.auth.getCurrentUser();
    if (error || !data?.user) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userWithProfile = data.user as any;
    return {
      id: data.user.id,
      email: data.user.email || '',
      name: userWithProfile.profile?.name,
      avatarUrl: userWithProfile.profile?.avatar_url,
    };
  } catch {
    return null;
  }
}

export async function getSession() {
  try {
    const { data, error } = await insforge.auth.getCurrentSession();
    if (error) {
      return null;
    }
    return data?.session || null;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  // Use cached token first to avoid redundant getCurrentSession() calls
  // that can trigger failed token refreshes clearing SDK state
  const { getAuthCache } = await import('./insforge');
  const cached = getAuthCache();
  if (cached) return cached;

  const result = await insforge.auth.getCurrentSession();
  return result?.data?.session?.accessToken || null;
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
