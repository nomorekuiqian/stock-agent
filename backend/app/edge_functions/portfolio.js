// Portfolio Edge Function
// Handles CRUD on user_portfolios + user_investment_profiles for U0-A.
// Schema: see backend/migrations/u0a_portfolio_schema.sql
//
// Actions:
//   GET  ?action=list&user_id=xxx                        -> list user's portfolio rows
//   POST ?action=bulk    body={user_id, rows:[...]}      -> replace whole portfolio (delete + upsert)
//   POST ?action=reconcile body={user_id, source, rows:[...], clear_source?} -> replace-by-source
//                                                          (Track M: P1 COALESCE-preserved,
//                                                           $CASH singleton, touch folded in)
//   POST ?action=patch   body={user_id, symbol, ...}     -> upsert single row (partial)
//   POST ?action=delete  body={user_id, symbol}          -> delete one row
//   POST ?action=touch   body={user_id}                  -> bump portfolio_confirmed_at
//   GET  ?action=profile&user_id=xxx                     -> read profile (defaults filled in caller)
//   POST ?action=upsert_profile body={user_id, ...}      -> upsert profile fields
//
// All requests assume the *backend* has already verified the JWT (Depends(verify_user_token))
// and passes a trusted user_id. This function does NOT re-validate JWT.

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

  // Verify internal secret — only the Python backend should call this EF
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
  const PORTFOLIOS = "user_portfolios";
  const PROFILES = "user_investment_profiles";

  const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers });
  const fail = (status, error) => new Response(JSON.stringify({ success: false, error }), { status, headers });

  try {
    // -------------------------- list ---------------------------------------
    if (request.method === "GET" && action === "list") {
      const user_id = url.searchParams.get("user_id");
      if (!user_id) return fail(400, "user_id required");

      const { data, error } = await client.database
        .from(PORTFOLIOS)
        .select("*")
        .eq("user_id", user_id);

      if (error) return fail(500, error.message);
      return ok(data || []);
    }

    // -------------------------- bulk replace -------------------------------
    // Order: upsert FIRST, then delete the leftovers. Insforge EF has no
    // transaction primitive, so we choose the failure mode where partial
    // failure leaves *extra* rows (recoverable) rather than *missing* rows
    // (silent data loss). The router caller treats the response as authoritative.
    if (request.method === "POST" && action === "bulk") {
      const body = await request.json();
      const user_id = body.user_id;
      const rows = Array.isArray(body.rows) ? body.rows : null;
      if (!user_id) return fail(400, "user_id required");
      if (rows === null) return fail(400, "rows must be array");

      // 1) upsert each row first
      for (const r of rows) {
        if (!r.symbol) continue;
        const upsertRow = {
          user_id,
          symbol: r.symbol,
          weight_pct: r.weight_pct ?? null,
          shares: r.shares ?? null,
          cost_basis: r.cost_basis ?? null,
          thesis: r.thesis ?? null,
          target: r.target ?? null,
          stop_loss: r.stop_loss ?? null,
          conviction: r.conviction ?? null,
          entry_price: r.entry_price ?? null,
          // Track M: hand-typed/onboarding path explicitly asserts manual ownership
          source: r.source ?? "manual",
          source_synced_at: r.source_synced_at ?? null,
          external_account_id: r.external_account_id ?? null,
        };
        const { error: upErr } = await client.database
          .from(PORTFOLIOS)
          .upsert(upsertRow, { onConflict: "user_id,symbol" });
        if (upErr) return fail(500, upErr.message);
      }

      // 2) delete rows not in the new list (router validates symbols against
      //    [$A-Z0-9.-]{1,16} so interpolation is safe)
      const keepSymbols = rows.map(r => r.symbol).filter(Boolean);
      if (keepSymbols.length === 0) {
        const { error: delErr } = await client.database
          .from(PORTFOLIOS)
          .delete()
          .eq("user_id", user_id);
        if (delErr) return fail(500, delErr.message);
      } else {
        const { error: delErr } = await client.database
          .from(PORTFOLIOS)
          .delete()
          .eq("user_id", user_id)
          .filter("symbol", "not.in", `(${keepSymbols.join(",")})`);
        if (delErr) return fail(500, delErr.message);
      }

      // 3) touch portfolio_confirmed_at
      await client.database
        .from(PROFILES)
        .upsert({ user_id, portfolio_confirmed_at: new Date().toISOString() }, { onConflict: "user_id" });

      // 4) return fresh state
      const { data: fresh } = await client.database
        .from(PORTFOLIOS)
        .select("*")
        .eq("user_id", user_id);
      return ok(fresh || []);
    }

    // -------------------------- reconcile (Track M replace-by-source) ------
    // Replace ONLY the rows that belong to `source`, preserving:
    //  · P1 fields (thesis/target/stop_loss/conviction) — always COALESCE from
    //    the EXISTING row, never from the import payload (source carries no P1).
    //  · hand-typed rows + other sources' rows — never touched.
    // $CASH is a SOURCE-AGNOSTIC SINGLETON: upserted normally, but excluded
    // from the source-scoped delete (so a cash-less import never wipes cash,
    // and clearing a source never nukes cash). Touch is folded in atomically.
    // Same failure mode as bulk: upsert FIRST then delete (extra rows over
    // missing rows). Router validates symbols [$A-Z0-9.-]{1,16} => safe interp.
    if (request.method === "POST" && action === "reconcile") {
      const body = await request.json();
      const user_id = body.user_id;
      const source = body.source;
      const rows = Array.isArray(body.rows) ? body.rows : null;
      const clearSource = body.clear_source === true;
      if (!user_id) return fail(400, "user_id required");
      if (!source) return fail(400, "source required");
      if (rows === null) return fail(400, "rows must be array");
      if (rows.length === 0 && !clearSource) {
        // Empty rows would delete the whole source — only allowed with an
        // explicit clear_source flag (guards "续修发增量" data-loss bug).
        return fail(400, "empty rows requires clear_source=true");
      }

      // Pre-read the user's full portfolio once -> map by symbol (avoid N selects)
      const { data: existingRows, error: exErr } = await client.database
        .from(PORTFOLIOS)
        .select("*")
        .eq("user_id", user_id);
      if (exErr) return fail(500, exErr.message);
      const existingBySymbol = {};
      for (const er of (existingRows || [])) existingBySymbol[er.symbol] = er;

      const nowIso = new Date().toISOString();

      // 1) upsert each import row; P1 strictly COALESCE'd from existing
      for (const r of rows) {
        if (!r.symbol) continue;
        const e = existingBySymbol[r.symbol] || null;
        const upsertRow = {
          user_id,
          symbol: r.symbol,
          weight_pct: r.weight_pct ?? null,
          shares: r.shares ?? null,
          cost_basis: r.cost_basis ?? null,
          entry_price: r.entry_price ?? null,
          // P1: ALWAYS from existing, NEVER from the import payload
          thesis: e ? (e.thesis ?? null) : null,
          target: e ? (e.target ?? null) : null,
          stop_loss: e ? (e.stop_loss ?? null) : null,
          conviction: e ? (e.conviction ?? null) : null,
          source: source,
          source_synced_at: nowIso,
          external_account_id: r.external_account_id ?? (e ? (e.external_account_id ?? null) : null),
        };
        const { error: upErr } = await client.database
          .from(PORTFOLIOS)
          .upsert(upsertRow, { onConflict: "user_id,symbol" });
        if (upErr) return fail(500, upErr.message);
      }

      // 2) source-scoped delete of rows no longer present in this import.
      //    Always append "$CASH" to the keep set so the source-scoped delete
      //    can never remove the cash singleton (uses only the proven
      //    .eq + .filter not.in primitives — same as bulk). The not-in set is
      //    never empty (>= ["$CASH"]), so clear_source / $CASH-only imports
      //    still wipe the rest of the source in one path.
      const keepSymbols = rows.map(r => r.symbol).filter(Boolean).filter(s => s !== "$CASH");
      const notInSet = [...keepSymbols, "$CASH"];
      const { error: delErr } = await client.database
        .from(PORTFOLIOS)
        .delete()
        .eq("user_id", user_id)
        .eq("source", source)
        .filter("symbol", "not.in", `(${notInSet.join(",")})`);
      if (delErr) return fail(500, delErr.message);

      // 3) fold in the R-2 touch atomically (no separate round-trip)
      await client.database
        .from(PROFILES)
        .upsert({ user_id, portfolio_confirmed_at: nowIso }, { onConflict: "user_id" });

      // 4) return fresh state
      const { data: fresh } = await client.database
        .from(PORTFOLIOS)
        .select("*")
        .eq("user_id", user_id);
      return ok(fresh || []);
    }

    // -------------------------- patch single -------------------------------
    if (request.method === "POST" && action === "patch") {
      const body = await request.json();
      const user_id = body.user_id;
      const symbol = body.symbol;
      if (!user_id || !symbol) return fail(400, "user_id and symbol required");

      const upsertRow = { user_id, symbol };
      const allowed = ["weight_pct", "shares", "cost_basis", "thesis", "target", "stop_loss", "conviction", "entry_price",
                       "source", "source_synced_at", "external_account_id"];
      for (const k of allowed) {
        if (k in body) upsertRow[k] = body[k];
      }

      const { data, error } = await client.database
        .from(PORTFOLIOS)
        .upsert(upsertRow, { onConflict: "user_id,symbol" })
        .select()
        .maybeSingle();
      if (error) return fail(500, error.message);
      return ok(data);
    }

    // -------------------------- delete -------------------------------------
    if (request.method === "POST" && action === "delete") {
      const body = await request.json();
      const user_id = body.user_id;
      const symbol = body.symbol;
      if (!user_id || !symbol) return fail(400, "user_id and symbol required");

      const { error } = await client.database
        .from(PORTFOLIOS)
        .delete()
        .eq("user_id", user_id)
        .eq("symbol", symbol);
      if (error) return fail(500, error.message);
      return ok({ deleted: 1 });
    }

    // -------------------------- touch (R-2) --------------------------------
    if (request.method === "POST" && action === "touch") {
      const body = await request.json();
      const user_id = body.user_id;
      if (!user_id) return fail(400, "user_id required");

      const now = new Date().toISOString();
      const { data, error } = await client.database
        .from(PROFILES)
        .upsert({ user_id, portfolio_confirmed_at: now }, { onConflict: "user_id" })
        .select("portfolio_confirmed_at")
        .maybeSingle();
      if (error) return fail(500, error.message);
      return ok({ confirmed_at: data?.portfolio_confirmed_at || now });
    }

    // -------------------------- profile read -------------------------------
    if (request.method === "GET" && action === "profile") {
      const user_id = url.searchParams.get("user_id");
      if (!user_id) return fail(400, "user_id required");

      const { data, error } = await client.database
        .from(PROFILES)
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();
      if (error) return fail(500, error.message);
      return ok(data);  // null if not exists; backend fills defaults
    }

    // -------------------------- profile upsert -----------------------------
    if (request.method === "POST" && action === "upsert_profile") {
      const body = await request.json();
      const user_id = body.user_id;
      if (!user_id) return fail(400, "user_id required");

      // Fetch current to compute version bump + onboarded_at COALESCE.
      const { data: existing } = await client.database
        .from(PROFILES)
        .select("version, onboarded_at")
        .eq("user_id", user_id)
        .maybeSingle();

      const upsertRow = { user_id };
      const allowed = ["style", "horizon", "risk_tolerance", "notify_mode"];
      let bumpVersion = false;
      for (const k of allowed) {
        if (k in body) {
          upsertRow[k] = body[k];
          if (k !== "notify_mode") bumpVersion = true;  // notify_mode 不影响 Action Bar cache
        }
      }
      if (existing) {
        upsertRow.version = bumpVersion ? (existing.version || 1) + 1 : (existing.version || 1);
        upsertRow.onboarded_at = existing.onboarded_at || new Date().toISOString();
      } else {
        upsertRow.version = 1;
        upsertRow.onboarded_at = new Date().toISOString();
      }

      const { data, error } = await client.database
        .from(PROFILES)
        .upsert(upsertRow, { onConflict: "user_id" })
        .select()
        .maybeSingle();
      if (error) return fail(500, error.message);
      return ok(data);
    }

    return fail(400, `Unknown action: ${action}`);
  } catch (e) {
    return fail(500, `Exception: ${e.message || String(e)}`);
  }
};
