// KOL Tweets - Edge Function
// Stores tweets from KOL/blogger accounts for methodology distillation.
//
// Schema: kol_tweets
//   id TEXT PRIMARY KEY (tweet ID),
//   author_username TEXT NOT NULL,
//   text TEXT,
//   tweet_type TEXT (original/quote/reply/thread),
//   conversation_id TEXT,
//   quoted_tweet_text TEXT,
//   in_reply_to_username TEXT,
//   created_at TIMESTAMPTZ,
//   url TEXT,
//   like_count INT DEFAULT 0,
//   retweet_count INT DEFAULT 0,
//   reply_count INT DEFAULT 0,
//   view_count INT DEFAULT 0,
//   category TEXT,
//   symbols JSONB                      -- Phase 2: per-tweet ticker list, e.g. ["NVDA", "INTC"];
//                                      -- null = unlabeled. Index: GIN (symbols).
//
// Schema: twitter_fetch_runs
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   run_id TEXT NOT NULL,
//   username TEXT NOT NULL,
//   status TEXT NOT NULL,             -- pending | success | failed | partial
//   pages_fetched INT DEFAULT 0,
//   tweets_fetched INT DEFAULT 0,
//   tweets_stored INT DEFAULT 0,
//   tweets_skipped INT DEFAULT 0,
//   reached_safety_window BOOL DEFAULT false,
//   error TEXT,
//   started_at TIMESTAMPTZ DEFAULT now(),
//   finished_at TIMESTAMPTZ
module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Internal-Secret",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const TABLE = "kol_tweets";
  const RUNS_TABLE = "twitter_fetch_runs";
  const DIGESTS_TABLE = "kol_daily_digests";
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  // Gate POST actions behind X-Internal-Secret. Reads (GET) stay open so
  // any user can view the digest like a regular daily report. Without this,
  // the public internet could upsert tweets / overwrite digests directly.
  if (request.method === "POST") {
    const expected = Deno.env.get("EDGE_FUNCTION_SECRET");
    if (expected) {
      const provided = request.headers.get("x-internal-secret") || "";
      if (provided !== expected) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: jsonHeaders }
        );
      }
    }
  }

  try {
    const action = url.searchParams.get("action");

    // GET ?action=list&username=xxx&category=yyy&page=1&limit=20
    if (request.method === "GET" && action === "list") {
      const username = url.searchParams.get("username");
      const category = url.searchParams.get("category");
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
      const offset = (page - 1) * limit;

      let query = client.database
        .from(TABLE)
        .select("id, author_username, text, tweet_type, conversation_id, quoted_tweet_text, in_reply_to_username, created_at, url, like_count, retweet_count, reply_count, view_count, category, symbols")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (username) {
        query = query.eq("author_username", username);
      }
      if (category) {
        query = query.eq("category", category);
      }

      const { data, error } = await query;

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: data || [] }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // GET ?action=stats&username=xxx
    if (request.method === "GET" && action === "stats") {
      const username = url.searchParams.get("username");
      if (!username) {
        return new Response(
          JSON.stringify({ success: false, error: "username required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      // Get total count and category breakdown (override default 1000 row limit)
      const { data: allTweets, error } = await client.database
        .from(TABLE)
        .select("id, tweet_type, category, created_at")
        .eq("author_username", username)
        .range(0, 9999);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      const tweets = allTweets || [];
      const byType = {};
      const byCategory = {};
      let minDate = null;
      let maxDate = null;

      for (const t of tweets) {
        byType[t.tweet_type] = (byType[t.tweet_type] || 0) + 1;
        if (t.category) {
          byCategory[t.category] = (byCategory[t.category] || 0) + 1;
        }
        if (t.created_at) {
          if (!minDate || t.created_at < minDate) minDate = t.created_at;
          if (!maxDate || t.created_at > maxDate) maxDate = t.created_at;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            total_tweets: tweets.length,
            by_type: byType,
            by_category: byCategory,
            date_range: { earliest: minDate, latest: maxDate },
          },
        }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // GET ?action=get&id=xxx
    if (request.method === "GET" && action === "get") {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response(
          JSON.stringify({ success: false, error: "id required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data, error } = await client.database
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // POST ?action=upsert_batch - bulk insert/update tweets
    if (request.method === "POST" && action === "upsert_batch") {
      const body = await request.json();
      const tweets = body.tweets;

      if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "tweets array required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data, error } = await client.database
        .from(TABLE)
        .upsert(tweets, { onConflict: "id" })
        .select("id");

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, count: (data || []).length }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // POST ?action=update_category - update category for a tweet
    if (request.method === "POST" && action === "update_category") {
      const body = await request.json();
      const { id, category } = body;

      if (!id || !category) {
        return new Response(
          JSON.stringify({ success: false, error: "id and category required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { error } = await client.database
        .from(TABLE)
        .update({ category })
        .eq("id", id);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // POST ?action=update_categories_batch - batch update categories
    if (request.method === "POST" && action === "update_categories_batch") {
      const body = await request.json();
      const updates = body.updates; // [{id, category}, ...]

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "updates array required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      let successCount = 0;
      let errorCount = 0;

      for (const { id, category } of updates) {
        const { error } = await client.database
          .from(TABLE)
          .update({ category })
          .eq("id", id);
        if (error) {
          errorCount++;
        } else {
          successCount++;
        }
      }

      return new Response(
        JSON.stringify({ success: true, updated: successCount, errors: errorCount }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // POST ?action=list_batch - list tweets across multiple usernames within a date range
    if (request.method === "POST" && action === "list_batch") {
      const body = await request.json();
      const usernames = Array.isArray(body.usernames) ? body.usernames : [];
      const since = body.since || null; // ISO string, inclusive
      const until = body.until || null; // ISO string, exclusive
      const limit = Math.min(parseInt(body.limit || "1000", 10), 5000);
      const onlyOpinionated = body.only_opinionated === true;

      if (usernames.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "usernames array required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      let query = client.database
        .from(TABLE)
        .select("id, author_username, text, tweet_type, conversation_id, quoted_tweet_text, in_reply_to_username, created_at, url, like_count, retweet_count, reply_count, view_count, category, symbols")
        .in("author_username", usernames)
        .order("created_at", { ascending: false })
        .range(0, limit - 1);

      if (since) query = query.gte("created_at", since);
      if (until) query = query.lt("created_at", until);
      if (onlyOpinionated) query = query.neq("tweet_type", "retweet");

      const { data, error } = await query;
      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: data || [] }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // POST ?action=start_run - record start of a per-KOL fetch attempt
    if (request.method === "POST" && action === "start_run") {
      const body = await request.json();
      const { run_id, username } = body;
      if (!run_id || !username) {
        return new Response(
          JSON.stringify({ success: false, error: "run_id and username required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data, error } = await client.database
        .from(RUNS_TABLE)
        .insert({
          run_id,
          username,
          status: "pending",
          started_at: new Date().toISOString(),
        })
        .select("id, run_id, username, started_at")
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // POST ?action=finish_run - update an existing run row with final results
    if (request.method === "POST" && action === "finish_run") {
      const body = await request.json();
      const { id } = body;
      if (!id) {
        return new Response(
          JSON.stringify({ success: false, error: "id required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const update = {
        status: body.status || "success",
        pages_fetched: body.pages_fetched || 0,
        tweets_fetched: body.tweets_fetched || 0,
        tweets_stored: body.tweets_stored || 0,
        tweets_skipped: body.tweets_skipped || 0,
        reached_safety_window: body.reached_safety_window === true,
        error: body.error || null,
        finished_at: new Date().toISOString(),
      };

      const { error } = await client.database
        .from(RUNS_TABLE)
        .update(update)
        .eq("id", id);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // GET ?action=list_runs&run_id=xxx | &username=yyy | &limit=N
    if (request.method === "GET" && action === "list_runs") {
      const runId = url.searchParams.get("run_id");
      const username = url.searchParams.get("username");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);

      let query = client.database
        .from(RUNS_TABLE)
        .select("id, run_id, username, status, pages_fetched, tweets_fetched, tweets_stored, tweets_skipped, reached_safety_window, error, started_at, finished_at")
        .order("started_at", { ascending: false })
        .range(0, limit - 1);

      if (runId) query = query.eq("run_id", runId);
      if (username) query = query.eq("username", username);

      const { data, error } = await query;
      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: data || [] }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // POST ?action=upsert_digest - upsert a daily digest (overwrites by date)
    //
    // V2 schema rename note: the application now sends macro_picks /
    // industry_picks / stock_picks. The DB table still has columns named
    // bullish_picks / bearish_picks / neutral_analyses (legacy). We accept
    // either set of field names from the client and map to the legacy column
    // names internally, so renaming the table is a future cleanup, not a
    // blocker for the V2 product.
    if (request.method === "POST" && action === "upsert_digest") {
      const body = await request.json();
      const {
        date,
        // V2 names (preferred)
        macro_picks,
        industry_picks,
        stock_picks,
        // V1.5 names (still accepted)
        bullish_picks,
        bearish_picks,
        neutral_analyses,
        tracked_kols,
        takeaway,
        window_hours,
        input_tweet_count,
        generated_at,
        model_version,
      } = body;
      // Pick whichever set the client sent; V2 wins when both arrive.
      const macroBucket = macro_picks ?? bullish_picks ?? [];
      const industryBucket = industry_picks ?? bearish_picks ?? [];
      const stockBucket = stock_picks ?? neutral_analyses ?? [];

      if (!date || window_hours === undefined || input_tweet_count === undefined ||
          !generated_at || !model_version) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "date, window_hours, input_tweet_count, generated_at, model_version required",
          }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const row = {
        date,
        // Legacy column names retained — see V2 rename note above.
        bullish_picks: macroBucket,
        bearish_picks: industryBucket,
        neutral_analyses: stockBucket,
        tracked_kols: tracked_kols || [],
        // takeaway requires a `takeaway JSONB` column on kol_daily_digests.
        // If the column does not yet exist, Insforge will surface a
        // column-not-found error and the upsert will fail; backfill the
        // schema before deploying this revision.
        takeaway: takeaway || [],
        window_hours,
        input_tweet_count,
        generated_at,
        model_version,
        updated_at: new Date().toISOString(),
      };

      // Guard against last-writer-wins: if an existing row for this date has a
      // newer generated_at, refuse to overwrite. This makes overlapping cron
      // retries / manual reruns safe — only the newest result wins.
      const { data: existing, error: readError } = await client.database
        .from(DIGESTS_TABLE)
        .select("id, generated_at")
        .eq("date", date)
        .maybeSingle();

      if (readError) {
        return new Response(
          JSON.stringify({ success: false, error: readError.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      if (existing && existing.generated_at && existing.generated_at > generated_at) {
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            reason: "existing digest is newer",
            existing_generated_at: existing.generated_at,
            incoming_generated_at: generated_at,
            data: { id: existing.id, date },
          }),
          { status: 200, headers: jsonHeaders }
        );
      }

      const { data, error } = await client.database
        .from(DIGESTS_TABLE)
        .upsert(row, { onConflict: "date" })
        .select("id, date")
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // GET ?action=get_digest&date=YYYY-MM-DD - fetch a single date's digest
    if (request.method === "GET" && action === "get_digest") {
      const date = url.searchParams.get("date");
      if (!date) {
        return new Response(
          JSON.stringify({ success: false, error: "date required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data, error } = await client.database
        .from(DIGESTS_TABLE)
        .select("date, bullish_picks, bearish_picks, neutral_analyses, tracked_kols, takeaway, window_hours, input_tweet_count, generated_at, model_version")
        .eq("date", date)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // GET ?action=get_latest_digest - fetch the most recent digest by date
    if (request.method === "GET" && action === "get_latest_digest") {
      const { data, error } = await client.database
        .from(DIGESTS_TABLE)
        .select("date, bullish_picks, bearish_picks, neutral_analyses, tracked_kols, takeaway, window_hours, input_tweet_count, generated_at, model_version")
        .order("date", { ascending: false })
        .limit(1);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      const row = (data && data.length > 0) ? data[0] : null;
      return new Response(
        JSON.stringify({ success: true, data: row }),
        { status: 200, headers: jsonHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid request. Use action param: list, list_batch, stats, get, upsert_batch, update_category, update_categories_batch, start_run, finish_run, list_runs, upsert_digest, get_digest, get_latest_digest" }),
      { status: 400, headers: jsonHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
