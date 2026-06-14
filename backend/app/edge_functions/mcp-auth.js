// TheMarketBrew MCP auth Edge Function
//
// Handles device-style MCP authorization records, opaque MCP tokens, and usage
// logs. The Python backend owns all token generation and passes only hashes to
// this function. If EDGE_FUNCTION_SECRET is set, calls must include it.

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
  const DEVICES = "mcp_device_authorizations";
  const TOKENS = "mcp_tokens";
  const USAGE = "mcp_usage_events";

  const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers });
  const fail = (status, error) => new Response(JSON.stringify({ success: false, error }), { status, headers });
  const nowIso = () => new Date().toISOString();
  const isExpired = (iso) => Boolean(iso && new Date(iso).getTime() <= Date.now());

  try {
    if (request.method === "POST" && action === "start") {
      const body = await request.json();
      if (!body.device_code_hash) return fail(400, "device_code_hash required");
      if (!body.user_code_hash) return fail(400, "user_code_hash required");
      if (!body.expires_at) return fail(400, "expires_at required");

      const row = {
        device_code_hash: body.device_code_hash,
        user_code_hash: body.user_code_hash,
        client_name: body.client_name || "TheMarketBrew MCP",
        expires_at: body.expires_at,
        poll_interval_s: body.poll_interval_s || 2,
      };
      const { data, error } = await client.database
        .from(DEVICES)
        .insert([row])
        .select()
        .maybeSingle();
      if (error) return fail(500, error.message);
      return ok({ id: data && data.id, status: "authorization_pending" });
    }

    if (request.method === "POST" && action === "authorize") {
      const body = await request.json();
      if (!body.user_code_hash) return fail(400, "user_code_hash required");
      if (!body.user_id) return fail(400, "user_id required");

      const { data: device, error: getError } = await client.database
        .from(DEVICES)
        .select("*")
        .eq("user_code_hash", body.user_code_hash)
        .maybeSingle();
      if (getError) return fail(500, getError.message);
      if (!device) return fail(404, "not_found");
      if (device.denied_at) return fail(409, "denied");
      if (device.consumed_at) return fail(409, "consumed");
      if (isExpired(device.expires_at)) return fail(410, "expired");

      const { data, error } = await client.database
        .from(DEVICES)
        .update({
          authorized_at: nowIso(),
          authorized_user_id: body.user_id,
        })
        .eq("id", device.id)
        .select()
        .maybeSingle();
      if (error) return fail(500, error.message);
      return ok({
        status: "authorized",
        client_name: data && data.client_name,
        expires_at: data && data.expires_at,
      });
    }

    if (request.method === "POST" && action === "exchange") {
      const body = await request.json();
      if (!body.device_code_hash) return fail(400, "device_code_hash required");
      if (!body.token_hash) return fail(400, "token_hash required");
      if (!body.token_expires_at) return fail(400, "token_expires_at required");

      const { data: device, error: getError } = await client.database
        .from(DEVICES)
        .select("*")
        .eq("device_code_hash", body.device_code_hash)
        .maybeSingle();
      if (getError) return fail(500, getError.message);
      if (!device) return fail(404, "not_found");
      if (device.denied_at) return fail(409, "denied");
      if (device.consumed_at) return fail(409, "consumed");
      if (isExpired(device.expires_at)) return fail(410, "expired");
      if (!device.authorized_at || !device.authorized_user_id) return fail(409, "pending");

      const scopes = Array.isArray(body.scopes) && body.scopes.length
        ? body.scopes
        : ["mcp:persona", "mcp:data"];
      const { data: tokenRow, error: tokenError } = await client.database
        .from(TOKENS)
        .insert([{
          token_hash: body.token_hash,
          user_id: device.authorized_user_id,
          scopes,
          client_name: device.client_name || "TheMarketBrew MCP",
          expires_at: body.token_expires_at,
        }])
        .select()
        .maybeSingle();
      if (tokenError) return fail(500, tokenError.message);

      const { error: consumeError } = await client.database
        .from(DEVICES)
        .update({ consumed_at: nowIso() })
        .eq("id", device.id);
      if (consumeError) return fail(500, consumeError.message);

      return ok({
        status: "authorized",
        user_id: device.authorized_user_id,
        token_id: tokenRow && tokenRow.id,
        scopes,
        client_name: device.client_name || "TheMarketBrew MCP",
      });
    }

    if (request.method === "POST" && action === "verify") {
      const body = await request.json();
      if (!body.token_hash) return fail(400, "token_hash required");
      const { data: token, error } = await client.database
        .from(TOKENS)
        .select("*")
        .eq("token_hash", body.token_hash)
        .maybeSingle();
      if (error) return fail(500, error.message);
      if (!token) return fail(401, "invalid");
      if (token.revoked_at) return fail(401, "revoked");
      if (isExpired(token.expires_at)) return fail(401, "expired");

      await client.database
        .from(TOKENS)
        .update({ last_used_at: nowIso() })
        .eq("id", token.id);

      return ok({
        token_id: token.id,
        user_id: token.user_id,
        scopes: token.scopes || [],
        expires_at: token.expires_at,
        client_name: token.client_name,
      });
    }

    if (request.method === "POST" && action === "revoke") {
      const body = await request.json();
      if (!body.token_hash) return fail(400, "token_hash required");
      const { error } = await client.database
        .from(TOKENS)
        .update({ revoked_at: nowIso() })
        .eq("token_hash", body.token_hash);
      if (error) return fail(500, error.message);
      return ok({ revoked: true });
    }

    if (request.method === "POST" && action === "log_usage") {
      const body = await request.json();
      if (!body.user_id) return fail(400, "user_id required");
      const { error } = await client.database
        .from(USAGE)
        .insert([{
          user_id: body.user_id,
          token_id: body.token_id || null,
          tool: body.tool || "unknown",
          endpoint: body.endpoint || null,
          symbols: Array.isArray(body.symbols) ? body.symbols : [],
          sections: Array.isArray(body.sections) ? body.sections : [],
          latency_ms: body.latency_ms ?? null,
          success: body.success !== false,
          error: body.error || null,
          metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
        }]);
      if (error) return fail(500, error.message);
      return ok({ logged: true });
    }

    return fail(400, "unsupported action");
  } catch (error) {
    return fail(500, error && error.message ? error.message : String(error));
  }
};
