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

  // Convenience helper
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // POST ?action=upsert
    if (request.method === "POST" && action === "upsert") {
      const { openid, session_key, nickname, avatar_url } = await request.json();

      if (!openid) {
        return json({ success: false, error: "openid required" }, 400);
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
        return json({ success: false, error: error.message }, 500);
      }

      return json({ success: true, data });
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
        return json({ success: false, error: error.message }, 500);
      }

      return json({ success: true, data });
    }

    // POST ?action=bind
    if (request.method === "POST" && action === "bind") {
      const { openid, user_id } = await request.json();

      if (!openid || !user_id) {
        return json({ success: false, error: "openid and user_id required" }, 400);
      }

      const { data, error } = await client.database
        .from("wechat_users")
        .update({ user_id, updated_at: new Date().toISOString() })
        .eq("openid", openid)
        .select()
        .single();

      if (error) {
        return json({ success: false, error: error.message }, 500);
      }

      return json({ success: true, data });
    }

    // POST ?action=update_email_verified
    // Body: { openid, email }
    if (request.method === "POST" && action === "update_email_verified") {
      const { openid, email } = await request.json();
      if (!openid || !email) {
        return json({ success: false, error: "openid and email required" }, 400);
      }
      const { data, error } = await client.database
        .from("wechat_users")
        .update({
          email,
          email_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("openid", openid)
        .select()
        .single();
      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true, data });
    }

    // POST ?action=bind_insforge_user
    // Body: { openid, insforge_user_id }
    if (request.method === "POST" && action === "bind_insforge_user") {
      const { openid, insforge_user_id } = await request.json();
      if (!openid || !insforge_user_id) {
        return json({ success: false, error: "openid and insforge_user_id required" }, 400);
      }
      const { data, error } = await client.database
        .from("wechat_users")
        .update({
          insforge_user_id,
          bound_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("openid", openid)
        .select()
        .single();
      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true, data });
    }

    return json({ success: false, error: "Unknown action" }, 400);
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
};
