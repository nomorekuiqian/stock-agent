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
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRO_PRICE_ID = os.getenv("STRIPE_PRO_PRICE_ID", "")

# Security
CRON_SECRET = os.getenv("CRON_SECRET", "")
INSFORGE_ANON_KEY = os.getenv("INSFORGE_ANON_KEY", "")

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

# Cache settings
STOCK_ANALYSIS_CACHE_HOURS = 168  # 7 days
