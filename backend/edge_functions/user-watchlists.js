// User Watchlists Edge Function
// GET: query user_watchlists table for user's watchlist symbols
// POST: upsert user's watchlist (action=upsert)

function jsonResponse(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers });
}

function parseBearerToken(request) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

async function resolveAuthContext(request, baseUrl, anonKey, internalSecret) {
  const internalHeader = request.headers.get('X-Internal-Secret') || request.headers.get('x-internal-secret');
  if (internalSecret && internalHeader && internalHeader === internalSecret) {
    return { ok: true, internal: true, userId: null, token: null };
  }

  const token = parseBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing authentication' };
  }

  try {
    const resp = await fetch(`${baseUrl}/api/auth/sessions/current`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey || ''
      }
    });

    if (resp.status !== 200) {
      return { ok: false, status: 401, error: 'Invalid or expired token' };
    }

    const data = await resp.json().catch(() => ({}));
    const userObj = data?.user || data;
    const userId = userObj?.id;
    if (!userId) {
      return { ok: false, status: 401, error: 'Invalid auth session' };
    }
    return { ok: true, internal: false, userId, token };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: (error instanceof Error ? error.message : String(error)) || 'Auth service unavailable'
    };
  }
}

module.exports = async function(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Internal-Secret',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const baseUrl = Deno.env.get('INSFORGE_INTERNAL_URL') || 'http://insforge:7130';
  const anonKey = Deno.env.get('ANON_KEY') || '';
  const internalSecret = Deno.env.get('EDGE_FUNCTION_SECRET') || Deno.env.get('CRON_SECRET') || '';
  const auth = await resolveAuthContext(request, baseUrl, anonKey, internalSecret);
  if (!auth.ok) {
    return jsonResponse({ success: false, error: auth.error }, auth.status, corsHeaders);
  }

  const client = createClient({
    baseUrl,
    edgeFunctionToken: auth.token || undefined,
    anonKey
  });

  const url = new URL(request.url);

  try {
    // POST - Upsert watchlist
    if (request.method === 'POST') {
      const body = await request.json();

      if (!body.user_id) {
        return jsonResponse({
          success: false,
          error: 'user_id is required'
        }, 400, corsHeaders);
      }

      if (!auth.internal && auth.userId !== body.user_id) {
        return jsonResponse({
          success: false,
          error: 'Forbidden: user_id mismatch'
        }, 403, corsHeaders);
      }

      const watchlistData = {
        user_id: body.user_id,
        symbols: body.symbols || [],
        email: body.email || '',
        updated_at: new Date().toISOString()
      };

      // Check if exists
      const { data: existing } = await client.database
        .from('user_watchlists')
        .select('id, updated_at')
        .eq('user_id', body.user_id)
        .maybeSingle();

      if (
        existing &&
        body.base_updated_at &&
        existing.updated_at &&
        body.base_updated_at !== existing.updated_at
      ) {
        return jsonResponse({
          success: false,
          error: 'Watchlist was updated elsewhere. Please refresh and try again.',
          data: { updated_at: existing.updated_at }
        }, 409, corsHeaders);
      }

      let result;
      if (existing) {
        result = await client.database
          .from('user_watchlists')
          .update(watchlistData)
          .eq('user_id', body.user_id)
          .select()
          .single();
      } else {
        result = await client.database
          .from('user_watchlists')
          .insert(watchlistData)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      return jsonResponse({
        success: true,
        action: existing ? 'updated' : 'created',
        data: result.data
      }, existing ? 200 : 201, corsHeaders);
    }

    // GET - Query watchlist
    const userId = url.searchParams.get('user_id');

    if (!userId) {
      return jsonResponse({
        success: false,
        error: 'user_id is required'
      }, 400, corsHeaders);
    }

    if (!auth.internal && auth.userId !== userId) {
      return jsonResponse({
        success: false,
        error: 'Forbidden: user_id mismatch'
      }, 403, corsHeaders);
    }

    const { data, error } = await client.database
      .from('user_watchlists')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    return jsonResponse({
      success: true,
      data: data || null
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Error in user-watchlists function:', error);
    return jsonResponse({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Internal server error'
    }, 500, corsHeaders);
  }
};
