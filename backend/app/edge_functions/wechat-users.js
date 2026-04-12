// Edge function: wechat-users
// POST ?action=upsert — create or update wechat user by openid
// GET  ?action=get_by_openid&openid=xxx — lookup by openid
// POST ?action=bind — bind openid to insforge user_id

module.exports = async function (request) {
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

  try {
    // POST ?action=upsert
    if (request.method === "POST" && action === "upsert") {
      const { openid, session_key, nickname, avatar_url } = await request.json();

      if (!openid) {
        return new Response(
          JSON.stringify({ success: false, error: "openid required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .from("wechat_users")
        .upsert(
          {
            openid,
            session_key: session_key || null,
            nickname: nickname || null,
            avatar_url: avatar_url || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "openid" }
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

    // GET ?action=get_by_openid&openid=xxx
    if (request.method === "GET" && action === "get_by_openid") {
      const openid = url.searchParams.get("openid");

      const { data, error } = await client.database
        .from("wechat_users")
        .select("*")
        .eq("openid", openid)
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

    // POST ?action=bind
    if (request.method === "POST" && action === "bind") {
      const { openid, user_id } = await request.json();

      if (!openid || !user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "openid and user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .from("wechat_users")
        .update({ user_id, updated_at: new Date().toISOString() })
        .eq("openid", openid)
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
      JSON.stringify({ success: false, error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};
