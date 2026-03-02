// Edge Function for stock_analyses CRUD operations
module.exports = async function(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Create client with anon token for public data access
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_INTERNAL_URL') || 'http://insforge:7130',
    anonKey: Deno.env.get('ANON_KEY')
  });

  const url = new URL(request.url);

  if (request.method === 'GET') {
    // GET: Retrieve cached analysis
    const symbol = url.searchParams.get('symbol');
    const analysisType = url.searchParams.get('type') || 'comprehensive';

    if (!symbol) {
      return new Response(JSON.stringify({ success: false, error: 'Symbol required' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    try {
      // Query for non-expired analysis
      const { data, error } = await client.database
        .from('stock_analyses')
        .select('*')
        .eq('symbol', symbol.toUpperCase())
        .eq('analysis_type', analysisType)
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1);

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: corsHeaders
        });
      }

      if (data && data.length > 0) {
        const row = data[0];
        // Parse content if it's a string
        let content = row.content;
        if (typeof content === 'string') {
          try {
            content = JSON.parse(content);
          } catch (e) {}
        }
        return new Response(JSON.stringify({
          success: true,
          data: {
            id: row.id,
            symbol: row.symbol,
            analysis_type: row.analysis_type,
            content: content,
            model: row.model,
            generated_at: row.generated_at,
            expires_at: row.expires_at
          }
        }), {
          status: 200,
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
        status: 404,
        headers: corsHeaders
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  if (request.method === 'POST') {
    // POST: Save analysis
    try {
      const body = await request.json();
      const { symbol, analysis_type, content, data_snapshot, model, generated_at, expires_at } = body;

      if (!symbol || !analysis_type || !content) {
        return new Response(JSON.stringify({
          success: false,
          error: 'symbol, analysis_type, and content are required'
        }), {
          status: 400,
          headers: corsHeaders
        });
      }

      // Convert content to string if it's an object
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      const snapshotStr = data_snapshot ? JSON.stringify(data_snapshot) : null;

      const upperSymbol = symbol.toUpperCase();
      const now = new Date().toISOString();
      const defaultExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // Delete existing record for same symbol + analysis_type, then insert new one
      await client.database
        .from('stock_analyses')
        .delete()
        .eq('symbol', upperSymbol)
        .eq('analysis_type', analysis_type);

      const { data, error } = await client.database
        .from('stock_analyses')
        .insert([{
          symbol: upperSymbol,
          analysis_type: analysis_type,
          content: contentStr,
          data_snapshot: snapshotStr,
          model: model || 'gemini-3.1-pro-preview',
          generated_at: generated_at || now,
          expires_at: expires_at || defaultExpiry
        }])
        .select('id, symbol, analysis_type, generated_at');

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: data && data.length > 0 ? data[0] : null
      }), {
        status: 201,
        headers: corsHeaders
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: corsHeaders
  });
};
