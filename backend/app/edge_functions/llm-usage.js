module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Internal-Secret",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const expected = Deno.env.get("EDGE_FUNCTION_SECRET");
  const provided = request.headers.get("x-internal-secret") || "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  function clampDays(value) {
    const parsed = parseInt(value || "7", 10);
    return Math.max(1, Math.min(90, isNaN(parsed) ? 7 : parsed));
  }

  function windowParams() {
    const days = clampDays(url.searchParams.get("days"));
    const until = url.searchParams.get("until") || new Date().toISOString();
    const since = url.searchParams.get("since") ||
      new Date(new Date(until).getTime() - days * 86400000).toISOString();
    return { days, since, until };
  }

  async function rpc(name, args) {
    const { data, error } = await client.database.rpc(name, args);
    if (error) return { data: null, error };
    return { data: data || [], error: null };
  }

  try {
    if (request.method === "POST") {
      const body = await request.json();
      const rows = Array.isArray(body) ? body : [body];
      if (rows.length === 0) {
        return new Response(JSON.stringify({ success: true, inserted: 0 }), { status: 200, headers: jsonHeaders });
      }
      const cleaned = rows.map(function (r) {
        return {
          ts: r.ts || new Date().toISOString(),
          feature: r.feature,
          agent_name: r.agent_name,
          model: r.model || null,
          request_id: r.request_id || null,
          invocation_id: r.invocation_id || null,
          metering_version: r.metering_version || null,
          usage_signature: r.usage_signature || null,
          user_id: r.user_id || null,
          user_tier: r.user_tier || null,
          route: r.route || null,
          request_method: r.request_method || null,
          source: r.source || null,
          prompt_tokens: r.prompt_tokens || null,
          output_tokens: r.output_tokens || null,
          cached_tokens: r.cached_tokens || null,
          thoughts_tokens: r.thoughts_tokens || null,
          total_tokens: r.total_tokens || null,
          extra: r.extra || null,
        };
      });
      const { error } = await client.database.from("llm_usage").insert(cleaned);
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: jsonHeaders });
      }
      return new Response(JSON.stringify({ success: true, inserted: cleaned.length }), { status: 200, headers: jsonHeaders });
    }

    if (request.method === "GET" && (action === "summary" || action === "daily")) {
      const { days, since, until } = windowParams();
      const args = { since_ts: since, until_ts: until };
      const mainRpc = action === "daily"
        ? "admin_llm_usage_daily"
        : "admin_llm_usage_summary";
      const [
        mainRes,
        userRes,
        userFeatureRes,
        routeRes,
        reliabilityRes,
        reliableDailyRes,
        reliableUserFeatureRes,
        reliableRouteRes,
      ] = await Promise.all([
        rpc(mainRpc, args),
        rpc("admin_llm_usage_user_summary", args),
        rpc("admin_llm_usage_user_feature_summary", args),
        rpc("admin_llm_usage_route_summary", args),
        rpc("admin_llm_usage_metering_reliability", args),
        rpc("admin_llm_usage_reliable_daily", args),
        rpc("admin_llm_usage_reliable_user_feature_summary", args),
        rpc("admin_llm_usage_reliable_route_summary", args),
      ]);
      const firstError = mainRes.error || userRes.error || userFeatureRes.error || routeRes.error ||
        reliabilityRes.error || reliableDailyRes.error || reliableUserFeatureRes.error || reliableRouteRes.error;
      if (firstError) {
        return new Response(JSON.stringify({ success: false, error: firstError.message }), { status: 500, headers: jsonHeaders });
      }
      function normalizeUsageRows(data) {
        return (data || []).map(function (row) {
          return {
            day: row.day || undefined,
            feature: row.feature,
            model: row.model || null,
            calls: Number(row.calls || 0),
            prompt_tokens: Number(row.prompt_tokens || 0),
            output_tokens: Number(row.output_tokens || 0),
            cached_tokens: Number(row.cached_tokens || 0),
            thoughts_tokens: Number(row.thoughts_tokens || 0),
            total_tokens: Number(row.total_tokens || 0),
          };
        });
      }
      const summary = normalizeUsageRows(mainRes.data);
      const reliableSummary = normalizeUsageRows(reliableDailyRes.data);
      function normalizeSummaryRows(data) {
        return (data || []).map(function (row) {
          return {
            ...row,
            calls: Number(row.calls || 0),
            prompt_tokens: Number(row.prompt_tokens || 0),
            output_tokens: Number(row.output_tokens || 0),
            cached_tokens: Number(row.cached_tokens || 0),
            thoughts_tokens: Number(row.thoughts_tokens || 0),
            total_tokens: Number(row.total_tokens || 0),
          };
        });
      }
      const userSummary = normalizeSummaryRows(userRes.data);
      const userFeatureSummary = normalizeSummaryRows(userFeatureRes.data);
      const routeSummary = normalizeSummaryRows(routeRes.data);
      const reliableUserFeatureSummary = normalizeSummaryRows(reliableUserFeatureRes.data);
      const reliableRouteSummary = normalizeSummaryRows(reliableRouteRes.data);
      const meteringReliability = normalizeSummaryRows(reliabilityRes.data).map(function (row) {
        return {
          ...row,
          metering_version: Number(row.metering_version || 1),
        };
      });
      return new Response(JSON.stringify({
        success: true,
        days: days,
        since: since,
        until: until,
        summary: summary,
        user_summary: userSummary,
        user_feature_summary: userFeatureSummary,
        route_summary: routeSummary,
        metering_reliability: meteringReliability,
        reliable_summary: reliableSummary,
        reliable_user_feature_summary: reliableUserFeatureSummary,
        reliable_route_summary: reliableRouteSummary,
      }), { status: 200, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ success: false, error: "Invalid action" }), { status: 400, headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: jsonHeaders });
  }
};
