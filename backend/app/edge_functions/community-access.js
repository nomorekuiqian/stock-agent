// Community Access Edge Function
// Stores partner-scoped Agent grants such as Panda Agent email access.
module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
  const TABLE = "community_access_grants";
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  function ok(data, status = 200) {
    return new Response(JSON.stringify({ success: true, data }), { status, headers: jsonHeaders });
  }

  function err(message, status = 400) {
    return new Response(JSON.stringify({ success: false, error: message }), { status, headers: jsonHeaders });
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  try {
    if (request.method === "GET" && action === "get_by_email") {
      const partnerId = url.searchParams.get("partner_id") || "panda";
      const email = normalizeEmail(url.searchParams.get("email"));
      if (!email) return err("email required");

      const { data, error } = await client.database
        .from(TABLE)
        .select("*")
        .eq("partner_id", partnerId)
        .eq("email_normalized", email)
        .maybeSingle();

      if (error) return err(error.message, 500);
      return ok(data || null);
    }

    if (request.method === "GET" && action === "list") {
      const partnerId = url.searchParams.get("partner_id") || "panda";
      const email = normalizeEmail(url.searchParams.get("email"));
      const status = url.searchParams.get("status");
      const rawLimit = parseInt(url.searchParams.get("limit") || "200", 10);
      const rawOffset = parseInt(url.searchParams.get("offset") || "0", 10);
      const limit = Math.min(1000, Math.max(1, isNaN(rawLimit) ? 200 : rawLimit));
      const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

      let query = client.database
        .from(TABLE)
        .select("*")
        .eq("partner_id", partnerId)
        .order("updated_at", { ascending: false });
      if (status) query = query.eq("status", status);
      const { data, error } = await query.range(offset, offset + limit - 1);
      if (error) return err(error.message, 500);

      let rows = data || [];
      if (email) {
        rows = rows.filter((row) => String(row.email_normalized || "").includes(email));
      }
      return ok(rows);
    }

    if (request.method === "POST" && action === "bulk_upsert") {
      const body = await request.json();
      const partnerId = body?.partner_id || "panda";
      const grantedBy = body?.granted_by || null;
      const grantSource = body?.grant_source || "zsxq_comment";
      const notes = body?.notes || null;
      const emails = Array.isArray(body?.emails) ? body.emails.map(normalizeEmail).filter(Boolean) : [];
      if (emails.length === 0) return ok([]);

      const now = new Date().toISOString();
      const rows = Array.from(new Set(emails)).map((email) => ({
        partner_id: partnerId,
        email,
        email_normalized: email,
        status: "active",
        grant_source: grantSource,
        granted_by: grantedBy,
        granted_at: now,
        revoked_at: null,
        revoked_by: null,
        notes,
        updated_at: now,
      }));

      const { data, error } = await client.database
        .from(TABLE)
        .upsert(rows, { onConflict: "partner_id,email_normalized" })
        .select();

      if (error) return err(error.message, 500);
      return ok(data || []);
    }

    if (request.method === "POST" && action === "mark_seen") {
      const body = await request.json();
      const partnerId = body?.partner_id || "panda";
      const email = normalizeEmail(body?.email);
      const userId = body?.user_id || null;
      if (!email || !userId) return err("email and user_id required");

      const now = new Date().toISOString();
      const { data, error } = await client.database
        .from(TABLE)
        .update({
          user_id: userId,
          first_seen_user_id: userId,
          last_seen_at: now,
          updated_at: now,
        })
        .eq("partner_id", partnerId)
        .eq("email_normalized", email)
        .eq("status", "active")
        .select()
        .maybeSingle();

      if (error) return err(error.message, 500);
      return ok(data || null);
    }

    if (request.method === "DELETE" && action === "revoke") {
      const grantId = url.searchParams.get("id");
      const partnerId = url.searchParams.get("partner_id") || "panda";
      const revokedBy = url.searchParams.get("revoked_by") || null;
      if (!grantId) return err("id required");

      const now = new Date().toISOString();
      const { data, error } = await client.database
        .from(TABLE)
        .update({
          status: "revoked",
          revoked_at: now,
          revoked_by: revokedBy,
          updated_at: now,
        })
        .eq("id", grantId)
        .eq("partner_id", partnerId)
        .select()
        .maybeSingle();

      if (error) return err(error.message, 500);
      return ok(data || null);
    }

    return err("Invalid action");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 500);
  }
};
