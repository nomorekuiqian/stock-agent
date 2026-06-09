module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Internal-Secret",
  };
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const expected = Deno.env.get("EDGE_FUNCTION_SECRET");
  const provided = request.headers.get("x-internal-secret") || "";
  if (!expected || provided !== expected) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: jsonHeaders }
    );
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  try {
    if (request.method === "POST" && action === "insert") {
      const body = await request.json();
      if (!body.svix_id || !body.event_type) {
        return new Response(
          JSON.stringify({ success: false, error: "svix_id and event_type are required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const row = {
        svix_id: body.svix_id,
        event_type: body.event_type,
        event_created_at: body.event_created_at || null,
        email_id: body.email_id || null,
        broadcast_id: body.broadcast_id || null,
        recipient_email: body.recipient_email || null,
        subject: body.subject || null,
        channel: body.channel || null,
        raw_payload: body.raw_payload || {},
      };

      const { error } = await client.database.from("email_events").insert(row);
      if (error) {
        const message = String(error.message || error);
        if (message.toLowerCase().includes("duplicate")) {
          return new Response(
            JSON.stringify({ success: true, inserted: 0, duplicate: true }),
            { status: 200, headers: jsonHeaders }
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, inserted: 1 }),
        { status: 200, headers: jsonHeaders }
      );
    }

    if (request.method === "GET" && action === "summary") {
      const daysRaw = Number.parseInt(url.searchParams.get("days") || "60", 10);
      const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 60;
      const startDate = url.searchParams.get("start_date") || "";
      const endDate = url.searchParams.get("end_date") || "";
      const hasRange = Boolean(startDate && endDate);

      const { data: daily, error: dailyError } = hasRange
        ? await client.database.rpc("admin_daily_email_metrics_range", {
            start_date: startDate,
            end_date: endDate,
          })
        : await client.database.rpc("admin_daily_email_metrics", { days_back: days });
      if (dailyError) {
        return new Response(
          JSON.stringify({ success: false, error: dailyError.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      const { data: byChannel, error: channelError } = hasRange
        ? await client.database.rpc("admin_email_channel_metrics_range", {
            start_date: startDate,
            end_date: endDate,
          })
        : await client.database.rpc("admin_email_channel_metrics", { days_back: days });
      if (channelError) {
        return new Response(
          JSON.stringify({ success: false, error: channelError.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          days,
          start_date: hasRange ? startDate : null,
          end_date: hasRange ? endDate : null,
          daily: daily || [],
          by_channel: byChannel || [],
        }),
        { status: 200, headers: jsonHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: jsonHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: jsonHeaders }
    );
  }
};
