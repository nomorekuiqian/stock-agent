CREATE INDEX IF NOT EXISTS idx_user_activities_created_at_user_event
  ON public.user_activities (created_at DESC, user_id, event_type);

CREATE OR REPLACE FUNCTION public.admin_daily_activity(days_back integer DEFAULT 30)
RETURNS TABLE(
  day date,
  active_users bigint,
  event_count bigint,
  api_calls bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $function$
  WITH params AS (
    SELECT
      greatest(1, least(coalesce(days_back, 30), 90))::int AS days,
      (now() AT TIME ZONE 'UTC')::date AS today_utc
  ),
  day_series AS (
    SELECT generate_series(
      (SELECT today_utc - (days - 1) FROM params),
      (SELECT today_utc FROM params),
      interval '1 day'
    )::date AS day
  ),
  activity_by_day AS (
    SELECT
      (ua.created_at AT TIME ZONE 'UTC')::date AS day,
      count(DISTINCT ua.user_id) FILTER (WHERE ua.user_id IS NOT NULL)::bigint AS active_users,
      count(ua.id)::bigint AS event_count,
      count(ua.id) FILTER (WHERE ua.event_type = 'api_call')::bigint AS api_calls
    FROM public.user_activities ua
    CROSS JOIN params p
    WHERE ua.created_at >= ((p.today_utc - (p.days - 1))::timestamp AT TIME ZONE 'UTC')
      AND ua.created_at < ((p.today_utc + 1)::timestamp AT TIME ZONE 'UTC')
    GROUP BY (ua.created_at AT TIME ZONE 'UTC')::date
  )
  SELECT
    d.day,
    coalesce(a.active_users, 0)::bigint AS active_users,
    coalesce(a.event_count, 0)::bigint AS event_count,
    coalesce(a.api_calls, 0)::bigint AS api_calls
  FROM day_series d
  LEFT JOIN activity_by_day a ON a.day = d.day
  ORDER BY d.day;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_daily_activity(integer) TO anon, authenticated;
