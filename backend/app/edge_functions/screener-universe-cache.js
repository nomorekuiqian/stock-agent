// Screener Universe Cache - Edge Function
// Stores screener stock universe data with TTL-based expiry.
// Schema: screener_universe_cache (same as macro_data_cache)
//   data_key TEXT PRIMARY KEY, data JSONB, fetched_at TIMESTAMPTZ,
//   expires_at TIMESTAMPTZ, source TEXT, error TEXT
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
  const TABLE = "screener_universe_cache";

  try {
    // GET ?key=xxx - single key lookup
    const key = url.searchParams.get("key");
    if (request.method === "GET" && key) {
      const { data, error } = await client.database
        .from(TABLE)
        .select("*")
        .eq("data_key", key)
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

    // GET ?keys=a,b,c - batch key lookup
    const keys = url.searchParams.get("keys");
    if (request.method === "GET" && keys) {
      const keyList = keys.split(",").map(k => k.trim()).filter(Boolean);
      const { data, error } = await client.database
        .from(TABLE)
        .select("*")
        .in("data_key", keyList);

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

    // GET ?all=true - list all entries (monitoring)
    const all = url.searchParams.get("all");
    if (request.method === "GET" && all === "true") {
      const { data, error } = await client.database
        .from(TABLE)
        .select("data_key, fetched_at, expires_at, source, error")
        .order("data_key");

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

    // POST ?action=upsert - create/update cache entry
    const action = url.searchParams.get("action");
    if (request.method === "POST" && action === "upsert") {
      const body = await request.json();
      const { data_key, data, fetched_at, expires_at, source, error: errorMsg } = body;

      if (!data_key) {
        return new Response(
          JSON.stringify({ success: false, error: "data_key required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const row = {
        data_key,
        data,
        fetched_at,
        expires_at,
        source,
        error: errorMsg || null,
      };

      const { data: result, error: upsertError } = await client.database
        .from(TABLE)
        .upsert(row, { onConflict: "data_key" })
        .select()
        .single();

      if (upsertError) {
        return new Response(
          JSON.stringify({ success: false, error: upsertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
