'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // The SDK's detectAuthCallback() should automatically handle the OAuth callback
        // when the insforge client is initialized. We just need to wait a moment
        // and then refresh the user state.

        setStatus('Completing sign in...');

        // Give the SDK time to process the callback
        await new Promise(resolve => setTimeout(resolve, 500));

        // Refresh user state
        await refreshUser();

        // Redirect to market page
        setStatus('Redirecting...');
        router.push('/market');
      } catch (error) {
        console.error('[Auth Callback] Exception:', error);
        router.push('/login?error=callback_failed');
      }
    };

    handleCallback();
  }, [router, refreshUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 mx-auto border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">{status}</p>
      </div>
    </div>
  );
}
