// Market Lens MCP beta access for the Frank persona.
//
// Tables:
//   frank_lens_invites — invite code records
//   frank_lens_usage   — per-tool beta usage audit
//
// POST ?action=validate_invite body={invite_hash}
// POST ?action=record_usage    body={invite_id, tool_name, workflow, ...}

module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Internal-Secret",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const expected = Deno.env.get("EDGE_FUNCTION_SECRET");
  const provided = request.headers.get("x-internal-secret") || "";
  if (!expected || provided !== expected) {
    return json({ success: false, error: "Unauthorized" }, 401, jsonHeaders);
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    if (request.method === "POST" && action === "validate_invite") {
      const body = await request.json();
      const inviteHash = String(body.invite_hash || "").trim();
      if (!inviteHash) {
        return json({ success: false, error: "invite_code_required" }, 400, jsonHeaders);
      }

      let invite = null;
      let error = null;
      const result = await client.database
        .from("frank_lens_invites")
        .select("id, label, status, expires_at, max_uses, use_count, metadata")
        .eq("code_hash", inviteHash)
        .maybeSingle();
      invite = result.data;
      error = result.error;
      if (error) {
        return json({ success: false, error: error.message }, 500, jsonHeaders);
      }
      if (!invite) {
        return json({ success: true, allowed: false, error: "invite_not_found" }, 200, jsonHeaders);
      }

      const now = Date.now();
      const expiresAt = invite.expires_at ? Date.parse(invite.expires_at) : null;
      const maxUses = Number(invite.max_uses || 0);
      const useCount = Number(invite.use_count || 0);
      const status = invite.status || "active";
      const expired = expiresAt !== null && !Number.isNaN(expiresAt) && expiresAt < now;
      const exhausted = maxUses > 0 && useCount >= maxUses;
      const allowed = status === "active" && !expired && !exhausted;
      const metadata = invite.metadata && typeof invite.metadata === "object" ? invite.metadata : {};
      const allowedPersonas = arrayValue(metadata.allowed_personas || metadata.persona_allowlist);
      const allowedWorkflows = arrayValue(metadata.allowed_workflows || metadata.workflow_allowlist);

      return json({
        success: true,
        allowed,
        error: allowed ? null : (expired ? "invite_expired" : exhausted ? "invite_exhausted" : "invite_inactive"),
        invite: {
          id: invite.id,
          label: invite.label || null,
          remaining_quota: maxUses > 0 ? Math.max(0, maxUses - useCount) : null,
          allowed_personas: allowedPersonas,
          allowed_workflows: allowedWorkflows,
        },
      }, 200, jsonHeaders);
    }

    if (request.method === "POST" && action === "record_usage") {
      const body = await request.json();
      const inviteId = body.invite_id;
      if (!inviteId) {
        return json({ success: false, error: "invite_id_required" }, 400, jsonHeaders);
      }

      const row = {
        invite_id: inviteId,
        persona_username: body.persona_username || "qinbafrank",
        tool_name: body.tool_name || null,
        workflow: body.workflow || null,
        ticker: body.ticker || null,
        tickers: Array.isArray(body.tickers) ? body.tickers : [],
        status: body.status || "unknown",
        latency_ms: Number.isFinite(Number(body.latency_ms)) ? Number(body.latency_ms) : null,
        metadata: body.metadata || {},
      };

      const { error: insertError } = await client.database.from("frank_lens_usage").insert(row);
      if (insertError) {
        return json({ success: false, error: insertError.message }, 500, jsonHeaders);
      }

      const { data: current } = await client.database
        .from("frank_lens_invites")
        .select("use_count")
        .eq("id", inviteId)
        .maybeSingle();
      const nextCount = Number(current && current.use_count ? current.use_count : 0) + 1;
      const { error: updateError } = await client.database
        .from("frank_lens_invites")
        .update({ use_count: nextCount, last_used_at: new Date().toISOString() })
        .eq("id", inviteId);
      if (updateError) {
        return json({ success: false, error: updateError.message }, 500, jsonHeaders);
      }

      return json({ success: true }, 200, jsonHeaders);
    }

    return json({ success: false, error: "invalid_action" }, 400, jsonHeaders);
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500, jsonHeaders);
  }
};

function json(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers });
}

function arrayValue(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}
