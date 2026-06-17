-- Persist offline-generated market discussion payloads for watchlist monitor.

ALTER TABLE ticker_daily_briefs
  ADD COLUMN IF NOT EXISTS market_discussion JSONB NOT NULL DEFAULT '{}'::jsonb;
