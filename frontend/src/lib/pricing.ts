/**
 * Pricing display constants. Source of truth for all user-facing price text.
 * The actual charge amount is controlled by Stripe Price IDs on the backend.
 */

/** Stripe live mode not yet configured. Set NEXT_PUBLIC_STRIPE_LIVE=true to enable checkout. */
export const STRIPE_LIVE = process.env.NEXT_PUBLIC_STRIPE_LIVE === 'true';

export const PRICING = {
  /** Pro tier price */
  pro: '$10',
  proPerMonth: '$10/月',
  /** Max tier price */
  max: '$20',
  maxPerMonth: '$20/月',
  /** Ultra tier: Max + Blogger Research Room Frank pack */
  ultra: '$30',
  ultraPerMonth: '$30/月',
  /** Per-period label */
  interval: '/月',
} as const;
