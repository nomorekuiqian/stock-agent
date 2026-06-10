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
  const capturedPageviewKey = useRef<string | null>(null);

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!pathname || isLoading || !isPostHogEnabled()) return;
    if (!initPostHog()) return;

    if (user?.id && identifiedUserId.current !== user.id) {
      posthog.identify(user.id, {
        email: user.email,
        name: user.name,
      });
      identifiedUserId.current = user.id;
    } else if (!user?.id && identifiedUserId.current) {
      posthog.reset();
      identifiedUserId.current = null;
    }

    const query = searchParams.toString();
    const pageviewKey = `${pathname}?${query}|${user?.id ?? 'anonymous'}`;
    if (capturedPageviewKey.current === pageviewKey) return;
    capturedPageviewKey.current = pageviewKey;

    posthog.capture('$pageview', {
      $current_url: currentUrl(pathname, searchParams),
      $host: window.location.host,
      $pathname: pathname,
      path: pathname,
      is_authenticated: Boolean(user?.id),
      user_id: user?.id,
    });
  }, [isLoading, pathname, searchParams, user?.id, user?.email, user?.name]);

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
