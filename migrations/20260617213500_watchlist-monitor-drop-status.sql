-- Drop the ticker brief status column. Brief freshness is represented by
-- brief_date/is_stale in the API layer.

DROP INDEX IF EXISTS idx_ticker_daily_briefs_status;

ALTER TABLE public.ticker_daily_briefs
  DROP CONSTRAINT IF EXISTS ticker_daily_briefs_status_check;

ALTER TABLE public.ticker_daily_briefs
  DROP COLUMN IF EXISTS status;
