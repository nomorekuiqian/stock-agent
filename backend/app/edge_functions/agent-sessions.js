// Agent Sessions Edge Function
// Handles durable runtime sessions and session timeline events.
// Schema: see backend/migrations/u4a_agent_runtime_schema.sql
//
// Actions:
//   GET  ?action=get&user_id=...&agent_id=...&session_id=...
//   POST ?action=append_entries body={user_id, agent_id, session_id, metadata?, entries:[{role, content, metadata?}]}
//   POST ?action=append_events  body={user_id, agent_id, session_id, metadata?, events:[{event_type, role?, content?, payload?}]}
//
// The backend authenticates users before calling this function. If
// EDGE_FUNCTION_SECRET is configured, calls must include X-Internal-Secret.

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
  const SESSIONS = "agent_sessions";
  const EVENTS = "agent_session_events";

  const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers });
  const fail = (status, error) => new Response(JSON.stringify({ success: false, error }), { status, headers });

  function requireIdentity(user_id, agent_id, session_id) {
    if (!user_id) return "user_id required";
    if (!agent_id) return "agent_id required";
    if (!session_id) return "session_id required";
    return null;
  }

  async function fetchAllChunked(makeQuery, orderCols) {
    const PAGE = 1000;
    let all = [];
    let offset = 0;
    for (let guard = 0; guard < 1000; guard++) {
      let q = makeQuery();
      for (const spec of orderCols || []) {
        const column = typeof spec === "string" ? spec : spec.column;
        const ascending = typeof spec === "string" ? true : spec.ascending !== false;
        q = q.order(column, { ascending });
      }
      const { data, error } = await q.range(offset, offset + PAGE - 1);
      if (error) return { data: null, error };
      const rows = data || [];
      all = all.concat(rows);
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    return { data: all, error: null };
  }

  function sessionKey(agentId, sessionId) {
    return `${agentId || ""}:${sessionId || ""}`;
  }

  function publicSessionMetadata(session) {
    const metadata = session && typeof session.metadata === "object" && session.metadata
      ? session.metadata
      : {};
    return {
      agent_kind: metadata.agent_kind || null,
      persona_username: metadata.persona_username || null,
      restore_version: metadata.restore_version || null,
    };
  }

  function runtimeConversationTitle(session, firstUserMessage) {
    const metadata = session && typeof session.metadata === "object" && session.metadata
      ? session.metadata
      : {};
    const storedTitle = metadata.title || (session && session.title);
    if (storedTitle) return String(storedTitle);
    const fallback = String(firstUserMessage || "").replace(/\s+/g, " ").trim();
    if (!fallback) return null;
    return fallback.length > 80 ? `${fallback.slice(0, 77)}...` : fallback;
  }

  function compareIsoDesc(a, b) {
    const av = a || "";
    const bv = b || "";
    if (av === bv) return 0;
    return av < bv ? 1 : -1;
  }

  try {
    if (request.method === "GET" && action === "get") {
      const user_id = url.searchParams.get("user_id");
      const agent_id = url.searchParams.get("agent_id");
      const session_id = url.searchParams.get("session_id");
      const allEvents = url.searchParams.get("all") === "true";
      const limitRaw = parseInt(url.searchParams.get("limit") || "80", 10);
      // Allow up to 500 events per restore so long-running sessions don't
      // silently drop turns from the head of the transcript. The Python side
      // controls the actual default through AGENT_RUNTIME_HISTORY_FETCH_LIMIT.
      const limit = Math.min(500, Math.max(1, isNaN(limitRaw) ? 200 : limitRaw));
      const afterCreatedAt = url.searchParams.get("after_created_at");
      const afterId = url.searchParams.get("after_id");
      // Cursor contract: both fields must be present together so the boundary
      // event isn't re-delivered on the next page. A lone after_created_at
      // value is ignored (treated as "no cursor"), matching the Python helper.
      const useCursor = Boolean(afterCreatedAt && afterId);
      const missing = requireIdentity(user_id, agent_id, session_id);
      if (missing) return fail(400, missing);

      const { data: session, error: sessionError } = await client.database
        .from(SESSIONS)
        .select("*")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("session_id", session_id)
        .maybeSingle();

      if (sessionError) return fail(500, sessionError.message);

      let events;
      let eventsError;
      if (allEvents) {
        const result = await fetchAllChunked(
          () => client.database
            .from(EVENTS)
            .select("id, event_type, role, content, payload, token_estimate, turn_id, client_event_id, client_ts, created_at")
            .eq("user_id", user_id)
            .eq("agent_id", agent_id)
            .eq("session_id", session_id),
          [
            { column: "created_at", ascending: true },
            { column: "id", ascending: true },
          ],
        );
        events = result.data;
        eventsError = result.error;
      } else {
        let eventsQuery = client.database
          .from(EVENTS)
          .select("id, event_type, role, content, payload, token_estimate, turn_id, client_event_id, client_ts, created_at")
          .eq("user_id", user_id)
          .eq("agent_id", agent_id)
          .eq("session_id", session_id);

        if (useCursor) {
          // Over-fetch by a small margin so the post-filter for (created_at, id)
          // boundary still leaves us with up to `limit` events after dedup.
          eventsQuery = eventsQuery
            .gte("created_at", afterCreatedAt)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(limit + 20);
        } else {
          eventsQuery = eventsQuery
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(limit);
        }

        const result = await eventsQuery;
        events = result.data;
        eventsError = result.error;
      }

      if (eventsError) return fail(500, eventsError.message);

      let orderedEvents = allEvents || useCursor ? (events || []) : (events || []).reverse();
      if (useCursor) {
        orderedEvents = orderedEvents.filter(e => (
          e.created_at > afterCreatedAt ||
          (e.created_at === afterCreatedAt && String(e.id) > afterId)
        ));
      }
      if (!allEvents) {
        orderedEvents = orderedEvents.slice(0, limit);
      }
      const lastEvent = orderedEvents.length > 0 ? orderedEvents[orderedEvents.length - 1] : null;
      const entries = orderedEvents
        .filter(e => e.event_type === "user_message" || e.event_type === "assistant_message")
        .map(e => ({
          role: e.role,
          content: e.content || "",
          metadata: e.payload || {},
          turn_id: e.turn_id || null,
          client_event_id: e.client_event_id || null,
          client_ts: e.client_ts || null,
          created_at: e.created_at,
          id: e.id,
        }));
      const lastMessage = entries.length > 0 ? entries[entries.length - 1] : null;

      return ok({
        session: session || null,
        events: orderedEvents,
        entries,
        // `cursor` advances by ANY event (tool calls, ui navigation, errors).
        // `messages_cursor` advances only by user/assistant messages so the
        // frontend can paginate the visible chat without skipping rows.
        cursor: lastEvent ? { created_at: lastEvent.created_at, id: lastEvent.id } : null,
        messages_cursor: lastMessage
          ? { created_at: lastMessage.created_at, id: lastMessage.id }
          : null,
      });
    }

    if (request.method === "GET" && action === "list_user_sessions") {
      const user_id = url.searchParams.get("user_id");
      if (!user_id) return fail(400, "user_id required");

      const sessionsRes = await fetchAllChunked(
        () => client.database
          .from(SESSIONS)
          .select("id, session_id, user_id, agent_id, status, title, metadata, created_at, updated_at")
          .eq("user_id", user_id),
        [
          { column: "created_at", ascending: true },
          { column: "id", ascending: true },
        ],
      );
      if (sessionsRes.error) return fail(500, sessionsRes.error.message);

      const eventsRes = await fetchAllChunked(
        () => client.database
          .from(EVENTS)
          .select("id, user_id, agent_id, session_id, event_type, role, content, created_at")
          .eq("user_id", user_id)
          .in("event_type", ["user_message", "assistant_message"]),
        [
          { column: "created_at", ascending: true },
          { column: "id", ascending: true },
        ],
      );
      if (eventsRes.error) return fail(500, eventsRes.error.message);

      const sessionMap = {};
      for (const session of sessionsRes.data || []) {
        sessionMap[sessionKey(session.agent_id, session.session_id)] = session;
      }

      const grouped = {};
      for (const event of eventsRes.data || []) {
        const key = sessionKey(event.agent_id, event.session_id);
        if (!grouped[key]) {
          grouped[key] = {
            user_id: event.user_id,
            agent_id: event.agent_id,
            session_id: event.session_id,
            message_count: 0,
            user_message_count: 0,
            assistant_message_count: 0,
            first_user_message: null,
            created_at: event.created_at,
            updated_at: event.created_at,
          };
        }
        const item = grouped[key];
        item.message_count += 1;
        if (event.event_type === "user_message") {
          item.user_message_count += 1;
          if (!item.first_user_message && event.content) {
            item.first_user_message = event.content;
          }
        }
        if (event.event_type === "assistant_message") {
          item.assistant_message_count += 1;
        }
        if (!item.created_at || event.created_at < item.created_at) {
          item.created_at = event.created_at;
        }
        if (!item.updated_at || event.created_at > item.updated_at) {
          item.updated_at = event.created_at;
        }
      }

      const conversations = Object.values(grouped).map(item => {
        const session = sessionMap[sessionKey(item.agent_id, item.session_id)] || {};
        const metadata = publicSessionMetadata(session);
        const updatedAt = item.updated_at || session.updated_at || session.created_at || null;
        return {
          id: sessionKey(item.agent_id, item.session_id),
          user_id: item.user_id,
          agent_id: item.agent_id,
          session_id: item.session_id,
          agent_kind: metadata.agent_kind,
          persona_username: metadata.persona_username,
          title: runtimeConversationTitle(session, item.first_user_message),
          message_count: item.message_count,
          user_message_count: item.user_message_count,
          assistant_message_count: item.assistant_message_count,
          created_at: item.created_at || session.created_at || updatedAt,
          updated_at: updatedAt,
          last_message_at: item.updated_at || null,
          status: session.status || "active",
        };
      }).sort((a, b) => compareIsoDesc(a.updated_at, b.updated_at));

      return ok({ conversations, total: conversations.length });
    }

    if (request.method === "GET" && action === "stats_by_user") {
      const eventsRes = await fetchAllChunked(
        () => client.database
          .from(EVENTS)
          .select("id, user_id, agent_id, session_id, event_type, created_at")
          .in("event_type", ["user_message", "assistant_message"]),
        [
          { column: "user_id", ascending: true },
          { column: "created_at", ascending: true },
          { column: "id", ascending: true },
        ],
      );
      if (eventsRes.error) return fail(500, eventsRes.error.message);

      const grouped = {};
      for (const event of eventsRes.data || []) {
        const userId = event.user_id;
        if (!grouped[userId]) {
          grouped[userId] = {
            user_id: userId,
            conversation_count: 0,
            total_messages: 0,
            last_conversation_at: null,
            _sessions: {},
          };
        }
        const item = grouped[userId];
        const key = sessionKey(event.agent_id, event.session_id);
        if (!item._sessions[key]) {
          item._sessions[key] = true;
          item.conversation_count += 1;
        }
        item.total_messages += 1;
        if (!item.last_conversation_at || event.created_at > item.last_conversation_at) {
          item.last_conversation_at = event.created_at;
        }
      }

      const stats = Object.values(grouped)
        .map(item => ({
          user_id: item.user_id,
          conversation_count: item.conversation_count,
          total_messages: item.total_messages,
          last_conversation_at: item.last_conversation_at,
        }))
        .sort((a, b) => compareIsoDesc(a.last_conversation_at, b.last_conversation_at));

      return ok({ stats });
    }

    if (request.method === "POST" && (action === "append_entries" || action === "append_events")) {
      const body = await request.json();
      const user_id = body.user_id;
      const agent_id = body.agent_id;
      const session_id = body.session_id;
      const missing = requireIdentity(user_id, agent_id, session_id);
      if (missing) return fail(400, missing);

      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const { data: existingSession, error: existingError } = await client.database
        .from(SESSIONS)
        .select("metadata, title, status")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("session_id", session_id)
        .maybeSingle();

      if (existingError) return fail(500, existingError.message);

      const mergedMetadata = {
        ...((existingSession && existingSession.metadata) || {}),
        ...(body.metadata || {}),
      };
      const sessionRow = {
        user_id,
        agent_id,
        session_id,
        status: body.status || (existingSession && existingSession.status) || "active",
        title: body.title !== undefined ? body.title : ((existingSession && existingSession.title) || null),
        metadata: mergedMetadata,
        updated_at: now,
      };

      const { error: upsertError } = await client.database
        .from(SESSIONS)
        .upsert(sessionRow, { onConflict: "user_id,agent_id,session_id" });

      if (upsertError) return fail(500, upsertError.message);

      const rawItems = action === "append_events"
        ? (Array.isArray(body.events) ? body.events : [])
        : (Array.isArray(body.entries) ? body.entries : []);
      const rows = rawItems
        .filter(e => e && (e.event_type || e.role) && (e.content || e.payload))
        .map((e, idx) => {
          const role = e.role || null;
          let eventType = e.event_type || "session_event";
          if (!e.event_type && role === "user") eventType = "user_message";
          if (!e.event_type && role === "assistant") eventType = "assistant_message";
          if (!e.event_type && role === "tool") eventType = "tool_event";
          return {
            user_id,
            agent_id,
            session_id,
            event_type: eventType,
            role,
            content: e.content ? String(e.content) : null,
            payload: e.payload || e.metadata || {},
            token_estimate: e.token_estimate || null,
            turn_id: e.turn_id || (e.payload && e.payload.turn_id) || null,
            client_event_id: e.client_event_id || null,
            client_ts: e.client_ts || e.created_at || null,
            // Keep created_at server-authored while preserving the caller's
            // event order inside a single append batch. UUID ids are random,
            // so equal timestamps would otherwise restore user/assistant rows
            // in arbitrary order when the cursor sorts by (created_at, id).
            created_at: new Date(nowMs + idx).toISOString(),
          };
        });

      // Insert in three lanes so the unique constraints from
      // u4a_agent_runtime_schema.sql act as idempotency keys:
      //   1. client_event_id present       -> upsert on uq_agent_session_events_client_event_full
      //   2. turn_id present + message-like -> upsert on uq_agent_session_events_turn_message
      //   3. everything else                -> plain insert
      // Both upsert lanes use ignoreDuplicates so an event resent after a
      // retry does NOT double-write user_message / assistant_message rows.
      const TURN_DEDUPE_TYPES = new Set([
        "user_message",
        "assistant_message",
        "context_snapshot",
        "error",
      ]);
      const rowsWithClientId = [];
      const rowsWithTurnDedupe = [];
      const rowsPlain = [];
      for (const row of rows) {
        if (row.client_event_id) {
          rowsWithClientId.push(row);
        } else if (row.turn_id && TURN_DEDUPE_TYPES.has(row.event_type)) {
          rowsWithTurnDedupe.push(row);
        } else {
          rowsPlain.push(row);
        }
      }

      if (rowsWithClientId.length > 0) {
        const { error: e1 } = await client.database
          .from(EVENTS)
          .upsert(rowsWithClientId, {
            onConflict: "user_id,agent_id,session_id,client_event_id",
            ignoreDuplicates: true,
          });
        if (e1) return fail(500, e1.message);
      }

      if (rowsWithTurnDedupe.length > 0) {
        const { error: e2 } = await client.database
          .from(EVENTS)
          .upsert(rowsWithTurnDedupe, {
            onConflict:
              "user_id,agent_id,session_id,turn_id,event_type,role",
            ignoreDuplicates: true,
          });
        if (e2) return fail(500, e2.message);
      }

      if (rowsPlain.length > 0) {
        const { error: e3 } = await client.database
          .from(EVENTS)
          .insert(rowsPlain);
        if (e3) return fail(500, e3.message);
      }

      return ok({ session_id, inserted: rows.length });
    }

    return fail(400, `Unknown action: ${action}`);
  } catch (e) {
    return fail(500, `Exception: ${e.message || String(e)}`);
  }
};
