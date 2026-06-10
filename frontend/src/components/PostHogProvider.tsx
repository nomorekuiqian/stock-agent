'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { initPostHog, isPostHogEnabled, posthog } from '@/lib/posthog';

function currentUrl(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return `${window.location.origin}${pathname}${query ? `?${query}` : ''}`;
}

function PostHogTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!pathname || !isPostHogEnabled()) return;
    if (!initPostHog()) return;

    posthog.capture('$pageview', {
      $current_url: currentUrl(pathname, searchParams),
      path: pathname,
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    if (isLoading || !isPostHogEnabled()) return;
    if (!initPostHog()) return;

    if (user?.id) {
      if (identifiedUserId.current !== user.id) {
        posthog.identify(user.id, {
          email: user.email,
          name: user.name,
        });
        identifiedUserId.current = user.id;
      }
      return;
    }

    if (identifiedUserId.current) {
      posthog.reset();
      identifiedUserId.current = null;
    }
  }, [isLoading, user?.id, user?.email, user?.name]);

  return null;
}

export function PostHogProvider() {
  return (
    <Suspense fallback={null}>
      <PostHogTracker />
    </Suspense>
  );
}
