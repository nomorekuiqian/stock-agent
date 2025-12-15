from dotenv import load_dotenv
load_dotenv()  # Load .env before importing agents

import os
from datetime import datetime
from fastapi import FastAPI, HTTPException, Header, Query
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from fastapi.middleware.cors import CORSMiddleware
from agents.agent import MarketAgent
from app.services.email_service import get_email_service
from app.services.insforge_service import get_insforge_service
from app.models.request_models import DigestRequest, DigestResponse

app = FastAPI(title="Market Analysis API")


# =============================================================================
# Helper Functions
# =============================================================================


def transform_market_data_to_indices(market_data: dict) -> list:
    """Transform market_data dict to frontend indices array format."""
    indices = []
    for category in ["equities", "volatility", "commodities", "currencies"]:
        for name, data in market_data.get(category, {}).items():
            indices.append({
                "name": name,
                "value": data.get("value", 0),
                "change_percent": data.get("daily_change", 0)
            })
    return indices

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

# Initialize agent
market_agent = MarketAgent()

@app.get("/")
async def root():
    return {"message": "Market Analysis API is running"}

@app.post("/api/market")
async def analyze_market():
    try:
        result = await market_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate market analysis")

        # Transform market_data to frontend expected format
        market_data = result.get("market_data", {})
        indices = transform_market_data_to_indices(market_data)

        response_data = {
            "indices": indices,
            "timestamp": result.get("timestamp", datetime.now().isoformat()),
            "short_analysis": result.get("short_analysis", ""),
            "in_depth_analysis": result.get("in_depth_analysis", ""),
            "economic_calendar": result.get("economic_calendar", {}),
            "earnings_calendar": result.get("earnings_calendar", {}),
            "calendar": result.get("calendar", []),  # LLM-curated key events
            "news_data": result.get("news_data", {}),
            "evaluation_report": result.get("evaluation_report", ""),
            "draft_analysis": result.get("draft_analysis", ""),
            "market_data": market_data,
            "title": result.get("title", ""),
            "summary": result.get("summary", ""),
        }

        # Note: Report saving is handled by the frontend using Insforge SDK

        return response_data
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
        # Generate the market analysis
        result = await market_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate market analysis")

        # Transform to frontend format for consistent email
        market_data = result.get("market_data", {})
        indices = transform_market_data_to_indices(market_data)

        # Build complete report data for email and database
        report_data = {
            "indices": indices,
            "timestamp": result.get("timestamp", datetime.now().isoformat()),
            "short_analysis": result.get("short_analysis", ""),
            "in_depth_analysis": result.get("in_depth_analysis", ""),
            "title": result.get("title", ""),
            "summary": result.get("summary", ""),
            "calendar": result.get("calendar", []),
            "economic_calendar": result.get("economic_calendar", {}),
            "earnings_calendar": result.get("earnings_calendar", {}),
            "news_data": result.get("news_data", {}),
            "market_data": market_data,
        }

        # Save report to database
        insforge_service = get_insforge_service()
        save_result = await insforge_service.save_market_report(report_data)
        if not save_result.get("success"):
            print(f"[Warning] Failed to save report to database: {save_result.get('error')}")
            # Continue with email broadcast even if save fails

        # Broadcast to all subscribers
        email_service = get_email_service()
        email_result = await email_service.broadcast_daily_report(report_data)

        if not email_result.get("success"):
            raise HTTPException(status_code=500, detail=email_result.get("error", "Failed to broadcast email"))

        return {
            "success": True,
            "message": "Daily report broadcast to all subscribers",
            "broadcast_id": email_result.get("broadcast_id"),
            "audience_id": email_result.get("audience_id"),
            "report_saved": save_result.get("success", False),
            "report_id": save_result.get("report_id"),
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class SendEmailRequest(BaseModel):
    email: str  # Required: user's email address


class BroadcastTestRequest(BaseModel):
    report_id: str  # ID of existing report to use for testing


@app.get("/api/report/preview")
async def get_email_preview(report_id: Optional[str] = Query(None)):
    """
    Get rendered HTML email preview for an existing report.
    Does NOT trigger any Gemini API calls - uses existing data only.

    Args:
        report_id: Optional report ID. If not provided, uses the latest report.
    """
    try:
        insforge_service = get_insforge_service()

        if report_id:
            report = await insforge_service.get_report_by_id(report_id)
        else:
            report = await insforge_service.get_latest_report()

        if not report:
            raise HTTPException(status_code=404, detail="No report found")

        # Build report data for email rendering
        report_data = {
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", ""),
            "short_analysis": report.get("short_analysis", ""),
            "in_depth_analysis": report.get("in_depth_analysis", ""),
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
        }

        # Render HTML using the real email template
        email_service = get_email_service()
        html_content = email_service._format_html_report(report_data)

        return {
            "success": True,
            "html": html_content,
            "report_id": report.get("id"),
            "report_date": report.get("report_date"),
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/report/broadcast-test")
async def broadcast_test_report(request: BroadcastTestRequest):
    """
    Test broadcast functionality using an existing report from the database.
    This avoids generating a new report each time, saving API calls.
    """
    try:
        print(f"[broadcast-test] Fetching report: {request.report_id}")

        # Fetch report from Insforge
        insforge_service = get_insforge_service()
        report = await insforge_service.get_report_by_id(request.report_id)

        print(f"[broadcast-test] Report fetched: {report is not None}")

        if not report:
            raise HTTPException(status_code=404, detail=f"Report not found: {request.report_id}")

        # Build report data for email
        report_data = {
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", ""),
            "short_analysis": report.get("short_analysis", ""),
            "in_depth_analysis": report.get("in_depth_analysis", ""),
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
        }

        # Broadcast to all subscribers
        email_service = get_email_service()
        email_result = await email_service.broadcast_daily_report(report_data)

        if not email_result.get("success"):
            raise HTTPException(status_code=500, detail=email_result.get("error", "Failed to broadcast email"))

        return {
            "success": True,
            "message": "Test broadcast sent using existing report",
            "report_id": request.report_id,
            "broadcast_id": email_result.get("broadcast_id"),
            "audience_id": email_result.get("audience_id"),
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/report/send-test")
async def send_test_report(request: SendEmailRequest):
    """
    Send the latest market report from database to the user's email.
    Email address is required and should come from the authenticated user.
    """
    try:
        to_email = request.email
        if not to_email:
            raise HTTPException(status_code=400, detail="Email address is required")

        # Get the latest report from database
        insforge_service = get_insforge_service()
        report = await insforge_service.get_latest_report()

        if not report:
            raise HTTPException(status_code=404, detail="No report found in database. Please generate a report first.")

        # Prepare report data for email
        report_data = {
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", datetime.now().isoformat()),
            "short_analysis": report.get("short_analysis", ""),
            "in_depth_analysis": report.get("in_depth_analysis", "")
        }

        # Send email to single recipient
        email_service = get_email_service()
        email_result = await email_service.send_daily_report(report_data, to_email=to_email)

        if not email_result.get("success"):
            raise HTTPException(status_code=500, detail=email_result.get("error", "Failed to send email"))

        return {
            "success": True,
            "message": f"Test report sent to {to_email}",
            "email_id": email_result.get("email_id"),
            "sent_to": to_email,
            "report_date": report.get("report_date")
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Subscriber Management Endpoints
# =============================================================================


class SubscribeRequest(BaseModel):
    email: str
    first_name: Optional[str] = None


class UnsubscribeRequest(BaseModel):
    email: str


@app.post("/api/subscribe")
async def subscribe(request: SubscribeRequest):
    """
    Subscribe to the daily market report newsletter.
    """
    try:
        email_service = get_email_service()
        result = email_service.add_subscriber(
            email=request.email,
            first_name=request.first_name
        )

        if not result.get("success"):
            # Handle duplicate subscription gracefully
            if result.get("code") == "DUPLICATE":
                return {
                    "success": True,
                    "message": "Email is already subscribed",
                    "email": request.email
                }
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to subscribe"))

        return {
            "success": True,
            "message": "Successfully subscribed to daily reports",
            "email": request.email,
            "contact_id": result.get("contact_id")
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/unsubscribe")
async def unsubscribe(request: UnsubscribeRequest):
    """
    Unsubscribe from the daily market report newsletter.
    """
    try:
        email_service = get_email_service()
        result = email_service.unsubscribe(email=request.email)

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to unsubscribe"))

        return {
            "success": True,
            "message": "Successfully unsubscribed from daily reports",
            "email": request.email
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/subscribers")
async def list_subscribers(
    x_cron_secret: str = Header(None, alias="X-Cron-Secret"),
    limit: int = Query(default=100, le=500)
):
    """
    List all active subscribers (admin only, protected by CRON_SECRET).
    """
    # Verify cron secret for admin access
    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        email_service = get_email_service()
        result = email_service.list_subscribers(limit=limit)

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to list subscribers"))

        return {
            "success": True,
            "subscribers": result.get("subscribers", []),
            "count": result.get("count", 0)
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Personalized Digest Endpoints
# =============================================================================


@app.post("/api/digest", response_model=DigestResponse)
async def generate_digest(request: DigestRequest):
    """
    Generate a personalized daily digest based on user's stock watchlist.

    Uses the same MarketAgent as /api/market but with personalized news filtering
    based on user's watchlist symbols + default macro symbols (SPY, QQQ, VIX).
    """
    try:
        result = await market_agent.analyze(user_symbols=request.symbols)

        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate digest")

        return DigestResponse(
            user_id="",  # Will be set by frontend
            symbols_used=result.get("symbols_used", []),
            analysis=result.get("in_depth_analysis", ""),
            news_data=result.get("news_data", {}).get("articles", []),
            timestamp=result.get("timestamp", datetime.now().isoformat()),
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
