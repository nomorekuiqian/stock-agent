-- ============================================================================
-- Watchlist Monitor V0 - shared ticker daily briefs
-- ----------------------------------------------------------------------------
-- Idempotent DDL. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticker_daily_briefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol          TEXT NOT NULL,
  brief_date      DATE NOT NULL,
  model_version   TEXT NOT NULL DEFAULT 'watchlist-monitor-v0',
  headline        TEXT NOT NULL,
  ai_take         TEXT NOT NULL,
  news_summary    TEXT NOT NULL DEFAULT '',
  technical_monitor JSONB NOT NULL DEFAULT '{}'::jsonb,
  market_discussion JSONB NOT NULL DEFAULT '{}'::jsonb,
  signals         JSONB NOT NULL DEFAULT '[]'::jsonb,
  watchpoints     JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_refs     JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ticker_daily_briefs_symbol_check
    CHECK (symbol ~ '^[A-Z0-9.\-^=]{1,12}$'),
  CONSTRAINT ticker_daily_briefs_unique_version
    UNIQUE (symbol, brief_date, model_version)
);

ALTER TABLE ticker_daily_briefs
  ADD COLUMN IF NOT EXISTS news_summary TEXT NOT NULL DEFAULT '';

ALTER TABLE ticker_daily_briefs
  ADD COLUMN IF NOT EXISTS technical_monitor JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ticker_daily_briefs
  ADD COLUMN IF NOT EXISTS market_discussion JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ticker_daily_briefs
  ADD COLUMN IF NOT EXISTS event_candidates JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ticker_daily_briefs_symbol_date
  ON ticker_daily_briefs (symbol, brief_date DESC);

CREATE INDEX IF NOT EXISTS idx_ticker_daily_briefs_generated_at
  ON ticker_daily_briefs (generated_at DESC);

CREATE OR REPLACE FUNCTION u0a_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticker_daily_briefs_updated_at ON ticker_daily_briefs;
CREATE TRIGGER trg_ticker_daily_briefs_updated_at
  BEFORE UPDATE ON ticker_daily_briefs
  FOR EACH ROW EXECUTE FUNCTION u0a_set_updated_at();

-- ============================================================================
-- Rollback (emergency only):
--   DROP TRIGGER IF EXISTS trg_ticker_daily_briefs_updated_at ON ticker_daily_briefs;
--   DROP TABLE IF EXISTS ticker_daily_briefs;
-- ============================================================================
