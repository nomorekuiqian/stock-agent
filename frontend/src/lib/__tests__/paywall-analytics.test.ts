import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@vercel/analytics';
import { trackProductEvent } from '@/lib/product-analytics';
import {
  trackCheckoutComplete,
  trackCheckoutOpen,
  trackPaywallCtaClick,
  trackPaywallView,
} from '../paywall-analytics';

vi.mock('@vercel/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/product-analytics', () => ({
  trackProductEvent: vi.fn(),
}));

const vercelTrack = vi.mocked(track);
const productTrack = vi.mocked(trackProductEvent);

describe('paywall analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mirrors paywall events to Vercel Analytics and PostHog', () => {
    trackPaywallView({ source: 'stock_ai_paywall', tier: 'max' });
    trackPaywallCtaClick({ source: 'stock_ai_paywall', tier: 'max', authenticated: true });
    trackCheckoutOpen({ source: 'qinbafrank_ultra_landing', tier: 'ultra' });
    trackCheckoutComplete({ tier: 'ultra' });

    expect(vercelTrack).toHaveBeenCalledWith('paywall_view', {
      source: 'stock_ai_paywall',
      tier: 'max',
    });
    expect(vercelTrack).toHaveBeenCalledWith('paywall_cta_click', {
      source: 'stock_ai_paywall',
      tier: 'max',
      authenticated: true,
    });
    expect(vercelTrack).toHaveBeenCalledWith('checkout_open', {
      source: 'qinbafrank_ultra_landing',
      tier: 'ultra',
    });
    expect(vercelTrack).toHaveBeenCalledWith('checkout_complete', {
      tier: 'ultra',
    });

    expect(productTrack).toHaveBeenCalledWith('paywall_view', {
      source: 'stock_ai_paywall',
      tier: 'max',
    });
    expect(productTrack).toHaveBeenCalledWith('paywall_cta_click', {
      source: 'stock_ai_paywall',
      tier: 'max',
      authenticated: true,
    });
    expect(productTrack).toHaveBeenCalledWith('checkout_open', {
      source: 'qinbafrank_ultra_landing',
      tier: 'ultra',
    });
    expect(productTrack).toHaveBeenCalledWith('checkout_complete', {
      tier: 'ultra',
    });
  });
});
