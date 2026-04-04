/**
 * Pricing display constants. Source of truth for all user-facing price text.
 * The actual charge amount is controlled by STRIPE_PRO_PRICE_ID on the backend.
 */

/** Stripe live mode not yet configured. Set NEXT_PUBLIC_STRIPE_LIVE=true to enable checkout. */
export const STRIPE_LIVE = process.env.NEXT_PUBLIC_STRIPE_LIVE === 'true';

export const PRICING = {
  /** Pro tier price */
  pro: '$4.99',
  proPerMonth: '$4.99/月',
  proOriginal: '$14.99',
  proDiscount: '67% OFF',
  /** Max tier price */
  max: '$9.99',
  maxPerMonth: '$9.99/月',
  maxOriginal: '$39.99',
  maxDiscount: '75% OFF',
  /** Per-period label */
  interval: '/月',
  /** Early-access slot cap */
  earlyAccessTotal: 50,
} as const;
