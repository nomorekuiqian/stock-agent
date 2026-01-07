'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, getCurrentUser, signIn, signUp, signOut, signInWithGoogle } from '@/lib/auth';
import { api } from '@/lib/api';

/**
 * Check if user has been auto-subscribed before (using localStorage)
 */
const getAutoSubscribedKey = (userId: string) => `auto_subscribed_${userId}`;

const hasBeenAutoSubscribed = (userId: string): boolean => {
  if (typeof window === 'undefined') return true; // SSR safety
  return localStorage.getItem(getAutoSubscribedKey(userId)) === 'true';
};

const markAsAutoSubscribed = (userId: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(getAutoSubscribedKey(userId), 'true');
  }
};

/**
 * Sync user with Resend subscriptions in the background.
 * This links the website account with any existing email subscriptions.
 * Also auto-subscribes new users to the daily report.
 */
const syncUserWithSubscriptions = async (user: User) => {
  try {
    // First sync existing subscriptions
    const result = await api.subscriptions.syncUser(user.id, user.email, user.name);
    if (result.success && result.synced_channels.length > 0) {
      console.log('[AuthContext] Synced user with subscriptions:', result.synced_channels.map(c => c.channel));
    }

    // Auto-subscribe new users to daily_report (only once per user)
    if (!hasBeenAutoSubscribed(user.id)) {
      try {
        // Check if already subscribed
        const status = await api.subscriptions.getStatus('daily_report', user.email);
        if (!status.subscribed) {
          await api.subscriptions.subscribe('daily_report', {
            email: user.email,
            first_name: user.name,
            user_id: user.id,
          });
          console.log('[AuthContext] Auto-subscribed new user to daily_report');
        }
        // Mark as auto-subscribed (whether we subscribed or they were already subscribed)
        markAsAutoSubscribed(user.id);
      } catch (subError) {
        console.warn('[AuthContext] Failed to auto-subscribe to daily_report:', subError);
      }
    }
  } catch (error) {
    // Silent fail - sync is not critical for login
    console.warn('[AuthContext] Failed to sync subscriptions:', error);
  }
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string; needsVerification?: boolean }>;
  signOut: () => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      // Sync with subscriptions (handles auto-subscribe for new users)
      if (currentUser) {
        syncUserWithSubscriptions(currentUser);
      }
    } catch (error) {
      console.error('[AuthContext] Refresh user error:', error);
      setUser(null);
    }
  };

  useEffect(() => {
    // Check initial auth state
    const initAuth = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);

        // Sync existing session with Resend subscriptions (background)
        if (currentUser) {
          syncUserWithSubscriptions(currentUser);
        }
      } catch (error) {
        console.error('[AuthContext] Init error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    const result = await signIn(email, password);
    if (result.success && result.user) {
      setUser(result.user);
      // Sync with Resend subscriptions (background, don't block login)
      syncUserWithSubscriptions(result.user);
    }
    return { success: result.success, error: result.error };
  };

  const handleSignUp = async (email: string, password: string, name?: string) => {
    const result = await signUp(email, password, name);
    if (result.success && result.user && !result.needsVerification) {
      setUser(result.user);
      // Sync with Resend subscriptions (background)
      syncUserWithSubscriptions(result.user);
    }
    return { success: result.success, error: result.error, needsVerification: result.needsVerification };
  };

  const handleSignOut = async () => {
    const result = await signOut();
    if (result.success) {
      setUser(null);
    }
    return result;
  };

  const handleSignInWithGoogle = async () => {
    return signInWithGoogle();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn: handleSignIn,
        signUp: handleSignUp,
        signOut: handleSignOut,
        signInWithGoogle: handleSignInWithGoogle,
        refreshUser,
      }}
    >
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
