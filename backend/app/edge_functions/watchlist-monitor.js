// Watchlist Monitor Edge Function
// Handles shared ticker daily briefs for the V0 monitor.
// Schema: backend/migrations/watchlist_monitor_v0_schema.sql
//
// Actions:
//   POST ?action=upsert_brief body={symbol, brief_date, ...}
//   GET  ?action=latest_briefs&symbols=AAPL,NVDA
//
// All requests assume the Python backend has already verified auth and passes
// the internal secret. This function does NOT validate user JWTs.

module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Internal-Secret",
  };
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("EDGE_FUNCTION_SECRET");
  if (expectedSecret) {
    const provided = request.headers.get("X-Internal-Secret");
    if (provided !== expectedSecret) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 403, headers });
    }
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const TABLE = "ticker_daily_briefs";
  const SYMBOL_RE = /^[A-Z0-9.\-^=]{1,12}$/;

  const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers });
  const fail = (status, error) => new Response(JSON.stringify({ success: false, error }), { status, headers });

  function parseSymbols(raw) {
    return String(raw || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => SYMBOL_RE.test(s))
      .slice(0, 50);
  }

  function latestBySymbol(rows) {
    const result = {};
    for (const row of rows || []) {
      const symbol = row.symbol;
      if (!symbol || result[symbol]) continue;
      result[symbol] = row;
    }
    return result;
  }

  try {
    if (request.method === "POST" && action === "upsert_brief") {
      const body = await request.json();
      const symbol = String(body.symbol || "").trim().toUpperCase();
      const briefDate = body.brief_date;
      if (!SYMBOL_RE.test(symbol)) return fail(400, "valid symbol required");
      if (!briefDate) return fail(400, "brief_date required");

      const row = {
        symbol,
        brief_date: briefDate,
        model_version: body.model_version || "watchlist-monitor-v0",
        status: body.status || "stale",
        headline: body.headline || "",
        ai_take: body.ai_take || "",
        news_summary: body.news_summary || "",
        technical_monitor: body.technical_monitor && typeof body.technical_monitor === "object" ? body.technical_monitor : {},
        priority_score: body.priority_score ?? 0,
        signals: Array.isArray(body.signals) ? body.signals : [],
        watchpoints: Array.isArray(body.watchpoints) ? body.watchpoints : [],
        event_candidates: Array.isArray(body.event_candidates) ? body.event_candidates : [],
        source_refs: Array.isArray(body.source_refs) ? body.source_refs : [],
        generated_at: body.generated_at || new Date().toISOString(),
      };

      const { data, error } = await client.database
        .from(TABLE)
        .upsert(row, { onConflict: "symbol,brief_date,model_version" })
        .select()
        .maybeSingle();

      if (error) return fail(500, error.message);
      return ok(data || row);
    }

    if (request.method === "GET" && action === "latest_briefs") {
      const symbols = parseSymbols(url.searchParams.get("symbols"));
      if (symbols.length === 0) return ok({});

      const { data, error } = await client.database
        .from(TABLE)
        .select("*")
        .filter("symbol", "in", `(${symbols.join(",")})`)
        .order("brief_date", { ascending: false })
        .order("generated_at", { ascending: false })
        .limit(symbols.length * 5);

      if (error) return fail(500, error.message);
      return ok(latestBySymbol(data || []));
    }

    return fail(400, `Unknown action: ${action}`);
  } catch (e) {
    return fail(500, `Exception: ${e.message || String(e)}`);
  }
};
