// No import needed - createClient is injected by the Insforge worker template
module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  function ok(data) {
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: jsonHeaders });
  }
  function err(message, status = 400) {
    return new Response(JSON.stringify({ success: false, error: message }), { status, headers: jsonHeaders });
  }

  try {
    // GET ?action=list&user_id=xxx  (existing — per-user read)
    if (request.method === "GET" && action === "list") {
      const userId = url.searchParams.get("user_id");
      if (!userId) return err("user_id required");

      const { data, error } = await client.database
        .from("feature_flags")
        .select("flag")
        .eq("user_id", userId)
        .eq("enabled", true);

      if (error) return err(error.message, 500);
      return ok((data || []).map((row) => row.flag));
    }

    // GET ?action=check&user_id=xxx&flag=name  (existing — single flag check)
    if (request.method === "GET" && action === "check") {
      const userId = url.searchParams.get("user_id");
      const flag = url.searchParams.get("flag");
      if (!userId || !flag) return err("user_id and flag required");

      const { data, error } = await client.database
        .from("feature_flags")
        .select("enabled")
        .eq("user_id", userId)
        .eq("flag", flag)
        .maybeSingle();

      if (error) return err(error.message, 500);
      return ok({ enabled: data ? data.enabled === true : false });
    }

    // GET ?action=list_all[&flag=xxx]  (new — admin enumeration)
    if (request.method === "GET" && action === "list_all") {
      const flag = url.searchParams.get("flag");
      let query = client.database
        .from("feature_flags")
        .select("user_id, flag, enabled, created_at")
        .eq("enabled", true);
      if (flag) query = query.eq("flag", flag);
      const { data, error } = await query;
      if (error) return err(error.message, 500);
      return ok(data || []);
    }

    // POST ?action=upsert  body {user_id, flag, enabled?}
    if (request.method === "POST" && action === "upsert") {
      const body = await request.json();
      const { user_id, flag, enabled = true } = body || {};
      if (!user_id || !flag) return err("user_id and flag required");

      const { data, error } = await client.database
        .from("feature_flags")
        .upsert(
          { user_id, flag, enabled },
          { onConflict: "user_id,flag" }
        )
        .select()
        .single();

      if (error) return err(error.message, 500);
      return ok(data);
    }

    // DELETE ?action=delete&user_id=xxx&flag=xxx
    if (request.method === "DELETE" && action === "delete") {
      const userId = url.searchParams.get("user_id");
      const flag = url.searchParams.get("flag");
      if (!userId || !flag) return err("user_id and flag required");

      const { error } = await client.database
        .from("feature_flags")
        .delete()
        .eq("user_id", userId)
        .eq("flag", flag);

      if (error) return err(error.message, 500);
      return ok({ deleted: { user_id: userId, flag } });
    }

    return err("Invalid action");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 500);
  }
}
