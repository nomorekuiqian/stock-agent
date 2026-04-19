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
