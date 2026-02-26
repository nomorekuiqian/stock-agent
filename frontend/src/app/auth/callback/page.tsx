'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function Spinner() {
  return (
    <div className="w-10 h-10 mx-auto border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    const error = searchParams.get('error');
    if (error) {
      router.push('/login?error=' + encodeURIComponent(error));
      return;
    }

    if (isAuthenticated) {
      const redirectUrl = sessionStorage.getItem('auth_redirect') || '/today';
      sessionStorage.removeItem('auth_redirect');
      router.push(redirectUrl);
    } else {
      router.push('/login?error=auth_failed');
    }
  }, [isAuthenticated, isLoading, router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <Spinner />
        <p className="text-gray-500 text-sm">
          {isLoading ? 'Processing...' : 'Redirecting...'}
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
