-- Migrate kol_daily_digests.date from BJT cron day to ET market day.
--
-- Background: the Twitter Digest cron fires at UTC 20:30 (= ET 16:30 EDT,
-- 30 min after US close). The previous `_business_date_bjt` helper stored
-- (UTC + 8h).date(), which is the next-day BJT calendar day — labelling
-- each digest with tomorrow's date for ET readers. The new
-- `_business_date_et` helper stores the ET market day the digest covers,
-- so every existing row's `date` is exactly one day ahead of the corrected
-- value.
--
-- Shift every row back by one day. PostgreSQL checks UNIQUE constraints
-- once per statement (not per row), and the shifted set is still distinct,
-- so a single UPDATE is safe.
--
-- The `date` column is TEXT (stored as 'YYYY-MM-DD'); cast through DATE
-- to do the arithmetic, then back to TEXT for storage.

UPDATE kol_daily_digests
SET date = (date::date - INTERVAL '1 day')::date::text;
