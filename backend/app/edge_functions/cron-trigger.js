// Central dispatcher for production cron jobs that now run on Insforge
// Schedules. Use dry_run=true to validate routing without calling backend.
const BACKEND_URL = (
  Deno.env.get("BACKEND_URL") || "https://stock-agent-production.up.railway.app"
).replace(/\/+$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Internal-Secret",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const LIST_ID = "1800707969811894542";

const JOBS = {
  daily_report: {
    description: "Daily market report email broadcast",
    steps: [{
      name: "daily_report",
      path: "/api/subscriptions/daily_report/broadcast?force=true",
      timeoutMs: 600000,
      validate: function(body) {
        if (body && body.success === false) return "success=false";
        return null;
      },
    }],
  },
  daily_digest: {
    description: "Personalized daily digest email broadcast",
    steps: [{
      name: "daily_digest",
      path: "/api/subscriptions/personal_digest/broadcast",
      timeoutMs: 600000,
      validate: function(body) {
        if (body && body.success === false) return "success=false";
        if (body && Number(body.failed || 0) > 2) {
          return "failed=" + body.failed + " > 2";
        }
        return null;
      },
    }],
  },
  weekly_report: {
    description: "Weekly macro report generation and broadcast",
    steps: [{
      name: "weekly_report",
      path: "/api/weekly-report/generate",
      timeoutMs: 600000,
      validate: function(body) {
        if (body && body.success === false) return "success=false";
        if (body && body.from_cache === true) return null;
        const broadcast = body ? body.broadcast_result : null;
        if (!broadcast) return "broadcast_result missing";
        if (broadcast.success !== true) {
          return "broadcast failed: " + (broadcast.error || "unknown error");
        }
        return null;
      },
    }],
  },
  payment_reconcile_expired_grants: {
    description: "Expire non-Stripe subscription grants and sync email segments",
    steps: [{
      name: "payment_reconcile_expired_grants",
      path: "/api/payment/reconcile-expired-grants",
      timeoutMs: 300000,
      validate: validateSuccessField,
    }],
  },
  onboarding_drip: {
    description: "Legacy onboarding drip cron; backend returns disabled no-op",
    steps: [{
      name: "onboarding_drip",
      path: "/api/cron/onboarding-emails",
      timeoutMs: 300000,
      validate: function(body) {
        if (body && body.success === false) return "success=false";
        return null;
      },
    }],
  },
  screener_universe_refresh: {
    description: "TradingView screener universe refresh",
    steps: [{
      name: "screener_universe_refresh",
      path: "/api/screener/refresh",
      timeoutMs: 180000,
      validate: function(body) {
        if (body && body.success === false) return "success=false";
        return null;
      },
    }],
  },
  macro_cache_t1: {
    description: "Macro data cache tier 1 refresh",
    steps: [{
      name: "macro_cache_t1",
      path: "/api/macro-cache/refresh?tier=1",
      timeoutMs: 240000,
      validate: validateSuccessField,
    }],
  },
  macro_cache_t2: {
    description: "Macro data cache tier 2 refresh",
    steps: [{
      name: "macro_cache_t2",
      path: "/api/macro-cache/refresh?tier=2",
      timeoutMs: 240000,
      validate: validateSuccessField,
    }],
  },
  macro_cache_t3: {
    description: "Macro data cache tier 3 refresh",
    steps: [{
      name: "macro_cache_t3",
      path: "/api/macro-cache/refresh?tier=3",
      timeoutMs: 240000,
      validate: validateSuccessField,
    }],
  },
  kol_list_sync: {
    description: "Sync Twitter list members into kol_accounts",
    steps: [{
      name: "kol_list_sync",
      path: "/api/twitter/sync-kol-list?list_id=" + LIST_ID,
      timeoutMs: 300000,
      validate: validateSuccessField,
    }],
  },
  kol_tweets_ingestion: {
    description: "Hourly KOL tweet fetch plus enrichment",
    steps: [
      {
        name: "fetch_configured_kols",
        path: "/api/twitter/fetch-configured-kols",
        body: {},
        timeoutMs: 600000,
        validate: function(body) {
          if (body && body.success === false) return "success=false";
          if (Number(body && body.succeeded || 0) === 0) {
            return "zero successful KOL lists";
          }
          const stored = (body && body.results || []).reduce(function(total, item) {
            return total + Number(item.tweets_stored || item.total_stored || 0);
          }, 0);
          if (stored === 0) return "stored=0";
          return null;
        },
      },
      {
        name: "enrich_recent_tweets",
        path: "/api/twitter-digest/enrich?window_hours=6",
        timeoutMs: 600000,
        warnOnly: true,
        validate: function(body) {
          if (body && body.success === false) return "success=false";
          if (body && Number(body.errors || 0) > 0) {
            return "errors=" + body.errors;
          }
          return null;
        },
      },
    ],
  },
  twitter_digest_generate: {
    description: "Generate and persist Twitter KOL daily digest",
    steps: [{
      name: "twitter_digest_generate",
      path: "/api/twitter-digest/generate?window_hours=24&persist=true",
      timeoutMs: 900000,
      validate: function(body) {
        if (body && body.success === false) return "success=false";
        return null;
      },
      warnings: function(body) {
        if (body && Number(body.input_tweet_count || 0) === 0) {
          return ["input_tweet_count=0"];
        }
        return [];
      },
    }],
  },
  twitter_digest_broadcast: {
    description: "Broadcast latest Twitter KOL digest email",
    steps: [{
      name: "twitter_digest_broadcast",
      path: "/api/twitter-digest/broadcast",
      timeoutMs: 600000,
      validate: function(body) {
        if (!body || body.success !== true) return "success=false";
        if (Number(body.total || 0) > 0 && Number(body.sent || 0) === 0) {
          return "total=" + body.total + " but sent=0";
        }
        return null;
      },
    }],
  },
  watchlist_monitor_paid_universe: {
    description: "Generate AI watchlist monitor briefs for the paid For You user universe",
    steps: [{
      name: "watchlist_monitor_paid_universe",
      path: "/api/admin/watchlist-monitor/start-paid-universe",
      body: {
        user_limit: 1000,
        limit_per_user: 25,
        force: false,
        dry_run: false,
      },
      timeoutMs: 30000,
      validate: function(body) {
        if (!body || body.success !== true) return "success=false";
        if (body.accepted !== true) return "accepted=false";
        return null;
      },
    }],
  },
};

function validateSuccessField(body) {
  if (body && body.success === false) return "success=false";
  return null;
}

function response(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function safeJobView(jobName) {
  const job = JOBS[jobName];
  return {
    job: jobName,
    description: job.description,
    steps: job.steps.map(function(step) {
      return {
        name: step.name,
        method: step.method || "POST",
        target_url: BACKEND_URL + step.path,
        timeout_ms: step.timeoutMs,
        warn_only: step.warnOnly === true,
        has_body: step.body !== undefined,
      };
    }),
  };
}

function summarizeBody(body) {
  if (!body || typeof body !== "object") return body;
  const summary = {};
  [
    "success",
    "channel",
    "total",
    "sent",
    "failed",
    "processed",
    "expired",
    "skipped_already",
    "skipped_other",
    "skipped",
    "errors",
    "from_cache",
    "tier",
    "summary",
    "date",
    "input_tweet_count",
    "tracked_kols",
    "symbol_count",
    "generated_count",
    "failed_count",
    "failed_user_count",
    "dry_run",
  ].forEach(function(key) {
    if (body[key] !== undefined) summary[key] = body[key];
  });

  if (Array.isArray(body.results)) {
    summary.results_count = body.results.length;
    summary.results_stored = body.results.reduce(function(total, item) {
      return total + Number(item.tweets_stored || item.total_stored || 0);
    }, 0);
  } else if (body.results && typeof body.results === "object") {
    summary.results_success = body.results.success;
    summary.stock_count = body.results.stock_count;
  }

  if (body.broadcast_result && typeof body.broadcast_result === "object") {
    summary.broadcast_result = {
      success: body.broadcast_result.success,
      total: body.broadcast_result.total,
      sent: body.broadcast_result.sent,
      failed: body.broadcast_result.failed,
      error: body.broadcast_result.error,
    };
  }

  if (Object.keys(summary).length > 0) return summary;
  return { keys: Object.keys(body).slice(0, 20) };
}

async function readPayload(request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

async function callStep(step, cronSecret) {
  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(function() {
    controller.abort();
  }, step.timeoutMs || 300000);

  try {
    const headers = {
      "X-Cron-Secret": cronSecret,
      "Content-Type": "application/json",
    };
    const init = {
      method: step.method || "POST",
      headers,
      signal: controller.signal,
    };
    if (step.body !== undefined) {
      init.body = JSON.stringify(step.body);
    }

    const res = await fetch(BACKEND_URL + step.path, init);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (_err) {
      body = { raw: text.slice(0, 1000) };
    }

    const validationError = res.ok ? step.validate(body) : "HTTP " + res.status;
    const warnings = step.warnings ? step.warnings(body) : [];
    if (validationError && step.warnOnly) {
      warnings.push(validationError);
    }

    return {
      name: step.name,
      ok: res.ok && (!validationError || step.warnOnly),
      status: res.status,
      duration_ms: Date.now() - started,
      warning_only: step.warnOnly === true,
      validation_error: step.warnOnly ? null : validationError,
      warnings,
      body_summary: summarizeBody(body),
    };
  } catch (err) {
    const message = err && err.name === "AbortError"
      ? "timeout after " + (step.timeoutMs || 300000) + "ms"
      : String(err);
    return {
      name: step.name,
      ok: step.warnOnly === true,
      status: null,
      duration_ms: Date.now() - started,
      warning_only: step.warnOnly === true,
      validation_error: step.warnOnly ? null : message,
      warnings: step.warnOnly ? [message] : [],
      body: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = async function(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response(405, { success: false, error: "Use POST" });
  }

  const expectedSecret = Deno.env.get("EDGE_FUNCTION_SECRET");
  const providedSecret = request.headers.get("x-internal-secret") || "";
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return response(401, { success: false, error: "Unauthorized" });
  }

  let payload = {};
  try {
    payload = await readPayload(request);
  } catch (_err) {
    return response(400, { success: false, error: "Invalid JSON body" });
  }

  const url = new URL(request.url);
  const jobName = payload.job || url.searchParams.get("job");
  const dryRun = payload.dry_run === true || payload.dryRun === true ||
    url.searchParams.get("dry_run") === "true";

  if (dryRun && !jobName) {
    return response(200, {
      success: true,
      dry_run: true,
      has_edge_function_secret: Boolean(expectedSecret),
      has_cron_secret: Boolean(Deno.env.get("CRON_SECRET")),
      backend_url_configured: Boolean(Deno.env.get("BACKEND_URL")),
      backend_url: BACKEND_URL,
      jobs: Object.keys(JOBS).sort().map(safeJobView),
    });
  }

  if (!jobName || !JOBS[jobName]) {
    return response(400, {
      success: false,
      error: "Unknown or missing job",
      valid_jobs: Object.keys(JOBS).sort(),
    });
  }

  if (dryRun) {
    return response(200, {
      success: true,
      dry_run: true,
      has_edge_function_secret: Boolean(expectedSecret),
      has_cron_secret: Boolean(Deno.env.get("CRON_SECRET")),
      backend_url_configured: Boolean(Deno.env.get("BACKEND_URL")),
      backend_url: BACKEND_URL,
      ...safeJobView(jobName),
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    return response(503, { success: false, job: jobName, error: "CRON_SECRET not configured" });
  }

  const job = JOBS[jobName];
  const results = [];
  for (let i = 0; i < job.steps.length; i += 1) {
    const result = await callStep(job.steps[i], cronSecret);
    results.push(result);
    if (!result.ok && job.steps[i].warnOnly !== true) {
      return response(502, {
        success: false,
        job: jobName,
        failed_step: result.name,
        results,
      });
    }
  }

  return response(200, {
    success: true,
    job: jobName,
    results,
  });
};
