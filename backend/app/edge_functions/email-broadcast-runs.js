const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function runKey(channel, broadcastDate) {
  return `${channel}:${broadcastDate}`;
}

module.exports = async function(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (request.method === "POST" && action === "acquire") {
    const body = await request.json();
    const channel = String(body.channel || "").trim();
    const broadcastDate = String(body.broadcast_date || "").trim();
    const lockToken = String(body.lock_token || crypto.randomUUID());

    if (!channel || !broadcastDate) {
      return json(400, { success: false, error: "channel and broadcast_date required" });
    }

    const row = {
      run_key: runKey(channel, broadcastDate),
      channel,
      broadcast_date: broadcastDate,
      status: "running",
      lock_token: lockToken,
      details: body.details || {},
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.database
      .from("email_broadcast_runs")
      .insert(row)
      .select()
      .single();

    if (!error) {
      return json(200, { success: true, acquired: true, data });
    }

    const { data: existing, error: readError } = await client.database
      .from("email_broadcast_runs")
      .select("*")
      .eq("run_key", row.run_key)
      .maybeSingle();

    if (readError) {
      return json(500, { success: false, error: readError.message });
    }

    const startedAt = existing && existing.started_at
      ? new Date(existing.started_at).getTime()
      : Date.now();
    const staleRunning = existing && existing.status === "running" &&
      Date.now() - startedAt > 2 * 60 * 60 * 1000;
    if (existing && (existing.status === "failed" || staleRunning)) {
      const { data: reacquired, error: updateError } = await client.database
        .from("email_broadcast_runs")
        .update({
          status: "running",
          lock_token: lockToken,
          details: body.details || {},
          started_at: new Date().toISOString(),
          completed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("run_key", row.run_key)
        .select()
        .maybeSingle();

      if (updateError) {
        return json(500, { success: false, error: updateError.message });
      }

      return json(200, {
        success: true,
        acquired: true,
        reacquired: true,
        data: reacquired,
      });
    }

    return json(200, {
      success: true,
      acquired: false,
      reason: "already_started",
      data: existing,
    });
  }

  if (request.method === "POST" && action === "complete") {
    const body = await request.json();
    const channel = String(body.channel || "").trim();
    const broadcastDate = String(body.broadcast_date || "").trim();
    const lockToken = String(body.lock_token || "").trim();
    const status = body.status === "failed" ? "failed" : "completed";

    if (!channel || !broadcastDate || !lockToken) {
      return json(400, { success: false, error: "channel, broadcast_date, and lock_token required" });
    }

    const patch = {
      status,
      broadcast_id: body.broadcast_id || null,
      details: body.details || {},
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.database
      .from("email_broadcast_runs")
      .update(patch)
      .eq("run_key", runKey(channel, broadcastDate))
      .eq("lock_token", lockToken)
      .select()
      .maybeSingle();

    if (error) {
      return json(500, { success: false, error: error.message });
    }

    return json(200, { success: true, data });
  }

  return json(405, { success: false, error: "Unsupported method/action" });
};
