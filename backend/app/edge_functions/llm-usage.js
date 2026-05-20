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

    if (request.method === "GET" && action === "summary") {
      const daysRaw = parseInt(url.searchParams.get("days") || "7", 10);
      const days = Math.max(1, Math.min(90, isNaN(daysRaw) ? 7 : daysRaw));
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await client.database
        .from("llm_usage")
        .select("feature, model, prompt_tokens, output_tokens, total_tokens")
        .gte("ts", since);
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: jsonHeaders });
      }
      const buckets = new Map();
      const rowsData = data || [];
      for (let i = 0; i < rowsData.length; i++) {
        const row = rowsData[i];
        const key = (row.feature || "") + "|" + (row.model || "");
        const b = buckets.get(key) || {
          feature: row.feature,
          model: row.model || null,
          calls: 0,
          prompt_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        };
        b.calls += 1;
        b.prompt_tokens += row.prompt_tokens || 0;
        b.output_tokens += row.output_tokens || 0;
        b.total_tokens += row.total_tokens || 0;
        buckets.set(key, b);
      }
      const summary = Array.from(buckets.values()).sort(function (a, b) {
        return b.total_tokens - a.total_tokens;
      });
      return new Response(JSON.stringify({ success: true, days: days, since: since, summary: summary }), { status: 200, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ success: false, error: "Invalid action" }), { status: 400, headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: jsonHeaders });
  }
};
