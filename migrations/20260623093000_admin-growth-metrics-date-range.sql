CREATE OR REPLACE FUNCTION public.admin_growth_metrics_range(
  start_date date,
  end_date date
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $function$
  WITH normalized AS (
    SELECT
      least(
        coalesce($1, current_date),
        coalesce($2, current_date)
      )::date AS current_start,
      greatest(
        coalesce($1, current_date),
        coalesce($2, current_date)
      )::date AS current_end
  ),
  params AS (
    SELECT
      current_start,
      current_end,
      greatest(1, (current_end - current_start + 1))::int AS days
    FROM normalized
  ),
  period_defs AS (
    SELECT
      'current'::text AS period,
      current_start AS start_date,
      current_end AS end_date
    FROM params
    UNION ALL
    SELECT
      'previous'::text AS period,
      current_start - days AS start_date,
      current_start - 1 AS end_date
    FROM params
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
  answer_feedback AS (
    SELECT
      p.period,
      count(*) FILTER (WHERE ase.feedback_sentiment = 1)::numeric AS useful_answers,
      count(*) FILTER (WHERE ase.feedback_sentiment = -1)::numeric AS thumbs_down_answers,
      count(*) FILTER (WHERE ase.feedback_sentiment IN (1, -1))::numeric AS rated_answers
    FROM period_defs p
    LEFT JOIN public.agent_session_events ase
      ON (ase.created_at AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
     AND ase.event_type = 'assistant_message'
    GROUP BY p.period
  ),
  turn_event_rows AS (
    SELECT
      p.period,
      concat_ws(
        ':',
        ase.user_id::text,
        ase.agent_id,
        ase.session_id,
        coalesce(
          nullif(ase.turn_id, ''),
          nullif(split_part(coalesce(ase.client_event_id, ''), ':', 1), ''),
          ase.id::text
        )
      ) AS turn_key,
      ase.event_type,
      lower(coalesce(ase.payload->>'code', '')) AS error_code
    FROM period_defs p
    JOIN public.agent_session_events ase
      ON (ase.created_at AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
    WHERE ase.event_type IN ('user_message', 'assistant_message', 'error')
  ),
  turn_outcomes AS (
    SELECT
      period,
      turn_key,
      bool_or(event_type = 'error') AS had_error,
      bool_or(event_type = 'error' AND (error_code = 'agent_timeout' OR error_code LIKE '%timeout%')) AS had_timeout
    FROM turn_event_rows
    GROUP BY period, turn_key
  ),
  reliability_stats AS (
    SELECT
      period,
      count(*)::numeric AS turns,
      count(*) FILTER (WHERE had_error)::numeric AS error_turns,
      count(*) FILTER (WHERE had_timeout)::numeric AS timeout_turns
    FROM turn_outcomes
    GROUP BY period
  ),
  assistant_latency_values AS (
    SELECT
      p.period,
      CASE
        WHEN (ase.payload->>'latency_ms') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (ase.payload->>'latency_ms')::numeric
        WHEN (ase.payload->>'duration_ms') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (ase.payload->>'duration_ms')::numeric
        ELSE NULL
      END AS latency_ms
    FROM period_defs p
    JOIN public.agent_session_events ase
      ON (ase.created_at AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
     AND ase.event_type = 'assistant_message'
  ),
  latency_stats AS (
    SELECT
      period,
      count(*)::numeric AS samples,
      (percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms))::numeric AS p50_latency_ms,
      (percentile_cont(0.75) WITHIN GROUP (ORDER BY latency_ms))::numeric AS p75_latency_ms,
      (percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::numeric AS p95_latency_ms,
      (percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms))::numeric AS p99_latency_ms
    FROM assistant_latency_values
    WHERE latency_ms IS NOT NULL
    GROUP BY period
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
      'First AI output rate',
      'percent',
      'Users with a first assistant answer or legacy first_insight_generated event divided by registered users through period end.',
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
    UNION ALL
    SELECT
      'useful_answer_rate',
      'Quality / Trust',
      'P0',
      'Useful answer rate',
      'percent',
      'Positive assistant-answer feedback divided by rated assistant answers.',
      p.period,
      coalesce(af.useful_answers, 0),
      coalesce(af.rated_answers, 0)
    FROM period_defs p
    LEFT JOIN answer_feedback af USING (period)
    UNION ALL
    SELECT
      'thumbs_down_rate',
      'Quality / Trust',
      'P0',
      'Thumbs-down rate',
      'percent',
      'Negative assistant-answer feedback divided by rated assistant answers.',
      p.period,
      coalesce(af.thumbs_down_answers, 0),
      coalesce(af.rated_answers, 0)
    FROM period_defs p
    LEFT JOIN answer_feedback af USING (period)
    UNION ALL
    SELECT
      'error_rate',
      'Quality / Trust',
      'P0',
      'Error rate',
      'percent',
      'Chat turns with an agent runtime error divided by recorded chat turns.',
      p.period,
      coalesce(rs.error_turns, 0),
      coalesce(rs.turns, 0)
    FROM period_defs p
    LEFT JOIN reliability_stats rs USING (period)
    UNION ALL
    SELECT
      'timeout_rate',
      'Quality / Trust',
      'P0',
      'Timeout rate',
      'percent',
      'Chat turns with a timeout error divided by recorded chat turns.',
      p.period,
      coalesce(rs.timeout_turns, 0),
      coalesce(rs.turns, 0)
    FROM period_defs p
    LEFT JOIN reliability_stats rs USING (period)
    UNION ALL
    SELECT
      'p50_latency_ms',
      'Quality / Trust',
      'P1',
      'P50 latency',
      'duration_ms',
      '50th percentile response latency for assistant answers that record latency_ms.',
      p.period,
      coalesce(round(ls.p50_latency_ms, 0), 0),
      coalesce(ls.samples, 0)
    FROM period_defs p
    LEFT JOIN latency_stats ls USING (period)
    UNION ALL
    SELECT
      'p75_latency_ms',
      'Quality / Trust',
      'P1',
      'P75 latency',
      'duration_ms',
      '75th percentile response latency for assistant answers that record latency_ms.',
      p.period,
      coalesce(round(ls.p75_latency_ms, 0), 0),
      coalesce(ls.samples, 0)
    FROM period_defs p
    LEFT JOIN latency_stats ls USING (period)
    UNION ALL
    SELECT
      'p95_latency_ms',
      'Quality / Trust',
      'P1',
      'P95 latency',
      'duration_ms',
      '95th percentile response latency for assistant answers that record latency_ms.',
      p.period,
      coalesce(round(ls.p95_latency_ms, 0), 0),
      coalesce(ls.samples, 0)
    FROM period_defs p
    LEFT JOIN latency_stats ls USING (period)
    UNION ALL
    SELECT
      'p99_latency_ms',
      'Quality / Trust',
      'P1',
      'P99 latency',
      'duration_ms',
      '99th percentile response latency for assistant answers that record latency_ms.',
      p.period,
      coalesce(round(ls.p99_latency_ms, 0), 0),
      coalesce(ls.samples, 0)
    FROM period_defs p
    LEFT JOIN latency_stats ls USING (period)
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
            WHEN format = 'duration_ms' THEN round(numerator, 0)
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

CREATE OR REPLACE FUNCTION public.admin_growth_metrics(days_back integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $function$
  WITH params AS (
    SELECT greatest(1, least(coalesce(days_back, 30), 90))::int AS days
  )
  SELECT public.admin_growth_metrics_range(
    current_date - ((SELECT days FROM params) - 1),
    current_date
  );
$function$;

GRANT EXECUTE ON FUNCTION public.admin_growth_metrics(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_growth_metrics_range(date, date) TO anon, authenticated;
