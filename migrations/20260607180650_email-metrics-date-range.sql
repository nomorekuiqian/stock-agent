CREATE OR REPLACE FUNCTION public.admin_daily_email_metrics_range(
  start_date date,
  end_date date
)
RETURNS TABLE(
  day date,
  delivered bigint,
  opened bigint,
  clicked bigint,
  bounced bigint,
  complained bigint,
  failed bigint,
  open_rate numeric,
  click_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $function$
  WITH bounds AS (
    SELECT
      least(coalesce(start_date, current_date), coalesce(end_date, current_date)) AS start_day,
      greatest(coalesce(start_date, current_date), coalesce(end_date, current_date)) AS end_day
  ),
  day_series AS (
    SELECT generate_series(
      (SELECT start_day FROM bounds),
      (SELECT end_day FROM bounds),
      interval '1 day'
    )::date AS day
  ),
  scoped AS (
    SELECT
      (coalesce(event_created_at, created_at) AT TIME ZONE 'UTC')::date AS day,
      event_type,
      coalesce(email_id, recipient_email, svix_id) AS event_key
    FROM email_events
    WHERE (coalesce(event_created_at, created_at) AT TIME ZONE 'UTC')::date
      BETWEEN (SELECT start_day FROM bounds) AND (SELECT end_day FROM bounds)
  ),
  aggregated AS (
    SELECT
      day,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.delivered')::bigint AS delivered,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.opened')::bigint AS opened,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.clicked')::bigint AS clicked,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.bounced')::bigint AS bounced,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.complained')::bigint AS complained,
      count(DISTINCT event_key) FILTER (WHERE event_type IN ('email.failed', 'email.suppressed'))::bigint AS failed
    FROM scoped
    GROUP BY day
  )
  SELECT
    d.day,
    coalesce(a.delivered, 0)::bigint AS delivered,
    coalesce(a.opened, 0)::bigint AS opened,
    coalesce(a.clicked, 0)::bigint AS clicked,
    coalesce(a.bounced, 0)::bigint AS bounced,
    coalesce(a.complained, 0)::bigint AS complained,
    coalesce(a.failed, 0)::bigint AS failed,
    CASE
      WHEN coalesce(a.delivered, 0) = 0 THEN 0
      ELSE least(round((coalesce(a.opened, 0)::numeric / a.delivered::numeric) * 100, 2), 100)
    END AS open_rate,
    CASE
      WHEN coalesce(a.delivered, 0) = 0 THEN 0
      ELSE least(round((coalesce(a.clicked, 0)::numeric / a.delivered::numeric) * 100, 2), 100)
    END AS click_rate
  FROM day_series d
  LEFT JOIN aggregated a ON a.day = d.day
  ORDER BY d.day;
$function$;

CREATE OR REPLACE FUNCTION public.admin_email_channel_metrics_range(
  start_date date,
  end_date date
)
RETURNS TABLE(
  channel text,
  delivered bigint,
  opened bigint,
  clicked bigint,
  bounced bigint,
  complained bigint,
  failed bigint,
  open_rate numeric,
  click_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $function$
  WITH bounds AS (
    SELECT
      least(coalesce(start_date, current_date), coalesce(end_date, current_date)) AS start_day,
      greatest(coalesce(start_date, current_date), coalesce(end_date, current_date)) AS end_day
  ),
  scoped AS (
    SELECT
      coalesce(nullif(channel, ''), 'unknown') AS channel,
      event_type,
      coalesce(email_id, recipient_email, svix_id) AS event_key
    FROM email_events
    WHERE (coalesce(event_created_at, created_at) AT TIME ZONE 'UTC')::date
      BETWEEN (SELECT start_day FROM bounds) AND (SELECT end_day FROM bounds)
  ),
  aggregated AS (
    SELECT
      channel,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.delivered')::bigint AS delivered,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.opened')::bigint AS opened,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.clicked')::bigint AS clicked,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.bounced')::bigint AS bounced,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.complained')::bigint AS complained,
      count(DISTINCT event_key) FILTER (WHERE event_type IN ('email.failed', 'email.suppressed'))::bigint AS failed
    FROM scoped
    GROUP BY channel
  )
  SELECT
    channel,
    delivered,
    opened,
    clicked,
    bounced,
    complained,
    failed,
    CASE
      WHEN delivered = 0 THEN 0
      ELSE least(round((opened::numeric / delivered::numeric) * 100, 2), 100)
    END AS open_rate,
    CASE
      WHEN delivered = 0 THEN 0
      ELSE least(round((clicked::numeric / delivered::numeric) * 100, 2), 100)
    END AS click_rate
  FROM aggregated
  ORDER BY delivered DESC, channel ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_daily_email_metrics_range(date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_email_channel_metrics_range(date, date) TO anon, authenticated;
