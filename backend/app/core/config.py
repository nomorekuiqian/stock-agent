"""
Core configuration - environment variables and app settings.
"""

import os

from dotenv import load_dotenv

from app.core.ai_models import GENERATIVE_MODEL

load_dotenv()

# API Keys
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
FMP_API_KEY = os.getenv("FMP_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
FRED_API_KEY = os.getenv("FRED_API_KEY", "")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_WEBHOOK_SECRET = os.getenv("RESEND_WEBHOOK_SECRET", "")
TWITTER_API_KEY = os.getenv("TWITTER_API_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_LEGACY_SECRET_KEY = os.getenv("STRIPE_LEGACY_SECRET_KEY", "")
STRIPE_MIGRATION_SOURCE_SECRET_KEY = os.getenv(
    "STRIPE_MIGRATION_SOURCE_SECRET_KEY",
    STRIPE_LEGACY_SECRET_KEY,
)
STRIPE_MIGRATION_DESTINATION_SECRET_KEY = os.getenv(
    "STRIPE_MIGRATION_DESTINATION_SECRET_KEY",
    STRIPE_SECRET_KEY,
)
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
# Signing secret for the legacy Stripe account's webhook endpoint. Set during
# the account migration so the webhook handler can verify and process events
# coming from the legacy account (the 47 pre-migration subscriptions still live
# there). Empty when no legacy account is configured.
STRIPE_LEGACY_WEBHOOK_SECRET = os.getenv("STRIPE_LEGACY_WEBHOOK_SECRET", "")
STRIPE_PRO_PRICE_ID = os.getenv("STRIPE_PRO_PRICE_ID", "")
STRIPE_MAX_PRICE_ID = os.getenv("STRIPE_MAX_PRICE_ID", "")
STRIPE_MIGRATION_DESTINATION_MAX_PRICE_ID = os.getenv(
    "STRIPE_MIGRATION_DESTINATION_MAX_PRICE_ID",
    STRIPE_MAX_PRICE_ID,
)
STRIPE_MIGRATION_DESTINATION_PRO_PRICE_ID = os.getenv(
    "STRIPE_MIGRATION_DESTINATION_PRO_PRICE_ID",
    STRIPE_PRO_PRICE_ID,
)
STRIPE_ULTRA_PRICE_ID = os.getenv(
    "STRIPE_ULTRA_PRICE_ID",
    os.getenv("STRIPE_CREATOR_MAX_QINBAFRANK_PRICE_ID", ""),
)

# OKX Onchain OS / x402 payment settings for the isolated OKX MCP app.
OKX_API_KEY = os.getenv("OKX_API_KEY", "")
OKX_SECRET_KEY = os.getenv("OKX_SECRET_KEY", "")
OKX_PASSPHRASE = os.getenv("OKX_PASSPHRASE", "")
OKX_BASE_URL = os.getenv("OKX_BASE_URL", "https://web3.okx.com")

# PostHog Analytics
POSTHOG_PROJECT_TOKEN = os.getenv("POSTHOG_PROJECT_TOKEN", "")
POSTHOG_HOST = os.getenv("POSTHOG_HOST", "https://us.i.posthog.com")

# WeChat Mini Program
WECHAT_APP_ID = os.getenv("WECHAT_APP_ID", "")
WECHAT_APP_SECRET = os.getenv("WECHAT_APP_SECRET", "")
WECHAT_JWT_SECRET = os.getenv("WECHAT_JWT_SECRET", "")

# Security
CRON_SECRET = os.getenv("CRON_SECRET", "")
INSFORGE_ANON_KEY = os.getenv("INSFORGE_ANON_KEY", "")
# Insforge service-role key — required for admin API (e.g. /api/auth/admin/users)
# INSFORGE_ANON_KEY does NOT have admin scope; use SERVICE_KEY for backend-to-backend calls
INSFORGE_SERVICE_KEY = os.getenv("INSFORGE_SERVICE_KEY", "")
# Insforge project API key — FULL-ADMIN credential (DB/auth/storage/payments).
# Kept for reference; storage uploads now use the least-privilege S3 keys below.
INSFORGE_API_KEY = os.getenv("INSFORGE_API_KEY", "")
EDGE_FUNCTION_SECRET = os.getenv("EDGE_FUNCTION_SECRET", CRON_SECRET)

# Environment
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")  # "production" or "development"

# URLs
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
INSFORGE_BASE_URL = os.getenv(
    "INSFORGE_BASE_URL", "https://9wmhxyi4.us-east.insforge.app"
)
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# CORS
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://themarketbrew.com",
    "https://www.themarketbrew.com",
]
_frontend_url = os.getenv("FRONTEND_URL")
if _frontend_url:
    ALLOWED_ORIGINS.append(_frontend_url)
ALLOWED_ORIGINS = list(dict.fromkeys(ALLOWED_ORIGINS))
CORS_ALLOWED_ORIGIN_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"https://.*-the-market-brew\.vercel\.app",
)

# Set GOOGLE_GENAI_API_KEY for google-genai library
if GOOGLE_API_KEY and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = GOOGLE_API_KEY

# Resend Segment IDs (for email preference filtering)
RESEND_SEGMENT_MORNING = os.getenv("RESEND_SEGMENT_MORNING", "")
RESEND_SEGMENT_EVENING = os.getenv("RESEND_SEGMENT_EVENING", "")
RESEND_SEGMENT_WEEKLY = os.getenv("RESEND_SEGMENT_WEEKLY", "")
RESEND_SEGMENT_DAILY_FREE_CTA = os.getenv(
    "RESEND_SEGMENT_DAILY_FREE_CTA",
    "a081542c-7411-4cd3-bb24-80aedd7af9e2",
)
RESEND_SEGMENT_DAILY_PAID_CTA = os.getenv(
    "RESEND_SEGMENT_DAILY_PAID_CTA",
    "f119ea94-de81-4a78-bb7a-f7ebf016bdaf",
)
# Twitter KOL digest contacts live in a dedicated Resend audience. Delivery is
# scoped by a dedicated segment inside that audience; broadcasts hard-fail if
# the segment id is unset rather than silently falling back to a broader list.
RESEND_AUDIENCE_TWITTER_DIGEST = os.getenv("RESEND_AUDIENCE_TWITTER_DIGEST", "")
RESEND_SEGMENT_TWITTER_DIGEST = os.getenv("RESEND_SEGMENT_TWITTER_DIGEST", "")

# Invite codes (comma-separated shared codes for public distribution)
INVITE_CODES = os.getenv("INVITE_CODES", "")
FRANK_LENS_DEV_INVITE_CODE = os.getenv("FRANK_LENS_DEV_INVITE_CODE", "")

# Admin access whitelist (comma-separated emails)
ADMIN_EMAILS = [
    e.strip().lower()
    for e in os.getenv("ADMIN_EMAILS", "kedengpan@gmail.com").split(",")
    if e.strip()
]

# Feature flags
# EMAIL_PRO_GATE: when true, only Pro subscribers receive email broadcasts.
# Default false — logic is deployed but inactive, same pattern as NEXT_PUBLIC_ENABLE_PAYWALL.
EMAIL_PRO_GATE = os.getenv("EMAIL_PRO_GATE", "false").lower() == "true"
AGENT_RUNTIME_REQUEST_HISTORY = os.getenv(
    "AGENT_RUNTIME_REQUEST_HISTORY",
    "fallback",
).lower()

# Cache settings
STOCK_ANALYSIS_CACHE_HOURS = 168  # 7 days

# Generic vector settings
VECTOR_EMBEDDING_MODEL = os.getenv(
    "VECTOR_EMBEDDING_MODEL",
    os.getenv("RAG_EMBEDDING_MODEL", "openai/text-embedding-3-small"),
)

def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


# OKX Context MCP payment defaults. The discovery endpoint stays public; paid
# context/data endpoints can be protected either by this app's SDK middleware
# or by an OKX reverse proxy configured outside the app.
OKX_MCP_PAYMENT_ENABLED = _bool_env("OKX_MCP_PAYMENT_ENABLED", False)
OKX_MCP_PAYMENT_MODE = os.getenv("OKX_MCP_PAYMENT_MODE", "sdk").lower()
OKX_MCP_NETWORK = os.getenv("OKX_MCP_NETWORK", "eip155:196")
OKX_MCP_PAY_TO_ADDRESS = os.getenv(
    "OKX_MCP_PAY_TO_ADDRESS",
    os.getenv("PAYMENT_RECIPIENT", ""),
)
OKX_MCP_PERSONA_CONTEXT_PRICE = os.getenv("OKX_MCP_PERSONA_CONTEXT_PRICE", "$0.05")
OKX_MCP_MARKET_DATA_PRICE = os.getenv("OKX_MCP_MARKET_DATA_PRICE", "$0.03")
OKX_MCP_MAX_TIMEOUT_SECONDS = _int_env("OKX_MCP_MAX_TIMEOUT_SECONDS", 300)


# Watchlist monitor offline generation settings.
# Legacy model environment overrides are retired to prevent provider drift.
WATCHLIST_MONITOR_LLM_MODEL = GENERATIVE_MODEL
WATCHLIST_MONITOR_LLM_MAX_TOKENS = _int_env(
    "WATCHLIST_MONITOR_LLM_MAX_TOKENS", 2400
)
WATCHLIST_MONITOR_LLM_RETRIES = _int_env("WATCHLIST_MONITOR_LLM_RETRIES", 2)
WATCHLIST_MONITOR_LLM_TEMPERATURE = _float_env(
    "WATCHLIST_MONITOR_LLM_TEMPERATURE", 0.2
)
WATCHLIST_MONITOR_MODEL_VERSION = "watchlist-monitor-v2-%s" % GENERATIVE_MODEL
WATCHLIST_MONITOR_GENERATION_CONCURRENCY = _int_env(
    "WATCHLIST_MONITOR_GENERATION_CONCURRENCY", 3
)
WATCHLIST_MONITOR_TAVILY_ENABLED = _bool_env(
    "WATCHLIST_MONITOR_TAVILY_ENABLED", True
)
WATCHLIST_MONITOR_TAVILY_RESULTS_PER_QUERY = _int_env(
    "WATCHLIST_MONITOR_TAVILY_RESULTS_PER_QUERY", 8
)
WATCHLIST_MONITOR_TAVILY_TIMEOUT_S = _float_env(
    "WATCHLIST_MONITOR_TAVILY_TIMEOUT_S", 8.0
)
WATCHLIST_MONITOR_TAVILY_TOPIC = os.getenv(
    "WATCHLIST_MONITOR_TAVILY_TOPIC", "general"
)
WATCHLIST_MONITOR_TAVILY_INCLUDE_DOMAINS = os.getenv(
    "WATCHLIST_MONITOR_TAVILY_INCLUDE_DOMAINS",
    ",".join(
        [
            "marketbeat.com",
            "tipranks.com",
            "tradersunion.com",
            "stockstotrade.com",
            "simplywall.st",
            "stocktitan.net",
            "seekingalpha.com",
            "investing.com",
            "finance.yahoo.com",
            "barchart.com",
            "benzinga.com",
        ]
    ),
)


# Agent runtime tunables
# These were previously module constants in features/agent_runtime and the two
# feature agents. Exposed via env so production can adjust without redeploy.
AGENT_RUNTIME_INMEMORY_MAX_SESSIONS = _int_env(
    "AGENT_RUNTIME_INMEMORY_MAX_SESSIONS", 256
)
AGENT_RUNTIME_INMEMORY_MAX_TRANSCRIPT = _int_env(
    "AGENT_RUNTIME_INMEMORY_MAX_TRANSCRIPT", 64
)
AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT = _int_env(
    "AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT", 60_000
)
AGENT_RUNTIME_TOOL_CACHE_TTL = _float_env(
    "AGENT_RUNTIME_TOOL_CACHE_TTL", 300.0
)
AGENT_RUNTIME_TOOL_CACHE_MAXSIZE = _int_env(
    "AGENT_RUNTIME_TOOL_CACHE_MAXSIZE", 2048
)
AGENT_RUNTIME_MAX_GOOGLE_SEARCH_PER_TURN = _int_env(
    "AGENT_RUNTIME_MAX_GOOGLE_SEARCH_PER_TURN", 1
)
AGENT_RUNTIME_MAX_KOL_TWEET_SEARCH_PER_TURN = _int_env(
    "AGENT_RUNTIME_MAX_KOL_TWEET_SEARCH_PER_TURN", 3
)
AGENT_RUNTIME_RESEARCH_TIMEOUT_S = _float_env(
    "AGENT_RUNTIME_RESEARCH_TIMEOUT_S", 75.0
)
AGENT_RUNTIME_KOL_TIMEOUT_S = _float_env(
    "AGENT_RUNTIME_KOL_TIMEOUT_S", 120.0
)
AGENT_RUNTIME_HISTORY_FETCH_LIMIT = _int_env(
    "AGENT_RUNTIME_HISTORY_FETCH_LIMIT", 200
)
# Hard cap for tool_response serialized payload kept in events.payload.result.
# Anything longer is truncated and an sha256 of the original is stored alongside
# so audit/replay can detect whether the cached/displayed text matches.
AGENT_RUNTIME_TOOL_RESULT_MAX_CHARS = _int_env(
    "AGENT_RUNTIME_TOOL_RESULT_MAX_CHARS", 1024
)

# BudgetPlan per-section char allocations. Each section is rendered inside the
# corresponding cap; ContextEngine logs a `context_budget_truncated` event when
# any section was reduced to fit. These are tunable per-env so operators can
# rebalance without a redeploy when Phase 2/3 work adds workspace + memory.
AGENT_RUNTIME_BUDGET_INPUT_GUARD = _int_env(
    "AGENT_RUNTIME_BUDGET_INPUT_GUARD", 6_000
)
AGENT_RUNTIME_BUDGET_ACTIVE_MEMORY = _int_env(
    "AGENT_RUNTIME_BUDGET_ACTIVE_MEMORY", 1_800
)
AGENT_RUNTIME_BUDGET_ATTACHED_WORKSPACE = _int_env(
    "AGENT_RUNTIME_BUDGET_ATTACHED_WORKSPACE", 6_000
)
AGENT_RUNTIME_BUDGET_HISTORY = _int_env(
    "AGENT_RUNTIME_BUDGET_HISTORY", 20_000
)
AGENT_RUNTIME_BUDGET_CONTENT_CONTEXT = _int_env(
    "AGENT_RUNTIME_BUDGET_CONTENT_CONTEXT", 8_000
)
AGENT_RUNTIME_BUDGET_INFERRED_MEMORY = _int_env(
    "AGENT_RUNTIME_BUDGET_INFERRED_MEMORY", 800
)
