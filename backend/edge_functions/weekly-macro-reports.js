// Edge Function for weekly macro reports CRUD operations
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

  // Create client with anon token - public access for weekly reports
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_INTERNAL_URL') || 'http://insforge:7130',
    anonKey: Deno.env.get('ANON_KEY')
  });

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    // POST - Save or upsert report
    if (request.method === 'POST') {
      const body = await request.json();

      if (action === 'upsert') {
        // Upsert by week_label
        const { data: existing } = await client.database
          .from('weekly_macro_reports')
          .select('id')
          .eq('week_label', body.week_label)
          .maybeSingle();

        let result;
        if (existing) {
          // Update existing
          result = await client.database
            .from('weekly_macro_reports')
            .update(body)
            .eq('week_label', body.week_label)
            .select();
        } else {
          // Insert new
          result = await client.database
            .from('weekly_macro_reports')
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
          message: existing ? 'Report updated' : 'Report created'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Default insert
      const { data, error } = await client.database
        .from('weekly_macro_reports')
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

    // GET - Fetch reports
    if (request.method === 'GET') {
      const reportId = url.searchParams.get('id');
      const reportWeek = url.searchParams.get('week');
      const latest = url.searchParams.get('latest');
      const limit = parseInt(url.searchParams.get('limit') || '10');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      // Get single report by ID
      if (reportId) {
        const { data, error } = await client.database
          .from('weekly_macro_reports')
          .select('*')
          .eq('id', reportId)
          .maybeSingle();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!data) {
          return new Response(JSON.stringify({ success: false, error: 'Report not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get single report by week label
      if (reportWeek) {
        const { data, error } = await client.database
          .from('weekly_macro_reports')
          .select('*')
          .eq('week_label', reportWeek)
          .order('created_at', { ascending: false })
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

      // Get latest report
      if (latest === 'true') {
        const { data, error } = await client.database
          .from('weekly_macro_reports')
          .select('*')
          .order('week_label', { ascending: false })
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

      // Get list of reports with pagination
      const { data, error, count } = await client.database
        .from('weekly_macro_reports')
        .select('id, week_label, generated_at, executive_summary, signal_lights, created_at', { count: 'exact' })
        .order('week_label', { ascending: false })
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
