// Edge Function for market reports CRUD operations
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

  // Create client with anon token - public access for market reports
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
        // Upsert by report_date
        const { data: existing } = await client.database
          .from('market_reports')
          .select('id')
          .eq('report_date', body.report_date)
          .maybeSingle();

        let result;
        if (existing) {
          // Update existing
          result = await client.database
            .from('market_reports')
            .update(body)
            .eq('report_date', body.report_date)
            .select();
        } else {
          // Insert new
          result = await client.database
            .from('market_reports')
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
        .from('market_reports')
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
      const reportDate = url.searchParams.get('date');
      const latest = url.searchParams.get('latest');
      const limit = parseInt(url.searchParams.get('limit') || '10');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      // Get single report by ID
      if (reportId) {
        const { data, error } = await client.database
          .from('market_reports')
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

      // Get single report by date (returns latest if multiple exist)
      if (reportDate) {
        const { data, error } = await client.database
          .from('market_reports')
          .select('*')
          .eq('report_date', reportDate)
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
          .from('market_reports')
          .select('*')
          .order('report_date', { ascending: false })
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
        .from('market_reports')
        .select('id, report_date, timestamp, title, short_analysis, created_at', { count: 'exact' })
        .order('report_date', { ascending: false })
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
