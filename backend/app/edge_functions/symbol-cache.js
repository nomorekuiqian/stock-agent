// Symbol-resolution L2 cache Edge Function (Track M / holdings_sync)
// Schema: backend/migrations/holdings_sync_symbol_cache.sql
// Design:  docs/plans/proposals/holdings-sync-track-m-tech-design.md §4.0 / §2bis.A.3
//
// Cross-user + cross-instance shared cache for symbol resolution. NOT portfolio
// geba (does not touch user_portfolios). Lazy expiry (read-time expires_at).
//
// Actions:
//   GET  ?action=get&query_norm=AAPL                 -> hit (unexpired) | null
//   POST ?action=put body={query_norm,resolved_json,status,ttl_days}
//
// KEY SAFETY (Codex fix / §2bis.A.3): query_norm MUST be a cross-user-safe
// canonical key — a ticker-shaped token [$A-Z0-9.-]{1,16} OR a non-reversible
// safe hash "h:<hex>". Free text (account labels, CUSIP, emails, CSV/PDF
// fragments) is REJECTED so raw user input never persists cross-user.
//
// Backend has already verified JWT; this EF does NOT re-validate it but DOES
// require the internal secret (only the Python backend may call it).

module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Fail-CLOSED (Codex [high] fix): this is a CROSS-USER shared WRITE cache —
  // a missing or wrong internal secret must NEVER leave it publicly writable
  // (a poisoned ticker-shaped row would propagate a bad resolution to every
  // user). Unset EDGE_FUNCTION_SECRET => refuse ALL traffic with 500, never
  // open. (Differs from portfolio.js, whose writes are scoped to a backend-
  // verified user_id; this table has no per-user scoping.)
  const expectedSecret = Deno.env.get("EDGE_FUNCTION_SECRET");
  if (!expectedSecret) {
    return new Response(
      JSON.stringify({ success: false, error: "Server misconfigured: EDGE_FUNCTION_SECRET unset" }),
      { status: 500, headers }
    );
  }
  const provided = request.headers.get("X-Internal-Secret");
  if (provided !== expectedSecret) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 403, headers });
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const TABLE = "symbol_resolution_cache";
  const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers });
  const fail = (status, error) => new Response(JSON.stringify({ success: false, error }), { status, headers });

  // Cross-user-safe key: ticker-shaped OR safe hash. Reject anything else so
  // raw free text can never persist into a shared row.
  const SAFE_KEY = /^([$A-Z0-9.\-]{1,16}|h:[0-9a-f]{16,64})$/;
  const VALID_STATUS = new Set(["ok", "needs_review", "unresolved"]);

  try {
    // -------------------------- get ----------------------------------------
    if (request.method === "GET" && action === "get") {
      const queryNorm = url.searchParams.get("query_norm");
      if (!queryNorm) return fail(400, "query_norm required");
      if (!SAFE_KEY.test(queryNorm)) return fail(400, "unsafe query_norm");

      const { data, error } = await client.database
        .from(TABLE)
        .select("*")
        .eq("query_norm", queryNorm)
        .maybeSingle();
      if (error) return fail(500, error.message);
      if (!data) return ok(null);

      // Lazy expiry: treat expired as miss (do not delete here; followup ③)
      if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
        return ok(null);
      }

      // Best-effort hit_count bump (observability only; never blocks the read)
      try {
        await client.database
          .from(TABLE)
          .update({ hit_count: (data.hit_count || 0) + 1 })
          .eq("query_norm", queryNorm);
      } catch (_) { /* non-fatal */ }

      return ok({ resolved_json: data.resolved_json, status: data.status });
    }

    // -------------------------- put ----------------------------------------
    if (request.method === "POST" && action === "put") {
      const body = await request.json();
      const queryNorm = body.query_norm;
      const resolvedJson = body.resolved_json;
      const status = body.status;
      let ttlDays = Number(body.ttl_days);

      if (!queryNorm) return fail(400, "query_norm required");
      if (!SAFE_KEY.test(queryNorm)) return fail(400, "unsafe query_norm");
      if (!VALID_STATUS.has(status)) return fail(400, "invalid status");
      if (resolvedJson === undefined || resolvedJson === null) return fail(400, "resolved_json required");
      if (!Number.isFinite(ttlDays)) return fail(400, "ttl_days required");
      // Clamp to a sane band (positive 60-90 / negative 14-30 decided by caller)
      ttlDays = Math.min(120, Math.max(1, Math.floor(ttlDays)));

      const nowMs = Date.now();
      const row = {
        query_norm: queryNorm,
        resolved_json: resolvedJson,
        status,
        hit_count: 0,
        resolved_at: new Date(nowMs).toISOString(),
        expires_at: new Date(nowMs + ttlDays * 86400000).toISOString(),
      };
      const { error } = await client.database
        .from(TABLE)
        .upsert(row, { onConflict: "query_norm" });
      if (error) return fail(500, error.message);
      return ok({ query_norm: queryNorm, expires_at: row.expires_at });
    }

    return fail(400, `Unknown action: ${action}`);
  } catch (e) {
    return fail(500, `Exception: ${e.message || String(e)}`);
  }
};
