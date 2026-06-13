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
    select
      greatest(1, least(coalesce(days_back, 30), 90))::int as days,
      (now() at time zone 'UTC')::date as today_utc
  ),
  day_series as (
    select generate_series(
      (select today_utc - (days - 1) from params),
      (select today_utc from params),
      interval '1 day'
    )::date as day
  ),
  activity_by_day as (
    select
      (ua.created_at at time zone 'UTC')::date as day,
      count(distinct ua.user_id) filter (where ua.user_id is not null)::bigint as active_users,
      count(ua.id)::bigint as event_count,
      count(ua.id) filter (where ua.event_type = 'api_call')::bigint as api_calls
    from public.user_activities ua
    cross join params p
    where ua.created_at >= ((p.today_utc - (p.days - 1))::timestamp at time zone 'UTC')
      and ua.created_at < ((p.today_utc + 1)::timestamp at time zone 'UTC')
    group by (ua.created_at at time zone 'UTC')::date
  )
  select
    d.day,
    coalesce(a.active_users, 0)::bigint as active_users,
    coalesce(a.event_count, 0)::bigint as event_count,
    coalesce(a.api_calls, 0)::bigint as api_calls
  from day_series d
  left join activity_by_day a on a.day = d.day
  order by d.day;
$function$;

grant execute on function public.admin_daily_activity(integer) to anon, authenticated;
