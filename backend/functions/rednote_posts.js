// Edge Function for RedNote (Xiaohongshu) posts CRUD operations
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

  // Create client with anon token - public access for rednote posts
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_INTERNAL_URL') || 'http://insforge:7130',
    anonKey: Deno.env.get('ANON_KEY')
  });

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    // POST - Save or upsert rednote post
    if (request.method === 'POST') {
      const body = await request.json();

      if (action === 'upsert') {
        // Upsert by report_date
        const { data: existing } = await client.database
          .from('rednote_posts')
          .select('id')
          .eq('report_date', body.report_date)
          .maybeSingle();

        let result;
        if (existing) {
          // Update existing
          result = await client.database
            .from('rednote_posts')
            .update(body)
            .eq('report_date', body.report_date)
            .select();
        } else {
          // Insert new
          result = await client.database
            .from('rednote_posts')
            .insert([body])
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
          message: existing ? 'Post updated' : 'Post created'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Default insert
      const { data, error } = await client.database
        .from('rednote_posts')
        .insert([body])
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

    // GET - Fetch rednote posts
    if (request.method === 'GET') {
      const reportDate = url.searchParams.get('date');
      const latest = url.searchParams.get('latest');
      const reportId = url.searchParams.get('report_id');

      // Get single post by date
      if (reportDate) {
        const { data, error } = await client.database
          .from('rednote_posts')
          .select('*')
          .eq('report_date', reportDate)
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

      // Get post by report_id
      if (reportId) {
        const { data, error } = await client.database
          .from('rednote_posts')
          .select('*')
          .eq('report_id', reportId)
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

      // Get latest post
      if (latest === 'true') {
        const { data, error } = await client.database
          .from('rednote_posts')
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

      // Get all posts with pagination
      const limit = parseInt(url.searchParams.get('limit') || '10');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const { data, error, count } = await client.database
        .from('rednote_posts')
        .select('id, report_id, report_date, generated_at', { count: 'exact' })
        .order('generated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data,
        total: count,
        limit,
        offset
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
