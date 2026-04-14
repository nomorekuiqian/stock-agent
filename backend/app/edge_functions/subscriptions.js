// No import needed - createClient is injected by the Insforge worker template
module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
      // 1. Get all auth users via RPC
      const { data: authUsers, error: authError } = await client.database
        .rpc("list_all_users");

      if (authError) {
        return new Response(
          JSON.stringify({ success: false, error: authError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Get all subscriptions
      const { data: subs, error: subError } = await client.database
        .from("subscriptions")
        .select("*");

      if (subError) {
        return new Response(
          JSON.stringify({ success: false, error: subError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Get conversation stats via RPC
      const { data: convStats } = await client.database
        .rpc("admin_conversation_stats");

      // 4. Get feedback stats via RPC
      const { data: feedbackStats } = await client.database
        .rpc("admin_feedback_stats");

      // 5. Get activity stats via RPC
      const { data: activityStats } = await client.database
        .rpc("admin_activity_stats");

      // Index everything by key
      const subMap = {};
      for (const sub of (subs || [])) {
        subMap[sub.user_id] = sub;
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

      // 6. Merge everything per user
      const merged = (authUsers || []).map((u) => {
        const sub = subMap[u.user_id] || {};
        const conv = convMap[u.user_id] || {};
        const fb = feedbackMap[u.email] || {};
        const act = activityMap[u.user_id] || {};

        return {
          user_id: u.user_id,
          email: u.email || null,
          name: u.name || null,
          auth_created_at: u.created_at,
          plan: sub.plan || null,
          status: sub.status || null,
          access_expires_at: sub.access_expires_at || null,
          invite_code: sub.invite_code || null,
          entitlements: sub.entitlements || null,
          stripe_customer_id: sub.stripe_customer_id || null,
          stripe_subscription_id: sub.stripe_subscription_id || null,
          current_period_end: sub.current_period_end || null,
          created_at: sub.created_at || u.created_at,
          updated_at: sub.updated_at || null,
          // Activity stats
          conversations: parseInt(conv.conversation_count) || 0,
          messages: parseInt(conv.total_messages) || 0,
          last_conversation_at: conv.last_conversation_at || null,
          feedback_count: parseInt(fb.feedback_count) || 0,
          last_feedback_at: fb.last_feedback_at || null,
          api_calls: act.total || 0,
          api_by_type: act.by_type || {},
          last_active_at: act.last_at || conv.last_conversation_at || fb.last_feedback_at || null,
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
