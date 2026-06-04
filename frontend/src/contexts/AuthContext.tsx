'use client';

import { createContext, useContext, useEffect, useCallback, ReactNode, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  signInAction,
  signOutAction,
  signUpAction,
  startOAuthAction,
  updateProfileAction,
  resendVerificationEmailAction,
  verifyEmailAction,
} from '@/app/actions/auth';
import type { User } from '@/app/actions/auth';
import { api } from '@/lib/api';
import { getPendingVerification } from '@/lib/auth-verification';

export type { User } from '@/app/actions/auth';

// --- Module-level access token cache ---

let _cachedAccessToken: string | null = null;

export function getAccessTokenSync(): string | null {
  return _cachedAccessToken;
}

export async function getAccessTokenAsync(): Promise<string | null> {
  if (_cachedAccessToken) return _cachedAccessToken;
  const session = await fetchSession();
  _cachedAccessToken = session.accessToken;
  return _cachedAccessToken;
}

/** Refresh the session and return the new access token, or null if refresh failed. */
export async function refreshSession(): Promise<string | null> {
  const session = await fetchSession();
  if (session.accessToken) {
    _cachedAccessToken = session.accessToken;
  }
  return session.accessToken;
}

// --- Session fetch ---

type SessionResult = { user: User | null; accessToken: string | null };

// Dedup concurrent /api/auth/session calls. When a tab regains focus or several
// queries 401 at the same time, every caller funnels into the same Promise so
// the server only hits InsForge once and the rotated refresh token isn't lost
// to a race.
let _inflightFetch: Promise<SessionResult> | null = null;

async function fetchSession(): Promise<SessionResult> {
  if (_inflightFetch) return _inflightFetch;
  const promise = (async (): Promise<SessionResult> => {
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) return { user: null, accessToken: null };
      return await res.json();
    } catch {
      return { user: null, accessToken: null };
    }
  })();
  _inflightFetch = promise;
  void promise.finally(() => {
    if (_inflightFetch === promise) _inflightFetch = null;
  });
  return promise;
}

// --- Subscription sync (unchanged from previous AuthContext) ---

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

  // Use pending verification name as fallback (covers the race condition
  // where verifyEmail sets user before applyPendingProfile updates the name)
  const effectiveName = user.name || getPendingVerification()?.name || undefined;

  try {
    const result = await api.subscriptions.syncUser(user.id, user.email, effectiveName);
    if (!hasBeenAutoSubscribed(user.id)) {
      try {
        const status = await api.subscriptions.getStatus('daily_report', user.email);
        if (!status.subscribed) {
          await api.subscriptions.subscribe('daily_report', {
            email: user.email,
            first_name: effectiveName,
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

// --- Context types ---

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

  // Hydrate session once on mount. Beyond this we rely on:
  //   - fetchProtected() retrying once via refreshSession() when a business
  //     request hits 401
  //   - the server-side dedup in /api/auth/session collapsing concurrent
  //     refreshes onto a single InsForge call
  // We deliberately do NOT poll on a timer or refresh on visibilitychange:
  // both used to fan-out concurrent refreshes that tripped InsForge's
  // refresh-token rotation replay protection and killed the session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await fetchSession();
      if (cancelled) return;
      _cachedAccessToken = session.accessToken;
      setUser(session.user);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Subscription sync on user change
  useEffect(() => {
    if (user) {
      syncUserWithSubscriptions(user);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignIn = useCallback(async (email: string, password: string) => {
    const result = await signInAction(email, password);
    if (result.success && result.user) {
      // Use token directly from server action to avoid cookie-propagation race
      _cachedAccessToken = result.accessToken ?? null;
      setUser(result.user);
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
    const result = await signUpAction(email, password, name, emailRedirectTo);

    if (result.success && result.user) {
      _cachedAccessToken = result.accessToken ?? null;
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
    const result = await signOutAction();
    if (result.success) {
      _cachedAccessToken = null;
      setUser(null);
      queryClient.clear();
    }
    return result;
  }, [queryClient]);

  const handleSignInWithGoogle = useCallback(async () => {
    const redirect = typeof window !== 'undefined'
      ? sessionStorage.getItem('auth_redirect') || '/today'
      : '/today';
    const callbackUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`
      : '/auth/callback';

    const result = await startOAuthAction('google', callbackUrl);
    if (result.success && result.url) {
      window.location.href = result.url;
      return { success: true };
    }
    return { success: false, error: result.error };
  }, []);

  const handleUpdateProfile = useCallback(async (profile: { name?: string }) => {
    const result = await updateProfileAction(profile);
    if (result.success && result.user) {
      setUser(result.user);
      api.subscriptions.syncUser(result.user.id, result.user.email, result.user.name).catch(() => {});
    }
    return { success: result.success, error: result.error };
  }, []);

  const handleResendVerificationEmail = useCallback(async (email: string) => {
    return resendVerificationEmailAction(email);
  }, []);

  const handleVerifyEmail = useCallback(async (otp: string, email?: string) => {
    const result = await verifyEmailAction(otp, email);
    if (result.success && result.user) {
      _cachedAccessToken = result.accessToken ?? null;
      setUser(result.user);
    }
    return { success: result.success, error: result.error };
  }, []);

  const setAuthenticatedUser = useCallback((nextUser: User | null) => {
    setUser(nextUser);
  }, []);

  const refreshUser = useCallback(async () => {
    const session = await fetchSession();
    _cachedAccessToken = session.accessToken;
    setUser(session.user);
  }, []);

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
