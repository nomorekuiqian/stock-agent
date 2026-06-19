-- Cache the actual Stripe Price attached to a paid subscription.
-- Used for account/profile display so legacy early-bird prices do not inherit
-- the current public plan price copy.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS billing_currency TEXT,
  ADD COLUMN IF NOT EXISTS billing_interval TEXT,
  ADD COLUMN IF NOT EXISTS billing_interval_count INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_account_ref TEXT DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS legacy_stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS legacy_stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_migration_state TEXT,
  ADD COLUMN IF NOT EXISTS stripe_migrated_at TIMESTAMPTZ;
