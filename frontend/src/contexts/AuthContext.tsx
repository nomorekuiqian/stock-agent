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
import { readAcquisitionPayload } from '@/lib/acquisition';
import { getPendingVerification } from '@/lib/auth-verification';

export type { User } from '@/app/actions/auth';

// --- Module-level access token cache ---

let _cachedAccessToken: string | null = null;
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

function isJwtExpiringSoon(token: string): boolean {
  const [, payload] = token.split('.');
  if (!payload) return false;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = globalThis.atob?.(padded);
    if (!decoded) return false;

    const parsed = JSON.parse(decoded) as { exp?: unknown };
    if (typeof parsed.exp !== 'number') return false;

    return parsed.exp * 1000 <= Date.now() + ACCESS_TOKEN_REFRESH_SKEW_MS;
  } catch {
    return false;
  }
}

export function getAccessTokenSync(): string | null {
  if (_cachedAccessToken && isJwtExpiringSoon(_cachedAccessToken)) {
    return null;
  }
  return _cachedAccessToken;
}

export async function getAccessTokenAsync(): Promise<string | null> {
  if (_cachedAccessToken && !isJwtExpiringSoon(_cachedAccessToken)) {
    return _cachedAccessToken;
  }
  const session = await fetchSession();
  _cachedAccessToken = session.accessToken;
  return _cachedAccessToken;
}

/** Refresh the session and return the new access token, or null if refresh failed. */
export async function refreshSession(): Promise<string | null> {
  const session = await fetchSession();
  _cachedAccessToken = session.accessToken;
  return session.accessToken;
}

// --- Session fetch ---

type SessionResult = { user: User | null; accessToken: string | null };

// Single-flight de-dup: many callers can ask for the session at once — the
// 12-min refresh interval, the visibilitychange handler, getAccessTokenAsync /
// refreshSession, plus subscription/entitlement contexts. Without de-dup an
// expired 15-min access cookie triggers several concurrent /api/auth/session
// calls, each rotating the refresh token; the first to land invalidates the
// token the others presented, so the losers fail and clear cookies — logging a
// genuinely-logged-in user out. Sharing one in-flight round-trip removes the
// rotation thundering herd entirely.
let _sessionInFlight: Promise<SessionResult> | null = null;

async function fetchSession(): Promise<SessionResult> {
  if (_sessionInFlight) return _sessionInFlight;
  const inFlight = (async (): Promise<SessionResult> => {
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) return { user: null, accessToken: null };
      return await res.json();
    } catch {
      return { user: null, accessToken: null };
    }
  })();
  _sessionInFlight = inFlight;
  try {
    return await inFlight;
  } finally {
    _sessionInFlight = null;
  }
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
    const result = await api.subscriptions.syncUser(user.id, user.email, effectiveName, readAcquisitionPayload());
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

  // Hydrate session on mount + periodic refresh + visibility change
  useEffect(() => {
    let cancelled = false;

    const refresh = async (isInitial = false) => {
      const session = await fetchSession();
      if (cancelled) return;
      // On background refresh, only update state if we got a valid session.
      // A transient network error returns { user: null, accessToken: null }
      // and we must not log the user out because of it.
      if (!isInitial && !session.user && _cachedAccessToken) {
        return;
      }
      _cachedAccessToken = session.accessToken;
      setUser(session.user);
      return session;
    };

    // Initial hydration (always applies the result, even if null)
    void (async () => {
      await refresh(true);
      if (!cancelled) setIsLoading(false);
    })();

    // Refresh token every 12 minutes (access token TTL is 15 min)
    const interval = setInterval(() => { void refresh(); }, 12 * 60 * 1000);

    // Refresh when user returns to the tab
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
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
      api.subscriptions.syncUser(result.user.id, result.user.email, result.user.name, readAcquisitionPayload()).catch(() => {});
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
