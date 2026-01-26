'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { insforge } from '@/lib/insforge';

const isDev = process.env.NODE_ENV === 'development';

// Parse hash fragments from URL
function parseHashParams(hash: string): Record<string, string> {
  if (!hash || hash.length <= 1) return {};
  const params: Record<string, string> = {};
  const hashContent = hash.startsWith('#') ? hash.substring(1) : hash;
  const pairs = hashContent.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return params;
}

// Sync token to HTTP-only cookie via API route
async function syncTokenToCookie(accessToken: string, refreshToken?: string): Promise<boolean> {
  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync-token',
        accessToken,
        refreshToken: refreshToken || '',
      }),
    });
    if (isDev) console.log('[Auth Callback] Sync token response:', response.status);
    return response.ok;
  } catch (error) {
    if (isDev) console.error('[Auth Callback] Failed to sync token to cookie:', error);
    return false;
  }
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        setStatus('Completing sign in...');

        // Log full URL for debugging (dev only)
        if (isDev) {
          console.log('[Auth Callback] Full URL:', window.location.href);
          console.log('[Auth Callback] Hash:', window.location.hash);
          console.log('[Auth Callback] Search:', window.location.search);
        }

        // Check for error in query params or hash
        const error = searchParams.get('error');
        if (error) {
          if (isDev) console.error('[Auth Callback] OAuth error:', error);
          router.push('/login?error=' + encodeURIComponent(error));
          return;
        }

        // Method 1: Check hash fragments for tokens (fragment response mode)
        const hashParams = parseHashParams(window.location.hash);
        if (isDev) console.log('[Auth Callback] Hash params keys:', Object.keys(hashParams));

        if (hashParams.access_token) {
          if (isDev) console.log('[Auth Callback] Found access_token in hash fragment');

          // Store the session
          const session = {
            accessToken: hashParams.access_token,
            refreshToken: hashParams.refresh_token || '',
            expiresAt: hashParams.expires_at
              ? Date.now() + parseInt(hashParams.expires_at) * 1000
              : Date.now() + 3600000,
          };

          localStorage.setItem('insforge_session', JSON.stringify(session));
          insforge.getHttpClient().setAuthToken(hashParams.access_token);

          // Sync token to HTTP-only cookie for middleware auth
          await syncTokenToCookie(hashParams.access_token, hashParams.refresh_token);

          // Refresh user state
          await refreshUser();

          // Get redirect URL
          const redirectUrl = sessionStorage.getItem('auth_redirect') || '/market';
          sessionStorage.removeItem('auth_redirect');
          sessionStorage.removeItem('oauth_code_verifier');

          setStatus('Redirecting...');
          router.push(redirectUrl);
          return;
        }

        // Method 2: Check query params for tokens
        const accessToken = searchParams.get('access_token');
        if (accessToken) {
          if (isDev) console.log('[Auth Callback] Found access_token in query params');

          const refreshToken = searchParams.get('refresh_token') || '';
          const session = {
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date.now() + 3600000,
          };

          localStorage.setItem('insforge_session', JSON.stringify(session));
          insforge.getHttpClient().setAuthToken(accessToken);

          // Sync token to HTTP-only cookie for middleware auth
          await syncTokenToCookie(accessToken, refreshToken);

          await refreshUser();

          const redirectUrl = sessionStorage.getItem('auth_redirect') || '/market';
          sessionStorage.removeItem('auth_redirect');
          sessionStorage.removeItem('oauth_code_verifier');

          setStatus('Redirecting...');
          router.push(redirectUrl);
          return;
        }

        // Method 3: Poll for SDK session (more robust than fixed delay)
        const maxAttempts = 10;
        const pollInterval = 100;
        for (let i = 0; i < maxAttempts; i++) {
          const { data: sessionData } = await insforge.auth.getCurrentSession();
          if (sessionData?.session?.accessToken) {
            if (isDev) console.log('[Auth Callback] SDK session found after', i * pollInterval, 'ms');
            insforge.getHttpClient().setAuthToken(sessionData.session.accessToken);

            // Sync token to HTTP-only cookie for middleware auth
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sessionAny = sessionData.session as any;
            await syncTokenToCookie(
              sessionData.session.accessToken,
              sessionAny.refreshToken || ''
            );

            await refreshUser();

            const redirectUrl = sessionStorage.getItem('auth_redirect') || '/market';
            sessionStorage.removeItem('auth_redirect');
            sessionStorage.removeItem('oauth_code_verifier');

            setStatus('Redirecting...');
            router.push(redirectUrl);
            return;
          }
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        // No valid authentication found
        if (isDev) {
          console.error('[Auth Callback] No authentication data found');
          console.error('[Auth Callback] All search params:', Array.from(searchParams.entries()));
          console.error('[Auth Callback] All hash params:', hashParams);
        }

        sessionStorage.removeItem('oauth_code_verifier');
        router.push('/login?error=no_auth_data');
      } catch (error) {
        if (isDev) console.error('[Auth Callback] Exception:', error);
        sessionStorage.removeItem('oauth_code_verifier');
        router.push('/login?error=callback_failed');
      }
    };

    handleCallback();
  }, [router, refreshUser, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 mx-auto border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">{status}</p>
      </div>
    </div>
  );
}

// Wrap with Suspense for useSearchParams
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 mx-auto border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
