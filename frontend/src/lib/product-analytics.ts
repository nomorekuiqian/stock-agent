'use client';

import { initPostHog, isPostHogEnabled, posthog } from '@/lib/posthog';

export type ProductAnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined | string[] | number[]
>;

export function trackProductEvent(
  event: string,
  properties: ProductAnalyticsProperties = {},
): void {
  if (!isPostHogEnabled() || !initPostHog()) return;
  posthog.capture(event, properties);
}
