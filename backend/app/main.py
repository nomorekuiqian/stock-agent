from dotenv import load_dotenv
load_dotenv()  # Load .env before importing agents

import os
from datetime import datetime
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from agents.agent import MacroAgent
from app.services.email_service import get_email_service

app = FastAPI(title="Macro Analysis API")

# Configure CORS - allow localhost and production domains
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
]
# Add production frontend URL from environment
if os.getenv("FRONTEND_URL"):
    allowed_origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize macro agent
macro_agent = MacroAgent()

@app.get("/")
async def root():
    return {"message": "Macro Analysis API is running"}

@app.post("/api/macro")
async def analyze_macro():
    try:
        result = await macro_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate macro analysis")

        # Transform market_data to frontend expected format
        market_data = result.get("market_data", {})

        # Build indices array from equities + volatility + commodities + currencies
        indices = []
        for name, data in market_data.get("equities", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("volatility", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("commodities", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("currencies", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })

        return {
            "indices": indices,
            "timestamp": result.get("timestamp", datetime.now().isoformat()),
            "short_analysis": result.get("short_analysis", ""),
            "in_depth_analysis": result.get("in_depth_analysis", ""),
            "economic_calendar": result.get("economic_calendar", {}),
            "earnings_calendar": result.get("earnings_calendar", {}),
            "news_data": result.get("news_data", {})
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Email Report Endpoints
# =============================================================================

CRON_SECRET = os.getenv("CRON_SECRET", "")


@app.post("/api/report/send")
async def send_daily_report(x_cron_secret: str = Header(None, alias="X-Cron-Secret")):
    """
    Generate and send daily market report via email.
    Protected by CRON_SECRET for scheduled job authentication.
    """
    # Verify cron secret if configured
    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # Generate the macro analysis
        result = await macro_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate macro analysis")

        # Transform to frontend format for consistent email
        market_data = result.get("market_data", {})

        indices = []
        for name, data in market_data.get("equities", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("volatility", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("commodities", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("currencies", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })

        report_data = {
            "indices": indices,
            "timestamp": result.get("timestamp", datetime.now().isoformat()),
            "short_analysis": result.get("short_analysis", ""),
            "in_depth_analysis": result.get("in_depth_analysis", "")
        }

        # Send email
        email_service = get_email_service()
        email_result = await email_service.send_daily_report(report_data)

        if not email_result.get("success"):
            raise HTTPException(status_code=500, detail=email_result.get("error", "Failed to send email"))

        return {
            "success": True,
            "message": "Daily report sent successfully",
            "email_id": email_result.get("email_id")
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class SendEmailRequest(BaseModel):
    email: Optional[str] = None


# Default test email - hardcoded for testing
DEFAULT_TEST_EMAIL = "kedengpan@gmail.com"


@app.post("/api/report/send-test")
async def send_test_report(request: SendEmailRequest = None):
    """
    Generate and send market report to a test email.
    No authentication required - for testing purposes only.
    """
    try:
        # Use provided email or default test email
        to_email = (request.email if request else None) or DEFAULT_TEST_EMAIL

        # Generate the macro analysis
        result = await macro_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate macro analysis")

        # Transform to frontend format for consistent email
        market_data = result.get("market_data", {})

        indices = []
        for name, data in market_data.get("equities", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("volatility", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("commodities", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
        for name, data in market_data.get("currencies", {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })

        report_data = {
            "indices": indices,
            "timestamp": result.get("timestamp", datetime.now().isoformat()),
            "short_analysis": result.get("short_analysis", ""),
            "in_depth_analysis": result.get("in_depth_analysis", "")
        }

        # Send email
        email_service = get_email_service()
        email_result = await email_service.send_daily_report(report_data, to_email=to_email)

        if not email_result.get("success"):
            raise HTTPException(status_code=500, detail=email_result.get("error", "Failed to send email"))

        return {
            "success": True,
            "message": f"Test report sent to {to_email}",
            "email_id": email_result.get("email_id"),
            "sent_to": to_email
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
