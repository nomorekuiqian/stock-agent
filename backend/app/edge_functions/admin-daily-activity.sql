create or replace function public.admin_daily_activity(days_back integer default 30)
returns table(
  day date,
  active_users bigint,
  event_count bigint,
  api_calls bigint
)
language sql
security definer
as $function$
  with params as (
    select greatest(1, least(coalesce(days_back, 30), 90))::int as days
  ),
  day_series as (
    select generate_series(
      current_date - ((select days from params) - 1),
      current_date,
      interval '1 day'
    )::date as day
  )
  select
    d.day,
    count(distinct ua.user_id) filter (where ua.user_id is not null)::bigint as active_users,
    count(ua.id)::bigint as event_count,
    count(ua.id) filter (where ua.event_type = 'api_call')::bigint as api_calls
  from day_series d
  left join public.user_activities ua
    on (ua.created_at at time zone 'UTC')::date = d.day
  group by d.day
  order by d.day;
$function$;

grant execute on function public.admin_daily_activity(integer) to anon, authenticated;
