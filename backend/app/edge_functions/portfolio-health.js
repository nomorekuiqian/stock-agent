// Portfolio Health Edge Function
// Handles CRUD on portfolio_health_reports + portfolio_insights for U1-B.
// Schema: see backend/migrations/u1b_health_schema.sql
//
// Actions:
//   POST ?action=save_report  body={user_id, cache_key, ...}       -> insert report row
//   GET  ?action=get_cached&user_id=xxx&cache_key=xxx              -> fetch cached report
//   GET  ?action=get_insights&user_id=xxx                          -> fetch latest insights
//   POST ?action=upsert_insights body={user_id, ...}               -> upsert insights row
//   GET  ?action=check_first&user_id=xxx                           -> check if first report
//
// All requests assume the *backend* has already verified the JWT (Depends(verify_user_token))
// and passes a trusted user_id. This function does NOT re-validate JWT.

module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  const REPORTS = "portfolio_health_reports";
  const INSIGHTS = "portfolio_insights";

  const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers });
  const fail = (status, error) => new Response(JSON.stringify({ success: false, error }), { status, headers });

  try {
    // -------------------------- save_report --------------------------------
    if (request.method === "POST" && action === "save_report") {
      const body = await request.json();
      const user_id = body.user_id;
      if (!user_id) return fail(400, "user_id required");

      const row = {
        user_id,
        cache_key: body.cache_key,
        generated_at: body.generated_at || new Date().toISOString(),
        score_total: body.score_total,
        score_dispersion: body.score_dispersion,
        score_performance: body.score_performance,
        score_macro_fit: body.score_macro_fit,
        score_stability: body.score_stability,
        holdings_snapshot: body.holdings_snapshot || null,
        profile_snapshot: body.profile_snapshot || null,
        diagnosis_markdown: body.diagnosis_markdown || null,
        one_line: body.one_line || null,
        top_risk: body.top_risk || null,
        sector_dna: body.sector_dna || null,
        macro_sensitivity_tag: body.macro_sensitivity_tag || null,
        next_action: body.next_action || null,
      };

      const { data, error } = await client.database
        .from(REPORTS)
        .upsert(row, { onConflict: "user_id,cache_key" })
        .select("id")
        .maybeSingle();

      if (error) return fail(500, error.message);
      return ok(data || {});
    }

    // -------------------------- get_cached ---------------------------------
    if (request.method === "GET" && action === "get_cached") {
      const user_id = url.searchParams.get("user_id");
      const cache_key = url.searchParams.get("cache_key");
      if (!user_id || !cache_key) return fail(400, "user_id and cache_key required");

      const { data, error } = await client.database
        .from(REPORTS)
        .select("*")
        .eq("user_id", user_id)
        .eq("cache_key", cache_key)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return fail(500, error.message);
      return ok(data);
    }

    // -------------------------- get_insights -------------------------------
    if (request.method === "GET" && action === "get_insights") {
      const user_id = url.searchParams.get("user_id");
      if (!user_id) return fail(400, "user_id required");

      const { data, error } = await client.database
        .from(INSIGHTS)
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

      if (error) return fail(500, error.message);
      return ok(data);
    }

    // -------------------------- upsert_insights ----------------------------
    if (request.method === "POST" && action === "upsert_insights") {
      const body = await request.json();
      const user_id = body.user_id;
      if (!user_id) return fail(400, "user_id required");

      const row = {
        user_id,
        health_score: body.health_score,
        one_line: body.one_line || null,
        top_risk: body.top_risk || null,
        sector_dna: body.sector_dna || null,
        macro_sensitivity_tag: body.macro_sensitivity_tag || null,
        next_action: body.next_action || null,
        source_report_id: body.source_report_id || null,
        generated_at: new Date().toISOString(),
      };

      const { data, error } = await client.database
        .from(INSIGHTS)
        .upsert(row, { onConflict: "user_id" })
        .select()
        .maybeSingle();

      if (error) return fail(500, error.message);
      return ok(data);
    }

    // -------------------------- check_first --------------------------------
    if (request.method === "GET" && action === "check_first") {
      const user_id = url.searchParams.get("user_id");
      if (!user_id) return fail(400, "user_id required");

      const { data, error, count } = await client.database
        .from(REPORTS)
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id);

      if (error) return fail(500, error.message);
      return ok({ is_first: (count || 0) === 0 });
    }

    return fail(400, `Unknown action: ${action}`);
  } catch (e) {
    return fail(500, `Exception: ${e.message || String(e)}`);
  }
};
