"""
Core configuration - environment variables and app settings.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# API Keys
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
FMP_API_KEY = os.getenv("FMP_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
FRED_API_KEY = os.getenv("FRED_API_KEY", "")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
TWITTER_API_KEY = os.getenv("TWITTER_API_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRO_PRICE_ID = os.getenv("STRIPE_PRO_PRICE_ID", "")
STRIPE_MAX_PRICE_ID = os.getenv("STRIPE_MAX_PRICE_ID", "")

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
EDGE_FUNCTION_SECRET = os.getenv("EDGE_FUNCTION_SECRET", CRON_SECRET)

# Environment
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")  # "production" or "development"

# URLs
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
INSFORGE_BASE_URL = os.getenv(
    "INSFORGE_BASE_URL", "https://9wmhxyi4.us-east.insforge.app"
)

# CORS
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
]
_frontend_url = os.getenv("FRONTEND_URL")
if _frontend_url:
    ALLOWED_ORIGINS.append(_frontend_url)

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

# Invite codes (comma-separated shared codes for public distribution)
INVITE_CODES = os.getenv("INVITE_CODES", "")

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

# Cache settings
STOCK_ANALYSIS_CACHE_HOURS = 168  # 7 days
