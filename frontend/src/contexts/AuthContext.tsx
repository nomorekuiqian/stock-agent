'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  bridgeAuthSessionToCookies,
  clearStaleAuthStateWithoutRedirect,
  cleanupAuthCallbackUrlParams,
  syncClientAuthSession,
  User,
} from '@/lib/auth';
import { INSFORGE_AUTH_TOKEN_KEY } from '@/lib/auth-storage';
import { insforge, _capturedOAuthCode } from '@/lib/insforge';
import { buildAbsoluteVerifyEmailUrl } from '@/lib/auth-verification';

interface AuthActionResult {
  success: boolean;
  error?: string;
}

interface SignUpResult extends AuthActionResult {
  requiresEmailVerification?: boolean;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string, name?: string, redirectPath?: string) => Promise<SignUpResult>;
  signOut: () => Promise<AuthActionResult>;
  signInWithGoogle: () => Promise<AuthActionResult>;
  updateProfile: (profile: { name?: string }) => Promise<AuthActionResult>;
  resendVerificationEmail: (email: string) => Promise<AuthActionResult>;
  verifyEmail: (otp: string, email?: string) => Promise<AuthActionResult>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Our own key for PKCE verifier, separate from SDK's 'insforge_pkce_verifier'.
// This prevents the SDK's detectAuthCallback() from consuming the verifier
// before we can exchange the code through Server Proxy.
const APP_PKCE_VERIFIER_KEY = 'app_pkce_verifier';

function getSdkError(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  if (!('error' in result)) return undefined;
  const error = (result as { error?: unknown }).error;
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return undefined;
}

function needsEmailVerification(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  if ('requireEmailVerification' in result && (result as { requireEmailVerification?: boolean }).requireEmailVerification === true) {
    return true;
  }

  const signupResult = result as {
    accessToken?: string | null;
    user?: { email?: string | null } | null;
  };

  return Boolean(signupResult.user?.email && signupResult.accessToken === null);
}

function toAuthUser(user: {
  id: string;
  email?: string | null;
  profile?: { name?: string; avatar_url?: string } | null;
}): User {
  return {
    id: user.id,
    email: user.email || '',
    name: user.profile?.name,
    avatarUrl: user.profile?.avatar_url,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initAttempted = useRef(false);

  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    let cancelled = false;

    (async () => {
      try {
        // Check if we're returning from an OAuth callback.
        // _capturedOAuthCode was captured in insforge.ts BEFORE the SDK
        // constructor could clean it from the URL.
        const oauthCode = _capturedOAuthCode;
        const codeVerifier = oauthCode
          ? (() => { try { return sessionStorage.getItem(APP_PKCE_VERIFIER_KEY); } catch { return null; } })()
          : null;

        if (oauthCode && codeVerifier) {
          // Exchange through Server Proxy to get refresh token on our domain.
          try { sessionStorage.removeItem(APP_PKCE_VERIFIER_KEY); } catch { /* noop */ }

          const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'oauth-exchange',
              code: oauthCode,
              codeVerifier,
            }),
            credentials: 'include',
          });

          if (!cancelled) {
            if (response.ok) {
              const data = await response.json();
              if (data.accessToken && data.user) {
                syncClientAuthSession(data.accessToken, data.user);
                setUser(toAuthUser(data.user));
              }
            }
            setIsLoading(false);
            cleanupAuthCallbackUrlParams();
          }
          return;
        }

        // Normal flow: let SDK inspect existing local session.
        const { data: userData } = await insforge.auth.getCurrentUser();
        if (userData?.user) {
          const token = window.localStorage.getItem(INSFORGE_AUTH_TOKEN_KEY);
          if (token) {
            syncClientAuthSession(token, userData.user);
          }
          if (!cancelled) {
            setUser(toAuthUser(userData.user as {
              id: string;
              email?: string | null;
              profile?: { name?: string; avatar_url?: string } | null;
            }));
            setIsLoading(false);
          }
          cleanupAuthCallbackUrlParams();
          return;
        }

        // SDK found no session — try Server Proxy refresh via httpOnly cookies
        const response = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refresh' }),
          credentials: 'include',
        });

        if (response.ok && !cancelled) {
          const data = await response.json();

          if (data.accessToken && data.user) {
            syncClientAuthSession(data.accessToken, data.user);
            setUser(toAuthUser(data.user));
          }
        }
      } catch {
        // Recovery failed — user remains unauthenticated.
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          cleanupAuthCallbackUrlParams();
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleSignIn = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign-in', email, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { success: false, error: data.error || 'Login failed' };
      }

      const data = await response.json();

      if (!data.accessToken || !data.user) {
        return { success: false, error: 'Login response invalid' };
      }

      syncClientAuthSession(data.accessToken, data.user);

      setUser(toAuthUser(data.user));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, []);

  const handleSignUp = useCallback(async (email: string, password: string, name?: string, redirectPath?: string) => {
    try {
      const emailRedirectTo = typeof window === 'undefined'
        ? undefined
        : buildAbsoluteVerifyEmailUrl(window.location.origin, redirectPath);
      const { data: signUpData, error: signUpError } = await insforge.auth.signUp({
        email,
        password,
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      });
      if (signUpError) {
        const errorMsg = getSdkError({ error: signUpError }) || signUpError.message || 'Sign up failed';
        return { success: false, error: errorMsg };
      }

      if (needsEmailVerification(signUpData)) {
        return {
          success: true,
          requiresEmailVerification: true,
          email,
        };
      }

      // Email verification disabled — session returned directly
      if (signUpData?.accessToken && signUpData?.user) {
        syncClientAuthSession(signUpData.accessToken, signUpData.user);
        await bridgeAuthSessionToCookies({
          accessToken: signUpData.accessToken,
          csrfToken: 'csrfToken' in signUpData ? (signUpData as { csrfToken?: string | null }).csrfToken : undefined,
        });
        setUser(toAuthUser(signUpData.user as {
          id: string;
          email?: string | null;
          profile?: { name?: string; avatar_url?: string } | null;
        }));
      }

      if (name?.trim()) {
        try {
          await insforge.auth.setProfile({ name: name.trim() });
        } catch (profileError) {
          console.warn('[AuthContext] Set signup profile name failed:', profileError);
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await clearStaleAuthStateWithoutRedirect();
      setUser(null);
      queryClient.clear();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [queryClient]);

  const handleUpdateProfile = useCallback(async (profile: { name?: string }) => {
    try {
      const { error: profileError } = await insforge.auth.setProfile(profile);
      if (profileError) {
        return { success: false, error: profileError.message || 'Update failed' };
      }

      setUser((prev) => prev ? { ...prev, name: profile.name ?? prev.name } : prev);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, []);

  const handleResendVerificationEmail = useCallback(async (email: string) => {
    try {
      const { data, error: resendError } = await insforge.auth.resendVerificationEmail({ email });
      if (resendError) {
        return { success: false, error: resendError.message || 'Resend failed' };
      }
      if (!data) {
        return {
          success: false,
          error: '重新发送失败，请稍后重试',
        };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, []);

  const handleVerifyEmail = useCallback(async (otp: string, email?: string) => {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email
          ? { action: 'verify-email', otp, email }
          : { action: 'verify-email', otp }),
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { success: false, error: data.error || 'Verification failed' };
      }

      const verifyData = await response.json();
      if (verifyData?.accessToken && verifyData?.user) {
        syncClientAuthSession(verifyData.accessToken, verifyData.user);
        setUser(toAuthUser(verifyData.user));
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, []);

  const handleSignInWithGoogle = useCallback(async () => {
    try {
      if (typeof window === 'undefined') {
        return { success: false, error: 'OAuth can only be initiated in browser' };
      }

      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error: oauthError } = await insforge.auth.signInWithOAuth({
        provider: 'google',
        redirectTo,
        skipBrowserRedirect: true,
      });
      if (oauthError) {
        return { success: false, error: oauthError.message || 'Google login failed' };
      }

      // SDK stored PKCE verifier under 'insforge_pkce_verifier'.
      // Move it to our own key and remove SDK's copy so the SDK's
      // detectAuthCallback() won't consume it on the callback page.
      try {
        const verifier = sessionStorage.getItem('insforge_pkce_verifier');
        if (verifier) {
          sessionStorage.setItem(APP_PKCE_VERIFIER_KEY, verifier);
          sessionStorage.removeItem('insforge_pkce_verifier');
        }
      } catch {
        // sessionStorage might be unavailable
      }

      // Redirect to Google manually
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
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.accessToken && data.user) {
          syncClientAuthSession(data.accessToken, data.user);
          setUser(toAuthUser(data.user));
        }
      }
    } catch (error) {
      console.error('[AuthContext] Refresh user error:', error);
    }
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    signInWithGoogle: handleSignInWithGoogle,
    updateProfile: handleUpdateProfile,
    resendVerificationEmail: handleResendVerificationEmail,
    verifyEmail: handleVerifyEmail,
    refreshUser,
  }), [user, isLoading, handleSignIn, handleSignUp, handleSignOut, handleSignInWithGoogle, handleUpdateProfile, handleResendVerificationEmail, handleVerifyEmail, refreshUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
