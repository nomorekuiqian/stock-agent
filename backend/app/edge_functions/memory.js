// Memory Edge Function
// Handles CRUD on ai_feedback + suggestion_tracking for U1-C.
// Schema: see backend/migrations/u1c_memory_schema.sql
//
// Actions:
//   POST ?action=save_feedback     body={user_id, target_type, target_id, sentiment, reason?, snapshot?}
//   GET  ?action=recent_feedback&user_id=xxx&days=7&limit=20
//   POST ?action=insert_suggestion body={user_id, source, suggestion_text, symbols?, sectors?, follow_up_at, ...}
//   GET  ?action=recent_suggestions&user_id=xxx&days=14
//   GET  ?action=due_today                                   -> suggestions due for T+7 evaluation
//   POST ?action=update_outcome    body={id, outcome}        -> write outcome JSONB
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
  const FEEDBACK = "ai_feedback";
  const TRACKING = "suggestion_tracking";

  const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers });
  const fail = (status, error) => new Response(JSON.stringify({ success: false, error }), { status, headers });

  try {
    // -------------------------- save_feedback --------------------------------
    if (request.method === "POST" && action === "save_feedback") {
      const body = await request.json();
      const user_id = body.user_id;
      if (!user_id) return fail(400, "user_id required");

      const row = {
        user_id,
        target_type: body.target_type,
        target_id: body.target_id,
        sentiment: body.sentiment,
        reason: body.reason || null,
        snapshot: body.snapshot || null,
      };

      const { data, error } = await client.database
        .from(FEEDBACK)
        .insert(row)
        .select("id")
        .maybeSingle();

      if (error) return fail(500, error.message);
      return ok(data || {});
    }

    // -------------------------- recent_feedback -------------------------------
    if (request.method === "GET" && action === "recent_feedback") {
      const user_id = url.searchParams.get("user_id");
      if (!user_id) return fail(400, "user_id required");

      const days = parseInt(url.searchParams.get("days") || "7", 10);
      const limit = parseInt(url.searchParams.get("limit") || "20", 10);

      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await client.database
        .from(FEEDBACK)
        .select("*")
        .eq("user_id", user_id)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return fail(500, error.message);
      return ok(data || []);
    }

    // -------------------------- insert_suggestion -----------------------------
    if (request.method === "POST" && action === "insert_suggestion") {
      const body = await request.json();
      const user_id = body.user_id;
      if (!user_id) return fail(400, "user_id required");

      const row = {
        user_id,
        source: body.source,
        source_ref_id: body.source_ref_id || null,
        suggestion_text: body.suggestion_text,
        suggestion_date: body.suggestion_date || new Date().toISOString().slice(0, 10),
        symbols: body.symbols || [],
        sectors: body.sectors || [],
        follow_up_at: body.follow_up_at,
      };

      const { data, error } = await client.database
        .from(TRACKING)
        .insert(row)
        .select("id")
        .maybeSingle();

      if (error) return fail(500, error.message);
      return ok(data || {});
    }

    // -------------------------- recent_suggestions ----------------------------
    if (request.method === "GET" && action === "recent_suggestions") {
      const user_id = url.searchParams.get("user_id");
      if (!user_id) return fail(400, "user_id required");

      const days = parseInt(url.searchParams.get("days") || "14", 10);

      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await client.database
        .from(TRACKING)
        .select("*")
        .eq("user_id", user_id)
        .gte("suggestion_date", since.toISOString().slice(0, 10))
        .order("suggestion_date", { ascending: false })
        .limit(20);

      if (error) return fail(500, error.message);
      return ok(data || []);
    }

    // -------------------------- due_today -------------------------------------
    if (request.method === "GET" && action === "due_today") {
      const today = new Date().toISOString().slice(0, 10);

      const { data, error } = await client.database
        .from(TRACKING)
        .select("*")
        .lte("follow_up_at", today)
        .is("outcome", null)
        .order("follow_up_at", { ascending: true })
        .limit(100);

      if (error) return fail(500, error.message);
      return ok(data || []);
    }

    // -------------------------- update_outcome --------------------------------
    if (request.method === "POST" && action === "update_outcome") {
      const body = await request.json();
      const id = body.id;
      if (!id) return fail(400, "id required");

      const { data, error } = await client.database
        .from(TRACKING)
        .update({ outcome: body.outcome })
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) return fail(500, error.message);
      return ok(data || {});
    }

    return fail(400, `Unknown action: ${action}`);
  } catch (e) {
    return fail(500, `Exception: ${e.message || String(e)}`);
  }
};
