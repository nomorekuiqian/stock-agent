-- Stripe subscription cancellation state for active subscriptions scheduled
-- to end at the current billing period boundary.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancel_at
  ON public.subscriptions (cancel_at)
  WHERE cancel_at IS NOT NULL;
