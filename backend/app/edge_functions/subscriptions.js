module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Internal-Secret",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // Fetch ALL rows of a query in chunks. PostgREST enforces a server-side
  // db-max-rows cap (1000 here) that .range(0, 49999) CANNOT exceed — a single
  // request is hard-capped at 1000 rows. So we page through in <=1000-row
  // chunks until a short page signals the end. orderCols give a stable,
  // unique-enough ordering so offset paging never skips/duplicates rows across
  // chunk boundaries. makeQuery must return a FRESH builder each call.
  async function fetchAllChunked(makeQuery, orderCols) {
    const PAGE = 1000;
    let all = [];
    let offset = 0;
    // Hard stop well above any realistic user count, in case a short page is
    // never reached (defensive against an unbounded loop).
    for (let guard = 0; guard < 1000; guard++) {
      let q = makeQuery();
      for (const col of (orderCols || [])) {
        q = q.order(col, { ascending: true });
      }
      const { data, error } = await q.range(offset, offset + PAGE - 1);
      if (error) return { data: null, error };
      const rows = data || [];
      all = all.concat(rows);
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    return { data: all, error: null };
  }

  function parseBoundedInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
  }

  function parseTags(url) {
    const repeated = url.searchParams.getAll("tag").filter(Boolean);
    if (repeated.length > 0) return repeated;
    const raw = url.searchParams.get("tags") || "";
    return raw.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  function internalUnauthorized(request) {
    const expectedSecret = Deno.env.get("EDGE_FUNCTION_SECRET");
    if (!expectedSecret) return false;
    return request.headers.get("X-Internal-Secret") !== expectedSecret;
  }

  try {
    // GET ?action=get&user_id=xxx
    if (request.method === "GET" && action === "get") {
      const userId = url.searchParams.get("user_id");
      if (!userId) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=get_detail&user_id=xxx
    // Single-user merge for the admin detail page: the auth.users row
    // (email + name + created_at) and the subscription row, in parallel.
    // Replaces the old path where the detail page ran the full list_all scan
    // (all users + 6 full-table aggregation RPCs, 60s timeout) just to find
    // one user's email. list_all_users is filtered to one row via .eq — it is
    // a plain auth.users SELECT (no aggregation joins), far cheaper than the
    // old path, and carries created_at so free users with no subscription row
    // still show a real 注册时间 (regression fix vs the email-only version).
    if (request.method === "GET" && action === "get_detail") {
      const userId = url.searchParams.get("user_id");
      if (!userId) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const [authRes, subRes] = await Promise.all([
        client.database.rpc("list_all_users").eq("user_id", userId).maybeSingle(),
        client.database.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
      ]);

      if (authRes.error) {
        return new Response(
          JSON.stringify({ success: false, error: authRes.error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (subRes.error) {
        return new Response(
          JSON.stringify({ success: false, error: subRes.error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authUser = authRes.data || {};
      const sub = subRes.data || {};
      const merged = {
        ...sub,
        user_id: userId,
        email: authUser.email || sub.email || null,
        name: authUser.name || null,
        // Fall back to the auth registration time when there is no sub row.
        created_at: sub.created_at || authUser.created_at || null,
      };

      return new Response(
        JSON.stringify({ success: true, data: merged }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=digest_stats&user_id=xxx
    // Personal-digest 30d summary for one user. NOTE: admin_personal_digest_stats
    // is a full-table GROUP BY aggregate filtered client-side by user_id — kept
    // off the SSR path (loaded lazily on email-section expand). .range lifts the
    // 1000-row cap so high-index users aren't silently missed by .find. A proper
    // user_id-predicated RPC is the P1 cleanup.
    if (request.method === "GET" && action === "digest_stats") {
      const userId = url.searchParams.get("user_id");
      if (!userId) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Chunked: the aggregate can exceed the 1000-row cap, which would make
      // .find miss high-index users (count stuck at 0). P1 cleanup = a
      // user_id-predicated RPC so we don't scan the whole aggregate.
      const { data: rows, error: digestErr } =
        await fetchAllChunked(() => client.database.rpc("admin_personal_digest_stats"), ["user_id"]);
      if (digestErr) {
        return new Response(
          JSON.stringify({ success: false, error: digestErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const row = (rows || []).find((r) => r.user_id === userId);
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            count_30d: row ? (Number(row.count_30d) || 0) : 0,
            last_date: row && row.last_date ? String(row.last_date).slice(0, 10) : null,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=list_dashboard&page=1&page_size=50&category=all&tag=m:digest&search=x&sort_key=last_active_at&sort_dir=desc
    // Returns one filtered/sorted page plus global summary and facet counts.
    // The heavy merge/filter work lives in Postgres (admin_dashboard_query)
    // so the admin page does not transfer every user row to FastAPI/React.
    if (request.method === "GET" && action === "list_dashboard") {
      if (internalUnauthorized(request)) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const page = parseBoundedInt(url.searchParams.get("page"), 1, 1, 100000);
      const pageSize = parseBoundedInt(url.searchParams.get("page_size"), 50, 1, 200);
      const category = url.searchParams.get("category") || "all";
      const search = url.searchParams.get("search") || "";
      const sortKey = url.searchParams.get("sort_key") || "last_active_at";
      const sortDir = url.searchParams.get("sort_dir") || "desc";
      const tags = parseTags(url);

      const { data, error } = await client.database.rpc("admin_dashboard_query", {
        page_num: page,
        page_size: pageSize,
        category_filter: category,
        tag_filters: tags,
        search_query: search,
        sort_key: sortKey,
        sort_dir: sortDir,
      });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: data || {} }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=get_by_customer&stripe_customer_id=xxx
    if (request.method === "GET" && action === "get_by_customer") {
      const customerId = url.searchParams.get("stripe_customer_id");
      if (!customerId) {
        return new Response(
          JSON.stringify({ success: false, error: "stripe_customer_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .from("subscriptions")
        .select("*")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=list_entitled&feature=personal_digest_email
    if (request.method === "GET" && action === "list_entitled") {
      const feature = url.searchParams.get("feature");
      if (!feature) {
        return new Response(
          JSON.stringify({ success: false, error: "feature required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Join with auth.users to get email + nickname in one query
      const { data, error } = await client.database
        .rpc("list_entitled_users", { feature_key: feature });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: data || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=list_expired_access_grants&now=ISO
    if (request.method === "GET" && action === "list_expired_access_grants") {
      const nowIso = url.searchParams.get("now") || new Date().toISOString();
      const { data, error } = await client.database
        .from("subscriptions")
        .select("*")
        .not("access_expires_at", "is", null)
        .lte("access_expires_at", nowIso)
        .order("access_expires_at", { ascending: true });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rows = (data || []).filter((row) => row.is_lifetime !== true);
      return new Response(
        JSON.stringify({ success: true, data: rows }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST ?action=upsert
    if (request.method === "POST" && action === "upsert") {
      const body = await request.json();
      const { user_id, ...fields } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      fields.updated_at = new Date().toISOString();

      const { data, error } = await client.database
        .from("subscriptions")
        .upsert(
          { user_id, ...fields },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST ?action=set_lifetime
    // Body: { user_id, is_lifetime: true|false, entitlements?: [...] }
    // Marks a user as lifetime (or revokes). When granting, callers should
    // pass the full max entitlements list so the cached column stays in sync.
    if (request.method === "POST" && action === "set_lifetime") {
      const body = await request.json();
      const { user_id, is_lifetime, entitlements } = body;

      if (!user_id || typeof is_lifetime !== "boolean") {
        return new Response(
          JSON.stringify({ success: false, error: "user_id and is_lifetime (boolean) required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const patch = {
        user_id,
        is_lifetime,
        updated_at: new Date().toISOString(),
      };
      if (is_lifetime) {
        patch.plan = "max";
        patch.status = "active";
        patch.access_expires_at = null;
        if (Array.isArray(entitlements)) patch.entitlements = entitlements;
      }

      const { data, error } = await client.database
        .from("subscriptions")
        .upsert(patch, { onConflict: "user_id" })
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=find_by_referral_code&referral_code=xxx
    if (request.method === "GET" && action === "find_by_referral_code") {
      const referralCode = url.searchParams.get("referral_code");
      if (!referralCode) {
        return new Response(
          JSON.stringify({ success: false, error: "referral_code required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .from("subscriptions")
        .select("user_id")
        .eq("referral_code", referralCode)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=invite_stats
    if (request.method === "GET" && action === "invite_stats") {
      const { count: totalRedeemed, error: e1 } = await client.database
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .not("invite_code", "is", null);

      const { count: totalReferrals, error: e2 } = await client.database
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .not("referred_by", "is", null);

      if (e1 || e2) {
        return new Response(
          JSON.stringify({ success: false, error: e1?.message ?? e2?.message ?? "query failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          total_redeemed: totalRedeemed ?? 0,
          total_referrals: totalReferrals ?? 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST ?action=cancel
    if (request.method === "POST" && action === "cancel") {
      const body = await request.json();
      const { user_id } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .from("subscriptions")
        .update({
          plan: "free",
          status: "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id)
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=check_email&email=xxx
    if (request.method === "GET" && action === "check_email") {
      const email = url.searchParams.get("email");
      if (!email) {
        return new Response(
          JSON.stringify({ success: false, error: "email required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .rpc("check_email_exists", { lookup_email: email });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, exists: !!data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=list_all
    // Returns ALL auth users with subscription + conversation + feedback + activity stats
    if (request.method === "GET" && action === "list_all") {
      // Six independent data sources, fetched concurrently. Each is paged in
      // <=1000-row chunks via fetchAllChunked because PostgREST's db-max-rows
      // server cap (1000) hard-truncates any single request — .range alone
      // cannot exceed it. Without chunking, auth.users >1000 silently dropped
      // high-index users (the literal "only 1000 users" bug) and the per-user
      // GROUP BY aggregations would stale out past 1000 active users.
      // Order columns must be unique-enough per source so offset paging never
      // skips/duplicates across chunk boundaries (activity_stats is
      // user_id×event_type, hence the composite order).
      const [
        authRes, subRes, convRes, feedbackRes, activityRes, digestRes,
      ] = await Promise.all([
        fetchAllChunked(() => client.database.rpc("list_all_users"), ["user_id"]),
        fetchAllChunked(() => client.database.from("subscriptions").select("*"), ["user_id"]),
        fetchAllChunked(() => client.database.rpc("admin_conversation_stats"), ["user_id"]),
        fetchAllChunked(() => client.database.rpc("admin_feedback_stats"), ["email"]),
        fetchAllChunked(() => client.database.rpc("admin_activity_stats"), ["user_id", "event_type"]),
        fetchAllChunked(() => client.database.rpc("admin_personal_digest_stats"), ["user_id"]),
      ]);

      const authUsers = authRes.data;
      if (authRes.error) {
        return new Response(
          JSON.stringify({ success: false, error: authRes.error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const subs = subRes.data;
      if (subRes.error) {
        return new Response(
          JSON.stringify({ success: false, error: subRes.error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Surface aggregation failures instead of silently degrading to 0/empty.
      const aggErr = convRes.error || feedbackRes.error || activityRes.error || digestRes.error;
      if (aggErr) {
        return new Response(
          JSON.stringify({ success: false, error: aggErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const convStats = convRes.data;
      const feedbackStats = feedbackRes.data;
      const activityStats = activityRes.data;
      const digestRows = digestRes.data;

      // Index everything by key
      const subMap = {};
      for (const sub of (subs || [])) {
        subMap[sub.user_id] = sub;
      }

      const digestMap = {};
      for (const row of (digestRows || [])) {
        digestMap[row.user_id] = {
          count_30d: Number(row.count_30d) || 0,
          last_date: row.last_date ? String(row.last_date).slice(0, 10) : null,
        };
      }

      const convMap = {};
      for (const c of (convStats || [])) {
        convMap[c.user_id] = c;
      }

      const feedbackMap = {};
      for (const f of (feedbackStats || [])) {
        feedbackMap[f.email] = f;
      }

      // Activity: group by user_id, flatten event_types into a map
      const activityMap = {};
      for (const a of (activityStats || [])) {
        if (!activityMap[a.user_id]) {
          activityMap[a.user_id] = { total: 0, by_type: {}, last_at: null };
        }
        const entry = activityMap[a.user_id];
        entry.total += parseInt(a.event_count) || 0;
        entry.by_type[a.event_type] = parseInt(a.event_count) || 0;
        if (!entry.last_at || a.last_event_at > entry.last_at) {
          entry.last_at = a.last_event_at;
        }
      }

      // 7. Merge everything per user
      const merged = (authUsers || []).map((u) => {
        const sub = subMap[u.user_id] || {};
        const conv = convMap[u.user_id] || {};
        const fb = feedbackMap[u.email] || {};
        const act = activityMap[u.user_id] || {};
        const digest = digestMap[u.user_id] || { count_30d: 0, last_date: null };

        return {
          user_id: u.user_id,
          email: u.email || null,
          name: u.name || null,
          auth_created_at: u.created_at,
          plan: sub.plan || null,
          status: sub.status || null,
          is_lifetime: sub.is_lifetime || false,
          access_expires_at: sub.access_expires_at || null,
          invite_code: sub.invite_code || null,
          entitlements: sub.entitlements || null,
          stripe_customer_id: sub.stripe_customer_id || null,
          stripe_subscription_id: sub.stripe_subscription_id || null,
          current_period_end: sub.current_period_end || null,
          created_at: sub.created_at || u.created_at,
          updated_at: sub.updated_at || null,
          onboarding_completed_at: sub.onboarding_completed_at || null,
          lifecycle_state: sub.lifecycle_state || {},
          reactivation_state: sub.reactivation_state || null,
          // Activity stats
          conversations: parseInt(conv.conversation_count) || 0,
          messages: parseInt(conv.total_messages) || 0,
          last_conversation_at: conv.last_conversation_at || null,
          feedback_count: parseInt(fb.feedback_count) || 0,
          last_feedback_at: fb.last_feedback_at || null,
          api_calls: act.total || 0,
          api_by_type: act.by_type || {},
          last_active_at: act.last_at || conv.last_conversation_at || fb.last_feedback_at || null,
          // Personal digest aggregates
          personal_digest_count_30d: digest.count_30d,
          personal_digest_last_date: digest.last_date,
        };
      });

      return new Response(
        JSON.stringify({ success: true, data: merged }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=list_trials
    if (request.method === "GET" && action === "list_trials") {
      // Include trials that expired up to 2 days ago so the day-14 email still fires
      const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await client.database
        .from("subscriptions")
        .select("user_id, plan, status, access_expires_at, created_at")
        .gt("access_expires_at", cutoff)
        .order("created_at", { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Enrich with user emails from auth.users
      const enriched = [];
      for (const sub of (data || [])) {
        const { data: userData } = await client.database
          .rpc("get_user_email", { lookup_user_id: sub.user_id });
        enriched.push({
          ...sub,
          email: userData || null,
        });
      }

      return new Response(
        JSON.stringify({ success: true, data: enriched }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=list_user_profiles
    // Returns all auth users with their profile names for Resend backfill
    if (request.method === "GET" && action === "list_user_profiles") {
      const { data, error } = await client.database.rpc("list_all_users");

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const profiles = (data || []).map((u) => ({
        user_id: u.user_id,
        email: u.email || null,
        profile_name: u.name || null,
      }));

      return new Response(
        JSON.stringify({ success: true, data: profiles }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST ?action=update_lifecycle_state
    // Body: { user_id, patch: {...} }
    // Shallow-merges patch into lifecycle_state JSONB (top-level keys replaced; nested objects fully overwritten).
    // Caller is responsible for read-modify-write of nested structures (e.g. onboarding_sent dict).
    if (request.method === "POST" && action === "update_lifecycle_state") {
      const body = await request.json();
      const { user_id, patch } = body;

      if (!user_id || typeof patch !== "object" || patch === null) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id and patch (object) required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: current, error: getErr } = await client.database
        .from("subscriptions")
        .select("lifecycle_state")
        .eq("user_id", user_id)
        .maybeSingle();

      if (getErr) {
        return new Response(
          JSON.stringify({ success: false, error: getErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const merged = { ...(current?.lifecycle_state || {}), ...patch };

      const { data, error } = await client.database
        .from("subscriptions")
        .upsert(
          { user_id, lifecycle_state: merged, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        )
        .select("user_id, lifecycle_state")
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
