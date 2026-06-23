module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Internal-Secret",
  };
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("EDGE_FUNCTION_SECRET");
  if (expectedSecret) {
    const providedSecret = request.headers.get("X-Internal-Secret");
    if (providedSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: jsonHeaders }
      );
    }
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "daily";

  if (request.method !== "GET" || action !== "daily") {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid request. Use GET ?action=daily" }),
      { status: 400, headers: jsonHeaders }
    );
  }

  const rawDays = Number.parseInt(url.searchParams.get("days") || "30", 10);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 30;
  const includeGrowth = url.searchParams.get("include_growth") !== "false";
  const growthStart = url.searchParams.get("growth_start") || "";
  const growthEnd = url.searchParams.get("growth_end") || "";
  const hasGrowthRange = Boolean(growthStart && growthEnd);

  let activityResult;
  let growthResult = { data: null, error: null };
  if (includeGrowth) {
    const growthRpc = hasGrowthRange
      ? client.database.rpc("admin_growth_metrics_range", {
          start_date: growthStart,
          end_date: growthEnd,
        })
      : client.database.rpc("admin_growth_metrics", { days_back: days });
    [activityResult, growthResult] = await Promise.all([
      client.database.rpc("admin_daily_activity", { days_back: days }),
      growthRpc,
    ]);
  } else {
    activityResult = await client.database.rpc("admin_daily_activity", { days_back: days });
  }

  if (activityResult.error) {
    return new Response(
      JSON.stringify({ success: false, error: activityResult.error.message }),
      { status: 500, headers: jsonHeaders }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      days,
      data: activityResult.data || [],
      growth_metrics: includeGrowth && growthResult.error ? null : growthResult.data,
      growth_metrics_error: includeGrowth && growthResult.error ? growthResult.error.message : null,
    }),
    { status: 200, headers: jsonHeaders }
  );
};
