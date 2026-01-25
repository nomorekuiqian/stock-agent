// Edge Function for sector digests CRUD operations
// No import needed - createClient is injected by the worker template
module.exports = async function(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Create client with anon token - public access for sector digests
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_INTERNAL_URL') || 'http://insforge:7130',
    anonKey: Deno.env.get('ANON_KEY')
  });

  const url = new URL(request.url);

  try {
    // POST - Save a new sector digest
    if (request.method === 'POST') {
      const body = await request.json();
      const { sector_id, digest_date, digest_data } = body;

      if (!sector_id || !digest_date || !digest_data) {
        return new Response(JSON.stringify({ error: 'sector_id, digest_date and digest_data are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if digest already exists for this sector and date
      const { data: existing } = await client.database
        .from('sector_digests')
        .select('id')
        .eq('sector_id', sector_id)
        .eq('digest_date', digest_date)
        .maybeSingle();

      let result;
      if (existing) {
        // Update existing digest
        result = await client.database
          .from('sector_digests')
          .update({ digest_data })
          .eq('sector_id', sector_id)
          .eq('digest_date', digest_date)
          .select();
      } else {
        // Insert new digest
        result = await client.database
          .from('sector_digests')
          .insert([{ sector_id, digest_date, digest_data }])
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
        message: existing ? 'Digest updated' : 'Digest created'
      }), {
        status: existing ? 200 : 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET - Fetch sector digests
    if (request.method === 'GET') {
      const sector_id = url.searchParams.get('sector_id');
      const digest_date = url.searchParams.get('date');
      const latest = url.searchParams.get('latest');
      const limit = parseInt(url.searchParams.get('limit') || '10');

      // Get latest digest for a specific sector
      if (sector_id && latest === 'true') {
        const { data, error } = await client.database
          .from('sector_digests')
          .select('*')
          .eq('sector_id', sector_id)
          .order('digest_date', { ascending: false })
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

      // Get digest by sector_id and date
      if (sector_id && digest_date) {
        const { data, error } = await client.database
          .from('sector_digests')
          .select('*')
          .eq('sector_id', sector_id)
          .eq('digest_date', digest_date)
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

      // Get all digests for a sector
      if (sector_id) {
        const { data, error } = await client.database
          .from('sector_digests')
          .select('id, sector_id, digest_date, generated_at')
          .eq('sector_id', sector_id)
          .order('digest_date', { ascending: false })
          .limit(limit);

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

      // Get latest digests across all sectors
      const { data, error } = await client.database
        .from('sector_digests')
        .select('id, sector_id, digest_date, generated_at')
        .order('digest_date', { ascending: false })
        .limit(limit);

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
