// Edge Function for sector subscriptions CRUD operations
// No import needed - createClient is injected by the worker template
module.exports = async function(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Extract token from request headers for authenticated access
  const authHeader = request.headers.get('Authorization');
  const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;

  // Create client with user's token for authenticated access
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_INTERNAL_URL') || 'http://insforge:7130',
    edgeFunctionToken: userToken,
    anonKey: Deno.env.get('ANON_KEY')
  });

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    // POST - Subscribe to a sector
    if (request.method === 'POST') {
      const body = await request.json();
      const { user_id, sector_id } = body;

      if (!user_id || !sector_id) {
        return new Response(JSON.stringify({ error: 'user_id and sector_id are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if already subscribed
      const { data: existing } = await client.database
        .from('user_sector_subscriptions')
        .select('id')
        .eq('user_id', user_id)
        .eq('sector_id', sector_id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({
          success: true,
          is_new: false,
          message: 'Already subscribed'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Insert new subscription
      const { data, error } = await client.database
        .from('user_sector_subscriptions')
        .insert([{ user_id, sector_id }])
        .select();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        is_new: true,
        data: data?.[0]
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // DELETE - Unsubscribe from a sector
    if (request.method === 'DELETE') {
      const user_id = url.searchParams.get('user_id');
      const sector_id = url.searchParams.get('sector_id');

      if (!user_id || !sector_id) {
        return new Response(JSON.stringify({ error: 'user_id and sector_id are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error } = await client.database
        .from('user_sector_subscriptions')
        .delete()
        .eq('user_id', user_id)
        .eq('sector_id', sector_id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET - List user subscriptions
    if (request.method === 'GET') {
      const user_id = url.searchParams.get('user_id');

      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data, error } = await client.database
        .from('user_sector_subscriptions')
        .select('id, sector_id, subscribed_at')
        .eq('user_id', user_id)
        .order('subscribed_at', { ascending: false });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        subscriptions: data || []
      }), {
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
