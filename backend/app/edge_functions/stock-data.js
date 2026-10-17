// Edge Function for stock_profiles and stock_financials CRUD operations
// Actions: get_profile, upsert_profile, get_financials, upsert_financial
module.exports = async function(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
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

  if (!action) {
    return new Response(JSON.stringify({ success: false, error: 'action parameter required' }), {
      status: 400, headers: corsHeaders
    });
  }

  try {
    // ===================== PROFILES =====================

    if (action === 'get_profile' && request.method === 'GET') {
      const symbol = url.searchParams.get('symbol');
      if (!symbol) {
        return new Response(JSON.stringify({ success: false, error: 'symbol required' }), {
          status: 400, headers: corsHeaders
        });
      }

      const { data, error } = await client.database
        .from('stock_profiles')
        .select('*')
        .eq('symbol', symbol.toUpperCase())
        .limit(1);

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500, headers: corsHeaders
        });
      }

      if (data && data.length > 0) {
        return new Response(JSON.stringify({ success: true, data: data[0] }), {
          status: 200, headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
        status: 200, headers: corsHeaders
      });
    }

    if (action === 'upsert_profile' && request.method === 'POST') {
      const body = await request.json();
      const { symbol, company_name, company_name_zh, exchange, classification, description, company_details, data_source } = body;

      if (!symbol || !company_name) {
        return new Response(JSON.stringify({ success: false, error: 'symbol and company_name required' }), {
          status: 400, headers: corsHeaders
        });
      }

      const upperSymbol = symbol.toUpperCase();
      const now = new Date().toISOString();

      // Check if profile exists
      const { data: existing } = await client.database
        .from('stock_profiles')
        .select('id')
        .eq('symbol', upperSymbol)
        .limit(1);

      let result;
      if (existing && existing.length > 0) {
        // Update existing
        const { data, error } = await client.database
          .from('stock_profiles')
          .update({
            company_name,
            company_name_zh: company_name_zh || null,
            exchange: exchange || null,
            classification: classification ? JSON.stringify(classification) : null,
            description: description ? JSON.stringify(description) : null,
            company_details: company_details ? JSON.stringify(company_details) : null,
            data_source: data_source || 'openbb_fmp',
            updated_at: now
          })
          .eq('symbol', upperSymbol)
          .select('id, symbol, company_name, updated_at');
        result = { data, error };
      } else {
        // Insert new
        const { data, error } = await client.database
          .from('stock_profiles')
          .insert([{
            symbol: upperSymbol,
            company_name,
            company_name_zh: company_name_zh || null,
            exchange: exchange || null,
            classification: classification ? JSON.stringify(classification) : null,
            description: description ? JSON.stringify(description) : null,
            company_details: company_details ? JSON.stringify(company_details) : null,
            data_source: data_source || 'openbb_fmp'
          }])
          .select('id, symbol, company_name, created_at');
        result = { data, error };
      }

      if (result.error) {
        return new Response(JSON.stringify({ success: false, error: result.error.message }), {
          status: 500, headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: result.data && result.data.length > 0 ? result.data[0] : null
      }), {
        status: existing && existing.length > 0 ? 200 : 201,
        headers: corsHeaders
      });
    }

    // ===================== FINANCIALS =====================

    if (action === 'get_financials' && request.method === 'GET') {
      const symbol = url.searchParams.get('symbol');
      const limit = parseInt(url.searchParams.get('limit') || '8', 10);

      if (!symbol) {
        return new Response(JSON.stringify({ success: false, error: 'symbol required' }), {
          status: 400, headers: corsHeaders
        });
      }

      const { data, error } = await client.database
        .from('stock_financials')
        .select('*')
        .eq('symbol', symbol.toUpperCase())
        .order('period_end_date', { ascending: false })
        .limit(limit);

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500, headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({ success: true, data: data || [] }), {
        status: 200, headers: corsHeaders
      });
    }

    if (action === 'upsert_financial' && request.method === 'POST') {
      const body = await request.json();
      const { symbol, fiscal_year, fiscal_quarter, period_type, period_end_date, income_statement, balance_sheet, cash_flow, currency, data_source, filing_date } = body;

      if (!symbol || !fiscal_year || !period_type || !period_end_date) {
        return new Response(JSON.stringify({
          success: false,
          error: 'symbol, fiscal_year, period_type, and period_end_date required'
        }), {
          status: 400, headers: corsHeaders
        });
      }

      const upperSymbol = symbol.toUpperCase();
      const now = new Date().toISOString();

      // Check if record exists by unique key (symbol, fiscal_year, fiscal_quarter, period_type)
      let query = client.database
        .from('stock_financials')
        .select('id')
        .eq('symbol', upperSymbol)
        .eq('fiscal_year', fiscal_year)
        .eq('period_type', period_type);

      if (fiscal_quarter) {
        query = query.eq('fiscal_quarter', fiscal_quarter);
      }

      const { data: existing } = await query.limit(1);

      const record = {
        income_statement: income_statement ? JSON.stringify(income_statement) : null,
        balance_sheet: balance_sheet ? JSON.stringify(balance_sheet) : null,
        cash_flow: cash_flow ? JSON.stringify(cash_flow) : null,
        currency: currency || 'USD',
        data_source: data_source || 'openbb_fmp',
        filing_date: filing_date || null,
        updated_at: now
      };

      let result;
      if (existing && existing.length > 0) {
        const { data, error } = await client.database
          .from('stock_financials')
          .update(record)
          .eq('id', existing[0].id)
          .select('id, symbol, fiscal_year, fiscal_quarter, period_end_date');
        result = { data, error };
      } else {
        const { data, error } = await client.database
          .from('stock_financials')
          .insert([{
            symbol: upperSymbol,
            fiscal_year,
            fiscal_quarter: fiscal_quarter || null,
            period_type,
            period_end_date,
            ...record
          }])
          .select('id, symbol, fiscal_year, fiscal_quarter, period_end_date');
        result = { data, error };
      }

      if (result.error) {
        return new Response(JSON.stringify({ success: false, error: result.error.message }), {
          status: 500, headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: result.data && result.data.length > 0 ? result.data[0] : null
      }), {
        status: existing && existing.length > 0 ? 200 : 201,
        headers: corsHeaders
      });
    }

    // ===================== UNKNOWN ACTION =====================
    return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}` }), {
      status: 400, headers: corsHeaders
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: corsHeaders
    });
  }
};
