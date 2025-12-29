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
          name: data.user.name,
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
      }

      return {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email || email,
          name: data.user.name,
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

// Google OAuth Sign In - Fetch auth URL from Insforge then redirect
export async function signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof window === 'undefined') {
      return { success: false, error: 'OAuth can only be initiated in browser' };
    }

    const redirectUrl = `${window.location.origin}/auth/callback`;
    const insforgeBaseUrl = 'https://9wmhxyi4.us-east.insforge.app';

    // Fetch the OAuth URL from Insforge endpoint
    const oauthEndpoint = `${insforgeBaseUrl}/api/auth/oauth/google?redirect_uri=${encodeURIComponent(redirectUrl)}`;

    console.log('[Auth] Fetching Google OAuth URL from:', oauthEndpoint);

    const response = await fetch(oauthEndpoint);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Auth] OAuth endpoint error:', errorText);
      return { success: false, error: 'Failed to initiate Google sign in' };
    }

    const data = await response.json();

    if (!data.authUrl) {
      console.error('[Auth] No authUrl in response:', data);
      return { success: false, error: 'Invalid OAuth response' };
    }

    console.log('[Auth] Redirecting to Google OAuth:', data.authUrl);
    window.location.href = data.authUrl;

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
    const { data: sessionData } = insforge.auth.getCurrentSession();
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
        name: sessionData.session.user.name,
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

// Get Current Session (sync, from local storage)
export function getSession() {
  try {
    const { data, error } = insforge.auth.getCurrentSession();

    if (error) {
      return null;
    }

    return data.session;
  } catch (error) {
    console.error('[Auth] Get session exception:', error);
    return null;
  }
}
