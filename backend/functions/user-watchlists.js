// User Watchlists Edge Function
// Queries user_watchlists table for getting user's watchlist symbols

module.exports = async function(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');

  if (!userId) {
    return new Response(JSON.stringify({
      success: false,
      error: 'user_id is required'
    }), { status: 400, headers: corsHeaders });
  }

  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_INTERNAL_URL') || 'http://insforge:7130',
    anonKey: Deno.env.get('ANON_KEY')
  });

  try {
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
      error: error.message || 'Internal server error'
    }), { status: 500, headers: corsHeaders });
  }
};
