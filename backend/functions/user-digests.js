/**
 * Edge Function: user-digests
 * Handles CRUD operations for personal digests (PersonalBrew)
 */

module.exports = async function(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const userId = url.searchParams.get('user_id');
  const digestDate = url.searchParams.get('date');
  const digestId = url.searchParams.get('id');
  const latest = url.searchParams.get('latest');

  // GET: Retrieve digest(s)
  if (request.method === 'GET') {
    // Get by ID
    if (digestId) {
      const { data, error } = await this.database
        .from('user_digests')
        .select('*')
        .eq('id', digestId)
        .maybeSingle();

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get latest for user
    if (latest === 'true' && userId) {
      const { data, error } = await this.database
        .from('user_digests')
        .select('*')
        .eq('user_id', userId)
        .order('digest_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get by user_id and date
    if (userId && digestDate) {
      const { data, error } = await this.database
        .from('user_digests')
        .select('*')
        .eq('user_id', userId)
        .eq('digest_date', digestDate)
        .maybeSingle();

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // List digests for user
    if (userId) {
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const { data, error } = await this.database
        .from('user_digests')
        .select('id, user_id, digest_date, greeting, one_line_summary, symbols, created_at')
        .eq('user_id', userId)
        .order('digest_date', { ascending: false })
        .limit(limit);

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'user_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // POST: Insert or upsert digest
  if (request.method === 'POST') {
    const body = await request.json();

    // Upsert: update if exists for same user_id + digest_date, otherwise insert
    if (action === 'upsert') {
      // Check if exists
      const { data: existing } = await this.database
        .from('user_digests')
        .select('id')
        .eq('user_id', body.user_id)
        .eq('digest_date', body.digest_date)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { data, error } = await this.database
          .from('user_digests')
          .update(body)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true, data, action: 'updated' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Insert new
    const { data, error } = await this.database
      .from('user_digests')
      .insert([body])
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, data, action: 'inserted' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
};
