'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, getCurrentUser, signIn, signUp, signOut, signInWithGoogle } from '@/lib/auth';
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

async function syncUserWithSubscriptions(user: User): Promise<void> {
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
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refreshUser(): Promise<void> {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      if (currentUser) {
        syncUserWithSubscriptions(currentUser);
      }
    } catch (error) {
      console.error('[AuthContext] Refresh user error:', error);
      setUser(null);
    }
  }

  useEffect(() => {
    async function initAuth() {
      try {
        const hasOAuthCode = typeof window !== 'undefined' &&
          window.location.search.includes('insforge_code');

        if (hasOAuthCode) {
          const maxAttempts = 40;
          const pollInterval = 50;

          for (let i = 0; i < maxAttempts; i++) {
            const currentUser = await getCurrentUser();
            if (currentUser) {
              setUser(currentUser);
              syncUserWithSubscriptions(currentUser);

              if (typeof window !== 'undefined' && window.history.replaceState) {
                const url = new URL(window.location.href);
                url.searchParams.delete('insforge_code');
                window.history.replaceState({}, '', url.toString());
              }

              setIsLoading(false);
              return;
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }

          console.warn('[AuthContext] OAuth code present but no session after polling');
          setIsLoading(false);
          return;
        }

        const currentUser = await getCurrentUser();
        setUser(currentUser);
        if (currentUser) {
          syncUserWithSubscriptions(currentUser);
        }
      } catch (error) {
        console.error('[AuthContext] Init error:', error);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  async function handleSignIn(email: string, password: string) {
    const result = await signIn(email, password);
    if (result.success && result.user) {
      setUser(result.user);
      syncUserWithSubscriptions(result.user);
    }
    return { success: result.success, error: result.error };
  }

  async function handleSignUp(email: string, password: string, name?: string) {
    const result = await signUp(email, password, name);
    if (result.success && result.user) {
      setUser(result.user);
      syncUserWithSubscriptions(result.user);
    }
    return { success: result.success, error: result.error };
  }

  async function handleSignOut() {
    const result = await signOut();
    if (result.success) {
      setUser(null);
    }
    return result;
  }

  async function handleSignInWithGoogle() {
    return signInWithGoogle();
  }

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
