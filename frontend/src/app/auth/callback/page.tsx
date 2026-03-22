'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { completeOAuthSignIn } from '@/lib/auth';
import { DEFAULT_AUTH_REDIRECT, getStoredAuthRedirect } from '@/lib/auth-redirect';
import { authDebug, authDebugWarn, getBrowserAuthSnapshot } from '@/lib/auth-debug';

function Spinner() {
  return (
    <div className="w-10 h-10 mx-auto border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuthenticatedUser } = useAuth();

  useEffect(() => {
    const error = searchParams.get('error');
    authDebug('auth/callback', 'Callback page mounted', {
      error,
      insforgeCodePresent: !!searchParams.get('insforge_code'),
      ...getBrowserAuthSnapshot(),
    });
    if (error) {
      authDebugWarn('auth/callback', 'Callback page received error query param', { error });
      router.push('/login?error=' + encodeURIComponent(error));
      return;
    }

    void (async () => {
      const result = await completeOAuthSignIn();
      authDebug('auth/callback', 'completeOAuthSignIn() result', {
        success: result.success,
        userId: result.user?.id ?? null,
        email: result.user?.email ?? null,
        error: result.error ?? null,
      });
      if (!result.success || !result.user) {
        router.push('/login?error=' + encodeURIComponent(result.error || 'auth_failed'));
        return;
      }

      setAuthenticatedUser(result.user);
      const redirectUrl = getStoredAuthRedirect(DEFAULT_AUTH_REDIRECT);
      authDebug('auth/callback', 'Redirecting after successful callback', {
        redirectUrl,
        ...getBrowserAuthSnapshot(),
      });
      sessionStorage.removeItem('auth_redirect');
      router.push(redirectUrl);
    })();
  }, [router, searchParams, setAuthenticatedUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <Spinner />
        <p className="text-gray-500 text-sm">
          Processing...
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner />
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
