// Edge function: access_requests
// POST ?action=insert — store questionnaire response

module.exports = async function (request) {
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

  try {
    // POST ?action=insert
    if (request.method === "POST" && action === "insert") {
      const { background, markets, trading_style, pain_points, feedback, email } = await request.json();

      if (!background) {
        return new Response(
          JSON.stringify({ success: false, error: "background required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .from("access_requests")
        .insert({
          background,
          markets: markets || [],
          trading_style: trading_style || [],
          pain_points: pain_points || [],
          feedback: feedback || null,
          email: email || null,
        })
        .select("id, created_at")
        .single();

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

    // POST ?action=list_by_email - Get questionnaire responses for a specific email
    if (request.method === "POST" && action === "list_by_email") {
      const { email } = await request.json();
      if (!email) {
        return new Response(
          JSON.stringify({ success: false, error: "email required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .from("access_requests")
        .select("*")
        .eq("email", email)
        .order("created_at", { ascending: false });

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

    // POST ?action=aggregate - Get emails that have submitted questionnaire (for admin dashboard)
    if (request.method === "POST" && action === "aggregate") {
      const { data, error } = await client.database
        .from("access_requests")
        .select("email, background, created_at");

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const byEmail = {};
      (data || []).forEach(item => {
        if (!item.email) return;
        if (!byEmail[item.email]) {
          byEmail[item.email] = { background: item.background, submitted_at: item.created_at };
        }
      });

      return new Response(
        JSON.stringify({ success: true, data: byEmail }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "invalid_action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};
