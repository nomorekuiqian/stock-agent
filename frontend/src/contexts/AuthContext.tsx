'use client';

import { createContext, useContext, useCallback, ReactNode, useMemo } from 'react';
import { useInsforge } from '@insforge/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import { User } from '@/lib/auth';
import { buildAbsoluteVerifyEmailUrl } from '@/lib/auth-verification';
import { getStoredAuthRedirect } from '@/lib/auth-redirect';

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
  if ('requireEmailVerification' in result && (result as { requireEmailVerification?: boolean }).requireEmailVerification === true) {
    return true;
  }

  const signupResult = result as {
    accessToken?: string | null;
    user?: { email?: string | null } | null;
  };

  return Boolean(signupResult.user?.email && signupResult.accessToken === null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const sdk = useInsforge();
  const queryClient = useQueryClient();

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

  const handleSignIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await sdk.signIn(email, password);
      const error = getSdkError(result);
      if (error) {
        return { success: false, error };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [sdk]);

  const handleSignUp = useCallback(async (email: string, password: string, name?: string, redirectPath?: string) => {
    try {
      const emailRedirectTo = typeof window === 'undefined'
        ? undefined
        : buildAbsoluteVerifyEmailUrl(window.location.origin, redirectPath);
      const result = await sdk.signUp(email, password, emailRedirectTo ? { emailRedirectTo } : undefined);
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
    const updateResult = await sdk.updateUser(profile);
    if (updateResult?.error) {
      return { success: false, error: updateResult.error };
    }
    return { success: true };
  }, [sdk]);

  const handleResendVerificationEmail = useCallback(async (email: string) => {
    try {
      const result = await sdk.resendVerificationEmail(email);
      const error = getSdkError(result);
      if (error) {
        return { success: false, error };
      }
      if (!result) {
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
  }, [sdk]);

  const handleVerifyEmail = useCallback(async (otp: string, email?: string) => {
    try {
      const result = await sdk.verifyEmail(otp, email);
      const error = getSdkError(result);
      if (error) {
        return { success: false, error };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [sdk]);

  const handleSignInWithGoogle = useCallback(async () => {
    try {
      if (typeof window === 'undefined') {
        return { success: false, error: 'OAuth can only be initiated in browser' };
      }

      const finalDestination = getStoredAuthRedirect();
      const redirectTo = `${window.location.origin}${finalDestination}`;
      await sdk.loginWithOAuth('google', redirectTo);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [sdk]);

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
