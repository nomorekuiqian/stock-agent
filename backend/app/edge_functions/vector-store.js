// Generic Vector Store - Edge Function
//
// Expected tables:
//   vector_documents(id, source_type, source_id, title, url, symbol,
//     report_date, visibility, user_id, metadata, content_hash, created_at, updated_at)
//   vector_chunks(id, document_id, source_type, source_id, chunk_index, content,
//     content_hash, token_count, title, url, symbol, report_date, visibility,
//     user_id, metadata, embedding, embedding_model, created_at)
//
// Expected RPC:
//   match_vector_chunks(query_embedding, match_count, match_threshold, filters)
module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
  const DOCS_TABLE = "vector_documents";
  const CHUNKS_TABLE = "vector_chunks";

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

  if (request.method !== "GET") {
    const denied = requireInternal();
    if (denied) return denied;
  }

  try {
    if (request.method === "POST" && action === "embed") {
      const body = await request.json();
      const input = body.input;
      const model = body.model || "openai/text-embedding-3-small";
      if (!(typeof input === "string" || Array.isArray(input))) {
        return new Response(JSON.stringify({ success: false, error: "input string or string[] required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const response = await client.ai.embeddings.create({
        model,
        input,
        encoding_format: "float",
      });
      const embeddings = (response.data || []).map((item) => item.embedding);

      return new Response(JSON.stringify({ success: true, model, embeddings }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    if (request.method === "GET" && action === "get_document_by_hash") {
      const sourceType = url.searchParams.get("source_type");
      const sourceId = url.searchParams.get("source_id");
      const contentHash = url.searchParams.get("content_hash");
      if (!sourceType || !sourceId || !contentHash) {
        return new Response(
          JSON.stringify({ success: false, error: "source_type, source_id, content_hash required" }),
          { status: 400, headers: jsonHeaders },
        );
      }

      const { data, error } = await client.database
        .from(DOCS_TABLE)
        .select("id, source_type, source_id, content_hash")
        .eq("source_type", sourceType)
        .eq("source_id", sourceId)
        .eq("content_hash", contentHash)
        .maybeSingle();

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      if (!data) {
        return new Response(JSON.stringify({ success: true, data: null }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      const { data: chunks, error: countError } = await client.database
        .from(CHUNKS_TABLE)
        .select("id")
        .eq("document_id", data.id)
        .range(0, 9999);

      if (countError) {
        return new Response(JSON.stringify({ success: false, error: countError.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }

      return new Response(
        JSON.stringify({ success: true, data: { ...data, chunk_count: (chunks || []).length } }),
        { status: 200, headers: jsonHeaders },
      );
    }

    if (request.method === "POST" && action === "upsert_document") {
      const body = await request.json();
      if (!body.source_type || !body.source_id || !body.content_hash) {
        return new Response(
          JSON.stringify({ success: false, error: "source_type, source_id, content_hash required" }),
          { status: 400, headers: jsonHeaders },
        );
      }

      const row = {
        source_type: body.source_type,
        source_id: body.source_id,
        title: body.title || null,
        url: body.url || null,
        symbol: body.symbol || null,
        report_date: body.report_date || null,
        visibility: body.visibility || "public",
        user_id: body.user_id || null,
        metadata: body.metadata || {},
        content_hash: body.content_hash,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await client.database
        .from(DOCS_TABLE)
        .upsert(row, { onConflict: "source_type,source_id,content_hash" })
        .select("id, source_type, source_id")
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

    if (request.method === "POST" && action === "upsert_chunks") {
      const body = await request.json();
      const chunks = Array.isArray(body.chunks) ? body.chunks : [];
      if (chunks.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "chunks array required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const { data, error } = await client.database
        .from(CHUNKS_TABLE)
        .upsert(chunks, { onConflict: "document_id,chunk_index" })
        .select("id");

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }

      return new Response(JSON.stringify({ success: true, count: (data || []).length }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    if (request.method === "POST" && action === "search") {
      const body = await request.json();
      if (!Array.isArray(body.query_embedding)) {
        return new Response(JSON.stringify({ success: false, error: "query_embedding required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const { data, error } = await client.database.rpc("match_vector_chunks", {
        query_embedding: body.query_embedding,
        match_count: body.match_count || 8,
        match_threshold: body.match_threshold ?? 0.7,
        filters: body.filters || {},
      });

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

    if (request.method === "POST" && action === "search_text") {
      const body = await request.json();
      const keywords = Array.isArray(body.keywords)
        ? body.keywords.map((kw) => String(kw || "").trim()).filter(Boolean).slice(0, 20)
        : [];
      if (keywords.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "keywords array required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const { data, error } = await client.database.rpc("search_vector_chunks_text", {
        keywords,
        match_count: body.match_count || 8,
        filters: body.filters || {},
      });

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

    if (request.method === "DELETE" && action === "delete_source") {
      const sourceType = url.searchParams.get("source_type");
      const sourceId = url.searchParams.get("source_id");
      if (!sourceType || !sourceId) {
        return new Response(
          JSON.stringify({ success: false, error: "source_type and source_id required" }),
          { status: 400, headers: jsonHeaders },
        );
      }

      const { data: docs, error: readError } = await client.database
        .from(DOCS_TABLE)
        .select("id")
        .eq("source_type", sourceType)
        .eq("source_id", sourceId)
        .range(0, 9999);

      if (readError) {
        return new Response(JSON.stringify({ success: false, error: readError.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }

      const docIds = (docs || []).map((d) => d.id);
      let deletedChunks = 0;
      if (docIds.length > 0) {
        const { data: chunkRows, error: chunkError } = await client.database
          .from(CHUNKS_TABLE)
          .delete()
          .in("document_id", docIds)
          .select("id");
        if (chunkError) {
          return new Response(JSON.stringify({ success: false, error: chunkError.message }), {
            status: 500,
            headers: jsonHeaders,
          });
        }
        deletedChunks = (chunkRows || []).length;
      }

      const { data: deletedDocs, error: deleteError } = await client.database
        .from(DOCS_TABLE)
        .delete()
        .eq("source_type", sourceType)
        .eq("source_id", sourceId)
        .select("id");

      if (deleteError) {
        return new Response(JSON.stringify({ success: false, error: deleteError.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          deleted_documents: (deletedDocs || []).length,
          deleted_chunks: deletedChunks,
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Invalid request. Use action=embed, get_document_by_hash, upsert_document, upsert_chunks, search, delete_source",
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
