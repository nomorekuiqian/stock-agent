'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { insforge } from '@/lib/insforge';

function Spinner() {
  return (
    <div className="w-10 h-10 mx-auto border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser, isAuthenticated } = useAuth();
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    async function handleCallback() {
      if (isAuthenticated) {
        const redirectUrl = sessionStorage.getItem('auth_redirect') || '/today';
        sessionStorage.removeItem('auth_redirect');
        router.push(redirectUrl);
        return;
      }

      const error = searchParams.get('error');
      if (error) {
        router.push('/login?error=' + encodeURIComponent(error));
        return;
      }

      setStatus('Completing sign in...');

      const maxAttempts = 40;
      const pollInterval = 50;

      for (let i = 0; i < maxAttempts; i++) {
        const { data: sessionData } = await insforge.auth.getCurrentSession();

        if (sessionData?.session?.accessToken) {
          await refreshUser();
          const redirectUrl = sessionStorage.getItem('auth_redirect') || '/today';
          sessionStorage.removeItem('auth_redirect');
          setStatus('Redirecting...');
          router.push(redirectUrl);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      router.push('/login?error=auth_timeout');
    }

    handleCallback();
  }, [router, refreshUser, searchParams, isAuthenticated]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <Spinner />
        <p className="text-gray-500 text-sm">{status}</p>
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
