// Edge Function for earnings_analyses CRUD operations
// Caching AI analysis of earnings call transcripts
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
    // GET: Retrieve cached earnings analysis
    const symbol = url.searchParams.get('symbol');
    const year = url.searchParams.get('year');
    const quarter = url.searchParams.get('quarter');

    if (!symbol || !year || !quarter) {
      return new Response(JSON.stringify({
        success: false,
        error: 'symbol, year, and quarter are required'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }

    try {
      // Query for non-expired analysis
      const { data, error } = await client.database
        .from('earnings_analyses')
        .select('*')
        .eq('symbol', symbol.toUpperCase())
        .eq('fiscal_year', parseInt(year))
        .eq('fiscal_quarter', parseInt(quarter))
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
            fiscal_year: row.fiscal_year,
            fiscal_quarter: row.fiscal_quarter,
            content: content,
            transcript_date: row.transcript_date,
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
    // POST: Save earnings analysis (upsert by symbol + year + quarter)
    try {
      const body = await request.json();
      const { symbol, fiscal_year, fiscal_quarter, content, transcript_date, model, generated_at, expires_at } = body;

      if (!symbol || !fiscal_year || !fiscal_quarter || !content) {
        return new Response(JSON.stringify({
          success: false,
          error: 'symbol, fiscal_year, fiscal_quarter, and content are required'
        }), {
          status: 400,
          headers: corsHeaders
        });
      }

      // Convert content to string if it's an object
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

      // Try to upsert (insert or update on conflict)
      const { data, error } = await client.database
        .from('earnings_analyses')
        .upsert([{
          symbol: symbol.toUpperCase(),
          fiscal_year: parseInt(fiscal_year),
          fiscal_quarter: parseInt(fiscal_quarter),
          content: contentStr,
          transcript_date: transcript_date || null,
          model: model || 'gemini-3-pro-preview',
          generated_at: generated_at || new Date().toISOString(),
          expires_at: expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString()
        }], {
          onConflict: 'symbol,fiscal_year,fiscal_quarter'
        })
        .select('id, symbol, fiscal_year, fiscal_quarter, generated_at');

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
