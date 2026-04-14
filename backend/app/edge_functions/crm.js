// CRM Edge Function - user profiles and interaction tracking
module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    // ── User Profiles ──

    // GET ?action=list_profiles
    if (request.method === "GET" && action === "list_profiles") {
      const { data, error } = await client.database
        .from("user_profiles")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) return err(error.message, 500);
      return ok(data || []);
    }

    // GET ?action=get_profile&user_id=xxx
    if (request.method === "GET" && action === "get_profile") {
      const userId = url.searchParams.get("user_id");
      if (!userId) return err("user_id required");

      const { data, error } = await client.database
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) return err(error.message, 500);
      return ok(data);
    }

    // POST ?action=upsert_profile
    if (request.method === "POST" && action === "upsert_profile") {
      const body = await request.json();
      const { user_id, ...fields } = body;
      if (!user_id) return err("user_id required");

      fields.updated_at = new Date().toISOString();

      const { data, error } = await client.database
        .from("user_profiles")
        .upsert({ user_id, ...fields }, { onConflict: "user_id" })
        .select()
        .single();

      if (error) return err(error.message, 500);
      return ok(data);
    }

    // ── Interactions ──

    // GET ?action=list_interactions&user_id=xxx
    if (request.method === "GET" && action === "list_interactions") {
      const userId = url.searchParams.get("user_id");
      if (!userId) return err("user_id required");

      const { data, error } = await client.database
        .from("interactions")
        .select("*")
        .eq("user_id", userId)
        .order("date", { ascending: false });

      if (error) return err(error.message, 500);
      return ok(data || []);
    }

    // POST ?action=add_interaction
    if (request.method === "POST" && action === "add_interaction") {
      const body = await request.json();
      const { user_id, ...fields } = body;
      if (!user_id) return err("user_id required");

      const { data, error } = await client.database
        .from("interactions")
        .insert({ user_id, ...fields })
        .select()
        .single();

      if (error) return err(error.message, 500);

      // Also update the profile's updated_at
      await client.database
        .from("user_profiles")
        .update({ updated_at: new Date().toISOString() })
        .eq("user_id", user_id);

      return ok(data);
    }

    // POST ?action=update_interaction
    if (request.method === "POST" && action === "update_interaction") {
      const body = await request.json();
      const { id, ...fields } = body;
      if (!id) return err("id required");

      const { data, error } = await client.database
        .from("interactions")
        .update(fields)
        .eq("id", id)
        .select()
        .single();

      if (error) return err(error.message, 500);
      return ok(data);
    }

    // DELETE ?action=delete_interaction&id=xxx
    if (request.method === "DELETE" && action === "delete_interaction") {
      const id = url.searchParams.get("id");
      if (!id) return err("id required");

      const { error } = await client.database
        .from("interactions")
        .delete()
        .eq("id", id);

      if (error) return err(error.message, 500);
      return ok({ deleted: id });
    }

    return err("Invalid action");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 500);
  }
}
