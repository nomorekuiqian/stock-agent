// Edge Function: signup attribution (user_acquisition)
// Internal only: callers must send X-Internal-Secret = EDGE_FUNCTION_SECRET.
// user_acquisition has RLS enabled with no policies, so this function writes
// with the project API_KEY (admin); the key never leaves Insforge.
//
// POST ?action=record  body: { user_id, first_touch?, last_touch? }
//   -> { success: true, recorded: true }   first insert
//   -> { success: true, recorded: false }  row already exists (PK conflict)
const TOUCH_FIELDS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "ref", "landing_path", "referrer_host", "ts",
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanTouch(touch) {
  const out = {};
  if (!touch || typeof touch !== "object" || Array.isArray(touch)) return out;
  for (const key of TOUCH_FIELDS) {
    const value = touch[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, 200);
  }
  return out;
}

module.exports = async function(request) {
  const jsonHeaders = { "Content-Type": "application/json" };
  const respond = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  const expected = Deno.env.get("EDGE_FUNCTION_SECRET");
  const provided = request.headers.get("x-internal-secret") || "";
  if (!expected || provided !== expected) {
    return respond(401, { success: false, error: "Unauthorized" });
  }

  const url = new URL(request.url);
  if (request.method !== "POST" || url.searchParams.get("action") !== "record") {
    return respond(400, { success: false, error: "Use POST ?action=record" });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return respond(400, { success: false, error: "Invalid JSON" });
  }
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  if (!UUID_RE.test(userId)) {
    return respond(400, { success: false, error: "Invalid user_id" });
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("API_KEY"),
  });

  try {
    const { error } = await client.database.from("user_acquisition").insert([{
      user_id: userId,
      first_touch: cleanTouch(body.first_touch),
      last_touch: cleanTouch(body.last_touch),
    }]);
    if (error) {
      const message = String(error.message || error);
      if (error.code === "23505" || /duplicate key/i.test(message)) {
        return respond(200, { success: true, recorded: false });
      }
      return respond(500, { success: false, error: message });
    }
    return respond(200, { success: true, recorded: true });
  } catch (err) {
    return respond(500, { success: false, error: String(err?.message || err) });
  }
};
