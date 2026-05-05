// User Holdings - Edge Function
// Read-only access to user_watchlists + user_portfolios for admin views.
// No RLS check — admin endpoints are gated server-side.
module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("user_id");

  function ok(data) {
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: jsonHeaders });
  }
  function err(message, status = 400) {
    return new Response(JSON.stringify({ success: false, error: message }), { status, headers: jsonHeaders });
  }

  if (request.method !== "GET" || !userId) {
    return err("GET with user_id required");
  }

  try {
    // GET ?action=get_watchlist&user_id=xxx
    if (action === "get_watchlist") {
      const { data, error } = await client.database
        .from("user_watchlists")
        .select("symbols, preferences, updated_at, email")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return err(error.message, 500);
      return ok(data);
    }

    // GET ?action=get_portfolio&user_id=xxx
    if (action === "get_portfolio") {
      const { data, error } = await client.database
        .from("user_portfolios")
        .select("symbol, shares, cost_basis, entry_price, target, stop_loss, conviction, thesis, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) return err(error.message, 500);
      return ok(data || []);
    }

    return err("Invalid action; use get_watchlist or get_portfolio");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 500);
  }
}
