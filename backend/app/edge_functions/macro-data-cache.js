// Edge Function for macro data cache CRUD operations
// Supports: GET (single key, batch keys, list all), POST (upsert)
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
    // POST - Upsert cache entry
    if (request.method === 'POST') {
      const body = await request.json();

      if (action === 'upsert') {
        const { data_key, data, fetched_at, expires_at, source, error } = body;

        if (!data_key || !source) {
          return new Response(JSON.stringify({ error: 'data_key and source are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Check if exists
        const { data: existing } = await client.database
          .from('macro_data_cache')
          .select('id')
          .eq('data_key', data_key)
          .maybeSingle();

        const record = { data_key, data, fetched_at, expires_at, source, error: error || null };

        let result;
        if (existing) {
          result = await client.database
            .from('macro_data_cache')
            .update(record)
            .eq('data_key', data_key)
            .select();
        } else {
          result = await client.database
            .from('macro_data_cache')
            .insert([record])
            .select();
        }

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          data: result.data?.[0],
          message: existing ? 'Cache updated' : 'Cache created'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown action. Use ?action=upsert' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET - Read cache entries
    if (request.method === 'GET') {
      const key = url.searchParams.get('key');
      const keys = url.searchParams.get('keys');
      const listAll = url.searchParams.get('all');

      // Single key lookup
      if (key) {
        const { data, error } = await client.database
          .from('macro_data_cache')
          .select('*')
          .eq('data_key', key)
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

      // Batch key lookup
      if (keys) {
        const keyList = keys.split(',').map(k => k.trim());
        const { data, error } = await client.database
          .from('macro_data_cache')
          .select('*')
          .in('data_key', keyList);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true, data: data || [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // List all cache entries (status view)
      if (listAll === 'true') {
        const { data, error } = await client.database
          .from('macro_data_cache')
          .select('data_key, source, fetched_at, expires_at, error, created_at')
          .order('data_key', { ascending: true });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true, data: data || [], count: (data || []).length }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Provide ?key=xxx, ?keys=a,b,c, or ?all=true' }), {
        status: 400,
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
