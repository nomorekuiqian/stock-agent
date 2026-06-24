// zsxq-ingest-store — Edge Function for 知识星球 ingestion persistence layer.
//
// Tables managed:
//   zsxq_credentials   — per-group cookie + status
//   zsxq_ingest_state  — per-group cursor / last-seen state
//   zsxq_ingest_runs   — per-run audit log
//   zsxq_thread_ledger — per-topic pipeline stage tracking
//
// Storage:
//   Bucket must be pre-created in the Insforge dashboard before use.
//   `content_base64` is required instead of raw binary in request bodies
//   because edge-function request bodies are JSON.
//
// All actions require X-Internal-Secret (including GET get_credential,
// because the cookie value is sensitive).

module.exports = async function (request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Internal-Secret",
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
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const requireInternal = () => {
    const expected = Deno.env.get("EDGE_FUNCTION_SECRET");
    if (!expected) {
      return new Response(
        JSON.stringify({ success: false, error: "EDGE_FUNCTION_SECRET not configured" }),
        { status: 503, headers: jsonHeaders },
      );
    }
    const provided = request.headers.get("x-internal-secret") || "";
    if (provided !== expected) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: jsonHeaders },
      );
    }
    return null;
  };

  // All actions require internal auth (cookie data is sensitive).
  const denied = requireInternal();
  if (denied) return denied;

  try {
    // -----------------------------------------------------------------------
    // get_credential  GET ?action=get_credential&group_id=...
    // -----------------------------------------------------------------------
    if (request.method === "GET" && action === "get_credential") {
      const groupId = url.searchParams.get("group_id");
      if (!groupId) {
        return new Response(JSON.stringify({ success: false, error: "group_id required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const { data, error } = await client.database
        .from("zsxq_credentials")
        .select("*")
        .eq("group_id", groupId)
        .maybeSingle();
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ success: true, data: data || null }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // -----------------------------------------------------------------------
    // set_credential  POST ?action=set_credential  body: {group_id, cookie, status?, updated_by?}
    // -----------------------------------------------------------------------
    if (request.method === "POST" && action === "set_credential") {
      const body = await request.json();
      if (!body.group_id || !body.cookie) {
        return new Response(JSON.stringify({ success: false, error: "group_id and cookie required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const row = {
        group_id: body.group_id,
        cookie: body.cookie,
        status: body.status || "active",
        updated_at: new Date().toISOString(),
        updated_by: body.updated_by || null,
      };
      const { data, error } = await client.database
        .from("zsxq_credentials")
        .upsert(row, { onConflict: "group_id" })
        .select("group_id, status, updated_at")
        .single();
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // -----------------------------------------------------------------------
    // get_state  GET ?action=get_state&group_id=...
    // -----------------------------------------------------------------------
    if (request.method === "GET" && action === "get_state") {
      const groupId = url.searchParams.get("group_id");
      if (!groupId) {
        return new Response(JSON.stringify({ success: false, error: "group_id required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const { data, error } = await client.database
        .from("zsxq_ingest_state")
        .select("*")
        .eq("group_id", groupId)
        .maybeSingle();
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ success: true, data: data || null }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // -----------------------------------------------------------------------
    // update_state  POST ?action=update_state  body: {group_id, ...fields}
    // -----------------------------------------------------------------------
    if (request.method === "POST" && action === "update_state") {
      const body = await request.json();
      if (!body.group_id) {
        return new Response(JSON.stringify({ success: false, error: "group_id required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const allowed = [
        "last_success_at",
        "last_seen_create_time",
        "last_seen_topic_id",
        "last_input_hash",
        "last_summary",
      ];
      const row = { group_id: body.group_id };
      for (const key of allowed) {
        if (body[key] !== undefined) row[key] = body[key];
      }
      const { data, error } = await client.database
        .from("zsxq_ingest_state")
        .upsert(row, { onConflict: "group_id" })
        .select("*")
        .single();
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // -----------------------------------------------------------------------
    // create_run  POST ?action=create_run  body: {group_id, crawl_type}
    // -----------------------------------------------------------------------
    if (request.method === "POST" && action === "create_run") {
      const body = await request.json();
      if (!body.group_id || !body.crawl_type) {
        return new Response(JSON.stringify({ success: false, error: "group_id and crawl_type required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const row = {
        group_id: body.group_id,
        crawl_type: body.crawl_type,
        status: "running",
        started_at: new Date().toISOString(),
      };
      const { data, error } = await client.database
        .from("zsxq_ingest_runs")
        .insert(row)
        .select("run_id, group_id, crawl_type, started_at, status")
        .single();
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // -----------------------------------------------------------------------
    // update_run  POST ?action=update_run  body: {run_id, ...fields}
    // -----------------------------------------------------------------------
    if (request.method === "POST" && action === "update_run") {
      const body = await request.json();
      if (!body.run_id) {
        return new Response(JSON.stringify({ success: false, error: "run_id required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const allowed = [
        "finished_at",
        "status",
        "pages_fetched",
        "topics_seen",
        "topics_new",
        "topics_updated",
        "comments_fetched",
        "files_downloaded",
        "indexed",
        "skipped",
        "failed",
        "error_message",
        "report",
      ];
      const updates = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ success: false, error: "no updatable fields provided" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const { data, error } = await client.database
        .from("zsxq_ingest_runs")
        .update(updates)
        .eq("run_id", body.run_id)
        .select("run_id, status, finished_at")
        .single();
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // -----------------------------------------------------------------------
    // get_run  GET ?action=get_run&run_id=...
    // -----------------------------------------------------------------------
    if (request.method === "GET" && action === "get_run") {
      const runId = url.searchParams.get("run_id");
      if (!runId) {
        return new Response(JSON.stringify({ success: false, error: "run_id required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const { data, error } = await client.database
        .from("zsxq_ingest_runs")
        .select("*")
        .eq("run_id", runId)
        .maybeSingle();
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ success: true, data: data || null }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // -----------------------------------------------------------------------
    // list_runs  GET ?action=list_runs&group_id=...&limit=30&status=running
    // Read-only: recent ingest runs (newest first), optional status filter.
    // Powers the admin monitoring view + the ingest concurrency guard.
    // -----------------------------------------------------------------------
    if (request.method === "GET" && action === "list_runs") {
      const groupId = url.searchParams.get("group_id");
      const status = url.searchParams.get("status");
      let limit = parseInt(url.searchParams.get("limit") || "30", 10);
      if (!Number.isFinite(limit) || limit < 1) limit = 30;
      if (limit > 200) limit = 200;
      let query = client.database.from("zsxq_ingest_runs").select("*");
      if (groupId) query = query.eq("group_id", groupId);
      if (status) query = query.eq("status", status);
      const { data, error } = await query
        .order("started_at", { ascending: false })
        .range(0, limit - 1);
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ success: true, data: data || [] }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // -----------------------------------------------------------------------
    // upsert_ledger  POST ?action=upsert_ledger  body: {row}
    // -----------------------------------------------------------------------
    if (request.method === "POST" && action === "upsert_ledger") {
      const body = await request.json();
      const row = body.row;
      if (!row || !row.group_id || !row.topic_id) {
        return new Response(
          JSON.stringify({ success: false, error: "row with group_id and topic_id required" }),
          { status: 400, headers: jsonHeaders },
        );
      }
      // Always stamp updated_at
      row.updated_at = new Date().toISOString();
      const { data, error } = await client.database
        .from("zsxq_thread_ledger")
        .upsert(row, { onConflict: "group_id,topic_id" })
        .select("group_id, topic_id, stage_indexed, updated_at")
        .single();
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // -----------------------------------------------------------------------
    // aggregate_ledger  GET ?action=aggregate_ledger&last_run_id=...
    // Returns stage counts (JS reduce over the run's ledger rows).
    // -----------------------------------------------------------------------
    if (request.method === "GET" && action === "aggregate_ledger") {
      const lastRunId = url.searchParams.get("last_run_id");
      if (!lastRunId) {
        return new Response(JSON.stringify({ success: false, error: "last_run_id required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const { data: rows, error } = await client.database
        .from("zsxq_thread_ledger")
        .select(
          "stage_crawled, stage_comments, stage_binaries, stage_normalized, stage_indexed, drop_reason",
        )
        .eq("last_run_id", lastRunId)
        .range(0, 9999);
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      const agg = {
        total: (rows || []).length,
        stage_crawled: {},
        stage_comments: {},
        stage_binaries: {},
        stage_normalized: {},
        stage_indexed: {},
        drop_reasons: {},
      };
      for (const row of rows || []) {
        for (const stage of [
          "stage_crawled",
          "stage_comments",
          "stage_binaries",
          "stage_normalized",
          "stage_indexed",
        ]) {
          const val = row[stage] || "pending";
          agg[stage][val] = (agg[stage][val] || 0) + 1;
        }
        if (row.drop_reason) {
          agg.drop_reasons[row.drop_reason] = (agg.drop_reasons[row.drop_reason] || 0) + 1;
        }
      }
      return new Response(JSON.stringify({ success: true, data: agg }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // -----------------------------------------------------------------------
    // put_object  POST ?action=put_object  body: {bucket, key, content_base64}
    // content_base64 is used because edge-function request bodies are JSON.
    // The target bucket must be pre-created in the Insforge dashboard.
    // -----------------------------------------------------------------------
    if (request.method === "POST" && action === "put_object") {
      const body = await request.json();
      if (!body.bucket || !body.key || !body.content_base64) {
        return new Response(
          JSON.stringify({ success: false, error: "bucket, key, and content_base64 required" }),
          { status: 400, headers: jsonHeaders },
        );
      }
      // Decode base64 → Uint8Array → Blob
      const binaryStr = atob(body.content_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const { data, error } = await client.storage.from(body.bucket).upload(body.key, blob);
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      return new Response(
        JSON.stringify({ success: true, data: { url: data.url, key: data.key } }),
        { status: 200, headers: jsonHeaders },
      );
    }

    // -----------------------------------------------------------------------
    // get_object_url  GET ?action=get_object_url&bucket=...&key=...
    // -----------------------------------------------------------------------
    if (request.method === "GET" && action === "get_object_url") {
      const bucket = url.searchParams.get("bucket");
      const key = url.searchParams.get("key");
      if (!bucket || !key) {
        return new Response(JSON.stringify({ success: false, error: "bucket and key required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      // Derive public URL from the storage SDK.
      const { data } = client.storage.from(bucket).getPublicUrl(key);
      return new Response(
        JSON.stringify({ success: true, data: { url: data ? data.publicUrl : null, key } }),
        { status: 200, headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Invalid action. Supported: get_credential, set_credential, get_state, update_state, " +
          "create_run, update_run, get_run, list_runs, upsert_ledger, aggregate_ledger, put_object, get_object_url",
      }),
      { status: 400, headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
};
