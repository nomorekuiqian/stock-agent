'use client';

import { createContext, useContext, useEffect, useCallback, ReactNode, useMemo, useState, useRef } from 'react';
import { useInsforge } from '@insforge/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import {
  User,
  signIn as authSignIn,
  signInWithGoogle,
  updateProfile as authUpdateProfile,
  isTokenExpired,
  setCachedToken,
} from '@/lib/auth';
import { clearClientAuthStorage } from '@/lib/auth-storage';
import { insforge } from '@/lib/insforge';
import { buildAbsoluteVerifyEmailUrl } from '@/lib/auth-verification';
import { api } from '@/lib/api';

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
  const payload = 'data' in result
    ? (result as { data?: unknown }).data
    : result;

  if (!payload || typeof payload !== 'object') return false;
  if ('requireEmailVerification' in payload && (payload as { requireEmailVerification?: boolean }).requireEmailVerification === true) {
    return true;
  }

  const signupResult = payload as {
    accessToken?: string | null;
    user?: { email?: string | null } | null;
  };

  return Boolean(signupResult.user?.email && signupResult.accessToken === null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const sdk = useInsforge();
  const queryClient = useQueryClient();
  const [recoveryPending, setRecoveryPending] = useState(true);
  const recoveryAttempted = useRef(false);

  const user: User | null = useMemo(() => {
    if (!sdk.user) return null;
    return {
      id: sdk.user.id,
      email: sdk.user.email || '',
      name: sdk.user.profile?.name,
      avatarUrl: sdk.user.profile?.avatar_url,
    };
  }, [sdk.user]);

  useEffect(() => {
    if (!sdk.isLoaded) return;
    if (sdk.user) return;
    if (recoveryAttempted.current) return;
    recoveryAttempted.current = true;

    fetch('/api/auth/session')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.authenticated && data.accessToken && data.user && !isTokenExpired(data.accessToken)) {
          insforge.getHttpClient().setAuthToken(data.accessToken);
          setCachedToken(data.accessToken);
          sdk.setUser({
            id: data.user.id,
            email: data.user.email,
            profile: data.user.profile ?? null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setRecoveryPending(false));
  }, [sdk.isLoaded, sdk.user, sdk]);

  const isLoading = !sdk.isLoaded || (recoveryPending && !sdk.user);

  useEffect(() => {
    if (user) {
      syncUserWithSubscriptions(user);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignIn = useCallback(async (email: string, password: string) => {
    const result = await authSignIn(email, password);
    if (result.success && result.user) {
      sdk.setUser({
        id: result.user.id,
        email: result.user.email,
        profile: {
          name: result.user.name,
          avatar_url: result.user.avatarUrl,
        },
      });
    }
    return { success: result.success, error: result.error };
  }, [sdk]);

  const handleSignUp = useCallback(async (
    email: string,
    password: string,
    name?: string,
    redirectPath?: string,
  ) => {
    try {
      const emailRedirectTo = typeof window === 'undefined'
        ? undefined
        : buildAbsoluteVerifyEmailUrl(window.location.origin, redirectPath);
      const result = await sdk.signUp(
        email,
        password,
        emailRedirectTo ? { emailRedirectTo } : undefined,
      );
      const error = getSdkError(result);
      if (error) {
        return { success: false, error };
      }

      if (needsEmailVerification(result)) {
        return {
          success: true,
          requiresEmailVerification: true,
          email,
        };
      }

      if (name?.trim()) {
        const updateResult = await sdk.updateUser({ name: name.trim() });
        if (updateResult?.error) {
          console.warn('[AuthContext] Set signup profile name failed:', updateResult.error);
        }
      }

      await sdk.reloadAuth();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [sdk]);

  const handleSignOut = useCallback(async () => {
    try {
      await sdk.signOut();
      setCachedToken(null);
      clearClientAuthStorage();
      try {
        insforge.getHttpClient().setAuthToken('');
      } catch {
        // Best-effort cleanup only.
      }
      try {
        await fetch('/api/auth', { method: 'DELETE', credentials: 'include' });
      } catch {
        // Best-effort server cookie cleanup.
      }
      queryClient.clear();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [sdk, queryClient]);

  const handleUpdateProfile = useCallback(async (profile: { name?: string }) => {
    const result = await authUpdateProfile(profile);
    if (result.success && result.user && user) {
      api.subscriptions.syncUser(user.id, user.email, result.user.name).catch(() => {});
      await sdk.reloadAuth();
    }
    return { success: result.success, error: result.error };
  }, [user, sdk]);

  const handleResendVerificationEmail = useCallback(async (email: string) => {
    try {
      const result = await sdk.resendVerificationEmail(email);
      const error = getSdkError(result);
      if (error) {
        return { success: false, error };
      }
      if (!result) {
        return { success: false, error: '重新发送失败，请稍后重试' };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [sdk]);

  const handleVerifyEmail = useCallback(async (otp: string, email?: string) => {
    try {
      const result = await sdk.verifyEmail(otp, email);
      const error = getSdkError(result);
      if (error) {
        return { success: false, error };
      }
      await sdk.reloadAuth();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [sdk]);

  const handleSignInWithGoogle = useCallback(async () => {
    return signInWithGoogle();
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      await sdk.reloadAuth();
    } catch (error) {
      console.error('[AuthContext] Refresh user error:', error);
    }
  }, [sdk]);

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
  }), [
    user,
    isLoading,
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
