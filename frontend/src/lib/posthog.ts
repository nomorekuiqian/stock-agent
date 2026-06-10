'use client';

import posthog from 'posthog-js';

let initialized = false;

export function getPostHogKey(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
}

export function getPostHogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
}

export function isPostHogEnabled(): boolean {
  return getPostHogKey().length > 0;
}

export function initPostHog(): boolean {
  if (initialized || typeof window === 'undefined' || !isPostHogEnabled()) {
    return initialized;
  }

  posthog.init(getPostHogKey(), {
    api_host: getPostHogHost(),
    capture_pageview: false,
    autocapture: true,
    person_profiles: 'identified_only',
    persistence: 'localStorage+cookie',
  });
  initialized = true;
  return true;
}

export { posthog };
