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
