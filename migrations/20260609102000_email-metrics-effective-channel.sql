CREATE OR REPLACE FUNCTION public.infer_email_event_channel(
  stored_channel text,
  raw_payload jsonb,
  subject text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  WITH payload AS (
    SELECT
      coalesce(raw_payload, '{}'::jsonb) AS body,
      nullif(stored_channel, '') AS stored,
      coalesce(subject, '') AS subject_text
  ),
  tags AS (
    SELECT
      stored,
      subject_text,
      body #>> '{data,from}' AS from_text,
      coalesce(
        nullif(body #>> '{data,tags,channel}', ''),
        nullif(body #>> '{data,tags,email_channel}', ''),
        (
          SELECT nullif(tag->>'value', '')
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(body #> '{data,tags}') = 'array' THEN body #> '{data,tags}'
              ELSE '[]'::jsonb
            END
          ) AS tag
          WHERE lower(coalesce(tag->>'name', '')) IN ('channel', 'email_channel')
          LIMIT 1
        )
      ) AS tag_channel
    FROM payload
  )
  SELECT
    CASE
      WHEN stored IS NOT NULL AND stored <> 'unknown' THEN stored
      WHEN tag_channel IS NOT NULL THEN tag_channel
      WHEN from_text ILIKE '%daily@themarketbrew.com%' THEN 'daily_report'
      WHEN from_text ILIKE '%morning@themarketbrew.com%' THEN 'morning_report'
      WHEN from_text ILIKE '%weekly@themarketbrew.com%' THEN 'weekly_report'
      WHEN subject_text ILIKE '%专属日报%' THEN 'personal_digest'
      WHEN subject_text ILIKE '%早报%' THEN 'morning_report'
      ELSE 'unknown'
    END
  FROM tags;
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
      public.infer_email_event_channel(email_events.channel, raw_payload, subject) AS channel,
      event_type,
      coalesce(email_id, recipient_email, svix_id) AS event_key
    FROM email_events
    WHERE coalesce(event_created_at, created_at) >= (
      current_date - (greatest(1, least(coalesce(days_back, 30), 90)) - 1)
    )
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
      public.infer_email_event_channel(email_events.channel, raw_payload, subject) AS channel,
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

GRANT EXECUTE ON FUNCTION public.infer_email_event_channel(text, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_email_channel_metrics(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_email_channel_metrics_range(date, date) TO anon, authenticated;
