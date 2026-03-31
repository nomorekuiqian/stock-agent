/**
 * Pricing display constants. Source of truth for all user-facing price text.
 * The actual charge amount is controlled by STRIPE_PRO_PRICE_ID on the backend.
 */

export const PRICING = {
  /** Current early-access price */
  pro: '$9.99',
  /** Original / future price (shown as strikethrough) */
  original: '$39.99',
  /** Discount label */
  discount: '75% OFF',
  /** Per-period label */
  interval: '/月',
  /** Combined display: "$9.99/月" */
  proPerMonth: '$9.99/月',
  /** Early-access slot cap */
  earlyAccessTotal: 50,
} as const;
