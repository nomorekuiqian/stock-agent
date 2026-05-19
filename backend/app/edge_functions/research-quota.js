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
    // GET ?action=get_usage&identifier=xxx&usage_date=2026-04-19
    if (request.method === "GET" && action === "get_usage") {
      const identifier = url.searchParams.get("identifier");
      const usageDate = url.searchParams.get("usage_date");

      if (!identifier || !usageDate) {
        return new Response(
          JSON.stringify({ success: false, error: "identifier and usage_date required" }),
          { status: 400, headers }
        );
      }

      const { data, error } = await client.database
        .from("research_quota")
        .select("*")
        .eq("identifier", identifier)
        .eq("usage_date", usageDate)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: data || { identifier, usage_date: usageDate, count: 0 } }),
        { status: 200, headers }
      );
    }

    // POST ?action=increment&identifier=xxx&identifier_type=user&usage_date=2026-04-19
    if (request.method === "POST" && action === "increment") {
      const body = await request.json();
      const identifier = body.identifier;
      const identifierType = body.identifier_type || "user";
      const usageDate = body.usage_date;

      if (!identifier || !usageDate) {
        return new Response(
          JSON.stringify({ success: false, error: "identifier and usage_date required" }),
          { status: 400, headers }
        );
      }

      // Try to get existing row
      const { data: existing } = await client.database
        .from("research_quota")
        .select("*")
        .eq("identifier", identifier)
        .eq("usage_date", usageDate)
        .maybeSingle();

      let newCount;
      if (existing) {
        // Update count
        newCount = (existing.count || 0) + 1;
        const { error } = await client.database
          .from("research_quota")
          .update({ count: newCount, updated_at: new Date().toISOString() })
          .eq("id", existing.id);

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers }
          );
        }
      } else {
        // Insert new row
        newCount = 1;
        const { error } = await client.database
          .from("research_quota")
          .insert({
            identifier,
            identifier_type: identifierType,
            usage_date: usageDate,
            count: 1,
          });

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers }
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true, count: newCount }),
        { status: 200, headers }
      );
    }

    // POST ?action=consume_if_under_limit — ATOMIC consume (Codex M2 [high]
    // fix). Wraps the SQL function which does pg_advisory_xact_lock +
    // UPSERT + UPDATE in a single transaction, returning (consumed, count,
    // lim). Replaces the raceable get_usage → increment two-step.
    if (request.method === "POST" && action === "consume_if_under_limit") {
      const body = await request.json();
      const identifier = body.identifier;
      const identifierType = body.identifier_type || "user";
      const usageDate = body.usage_date;
      const limit = body.limit;

      if (!identifier || !usageDate || !limit) {
        return new Response(
          JSON.stringify({ success: false, error: "identifier, usage_date, limit required" }),
          { status: 400, headers }
        );
      }
      const limitInt = Number.parseInt(limit, 10);
      if (!Number.isFinite(limitInt) || limitInt <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "limit must be a positive integer" }),
          { status: 400, headers }
        );
      }

      const { data, error } = await client.database.rpc(
        "consume_research_quota_if_under_limit",
        {
          p_identifier: identifier,
          p_identifier_type: identifierType,
          p_usage_date: usageDate,
          p_limit: limitInt,
        }
      );
      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers }
        );
      }
      // PostgREST returns SETOF as an array; first row carries the result.
      const row = Array.isArray(data) ? data[0] : data;
      return new Response(
        JSON.stringify({ success: true, data: row || { consumed: false, count: 0, lim: limitInt } }),
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
