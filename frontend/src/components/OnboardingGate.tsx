'use client';

import { isFeaturePaused } from '@/lib/feature-pause';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  hasLocalOnboardingCompleted,
  markLocalOnboardingCompleted,
} from '@/lib/onboarding-status';

/**
 * Sends logged-in users that have never completed onboarding to the lightweight
 * homepage guided tour. Backs up the OAuth callback redirect (which only fires
 * during fresh sign-ins) for users that arrive via cookies left behind in
 * a different tab / device.
 *
 * Skipped routes:
 *  - public marketing pages that don't require auth — middleware already
 *    lets these through without a cookie, so we mirror the list to avoid
 *    interrupting anonymous browsing if the user is logged in elsewhere.
 *  - focused partner routes such as `/panda`, where the partner-specific
 *    access gate owns the first-run experience.
 *
 * The status query is gated on `isAuthenticated` and skipped permanently
 * once this browser has seen completion for the current user. Gating is
 * best-effort and must never block a paying user from real content.
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
  '/panda',
];

function isOnboardingExempt(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some(
    (p) => p !== '/' && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}

function ActiveOnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const pathname = usePathname() || '/';
  const router = useRouter();

  const exempt = isOnboardingExempt(pathname);
  const userId = user?.id ?? null;
  const locallyCompleted = hasLocalOnboardingCompleted(userId);

  const { data } = useQuery({
    queryKey: ['onboarding-status', userId],
    queryFn: async () => {
      const status = await api.user.onboardingStatus();
      if (status.completed === true) {
        markLocalOnboardingCompleted(userId);
      }
      return status;
    },
    enabled: !authLoading && isAuthenticated && !!userId && !exempt && !locallyCompleted,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const completed = locallyCompleted || data?.completed === true;

  useEffect(() => {
    if (!isAuthenticated || exempt) return;
    if (completed) return;
    if (data && data.completed === false) {
      router.replace('/?tour=1');
    }
  }, [isAuthenticated, exempt, completed, data, router]);

  return <>{children}</>;
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  if (isFeaturePaused('onboarding')) return <>{children}</>;
  return <ActiveOnboardingGate>{children}</ActiveOnboardingGate>;
}
