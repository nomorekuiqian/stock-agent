-- Unknown-tagged Resend events should stay unknown unless we can infer the
-- product channel from explicit tags or subject text. The shared daily sender
-- is used by multiple broadcast types, so it is not a safe daily_report signal.

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
      WHEN subject_text ILIKE '%推特日报%' THEN 'twitter_digest'
      WHEN subject_text ILIKE '%专属日报%' THEN 'personal_digest'
      WHEN subject_text ILIKE '%早鸟价%' THEN 'lifecycle_email'
      WHEN subject_text ILIKE '%升级 Max%' THEN 'lifecycle_email'
      WHEN subject_text ILIKE '%早报%' THEN 'morning_report'
      WHEN from_text ILIKE '%morning@themarketbrew.com%' THEN 'morning_report'
      WHEN from_text ILIKE '%weekly@themarketbrew.com%' THEN 'weekly_report'
      ELSE 'unknown'
    END
  FROM tags;
$function$;

GRANT EXECUTE ON FUNCTION public.infer_email_event_channel(text, jsonb, text) TO anon, authenticated;
