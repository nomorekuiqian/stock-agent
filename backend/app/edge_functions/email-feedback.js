// Edge Function for email feedback CRUD operations
// Handles feedback recording and statistics
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
    // POST - Save feedback
    if (request.method === 'POST') {
      const body = await request.json();

      if (action === 'upsert') {
        // Validate required fields
        if (!body.report_date || !body.email || !body.rating) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: report_date, email, rating'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Validate rating value
        const validRatings = ['satisfied', 'neutral', 'dissatisfied'];
        if (!validRatings.includes(body.rating)) {
          return new Response(JSON.stringify({
            error: 'Invalid rating. Must be: satisfied, neutral, or dissatisfied'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Check if feedback already exists
        const { data: existing } = await client.database
          .from('email_feedback')
          .select('id, rating')
          .eq('report_date', body.report_date)
          .eq('email', body.email)
          .maybeSingle();

        let result;
        let isDuplicate = false;

        if (existing) {
          // Update existing feedback
          result = await client.database
            .from('email_feedback')
            .update({
              rating: body.rating,
              report_id: body.report_id || null
            })
            .eq('report_date', body.report_date)
            .eq('email', body.email)
            .select();
          isDuplicate = true;
        } else {
          // Insert new feedback
          result = await client.database
            .from('email_feedback')
            .insert([{
              report_id: body.report_id || null,
              report_date: body.report_date,
              email: body.email,
              rating: body.rating
            }])
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
          isDuplicate,
          message: isDuplicate ? 'Feedback updated' : 'Feedback recorded'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // action=stats - Get statistics for date range
      if (action === 'stats') {
        const startDate = body.start_date;
        const endDate = body.end_date;

        if (!startDate || !endDate) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: start_date, end_date'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get all feedback in date range
        const { data: feedbacks, error } = await client.database
          .from('email_feedback')
          .select('report_date, rating, created_at')
          .gte('report_date', startDate)
          .lte('report_date', endDate)
          .order('report_date', { ascending: true });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Calculate statistics
        const total = feedbacks.length;
        const breakdown = {
          satisfied: feedbacks.filter(f => f.rating === 'satisfied').length,
          neutral: feedbacks.filter(f => f.rating === 'neutral').length,
          dissatisfied: feedbacks.filter(f => f.rating === 'dissatisfied').length
        };
        const satisfactionRate = total > 0 ? breakdown.satisfied / total : 0;

        // Group by date for daily stats
        const dailyMap = {};
        feedbacks.forEach(f => {
          if (!dailyMap[f.report_date]) {
            dailyMap[f.report_date] = { satisfied: 0, neutral: 0, dissatisfied: 0 };
          }
          dailyMap[f.report_date][f.rating]++;
        });

        const daily = Object.keys(dailyMap).map(date => {
          const c = /** @type {{satisfied:number,neutral:number,dissatisfied:number}} */ (dailyMap[date]);
          return { date, satisfied: c.satisfied, neutral: c.neutral, dissatisfied: c.dissatisfied, total: c.satisfied + c.neutral + c.dissatisfied };
        });

        return new Response(JSON.stringify({
          success: true,
          period: { start: startDate, end: endDate },
          total,
          breakdown,
          satisfaction_rate: Math.round(satisfactionRate * 100) / 100,
          daily
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // action=list - Get individual records with email for admin dashboard
      if (action === 'list') {
        const startDate = body.start_date;
        const endDate = body.end_date;

        let query = client.database
          .from('email_feedback')
          .select('email, rating, report_date, created_at')
          .order('report_date', { ascending: false });

        if (startDate) query = query.gte('report_date', startDate);
        if (endDate) query = query.lte('report_date', endDate);

        const { data: records, error } = await query;

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          data: records || [],
          total_records: (records || []).length
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET - Check if feedback exists
    if (request.method === 'GET') {
      const reportDate = url.searchParams.get('report_date');
      const email = url.searchParams.get('email');

      if (reportDate && email) {
        const { data, error } = await client.database
          .from('email_feedback')
          .select('id, rating, created_at')
          .eq('report_date', reportDate)
          .eq('email', email)
          .maybeSingle();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          exists: !!data,
          data
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        error: 'Missing required params: report_date, email'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
