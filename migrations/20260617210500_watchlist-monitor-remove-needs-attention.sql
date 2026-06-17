-- Remove the deprecated needs_attention ticker status.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ticker_daily_briefs'
      AND column_name = 'status'
  ) THEN
    UPDATE public.ticker_daily_briefs
    SET status = 'watch'
    WHERE status = 'needs_attention';

    ALTER TABLE public.ticker_daily_briefs
      DROP CONSTRAINT IF EXISTS ticker_daily_briefs_status_check;

    ALTER TABLE public.ticker_daily_briefs
      ADD CONSTRAINT ticker_daily_briefs_status_check
      CHECK (status IN ('watch', 'quiet', 'stale'));
  END IF;
END;
$$;
