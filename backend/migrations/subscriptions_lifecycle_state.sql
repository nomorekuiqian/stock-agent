-- Freemium lifecycle: subscriptions table additions
-- Plan: docs/plans/active/freemium-lifecycle-email.md
-- Contract: docs/constraints/subscription-model.md
-- Run via Insforge CLI: insforge db sql --file backend/migrations/subscriptions_lifecycle_state.sql

-- Lifecycle scheduler state (which onboarding days sent, twitter intro count, trigger cooldowns)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS lifecycle_state JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Reactivation cohort marker (NULL / cohort_a / cohort_b / cohort_c / cold)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS reactivation_state TEXT;

-- Onboarding gate: NULL = not completed, timestamp = completed
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Index for "not yet onboarded" middleware lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_onboarding_incomplete
  ON public.subscriptions (user_id)
  WHERE onboarding_completed_at IS NULL;

-- Index for reactivation cohort scans
CREATE INDEX IF NOT EXISTS idx_subscriptions_reactivation_state
  ON public.subscriptions (reactivation_state)
  WHERE reactivation_state IS NOT NULL;
