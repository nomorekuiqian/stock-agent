// Edge Function for user feedback CRUD operations
// Handles general user feedback collection from contact page
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
    // POST - Submit or list feedback
    if (request.method === 'POST') {
      const body = await request.json();

      // action=submit - Submit new feedback
      if (action === 'submit') {
        // Validate required fields
        if (!body.rating || !body.email) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: rating, email'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Validate rating value
        const validRatings = ['helpful', 'neutral', 'not_helpful'];
        if (!validRatings.includes(body.rating)) {
          return new Response(JSON.stringify({
            error: 'Invalid rating. Must be: helpful, neutral, or not_helpful'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Insert new feedback (no unique constraint, allow multiple from same user)
        const result = await client.database
          .from('user_feedback')
          .insert([{
            rating: body.rating,
            email: body.email,
            message: body.message || null
          }])
          .select();

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          data: result.data?.[0],
          message: 'Feedback submitted successfully'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // action=list - List feedback with pagination (admin use)
      if (action === 'list') {
        const page = body.page || 1;
        const pageSize = body.page_size || 20;
        const offset = (page - 1) * pageSize;

        // Get total count
        const { count, error: countError } = await client.database
          .from('user_feedback')
          .select('*', { count: 'exact', head: true });

        if (countError) {
          return new Response(JSON.stringify({ error: countError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get paginated data
        const { data, error } = await client.database
          .from('user_feedback')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          data: data || [],
          total: count || 0,
          page,
          page_size: pageSize,
          total_pages: Math.ceil((count || 0) / pageSize)
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
