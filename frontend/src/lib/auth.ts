import { insforge } from './insforge';

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

// Email/Password Sign Up
export async function signUp(email: string, password: string, name?: string): Promise<AuthResult & { needsVerification?: boolean }> {
  try {
    const { data, error } = await insforge.auth.signUp({
      email,
      password,
      name,
    });

    console.log('[Auth] Sign up response:', { data, error });

    if (error) {
      console.error('[Auth] Sign up error:', error);
      return { success: false, error: error.message };
    }

    // Check if email verification is required
    if (data?.user) {
      return {
        success: true,
        needsVerification: data.requireEmailVerification || !data.user.emailVerified,
        user: {
          id: data.user.id,
          email: data.user.email || email,
          name: data.user.profile?.name || '',
        },
      };
    }

    // If we get here, check if it's because verification email was sent
    return {
      success: true,
      needsVerification: data?.requireEmailVerification ?? true,
      error: 'Please check your email to verify your account'
    };
  } catch (error) {
    console.error('[Auth] Sign up exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Email/Password Sign In
export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const { data, error } = await insforge.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[Auth] Sign in error:', error);
      return { success: false, error: error.message };
    }

    if (data?.user) {
      // Set auth token for database operations (RLS)
      if (data.accessToken) {
        console.log('[Auth] Setting auth token for database operations');
        insforge.getHttpClient().setAuthToken(data.accessToken);

        // Sync token to HTTP-only cookie for middleware auth
        try {
          await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'sync-token',
              accessToken: data.accessToken,
              refreshToken: data.refreshToken || '',
            }),
          });
        } catch {
          console.warn('[Auth] Failed to sync token to cookie');
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
    console.error('[Auth] Sign in exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Google OAuth Sign In - Use SDK's signInWithOAuth with InsforgeBrowserProvider
export async function signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof window === 'undefined') {
      return { success: false, error: 'OAuth can only be initiated in browser' };
    }

    // Store the final destination in sessionStorage (callback page will use this)
    // The actual redirect should go through /auth/callback to sync tokens to cookies
    const callbackUrl = `${window.location.origin}/auth/callback`;

    console.log('[Auth] Starting Google OAuth via SDK');
    console.log('[Auth] Callback URL:', callbackUrl);

    // Use SDK's signInWithOAuth - redirect to our callback page first
    const { data, error } = await insforge.auth.signInWithOAuth({
      provider: 'google',
      redirectTo: callbackUrl,
    });

    if (error) {
      console.error('[Auth] OAuth error:', error);
      return { success: false, error: error.message };
    }

    // Redirect to OAuth URL
    if (data?.url) {
      console.log('[Auth] Redirecting to OAuth URL');
      window.location.href = data.url;
    }

    return { success: true };
  } catch (error) {
    console.error('[Auth] Google sign in exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Sign Out
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await insforge.auth.signOut();

    // Clear HTTP-only cookies via API
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
      console.error('[Auth] Sign out error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[Auth] Sign out exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Get Current User
export async function getCurrentUser(): Promise<User | null> {
  try {
    // First check if we have a session
    const sessionResult = await insforge.auth.getCurrentSession();
    const sessionData = sessionResult?.data;
    if (!sessionData?.session) {
      return null;
    }

    // Set auth token for database operations (RLS) - important for page refresh
    if (sessionData.session.accessToken) {
      console.log('[Auth] Restoring auth token for database operations');
      insforge.getHttpClient().setAuthToken(sessionData.session.accessToken);
    }

    // Then get full user info from API
    const { data, error } = await insforge.auth.getCurrentUser();

    if (error || !data?.user) {
      // Fallback to session user data
      return {
        id: sessionData.session.user.id,
        email: sessionData.session.user.email || '',
        name: sessionData.session.user.profile?.name,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userWithProfile = data.user as any;
    return {
      id: data.user.id,
      email: data.user.email || '',
      name: userWithProfile.profile?.name,
      avatarUrl: userWithProfile.profile?.avatar_url,
    };
  } catch (error) {
    console.error('[Auth] Get user exception:', error);
    return null;
  }
}

// Get Current Session (async)
export async function getSession() {
  try {
    const { data, error } = await insforge.auth.getCurrentSession();

    if (error) {
      return null;
    }

    return data?.session || null;
  } catch (error) {
    console.error('[Auth] Get session exception:', error);
    return null;
  }
}
