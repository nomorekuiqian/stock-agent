// Picker Conversations - Edge Function
// CRUD operations for picker_conversations table.
// Schema:
//   id UUID PK, user_id TEXT, title TEXT, data JSONB,
//   message_count INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
  const TABLE = "picker_conversations";
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const action = url.searchParams.get("action");
    const userId = url.searchParams.get("user_id");
    const id = url.searchParams.get("id");

    // GET ?action=list&user_id=xxx - list conversations (lightweight, no data)
    if (request.method === "GET" && action === "list" && userId) {
      const { data, error } = await client.database
        .from(TABLE)
        .select("id, user_id, title, message_count, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: data || [] }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // GET ?action=get&id=xxx&user_id=xxx - get single conversation with full data
    if (request.method === "GET" && action === "get" && id && userId) {
      const { data, error } = await client.database
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      if (!data) {
        return new Response(
          JSON.stringify({ success: false, error: "Not found" }),
          { status: 404, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // POST ?action=create - create new conversation
    if (request.method === "POST" && action === "create") {
      const body = await request.json();
      const { user_id, title, data: convData, message_count } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const now = new Date().toISOString();
      const row = {
        user_id,
        title: title || "",
        data: convData || {},
        message_count: message_count || 0,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await client.database
        .from(TABLE)
        .insert(row)
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 201, headers: jsonHeaders }
      );
    }

    // PUT ?action=update&id=xxx - update conversation
    if (request.method === "PUT" && action === "update" && id) {
      const body = await request.json();
      const { user_id, title, data: convData, message_count } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const updates = {
        updated_at: new Date().toISOString(),
        title: undefined,
        data: undefined,
        message_count: undefined,
      };
      if (title !== undefined) updates.title = title;
      if (convData !== undefined) updates.data = convData;
      if (message_count !== undefined) updates.message_count = message_count;
      // Remove undefined fields
      Object.keys(updates).forEach(k => {
        if (updates[k] === undefined) delete updates[k];
      });

      const { data, error } = await client.database
        .from(TABLE)
        .update(updates)
        .eq("id", id)
        .eq("user_id", user_id)
        .select("id, updated_at")
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      if (!data) {
        return new Response(
          JSON.stringify({ success: false, error: "Not found or not owned" }),
          { status: 404, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // DELETE ?action=delete&id=xxx&user_id=xxx - delete conversation
    if (request.method === "DELETE" && action === "delete" && id && userId) {
      const { error } = await client.database
        .from(TABLE)
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: jsonHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid request" }),
      { status: 400, headers: jsonHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
