CREATE OR REPLACE FUNCTION public.admin_growth_metrics(days_back integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $function$
  WITH params AS (
    SELECT greatest(1, least(coalesce(days_back, 30), 90))::int AS days
  ),
  period_defs AS (
    SELECT
      'current'::text AS period,
      current_date - ((SELECT days FROM params) - 1) AS start_date,
      current_date AS end_date
    UNION ALL
    SELECT
      'previous'::text AS period,
      current_date - (((SELECT days FROM params) * 2) - 1) AS start_date,
      current_date - (SELECT days FROM params) AS end_date
  ),
  registered AS (
    SELECT id::text AS user_id, created_at
    FROM auth.users
  ),
  activity_events AS (
    SELECT
      ua.user_id::text AS user_id,
      ua.event_type,
      ua.event_name,
      ua.metadata,
      ua.created_at
    FROM public.user_activities ua
    WHERE ua.user_id IS NOT NULL
  ),
  setup_events AS (
    SELECT user_id, min(created_at) AS first_at
    FROM (
      SELECT user_id, created_at
      FROM activity_events
      WHERE event_type IN ('portfolio_uploaded', 'watchlist_created', 'ticker_added')
         OR event_name IN ('portfolio_uploaded', 'watchlist_created', 'ticker_added')
      UNION ALL
      SELECT user_id::text, created_at
      FROM public.user_portfolios
      WHERE coalesce(symbol, '') <> '$CASH'
    ) s
    GROUP BY user_id
  ),
  insight_events AS (
    SELECT user_id, min(created_at) AS first_at
    FROM (
      SELECT user_id, created_at
      FROM activity_events
      WHERE event_type = 'first_insight_generated'
         OR event_name = 'first_insight_generated'
      UNION ALL
      SELECT user_id::text, created_at
      FROM public.agent_session_events
      WHERE event_type = 'assistant_message'
         OR role = 'assistant'
    ) s
    GROUP BY user_id
  ),
  qualified_activity AS (
    SELECT user_id, created_at
    FROM activity_events
    WHERE event_type IN (
      'portfolio_checked',
      'watchlist_checked',
      'chat_message_sent',
      'follow_up_question_sent',
      'first_insight_generated',
      'insight_saved',
      'alert_opened'
    )
       OR event_name IN (
      'portfolio_checked',
      'watchlist_checked',
      'chat_message_sent',
      'follow_up_question_sent',
      'first_insight_generated',
      'insight_saved',
      'alert_opened',
      'ai_research',
      'stock_research',
      'daily_report',
      'morning_report',
      'macro',
      'screener'
    )
    UNION ALL
    SELECT user_id::text, created_at
    FROM public.agent_session_events
    WHERE event_type = 'user_message'
       OR role = 'user'
  ),
  period_registered AS (
    SELECT p.period, count(DISTINCT r.user_id)::numeric AS count
    FROM period_defs p
    LEFT JOIN registered r
      ON (r.created_at AT TIME ZONE 'UTC')::date <= p.end_date
    GROUP BY p.period
  ),
  period_setup AS (
    SELECT p.period, count(DISTINCT s.user_id)::numeric AS count
    FROM period_defs p
    JOIN registered r
      ON (r.created_at AT TIME ZONE 'UTC')::date <= p.end_date
    LEFT JOIN setup_events s
      ON s.user_id = r.user_id
     AND (s.first_at AT TIME ZONE 'UTC')::date <= p.end_date
    GROUP BY p.period
  ),
  period_insights AS (
    SELECT p.period, count(DISTINCT i.user_id)::numeric AS count
    FROM period_defs p
    JOIN registered r
      ON (r.created_at AT TIME ZONE 'UTC')::date <= p.end_date
    LEFT JOIN insight_events i
      ON i.user_id = r.user_id
     AND (i.first_at AT TIME ZONE 'UTC')::date <= p.end_date
    GROUP BY p.period
  ),
  weekly_return AS (
    SELECT
      p.period,
      count(DISTINCT prev.user_id)::numeric AS denominator,
      count(DISTINCT curr.user_id)::numeric AS numerator
    FROM period_defs p
    LEFT JOIN qualified_activity prev
      ON (prev.created_at AT TIME ZONE 'UTC')::date BETWEEN (p.end_date - 13) AND (p.end_date - 7)
    LEFT JOIN qualified_activity curr
      ON curr.user_id = prev.user_id
     AND (curr.created_at AT TIME ZONE 'UTC')::date BETWEEN (p.end_date - 6) AND p.end_date
    GROUP BY p.period
  ),
  session_messages AS (
    SELECT
      p.period,
      ase.user_id::text AS user_id,
      concat(ase.user_id::text, ':', ase.agent_id, ':', ase.session_id) AS session_key,
      count(*)::numeric AS user_messages
    FROM period_defs p
    JOIN public.agent_session_events ase
      ON (ase.created_at AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
     AND (ase.event_type = 'user_message' OR ase.role = 'user')
    GROUP BY p.period, ase.user_id, ase.agent_id, ase.session_id
  ),
  session_stats AS (
    SELECT
      period,
      count(*)::numeric AS sessions,
      count(*) FILTER (WHERE user_messages >= 2)::numeric AS follow_up_sessions,
      coalesce(sum(user_messages), 0)::numeric AS questions
    FROM session_messages
    GROUP BY period
  ),
  ratings AS (
    SELECT
      p.period,
      count(DISTINCT ae.user_id) FILTER (
        WHERE ae.event_type = 'insight_saved'
           OR ae.event_name = 'insight_saved'
      )::numeric AS saved
    FROM period_defs p
    LEFT JOIN activity_events ae
      ON (ae.created_at AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
    GROUP BY p.period
  ),
  metric_values AS (
    SELECT
      'portfolio_watchlist_setup_rate' AS key,
      'Activation' AS category,
      'P0' AS priority,
      'Portfolio/watchlist setup rate' AS label,
      'percent' AS format,
      'Users with a portfolio/watchlist setup divided by registered users through period end.' AS description,
      p.period,
      coalesce(ps.count, 0) AS numerator,
      coalesce(pr.count, 0) AS denominator
    FROM period_defs p
    LEFT JOIN period_setup ps USING (period)
    LEFT JOIN period_registered pr USING (period)
    UNION ALL
    SELECT
      'first_insight_generation_rate',
      'Activation',
      'P0',
      'First insight generation rate',
      'percent',
      'Users with a first personalized insight event or assistant answer divided by registered users through period end.',
      p.period,
      coalesce(pi.count, 0),
      coalesce(pr.count, 0)
    FROM period_defs p
    LEFT JOIN period_insights pi USING (period)
    LEFT JOIN period_registered pr USING (period)
    UNION ALL
    SELECT
      'weekly_return_rate',
      'Retention',
      'P0',
      'Weekly return rate',
      'percent',
      'Users active in the prior 7-day block who were active again in the latest 7-day block.',
      p.period,
      coalesce(wr.numerator, 0),
      coalesce(wr.denominator, 0)
    FROM period_defs p
    LEFT JOIN weekly_return wr USING (period)
    UNION ALL
    SELECT
      'follow_up_question_rate',
      'Depth',
      'P0',
      'Follow-up question rate',
      'percent',
      'Chat sessions with at least two user messages divided by chat sessions with a user message.',
      p.period,
      coalesce(ss.follow_up_sessions, 0),
      coalesce(ss.sessions, 0)
    FROM period_defs p
    LEFT JOIN session_stats ss USING (period)
    UNION ALL
    SELECT
      'questions_per_session',
      'Depth',
      'P1',
      'Questions per session',
      'decimal',
      'User messages divided by chat sessions.',
      p.period,
      coalesce(ss.questions, 0),
      coalesce(ss.sessions, 0)
    FROM period_defs p
    LEFT JOIN session_stats ss USING (period)
    UNION ALL
    SELECT
      'saved_insight_rate',
      'Depth',
      'P1',
      'Saved insight rate',
      'percent',
      'Users who saved at least one insight divided by users with an insight.',
      p.period,
      coalesce(r.saved, 0),
      coalesce(pi.count, 0)
    FROM period_defs p
    LEFT JOIN ratings r USING (period)
    LEFT JOIN period_insights pi USING (period)
  ),
  metric_json AS (
    SELECT
      key,
      category,
      priority,
      label,
      format,
      description,
      jsonb_object_agg(
        period,
        jsonb_build_object(
          'numerator', numerator,
          'denominator', denominator,
          'value', CASE
            WHEN denominator = 0 THEN NULL
            WHEN format = 'percent' THEN round((numerator / denominator) * 100, 2)
            ELSE round(numerator / denominator, 2)
          END
        )
      ) AS periods
    FROM metric_values
    GROUP BY key, category, priority, label, format, description
  )
  SELECT jsonb_build_object(
    'days', (SELECT days FROM params),
    'current', (
      SELECT jsonb_build_object('start_date', start_date, 'end_date', end_date)
      FROM period_defs
      WHERE period = 'current'
    ),
    'previous', (
      SELECT jsonb_build_object('start_date', start_date, 'end_date', end_date)
      FROM period_defs
      WHERE period = 'previous'
    ),
    'metrics', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key', key,
          'category', category,
          'priority', priority,
          'label', label,
          'format', format,
          'description', description,
          'current', coalesce(periods->'current', '{"numerator":0,"denominator":0,"value":null}'::jsonb),
          'previous', coalesce(periods->'previous', '{"numerator":0,"denominator":0,"value":null}'::jsonb)
        )
        ORDER BY
          CASE category
            WHEN 'Activation' THEN 1
            WHEN 'Retention' THEN 2
            WHEN 'Depth' THEN 3
            WHEN 'Quality / Trust' THEN 4
            WHEN 'Growth' THEN 5
            ELSE 6
          END,
          CASE priority WHEN 'P0' THEN 1 ELSE 2 END,
          label
      ),
      '[]'::jsonb
    )
  )
  FROM metric_json;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_growth_metrics(integer) TO anon, authenticated;
