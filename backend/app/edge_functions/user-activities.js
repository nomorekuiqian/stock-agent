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
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // POST ?action=batch_insert
    if (request.method === "POST" && action === "batch_insert") {
      const body = await request.json();
      const events = body.events || [];

      if (events.length === 0) {
        return new Response(
          JSON.stringify({ success: true, inserted: 0 }),
          { status: 200, headers }
        );
      }

      const rows = events.map((e) => ({
        user_id: e.user_id,
        event_type: e.event_type,
        event_name: e.event_name || "",
        metadata: e.metadata || {},
      }));

      const { error } = await client.database
        .from("user_activities")
        .insert(rows);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers }
        );
      }

      return new Response(
        JSON.stringify({ success: true, inserted: rows.length }),
        { status: 200, headers }
      );
    }

    // GET ?action=user_timeline&user_id=xxx&limit=50
    if (request.method === "GET" && action === "user_timeline") {
      const userId = url.searchParams.get("user_id");
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);

      if (!userId) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id required" }),
          { status: 400, headers }
        );
      }

      const { data, error } = await client.database
        .from("user_activities")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: data || [] }),
        { status: 200, headers }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers }
    );
  }
}
