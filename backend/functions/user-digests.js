// User Digests Edge Function
// Queries personal_digests table for digest preview and listing

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
  const userId = url.searchParams.get('user_id');
  const digestId = url.searchParams.get('digest_id');
  const date = url.searchParams.get('date');
  const limit = parseInt(url.searchParams.get('limit') || '20');

  try {
    let query = client.database.from('personal_digests');

    if (digestId) {
      // Get specific digest by ID
      const { data, error } = await query
        .select('*')
        .eq('id', digestId)
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (userId && date) {
      // Get digest for specific user and date
      const { data, error } = await query
        .select('*')
        .eq('user_id', userId)
        .eq('digest_date', date)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return new Response(JSON.stringify({ success: true, data: data || null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (userId) {
      // List digests for user
      const { data, error } = await query
        .select('*')
        .eq('user_id', userId)
        .order('digest_date', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data: data || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Please provide user_id or digest_id parameter'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
