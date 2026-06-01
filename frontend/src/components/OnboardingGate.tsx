'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

/**
 * Forces logged-in users that have never completed onboarding to land on
 * `/onboarding`. Backs up the OAuth callback redirect (which only fires
 * during fresh sign-ins) for users that arrive via cookies left behind in
 * a different tab / device.
 *
 * Skipped routes:
 *  - `/onboarding/*` itself (so the page can render)
 *  - public marketing pages that don't require auth — middleware already
 *    lets these through without a cookie, so we mirror the list to avoid
 *    interrupting anonymous browsing if the user is logged in elsewhere.
 *
 * The status query is gated on `isAuthenticated`, cached for the session,
 * and falls back silently on network errors — gating is best-effort and
 * must never block a paying user from real content.
 */
const PUBLIC_PREFIXES = [
  '/',
  '/login',
  '/auth',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/pricing',
  '/contact',
  '/feedback',
  '/unsubscribe',
  '/email-test',
  '/webview-check',
  '/request-access',
];

function isOnboardingExempt(pathname: string): boolean {
  if (pathname.startsWith('/onboarding')) return true;
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some(
    (p) => p !== '/' && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const pathname = usePathname() || '/';
  const router = useRouter();

  const exempt = isOnboardingExempt(pathname);

  const { data } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => api.user.onboardingStatus(),
    enabled: !authLoading && isAuthenticated && !exempt,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (!isAuthenticated || exempt) return;
    if (data && data.completed === false) {
      router.replace('/onboarding');
    }
  }, [isAuthenticated, exempt, data, router]);

  return <>{children}</>;
}
