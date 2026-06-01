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

-- ============================================================================
-- Backfill: every account that already existed before this migration is by
-- definition a legacy user — they have been using the product without the
-- onboarding flow and must not be force-redirected to /onboarding. Going
-- forward, only brand-new signups (no subscription row yet) hit the gate.
-- Both statements are idempotent so re-runs are safe.
-- ============================================================================

-- 1. Existing subscription rows -> stamp completion with their own created_at
--    (or NOW() as a last resort).
UPDATE public.subscriptions
SET onboarding_completed_at = COALESCE(created_at, updated_at, NOW())
WHERE onboarding_completed_at IS NULL;

-- 2. Legacy auth users without a subscription row -> insert a minimal row
--    pre-stamped as completed, so the gate skips them on next visit.
--    Both auth.users.id and subscriptions.user_id are UUID; no cast needed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    INSERT INTO public.subscriptions (user_id, onboarding_completed_at, created_at, updated_at)
    SELECT u.id, COALESCE(u.created_at, NOW()), COALESCE(u.created_at, NOW()), NOW()
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id
    );
  END IF;
END $$;
