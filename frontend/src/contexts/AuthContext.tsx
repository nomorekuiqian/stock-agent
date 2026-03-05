'use client';

import { createContext, useContext, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { useInsforge } from '@insforge/nextjs';
import {
  User,
  signIn as authSignIn,
  signUp as authSignUp,
  signInWithGoogle,
  updateProfile as authUpdateProfile,
} from '@/lib/auth';
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
const SYNC_TTL = 60 * 60 * 1000; // 1 hour

function needsSync(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return true;
    const cached = JSON.parse(raw);
    if (cached.userId !== userId) return true;
    return Date.now() - cached.ts > SYNC_TTL;
  } catch { return true; }
}

function markSynced(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_KEY, JSON.stringify({ userId, ts: Date.now() }));
}

async function syncUserWithSubscriptions(user: User): Promise<void> {
  if (!needsSync(user.id)) return;

  try {
    const result = await api.subscriptions.syncUser(user.id, user.email, user.name);
    if (result.success && result.synced_channels.length > 0) {
      console.log('[AuthContext] Synced subscriptions:', result.synced_channels.map(c => c.channel));
    }

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

    markSynced(user.id);
  } catch (error) {
    console.warn('[AuthContext] Sync subscriptions failed:', error);
  }
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  updateProfile: (profile: { name?: string }) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const sdk = useInsforge();

  // Map SDK user (InsforgeUser) to our User type
  const user: User | null = useMemo(() => {
    if (!sdk.user) return null;
    return {
      id: sdk.user.id,
      email: sdk.user.email || '',
      name: sdk.user.profile?.name,
      avatarUrl: sdk.user.profile?.avatar_url,
    };
  }, [sdk.user]);

  const isLoading = !sdk.isLoaded;

  // Subscription sync
  useEffect(() => {
    if (user) {
      syncUserWithSubscriptions(user);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // signIn - now uses pure SDK (signInWithPassword) via auth.ts
  // SDK's InsforgeBrowserProvider will auto-update sdk.user via onSignIn callback
  const handleSignIn = useCallback(async (email: string, password: string) => {
    const result = await authSignIn(email, password);
    if (result.success) {
      // SDK should auto-detect the login via its onSignIn/saveSessionFromResponse
      // But if it doesn't update sdk.user, we use reloadAuth as fallback
      if (!sdk.user) {
        await sdk.reloadAuth();
      }
    }
    return { success: result.success, error: result.error };
  }, [sdk]);

  const handleSignUp = useCallback(async (email: string, password: string, name?: string) => {
    const result = await authSignUp(email, password, name);
    if (result.success) {
      await sdk.reloadAuth();
    }
    return { success: result.success, error: result.error };
  }, [sdk]);

  const handleSignOut = useCallback(async () => {
    try {
      await sdk.signOut();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [sdk]);

  const handleUpdateProfile = useCallback(async (profile: { name?: string }) => {
    const result = await authUpdateProfile(profile);
    if (result.success && result.user && user) {
      api.subscriptions.syncUser(user.id, user.email, result.user.name).catch(() => {});
      await sdk.reloadAuth();
    }
    return { success: result.success, error: result.error };
  }, [user, sdk]);

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
    refreshUser,
  }), [user, isLoading, handleSignIn, handleSignUp, handleSignOut, handleSignInWithGoogle, handleUpdateProfile, refreshUser]);

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
