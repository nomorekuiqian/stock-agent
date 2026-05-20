-- ============================================================================
-- U1-B - Portfolio Health Check: portfolio_health_reports + portfolio_insights
-- ----------------------------------------------------------------------------
-- Idempotent DDL. Safe to re-run.
-- Deploy: insforge db query --file backend/migrations/u1b_health_schema.sql
--         or paste into Insforge admin console SQL editor.
-- ============================================================================

-- 1) portfolio_health_reports
--    Full health report with 4-dimension scores + AI diagnosis.
--    One report per user per cache_key (daily, per holdings fingerprint).
CREATE TABLE IF NOT EXISTS portfolio_health_reports (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  cache_key              TEXT NOT NULL,
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 4-dimension scores (each 0-25, total 0-100)
  score_total            SMALLINT NOT NULL,
  score_dispersion       SMALLINT NOT NULL,
  score_performance      SMALLINT NOT NULL,
  score_macro_fit        SMALLINT NOT NULL,
  score_stability        SMALLINT NOT NULL,

  -- Snapshots for audit / replay
  holdings_snapshot      JSONB,            -- [{symbol, weight, thesis}, ...]
  profile_snapshot       JSONB,            -- {style, horizon, risk_tolerance}

  -- AI diagnosis fields (nullable when agent fails)
  diagnosis_markdown     TEXT,
  one_line               TEXT,
  top_risk               TEXT,
  sector_dna             TEXT,
  macro_sensitivity_tag  TEXT,             -- low | mid | high
  next_action            JSONB,            -- {type, text, symbols}

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT health_reports_score_total_range
    CHECK (score_total >= 0 AND score_total <= 100),
  CONSTRAINT health_reports_score_dim_range
    CHECK (score_dispersion >= 0 AND score_dispersion <= 25
       AND score_performance >= 0 AND score_performance <= 25
       AND score_macro_fit >= 0 AND score_macro_fit <= 25
       AND score_stability >= 0 AND score_stability <= 25),
  CONSTRAINT health_reports_macro_tag_check
    CHECK (macro_sensitivity_tag IS NULL
        OR macro_sensitivity_tag IN ('low', 'mid', 'high'))
);

CREATE INDEX IF NOT EXISTS idx_health_reports_user
  ON portfolio_health_reports (user_id);

CREATE INDEX IF NOT EXISTS idx_health_reports_cache_key
  ON portfolio_health_reports (user_id, cache_key);

-- 2) portfolio_insights
--    Lightweight latest snapshot per user. One row per user, overwritten each check.
--    Consumed by brew digest agent for background knowledge injection.
CREATE TABLE IF NOT EXISTS portfolio_insights (
  user_id                TEXT PRIMARY KEY,
  health_score           SMALLINT,         -- total 0-100
  one_line               TEXT,
  top_risk               TEXT,
  sector_dna             TEXT,
  macro_sensitivity_tag  TEXT,
  next_action            JSONB,
  source_report_id       UUID REFERENCES portfolio_health_reports(id),
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT insights_score_range
    CHECK (health_score IS NULL OR (health_score >= 0 AND health_score <= 100)),
  CONSTRAINT insights_macro_tag_check
    CHECK (macro_sensitivity_tag IS NULL
        OR macro_sensitivity_tag IN ('low', 'mid', 'high'))
);

-- 3) updated_at triggers (reuse u0a_set_updated_at if it exists)
-- Create the function if not exists (safe -- OR REPLACE is idempotent)
CREATE OR REPLACE FUNCTION u0a_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_health_reports_updated_at ON portfolio_health_reports;
CREATE TRIGGER trg_health_reports_updated_at
  BEFORE UPDATE ON portfolio_health_reports
  FOR EACH ROW EXECUTE FUNCTION u0a_set_updated_at();

DROP TRIGGER IF EXISTS trg_portfolio_insights_updated_at ON portfolio_insights;
CREATE TRIGGER trg_portfolio_insights_updated_at
  BEFORE UPDATE ON portfolio_insights
  FOR EACH ROW EXECUTE FUNCTION u0a_set_updated_at();

-- ============================================================================
-- Rollback (emergency only):
--   DROP TRIGGER IF EXISTS trg_portfolio_insights_updated_at ON portfolio_insights;
--   DROP TRIGGER IF EXISTS trg_health_reports_updated_at ON portfolio_health_reports;
--   DROP TABLE IF EXISTS portfolio_insights;
--   DROP TABLE IF EXISTS portfolio_health_reports;
-- Note: rollback loses all health report data.
-- ============================================================================
