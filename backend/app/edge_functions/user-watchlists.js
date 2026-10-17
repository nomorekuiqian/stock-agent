// User Watchlists Edge Function
// GET: query user_watchlists table for user's watchlist symbols
// POST: upsert user's watchlist (action=upsert)

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

  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_INTERNAL_URL') || 'http://insforge:7130',
    anonKey: Deno.env.get('ANON_KEY')
  });

  const url = new URL(request.url);

  try {
    // POST - Upsert watchlist
    if (request.method === 'POST') {
      const body = await request.json();

      if (!body.user_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'user_id is required'
        }), { status: 400, headers: corsHeaders });
      }

      const watchlistData = {
        user_id: body.user_id,
        symbols: body.symbols || [],
        email: body.email || '',
        updated_at: new Date().toISOString()
      };

      // Check if exists
      const { data: existing } = await client.database
        .from('user_watchlists')
        .select('id')
        .eq('user_id', body.user_id)
        .maybeSingle();

      let result;
      if (existing) {
        result = await client.database
          .from('user_watchlists')
          .update(watchlistData)
          .eq('user_id', body.user_id)
          .select()
          .single();
      } else {
        result = await client.database
          .from('user_watchlists')
          .insert(watchlistData)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      return new Response(JSON.stringify({
        success: true,
        action: existing ? 'updated' : 'created',
        data: result.data
      }), { status: existing ? 200 : 201, headers: corsHeaders });
    }

    // GET - Query watchlist
    const userId = url.searchParams.get('user_id');

    if (!userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'user_id is required'
      }), { status: 400, headers: corsHeaders });
    }

    const { data, error } = await client.database
      .from('user_watchlists')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    return new Response(JSON.stringify({
      success: true,
      data: data || null
    }), { status: 200, headers: corsHeaders });

  } catch (error) {
    console.error('Error in user-watchlists function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Internal server error'
    }), { status: 500, headers: corsHeaders });
  }
};
