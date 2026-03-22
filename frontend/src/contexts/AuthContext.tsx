'use client';

import { createContext, useContext, useEffect, useCallback, ReactNode, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getCurrentAuthSession,
  signIn as authSignIn,
  signOut as authSignOut,
  signUp as authSignUp,
  signInWithGoogle as authSignInWithGoogle,
  updateProfile as authUpdateProfile,
  resendVerificationEmail as authResendVerificationEmail,
  verifyEmail as authVerifyEmail,
} from '@/lib/auth';
import type { User } from '@/lib/auth';
import { api } from '@/lib/api';
import { authDebug, authDebugWarn, getBrowserAuthSnapshot } from '@/lib/auth-debug';

function getAutoSubscribedKey(userId: string): string {
  return `auto_subscribed_${userId}`;
}

function hasBeenAutoSubscribed(userId: string): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(getAutoSubscribedKey(userId)) === 'true';
}

function markAsAutoSubscribed(userId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(getAutoSubscribedKey(userId), 'true');
  }
}

const SYNC_KEY = 'sub_synced';
const SYNC_TTL = 60 * 60 * 1000;

function needsSync(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return true;
    const cached = JSON.parse(raw);
    if (cached.userId !== userId) return true;
    return Date.now() - cached.ts > SYNC_TTL;
  } catch {
    return true;
  }
}

function markSynced(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_KEY, JSON.stringify({ userId, ts: Date.now() }));
}

async function syncUserWithSubscriptions(user: User): Promise<void> {
  if (!needsSync(user.id)) return;

  try {
    const result = await api.subscriptions.syncUser(user.id, user.email, user.name);
    if (!hasBeenAutoSubscribed(user.id)) {
      try {
        const status = await api.subscriptions.getStatus('daily_report', user.email);
        if (!status.subscribed) {
          await api.subscriptions.subscribe('daily_report', {
            email: user.email,
            first_name: user.name,
            user_id: user.id,
          });
        }
        markAsAutoSubscribed(user.id);
      } catch (subError) {
        console.warn('[AuthContext] Auto-subscribe failed:', subError);
      }
    }

    if (result.success) {
      markSynced(user.id);
    }
  } catch (error) {
    console.warn('[AuthContext] Sync subscriptions failed:', error);
  }
}

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
  setAuthenticatedUser: (user: User | null) => void;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hydrateSession = useCallback(async (force: boolean = false) => {
    authDebug('AuthContext', 'hydrateSession() start', {
      force,
      ...getBrowserAuthSnapshot(),
    });
    const session = await getCurrentAuthSession(force);
    authDebug('AuthContext', 'hydrateSession() result', {
      authenticated: session.authenticated,
      userId: session.user?.id ?? null,
      email: session.user?.email ?? null,
    });
    setUser(session.user);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      authDebug('AuthContext', 'Initial auth hydration start', getBrowserAuthSnapshot());
      const session = await getCurrentAuthSession();
      if (cancelled) {
        authDebugWarn('AuthContext', 'Initial auth hydration resolved after cancellation');
        return;
      }
      authDebug('AuthContext', 'Initial auth hydration result', {
        authenticated: session.authenticated,
        userId: session.user?.id ?? null,
        email: session.user?.email ?? null,
      });
      setUser(session.user);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) {
      syncUserWithSubscriptions(user);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignIn = useCallback(async (email: string, password: string) => {
    authDebug('AuthContext', 'handleSignIn() called', { email });
    const result = await authSignIn(email, password);
    if (result.success && result.user) {
      authDebug('AuthContext', 'handleSignIn() success', {
        userId: result.user.id,
        email: result.user.email,
      });
      setUser(result.user);
    } else {
      authDebugWarn('AuthContext', 'handleSignIn() failed', {
        email,
        error: result.error ?? null,
      });
    }
    return { success: result.success, error: result.error };
  }, []);

  const handleSignUp = useCallback(async (
    email: string,
    password: string,
    name?: string,
    redirectPath?: string,
  ) => {
    const emailRedirectTo = typeof window === 'undefined'
      ? undefined
      : `${window.location.origin}/verify-email${redirectPath ? `?redirect=${encodeURIComponent(redirectPath)}` : ''}`;
    const result = await authSignUp(email, password, name, emailRedirectTo);

    if (result.success && result.user) {
      setUser(result.user);
    }

    return {
      success: result.success,
      error: result.error,
      requiresEmailVerification: result.requiresEmailVerification,
      email: result.email,
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    const result = await authSignOut();
    if (result.success) {
      setUser(null);
      queryClient.clear();
    }
    return result;
  }, [queryClient]);

  const handleUpdateProfile = useCallback(async (profile: { name?: string }) => {
    const result = await authUpdateProfile(profile);
    if (result.success && result.user) {
      setUser(result.user);
      api.subscriptions.syncUser(result.user.id, result.user.email, result.user.name).catch(() => {});
    }
    return { success: result.success, error: result.error };
  }, []);

  const handleResendVerificationEmail = useCallback(async (email: string) => {
    return authResendVerificationEmail(email);
  }, []);

  const handleVerifyEmail = useCallback(async (otp: string, email?: string) => {
    const result = await authVerifyEmail(otp, email);
    if (result.success && result.user) {
      setUser(result.user);
    }
    return { success: result.success, error: result.error };
  }, []);

  const handleSignInWithGoogle = useCallback(async () => {
    authDebug('AuthContext', 'handleSignInWithGoogle() called', getBrowserAuthSnapshot());
    return authSignInWithGoogle();
  }, []);

  const setAuthenticatedUser = useCallback((nextUser: User | null) => {
    authDebug('AuthContext', 'setAuthenticatedUser()', {
      userId: nextUser?.id ?? null,
      email: nextUser?.email ?? null,
      ...getBrowserAuthSnapshot(),
    });
    setUser(nextUser);
  }, []);

  const refreshUser = useCallback(async () => {
    await hydrateSession(true);
  }, [hydrateSession]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    setAuthenticatedUser,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    signInWithGoogle: handleSignInWithGoogle,
    updateProfile: handleUpdateProfile,
    resendVerificationEmail: handleResendVerificationEmail,
    verifyEmail: handleVerifyEmail,
    refreshUser,
  }), [
    user,
    isLoading,
    setAuthenticatedUser,
    handleSignIn,
    handleSignUp,
    handleSignOut,
    handleSignInWithGoogle,
    handleUpdateProfile,
    handleResendVerificationEmail,
    handleVerifyEmail,
    refreshUser,
  ]);

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
