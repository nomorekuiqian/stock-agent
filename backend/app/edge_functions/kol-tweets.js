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
  const ACCOUNTS_TABLE = "kol_accounts";
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  // Gate POST actions behind X-Internal-Secret. Reads (GET) stay open so
  // any user can view the digest like a regular daily report. Without this,
  // the public internet could upsert tweets / overwrite digests directly.
  //
  // Fail CLOSED: if EDGE_FUNCTION_SECRET is unset in the runtime environment,
  // refuse all writes. Earlier versions silently allowed writes when the env
  // var was absent, which made misconfiguration in prod a public write hole.
  if (request.method === "POST") {
    const expected = Deno.env.get("EDGE_FUNCTION_SECRET");
    if (!expected) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "EDGE_FUNCTION_SECRET not configured — writes refused",
        }),
        { status: 503, headers: jsonHeaders }
      );
    }
    const provided = request.headers.get("x-internal-secret") || "";
    if (provided !== expected) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: jsonHeaders }
      );
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
      const allKols = body.all_kols === true;
      const since = body.since || null; // ISO string, inclusive
      const until = body.until || null; // ISO string, exclusive
      const limit = Math.min(parseInt(body.limit || "1000", 10), 5000);
      const onlyOpinionated = body.only_opinionated === true;

      // Either explicit usernames list OR all_kols=true (used when the catalog
      // exceeds PostgREST's IN-clause URL length budget). At least one required.
      if (usernames.length === 0 && !allKols) {
        return new Response(
          JSON.stringify({ success: false, error: "usernames array or all_kols=true required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      let query = client.database
        .from(TABLE)
        .select("id, author_username, text, tweet_type, conversation_id, quoted_tweet_text, in_reply_to_username, created_at, url, like_count, retweet_count, reply_count, view_count, category, symbols")
        .order("created_at", { ascending: false })
        .range(0, limit - 1);
      if (!allKols) {
        query = query.in("author_username", usernames);
      }

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

    // POST ?action=list_unenriched - list tweets that need V3 enrichment
    //   body: { since: ISO, limit?: number }
    //
    // "Needs enrichment" = symbols IS NULL OR symbols isn't the V3 object shape
    // (legacy Phase 1 array form, missing `quality` key, non-object). We can't
    // express the union cleanly via the SDK's typed filter chain so we pull
    // the window without a symbols filter and decide per-row in JS. Volume is
    // bounded by the time window (36h × small KOL set ≈ a few hundred rows).
    if (request.method === "POST" && action === "list_unenriched") {
      const body = await request.json();
      const since = body.since || null;
      const limit = Math.min(parseInt(body.limit || "5000", 10), 10000);

      let query = client.database
        .from(TABLE)
        .select("id, author_username, text, tweet_type, conversation_id, quoted_tweet_text, in_reply_to_username, created_at, url, like_count, retweet_count, reply_count, view_count, category, symbols")
        .order("created_at", { ascending: false })
        .range(0, limit - 1);

      if (since) query = query.gte("created_at", since);

      const { data, error } = await query;
      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      const needsEnrichment = (row) => {
        const s = row?.symbols;
        if (s === null || s === undefined) return true;
        if (Array.isArray(s)) return true;        // legacy Phase 1 ticker array
        if (typeof s !== "object") return true;
        if (typeof s.quality !== "string") return true;  // V3 shape but unfilled
        return false;
      };
      const filtered = (data || []).filter(needsEnrichment);

      return new Response(
        JSON.stringify({ success: true, data: filtered }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // POST ?action=upsert_enrichment - bulk write per-tweet enrichment metadata
    //   body: { updates: [{ id, symbols: { quality, ..., enriched_at, enriched_model } }] }
    // Each row's `symbols` JSONB is overwritten with the new payload. Backend
    // (enrichment.py) is responsible for shaping the payload; the edge function
    // just persists it.
    if (request.method === "POST" && action === "upsert_enrichment") {
      const body = await request.json();
      const updates = body.updates;

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "updates array required" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      let successCount = 0;
      let errorCount = 0;
      const errorDetails = [];

      for (const update of updates) {
        if (!update.id || !update.symbols) {
          errorCount++;
          continue;
        }
        const { error } = await client.database
          .from(TABLE)
          .update({ symbols: update.symbols })
          .eq("id", update.id);
        if (error) {
          errorCount++;
          if (errorDetails.length < 5) {
            errorDetails.push({ id: update.id, error: error.message });
          }
        } else {
          successCount++;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          updated: successCount,
          errors: errorCount,
          error_samples: errorDetails,
        }),
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
    if (request.method === "POST" && action === "upsert_digest") {
      const body = await request.json();
      const {
        date,
        tracked_kols,
        window_hours,
        input_tweet_count,
        generated_at,
        model_version,
        headline,
        intro,
        // Hot-list fields (backend-computed frequency tallies)
        hot_sectors,
        hot_tickers,
        hot_events,
        // Main content: ticker_theses + macro_threads + watchpoints
        ticker_theses,
        macro_threads,
        watchpoints,
        // Transparency tail
        other_tickers,
      } = body;

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
        tracked_kols: tracked_kols || [],
        window_hours,
        input_tweet_count,
        generated_at,
        model_version,
        headline: headline || "",
        intro: intro || "",
        hot_sectors: hot_sectors || [],
        hot_tickers: hot_tickers || [],
        hot_events: hot_events || [],
        ticker_theses: ticker_theses || [],
        macro_threads: macro_threads || [],
        watchpoints: watchpoints || [],
        other_tickers: other_tickers || [],
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
        .select("date, tracked_kols, window_hours, input_tweet_count, generated_at, model_version, headline, intro, hot_sectors, hot_tickers, hot_events, ticker_theses, macro_threads, watchpoints, other_tickers")
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
        .select("date, tracked_kols, window_hours, input_tweet_count, generated_at, model_version, headline, intro, hot_sectors, hot_tickers, hot_events, ticker_theses, macro_threads, watchpoints, other_tickers")
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

    // GET ?action=list_accounts&enabled_only=true|false
    // Returns all KOL accounts (the source-of-truth catalog).
    if (request.method === "GET" && action === "list_accounts") {
      const enabledOnly = url.searchParams.get("enabled_only") !== "false";
      let query = client.database
        .from(ACCOUNTS_TABLE)
        .select("username, display_name, source, enabled, followers, bio, added_at, last_synced_at")
        .order("added_at", { ascending: false });
      if (enabledOnly) {
        query = query.eq("enabled", true);
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

    // POST ?action=upsert_accounts
    // Body: { accounts: [{username, display_name, source, enabled?, followers?, bio?}] }
    // Bulk upsert by username (case-insensitive normalization done server-side).
    if (request.method === "POST" && action === "upsert_accounts") {
      const body = await request.json();
      if (!Array.isArray(body.accounts) || body.accounts.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "accounts (non-empty array) required" }),
          { status: 400, headers: jsonHeaders }
        );
      }
      const now = new Date().toISOString();
      const rows = body.accounts.map(a => ({
        username: String(a.username || "").toLowerCase(),
        display_name: a.display_name || a.username,
        source: a.source || "manual",
        enabled: a.enabled !== false,
        followers: a.followers ?? null,
        bio: a.bio ?? null,
        last_synced_at: now,
      })).filter(r => r.username);

      if (rows.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "no valid usernames" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data, error } = await client.database
        .from(ACCOUNTS_TABLE)
        .upsert(rows, { onConflict: "username" })
        .select("username");
      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: jsonHeaders }
        );
      }
      return new Response(
        JSON.stringify({ success: true, upserted: (data || []).length }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // POST ?action=update_account
    // Body: { username, ...patch } — patch any of {display_name, source, enabled, followers, bio}
    if (request.method === "POST" && action === "update_account") {
      const body = await request.json();
      const username = String(body.username || "").toLowerCase();
      if (!username) {
        return new Response(
          JSON.stringify({ success: false, error: "username required" }),
          { status: 400, headers: jsonHeaders }
        );
      }
      const patch = {};
      if (body.display_name !== undefined) patch.display_name = body.display_name;
      if (body.source !== undefined) patch.source = body.source;
      if (body.enabled !== undefined) patch.enabled = !!body.enabled;
      if (body.followers !== undefined) patch.followers = body.followers;
      if (body.bio !== undefined) patch.bio = body.bio;
      if (Object.keys(patch).length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "no fields to update" }),
          { status: 400, headers: jsonHeaders }
        );
      }
      patch.last_synced_at = new Date().toISOString();
      const { error } = await client.database
        .from(ACCOUNTS_TABLE)
        .update(patch)
        .eq("username", username);
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

    // POST ?action=disable_missing
    // Body: { source, current_usernames: [...] }
    // For sync from a list: any account with this `source` whose username is NOT in
    // current_usernames gets enabled=false (soft delete; tweets remain).
    if (request.method === "POST" && action === "disable_missing") {
      const body = await request.json();
      const source = String(body.source || "");
      const currentUsernames = Array.isArray(body.current_usernames)
        ? body.current_usernames.map(u => String(u).toLowerCase())
        : null;
      if (!source || !currentUsernames) {
        return new Response(
          JSON.stringify({ success: false, error: "source and current_usernames required" }),
          { status: 400, headers: jsonHeaders }
        );
      }
      // Pull all accounts with this source, then disable the ones not in current_usernames.
      const { data: existing, error: fetchErr } = await client.database
        .from(ACCOUNTS_TABLE)
        .select("username, enabled")
        .eq("source", source);
      if (fetchErr) {
        return new Response(
          JSON.stringify({ success: false, error: fetchErr.message }),
          { status: 500, headers: jsonHeaders }
        );
      }
      const currentSet = new Set(currentUsernames);
      const toDisable = (existing || [])
        .filter(r => r.enabled && !currentSet.has(r.username))
        .map(r => r.username);

      if (toDisable.length === 0) {
        return new Response(
          JSON.stringify({ success: true, disabled: 0 }),
          { status: 200, headers: jsonHeaders }
        );
      }

      const now = new Date().toISOString();
      const { error: updErr } = await client.database
        .from(ACCOUNTS_TABLE)
        .update({ enabled: false, last_synced_at: now })
        .in("username", toDisable);
      if (updErr) {
        return new Response(
          JSON.stringify({ success: false, error: updErr.message }),
          { status: 500, headers: jsonHeaders }
        );
      }
      return new Response(
        JSON.stringify({ success: true, disabled: toDisable.length, usernames: toDisable }),
        { status: 200, headers: jsonHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid request. Use action param: list, list_batch, list_unenriched, stats, get, upsert_batch, upsert_enrichment, update_category, update_categories_batch, start_run, finish_run, list_runs, upsert_digest, get_digest, get_latest_digest, list_accounts, upsert_accounts, update_account, disable_missing" }),
      { status: 400, headers: jsonHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
