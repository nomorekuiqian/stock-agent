-- Add UNIQUE constraint to prevent duplicate health reports per cache_key.
-- Idempotent: will error if constraint already exists (safe to re-run after fixing).
-- Rollback: ALTER TABLE portfolio_health_reports DROP CONSTRAINT health_reports_user_cache_key_unique;

ALTER TABLE portfolio_health_reports
  ADD CONSTRAINT health_reports_user_cache_key_unique
  UNIQUE (user_id, cache_key);
