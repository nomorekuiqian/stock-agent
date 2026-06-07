CREATE OR REPLACE FUNCTION public.admin_daily_email_metrics(days_back integer DEFAULT 30)
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
  WITH params AS (
    SELECT greatest(1, least(coalesce(days_back, 30), 90))::int AS days
  ),
  day_series AS (
    SELECT generate_series(
      current_date - ((SELECT days FROM params) - 1),
      current_date,
      interval '1 day'
    )::date AS day
  ),
  scoped AS (
    SELECT
      (coalesce(event_created_at, created_at) AT TIME ZONE 'UTC')::date AS day,
      event_type,
      coalesce(email_id, recipient_email, svix_id) AS event_key
    FROM email_events
    WHERE coalesce(event_created_at, created_at) >= (
      current_date - ((SELECT days FROM params) - 1)
    )
  ),
  per_email AS (
    SELECT
      day,
      event_key,
      bool_or(event_type = 'email.delivered') AS delivered,
      bool_or(event_type = 'email.opened') AS opened,
      bool_or(event_type = 'email.clicked') AS clicked,
      bool_or(event_type = 'email.bounced') AS bounced,
      bool_or(event_type = 'email.complained') AS complained,
      bool_or(event_type IN ('email.failed', 'email.suppressed')) AS failed
    FROM scoped
    GROUP BY day, event_key
  ),
  aggregated AS (
    SELECT
      day,
      count(*) FILTER (WHERE delivered)::bigint AS delivered,
      count(*) FILTER (WHERE delivered AND opened)::bigint AS opened,
      count(*) FILTER (WHERE delivered AND clicked)::bigint AS clicked,
      count(*) FILTER (WHERE bounced)::bigint AS bounced,
      count(*) FILTER (WHERE complained)::bigint AS complained,
      count(*) FILTER (WHERE failed)::bigint AS failed
    FROM per_email
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
      ELSE round((coalesce(a.opened, 0)::numeric / a.delivered::numeric) * 100, 2)
    END AS open_rate,
    CASE
      WHEN coalesce(a.delivered, 0) = 0 THEN 0
      ELSE round((coalesce(a.clicked, 0)::numeric / a.delivered::numeric) * 100, 2)
    END AS click_rate
  FROM day_series d
  LEFT JOIN aggregated a ON a.day = d.day
  ORDER BY d.day;
$function$;

CREATE OR REPLACE FUNCTION public.admin_email_channel_metrics(days_back integer DEFAULT 30)
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
  WITH scoped AS (
    SELECT
      coalesce(nullif(channel, ''), 'unknown') AS channel,
      event_type,
      coalesce(email_id, recipient_email, svix_id) AS event_key
    FROM email_events
    WHERE coalesce(event_created_at, created_at) >= (
      current_date - (greatest(1, least(coalesce(days_back, 30), 90)) - 1)
    )
  ),
  per_email AS (
    SELECT
      channel,
      event_key,
      bool_or(event_type = 'email.delivered') AS delivered,
      bool_or(event_type = 'email.opened') AS opened,
      bool_or(event_type = 'email.clicked') AS clicked,
      bool_or(event_type = 'email.bounced') AS bounced,
      bool_or(event_type = 'email.complained') AS complained,
      bool_or(event_type IN ('email.failed', 'email.suppressed')) AS failed
    FROM scoped
    GROUP BY channel, event_key
  ),
  aggregated AS (
    SELECT
      channel,
      count(*) FILTER (WHERE delivered)::bigint AS delivered,
      count(*) FILTER (WHERE delivered AND opened)::bigint AS opened,
      count(*) FILTER (WHERE delivered AND clicked)::bigint AS clicked,
      count(*) FILTER (WHERE bounced)::bigint AS bounced,
      count(*) FILTER (WHERE complained)::bigint AS complained,
      count(*) FILTER (WHERE failed)::bigint AS failed
    FROM per_email
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
    CASE WHEN delivered = 0 THEN 0 ELSE round((opened::numeric / delivered::numeric) * 100, 2) END AS open_rate,
    CASE WHEN delivered = 0 THEN 0 ELSE round((clicked::numeric / delivered::numeric) * 100, 2) END AS click_rate
  FROM aggregated
  ORDER BY delivered DESC, channel ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_daily_email_metrics(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_email_channel_metrics(integer) TO anon, authenticated;
