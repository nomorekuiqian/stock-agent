'use client';

import { track } from '@vercel/analytics';
import { trackProductEvent } from '@/lib/product-analytics';

export type PaywallSource =
  | 'morning'
  | 'twitter_digest'
  | 'paywall_guard'
  | 'paywall_guard_pro_to_max'
  | 'stock_ai_paywall'
  | 'personal_digest'
  | 'research_quota';

export type PaywallTier = 'pro' | 'max';

type Props = {
  source: PaywallSource;
  tier: PaywallTier;
  authenticated?: boolean;
};

export function trackPaywallView({ source, tier }: Pick<Props, 'source' | 'tier'>) {
  track('paywall_view', { source, tier });
  trackProductEvent('paywall_view', { source, tier });
}

export function trackPaywallCtaClick({ source, tier, authenticated }: Props) {
  const properties = {
    source,
    tier,
    authenticated: authenticated ?? false,
  };
  track('paywall_cta_click', properties);
  trackProductEvent('paywall_cta_click', properties);
}

export function trackCheckoutOpen({ source, tier }: Pick<Props, 'source' | 'tier'>) {
  track('checkout_open', { source, tier });
  trackProductEvent('checkout_open', { source, tier });
}

export function trackCheckoutComplete({ tier }: { tier: PaywallTier }) {
  track('checkout_complete', { tier });
  trackProductEvent('checkout_complete', { tier });
}
