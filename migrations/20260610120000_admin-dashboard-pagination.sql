CREATE INDEX IF NOT EXISTS idx_user_feedback_lower_email_created_at
  ON public.user_feedback (lower(email), created_at DESC)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_access_requests_lower_email_created_at
  ON public.access_requests (lower(email), created_at DESC)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_activities_user_type_created_at
  ON public.user_activities (user_id, event_type, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_dashboard_query(
  page_num integer DEFAULT 1,
  page_size integer DEFAULT 50,
  category_filter text DEFAULT 'all',
  tag_filters jsonb DEFAULT '[]'::jsonb,
  search_query text DEFAULT '',
  sort_key text DEFAULT 'last_active_at',
  sort_dir text DEFAULT 'desc'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $function$
  WITH params AS (
    SELECT
      greatest(1, coalesce(page_num, 1))::int AS page_num,
      greatest(1, least(coalesce(page_size, 50), 200))::int AS page_size,
      coalesce(nullif(category_filter, ''), 'all') AS category_filter,
      CASE
        WHEN jsonb_typeof(coalesce(tag_filters, '[]'::jsonb)) = 'array' THEN coalesce(tag_filters, '[]'::jsonb)
        ELSE '[]'::jsonb
      END AS tag_filters,
      lower(trim(coalesce(search_query, ''))) AS search_query,
      CASE
        WHEN sort_key IN ('email', 'conversations', 'messages', 'feedback_count', 'api_calls', 'last_active_at', 'created_at')
          THEN sort_key
        ELSE 'last_active_at'
      END AS sort_key,
      CASE WHEN lower(coalesce(sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END AS sort_dir,
      now() AS now_at
  ),
  auth_users AS (
    SELECT
      user_id::text AS user_id,
      email,
      name,
      created_at AS auth_created_at
    FROM public.list_all_users()
  ),
  conversation_stats AS (
    SELECT
      user_id,
      conversation_count,
      total_messages,
      last_conversation_at
    FROM public.admin_conversation_stats()
  ),
  email_feedback_stats AS (
    SELECT
      email,
      feedback_count,
      last_feedback_at
    FROM public.admin_feedback_stats()
  ),
  activity_stats AS (
    SELECT
      user_id,
      coalesce(sum(event_count), 0)::bigint AS api_calls,
      coalesce(jsonb_object_agg(event_type, event_count), '{}'::jsonb) AS api_by_type,
      max(last_event_at) AS last_activity_at
    FROM public.admin_activity_stats()
    GROUP BY user_id
  ),
  digest_stats AS (
    SELECT
      user_id,
      count_30d,
      last_date
    FROM public.admin_personal_digest_stats()
  ),
  contact_feedback AS (
    SELECT
      lower(email) AS email_key,
      count(*)::bigint AS contact_feedback_count,
      (array_agg(rating ORDER BY created_at DESC))[1] AS contact_feedback_rating
    FROM public.user_feedback
    WHERE email IS NOT NULL
    GROUP BY lower(email)
  ),
  questionnaires AS (
    SELECT DISTINCT ON (lower(email))
      lower(email) AS email_key,
      background,
      created_at
    FROM public.access_requests
    WHERE email IS NOT NULL
    ORDER BY lower(email), created_at DESC
  ),
  merged AS (
    SELECT
      au.user_id,
      au.email,
      au.name,
      s.plan,
      s.status,
      CASE
        WHEN s.plan IN ('pro', 'max')
          AND s.status = 'active'
          AND s.access_expires_at IS NULL
          THEN 'paid'
        WHEN s.access_expires_at IS NOT NULL
          AND s.access_expires_at > p.now_at
          AND s.access_expires_at <= p.now_at + interval '3 days'
          THEN 'expiring_soon'
        WHEN s.access_expires_at IS NOT NULL
          AND s.access_expires_at > p.now_at
          THEN 'active_trial'
        WHEN s.access_expires_at IS NOT NULL
          THEN 'trial_expired'
        ELSE 'never_trialed'
      END AS category,
      s.access_expires_at,
      s.invite_code,
      s.entitlements,
      au.auth_created_at,
      s.stripe_customer_id,
      s.stripe_subscription_id,
      s.current_period_end,
      coalesce(s.created_at, au.auth_created_at) AS created_at,
      s.updated_at,
      coalesce(cs.conversation_count, 0)::bigint AS conversations,
      coalesce(cs.total_messages, 0)::bigint AS messages,
      cs.last_conversation_at,
      coalesce(efs.feedback_count, 0)::bigint AS feedback_count,
      efs.last_feedback_at,
      coalesce(ast.api_calls, 0)::bigint AS api_calls,
      coalesce(ast.api_by_type, '{}'::jsonb) AS api_by_type,
      greatest(ast.last_activity_at, cs.last_conversation_at, efs.last_feedback_at) AS last_active_at,
      up.ops_status,
      up.priority AS ops_priority,
      up.name AS ops_name,
      up.next_followup AS ops_next_followup,
      coalesce(cf.contact_feedback_count, 0)::bigint AS contact_feedback_count,
      cf.contact_feedback_rating,
      (q.email_key IS NOT NULL) AS has_questionnaire,
      q.background AS questionnaire_background,
      coalesce(ds.count_30d, 0)::bigint AS personal_digest_count_30d,
      ds.last_date AS personal_digest_last_date,
      (coalesce(s.entitlements, '[]'::jsonb) ? 'personal_digest_email') AS personal_digest_subscribed
    FROM auth_users au
    CROSS JOIN params p
    LEFT JOIN public.subscriptions s ON s.user_id::text = au.user_id
    LEFT JOIN conversation_stats cs ON cs.user_id = au.user_id
    LEFT JOIN email_feedback_stats efs ON lower(efs.email) = lower(au.email)
    LEFT JOIN activity_stats ast ON ast.user_id = au.user_id
    LEFT JOIN digest_stats ds ON ds.user_id = au.user_id
    LEFT JOIN public.user_profiles up ON up.user_id::text = au.user_id
    LEFT JOIN contact_feedback cf ON cf.email_key = lower(au.email)
    LEFT JOIN questionnaires q ON q.email_key = lower(au.email)
  ),
  filtered AS (
    SELECT m.*
    FROM merged m
    CROSS JOIN params p
    WHERE (p.category_filter = 'all' OR m.category = p.category_filter)
      AND (
        p.search_query = ''
        OR lower(coalesce(m.email, '')) LIKE '%' || p.search_query || '%'
        OR lower(coalesce(m.name, '')) LIKE '%' || p.search_query || '%'
        OR lower(m.user_id) LIKE '%' || p.search_query || '%'
        OR lower(coalesce(m.invite_code, '')) LIKE '%' || p.search_query || '%'
      )
      AND (
        NOT (p.tag_filters ?| array['m:digest', 'm:no_digest', 'm:morning', 'm:weekly'])
        OR (p.tag_filters ? 'm:digest' AND m.personal_digest_subscribed)
        OR (p.tag_filters ? 'm:no_digest' AND NOT m.personal_digest_subscribed)
        OR (p.tag_filters ? 'm:morning' AND coalesce(m.entitlements, '[]'::jsonb) ? 'morning_report_email')
        OR (p.tag_filters ? 'm:weekly' AND coalesce(m.entitlements, '[]'::jsonb) ? 'weekly_report_email')
      )
      AND (
        NOT (p.tag_filters ?| array['e:conv', 'e:email_fb', 'e:api', 'e:none'])
        OR (p.tag_filters ? 'e:conv' AND m.conversations > 0)
        OR (p.tag_filters ? 'e:email_fb' AND m.feedback_count > 0)
        OR (p.tag_filters ? 'e:api' AND m.api_calls > 0)
        OR (p.tag_filters ? 'e:none' AND m.conversations = 0 AND m.feedback_count = 0 AND m.api_calls = 0)
      )
      AND (
        NOT (p.tag_filters ?| array['f:quest', 'f:contact'])
        OR (p.tag_filters ? 'f:quest' AND m.has_questionnaire)
        OR (p.tag_filters ? 'f:contact' AND m.contact_feedback_count > 0)
      )
      AND (
        NOT (p.tag_filters ?| array['o:待联系', 'o:已联系', 'o:跟进中', 'o:已反馈', 'o:活跃', 'o:流失'])
        OR (p.tag_filters ? 'o:待联系' AND coalesce(m.ops_status, '待联系') = '待联系')
        OR (p.tag_filters ? 'o:已联系' AND m.ops_status = '已联系')
        OR (p.tag_filters ? 'o:跟进中' AND m.ops_status = '跟进中')
        OR (p.tag_filters ? 'o:已反馈' AND m.ops_status = '已反馈')
        OR (p.tag_filters ? 'o:活跃' AND m.ops_status = '活跃')
        OR (p.tag_filters ? 'o:流失' AND m.ops_status = '流失')
      )
  ),
  ranked AS (
    SELECT
      f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN p.sort_key = 'email' AND p.sort_dir = 'asc' THEN f.email END ASC NULLS LAST,
          CASE WHEN p.sort_key = 'email' AND p.sort_dir = 'desc' THEN f.email END DESC NULLS LAST,
          CASE WHEN p.sort_key = 'conversations' AND p.sort_dir = 'asc' THEN f.conversations END ASC NULLS LAST,
          CASE WHEN p.sort_key = 'conversations' AND p.sort_dir = 'desc' THEN f.conversations END DESC NULLS LAST,
          CASE WHEN p.sort_key = 'messages' AND p.sort_dir = 'asc' THEN f.messages END ASC NULLS LAST,
          CASE WHEN p.sort_key = 'messages' AND p.sort_dir = 'desc' THEN f.messages END DESC NULLS LAST,
          CASE WHEN p.sort_key = 'feedback_count' AND p.sort_dir = 'asc' THEN f.feedback_count END ASC NULLS LAST,
          CASE WHEN p.sort_key = 'feedback_count' AND p.sort_dir = 'desc' THEN f.feedback_count END DESC NULLS LAST,
          CASE WHEN p.sort_key = 'api_calls' AND p.sort_dir = 'asc' THEN f.api_calls END ASC NULLS LAST,
          CASE WHEN p.sort_key = 'api_calls' AND p.sort_dir = 'desc' THEN f.api_calls END DESC NULLS LAST,
          CASE WHEN p.sort_key = 'last_active_at' AND p.sort_dir = 'asc' THEN f.last_active_at END ASC NULLS LAST,
          CASE WHEN p.sort_key = 'last_active_at' AND p.sort_dir = 'desc' THEN f.last_active_at END DESC NULLS LAST,
          CASE WHEN p.sort_key = 'created_at' AND p.sort_dir = 'asc' THEN f.created_at END ASC NULLS LAST,
          CASE WHEN p.sort_key = 'created_at' AND p.sort_dir = 'desc' THEN f.created_at END DESC NULLS LAST,
          f.user_id ASC
      ) AS _rn
    FROM filtered f
    CROSS JOIN params p
  ),
  page_rows AS (
    SELECT r.*
    FROM ranked r
    CROSS JOIN params p
    WHERE r._rn > ((p.page_num - 1) * p.page_size)
      AND r._rn <= (p.page_num * p.page_size)
  ),
  summary AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE category = 'paid')::int AS paid,
      count(*) FILTER (WHERE category = 'active_trial')::int AS active_trial,
      count(*) FILTER (WHERE category = 'expiring_soon')::int AS expiring_soon,
      count(*) FILTER (WHERE category = 'trial_expired')::int AS trial_expired,
      count(*) FILTER (WHERE category = 'never_trialed')::int AS never_trialed
    FROM merged
  ),
  engagement AS (
    SELECT
      count(*) FILTER (WHERE conversations > 0)::int AS with_conversations,
      count(*) FILTER (WHERE feedback_count > 0)::int AS with_feedback,
      coalesce(sum(conversations), 0)::int AS total_conversations,
      coalesce(sum(messages), 0)::int AS total_messages,
      count(*) FILTER (WHERE personal_digest_subscribed)::int AS personal_digest_subscribers
    FROM merged
  ),
  chip_counts AS (
    SELECT jsonb_build_object(
      'm:digest', count(*) FILTER (WHERE personal_digest_subscribed),
      'm:no_digest', count(*) FILTER (WHERE NOT personal_digest_subscribed),
      'm:morning', count(*) FILTER (WHERE coalesce(entitlements, '[]'::jsonb) ? 'morning_report_email'),
      'm:weekly', count(*) FILTER (WHERE coalesce(entitlements, '[]'::jsonb) ? 'weekly_report_email'),
      'e:conv', count(*) FILTER (WHERE conversations > 0),
      'e:email_fb', count(*) FILTER (WHERE feedback_count > 0),
      'e:api', count(*) FILTER (WHERE api_calls > 0),
      'e:none', count(*) FILTER (WHERE conversations = 0 AND feedback_count = 0 AND api_calls = 0),
      'f:quest', count(*) FILTER (WHERE has_questionnaire),
      'f:contact', count(*) FILTER (WHERE contact_feedback_count > 0),
      'o:待联系', count(*) FILTER (WHERE coalesce(ops_status, '待联系') = '待联系'),
      'o:已联系', count(*) FILTER (WHERE ops_status = '已联系'),
      'o:跟进中', count(*) FILTER (WHERE ops_status = '跟进中'),
      'o:已反馈', count(*) FILTER (WHERE ops_status = '已反馈'),
      'o:活跃', count(*) FILTER (WHERE ops_status = '活跃'),
      'o:流失', count(*) FILTER (WHERE ops_status = '流失')
    ) AS value
    FROM merged
  ),
  filtered_count AS (
    SELECT count(*)::int AS total
    FROM filtered
  )
  SELECT jsonb_build_object(
    'summary', (SELECT to_jsonb(summary) FROM summary),
    'engagement', (SELECT to_jsonb(engagement) FROM engagement),
    'chip_counts', (SELECT value FROM chip_counts),
    'pagination', jsonb_build_object(
      'page', (SELECT page_num FROM params),
      'page_size', (SELECT page_size FROM params),
      'total', (SELECT total FROM filtered_count),
      'total_pages', greatest(
        1,
        ceil((SELECT total FROM filtered_count)::numeric / (SELECT page_size FROM params))::int
      )
    ),
    'users', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(page_rows) - '_rn' ORDER BY page_rows._rn)
        FROM page_rows
      ),
      '[]'::jsonb
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_query(integer, integer, text, jsonb, text, text, text)
  TO anon, authenticated;
