// Edge Function for liquidity analysis CRUD operations
module.exports = async function(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_INTERNAL_URL') || 'http://insforge:7130',
    anonKey: Deno.env.get('ANON_KEY')
  });

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    // POST - Save analysis
    if (request.method === 'POST') {
      const body = await request.json();

      if (action === 'insert') {
        const { data, error } = await client.database
          .from('liquidity_analysis')
          .insert([{
            analysis: body.analysis,
            status: body.status,
            metrics_snapshot: body.metrics_snapshot || {},
            generated_at: body.generated_at,
            model: body.model
          }])
          .select();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true, data: data?.[0] }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET - Fetch analysis
    if (request.method === 'GET') {
      const analysisId = url.searchParams.get('id');
      const latest = url.searchParams.get('latest');
      const limit = parseInt(url.searchParams.get('limit') || '10');

      // Get single analysis by ID
      if (analysisId) {
        const { data, error } = await client.database
          .from('liquidity_analysis')
          .select('*')
          .eq('id', analysisId)
          .maybeSingle();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get latest analysis
      if (latest === 'true') {
        const { data, error } = await client.database
          .from('liquidity_analysis')
          .select('*')
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get list of analyses
      const { data, error } = await client.database
        .from('liquidity_analysis')
        .select('id, status, generated_at, model, created_at')
        .order('generated_at', { ascending: false })
        .limit(limit);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
