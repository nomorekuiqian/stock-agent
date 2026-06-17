ALTER TABLE public.ticker_daily_briefs
  DROP CONSTRAINT IF EXISTS ticker_daily_briefs_priority_score_check;

ALTER TABLE public.ticker_daily_briefs
  DROP COLUMN IF EXISTS priority_score;
