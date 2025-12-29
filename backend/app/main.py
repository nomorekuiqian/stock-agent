from dotenv import load_dotenv
load_dotenv()  # Load .env before importing agents

import os
from fastapi import FastAPI, HTTPException, Header, Query
from app.utils.timezone import today_str, now_iso, days_ago
from pydantic import BaseModel
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from agents.agent import MarketAgent
from app.services.email_service import get_email_service
from app.services.insforge_service import get_insforge_service
from app.services.fred_service import (
    get_all_liquidity_metrics,
    get_liquidity_history,
    fetch_fred_series,
)
from app.services.liquidity_agent import get_liquidity_agent
from app.services.rednote_agent import get_rednote_agent
from app.models.request_models import (
    DigestRequest,
    DigestResponse,
    StockAnalysis,
    DigestHeadlineNews,
    DigestBriefNews,
    DigestNewsSection,
    DigestEvent,
    DigestSummary,
    SubscribeRequest,
    UnsubscribeRequest,
    SubscriptionUpdateRequest,
    SubscriptionStatusRequest,
    SubscriptionStatusResponse,
    SubscriptionResponse,
    BroadcastResponse,
    SubscribersListResponse,
)
from agents.personal_digest import get_personal_digest
from app.services.subscription_service import (
    get_subscription_service,
    SubscriptionChannel,
)

app = FastAPI(title="Market Analysis API")


# =============================================================================
# Helper Functions
# =============================================================================


def transform_market_data_to_indices(market_data: dict) -> list:
    """Transform market_data dict to frontend indices array format."""
    indices = []

    # Standard categories with value/daily_change structure
    for category in ["equities", "volatility", "commodities", "currencies", "credit", "financials"]:
        for name, data in market_data.get(category, {}).items():
            if isinstance(data, dict) and "value" in data:
                indices.append({
                    "name": name,
                    "value": data.get("value", 0),
                    "change_percent": data.get("daily_change", 0)
                })

    # Treasury rates (special structure: rates.yield_curve)
    # Only include 2Y and 10Y for simplicity
    rates_data = market_data.get("rates", {})
    yield_curve = rates_data.get("yield_curve", {})
    key_tenors = ["2Y", "10Y"]
    for tenor in key_tenors:
        data = yield_curve.get(tenor, {})
        if isinstance(data, dict) and "rate" in data:
            display_name = f"{tenor} Treasury"
            indices.append({
                "name": display_name,
                "value": data.get("rate", 0),
                "change_percent": data.get("daily_change", 0) or 0
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

class MarketAnalysisRequest(BaseModel):
    force: bool = False  # Force regenerate even if cached


@app.post("/api/market")
async def analyze_market(request: Optional[MarketAnalysisRequest] = None):
    try:
        force = request.force if request else False

        # Check if today's report already exists in database (Pacific timezone)
        today = today_str()
        insforge = get_insforge_service()
        existing_report = await insforge.get_report_by_date(today)

        # Validate that the cached report's timestamp is actually from today (local time)
        # This handles timezone issues where report_date might be stored in UTC
        if existing_report and not force:
            report_timestamp = existing_report.get("timestamp", "")
            report_date_from_timestamp = report_timestamp[:10] if report_timestamp else ""

            if report_date_from_timestamp == today:
                print(f"[API] Found existing report for {today}, returning cached data")
                # Return existing report from database
                return {
                    "report_id": existing_report.get("id"),
                    "indices": existing_report.get("indices", []),
                    "timestamp": existing_report.get("timestamp", now_iso()),
                    # New structured fields
                    "title": existing_report.get("title", ""),
                    "summary": existing_report.get("summary", ""),
                    "quick_take": existing_report.get("quick_take", ""),
                    "market_narrative": existing_report.get("market_narrative", ""),
                    "macro": existing_report.get("macro"),
                    "news": existing_report.get("news"),
                    "conclusion": existing_report.get("conclusion", ""),
                    "calendar": existing_report.get("calendar", []),
                    # Legacy fields for backward compatibility
                    "short_analysis": existing_report.get("short_analysis", ""),
                    "in_depth_analysis": existing_report.get("in_depth_analysis", ""),
                    # Raw data
                    "economic_calendar": existing_report.get("economic_calendar", {}),
                    "earnings_calendar": existing_report.get("earnings_calendar", {}),
                    "news_data": existing_report.get("news_data", {}),
                    "market_data": existing_report.get("market_data", {}),
                    "from_cache": True,
                }
            else:
                print(f"[API] Found report but timestamp ({report_date_from_timestamp}) doesn't match today ({today}), regenerating...")

        # Force regeneration requested
        if force:
            print(f"[API] Force regeneration requested, generating new report...")

        # No existing report, generate new one
        if not force:
            print(f"[API] No report found for {today}, generating new analysis...")
        result = await market_agent.analyze()
        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate market analysis")

        # Transform market_data to frontend expected format
        market_data = result.get("market_data", {})
        indices = transform_market_data_to_indices(market_data)

        response_data = {
            "indices": indices,
            "timestamp": result.get("timestamp", now_iso()),
            # New structured fields
            "title": result.get("title", ""),
            "summary": result.get("summary", ""),
            "quick_take": result.get("quick_take", ""),
            "market_narrative": result.get("market_narrative", ""),
            "macro": result.get("macro"),
            "news": result.get("news"),
            "conclusion": result.get("conclusion", ""),
            "calendar": result.get("calendar", []),  # LLM-curated key events
            # Legacy fields for backward compatibility
            "short_analysis": result.get("short_analysis", ""),
            "in_depth_analysis": result.get("in_depth_analysis", ""),
            # Raw data
            "economic_calendar": result.get("economic_calendar", {}),
            "earnings_calendar": result.get("earnings_calendar", {}),
            "news_data": result.get("news_data", {}),
            "evaluation_report": result.get("evaluation_report", ""),
            "draft_analysis": result.get("draft_analysis", ""),
            "market_data": market_data,
            "from_cache": False,
        }

        # Save new report to database
        save_result = await insforge.save_market_report(response_data)
        if save_result.get("success"):
            print(f"[API] Report saved to database for {today}")
            response_data["report_id"] = save_result.get("report_id")
        else:
            print(f"[API] Failed to save report: {save_result.get('error')}")

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

    If today's report already exists, use it instead of generating a new one.
    """
    # Verify cron secret if configured
    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        insforge_service = get_insforge_service()
        today = today_str()
        from_cache = False
        save_result = {"success": True}

        # Check if today's report already exists
        existing_report = await insforge_service.get_report_by_date(today)

        if existing_report:
            report_timestamp = existing_report.get("timestamp", "")
            report_date_from_timestamp = report_timestamp[:10] if report_timestamp else ""

            if report_date_from_timestamp == today:
                print(f"[API] Found existing report for {today}, using cached data for email")
                from_cache = True
                report_data = {
                    "indices": existing_report.get("indices", []),
                    "timestamp": existing_report.get("timestamp", now_iso()),
                    "title": existing_report.get("title", ""),
                    "summary": existing_report.get("summary", ""),
                    "quick_take": existing_report.get("quick_take", ""),
                    "market_narrative": existing_report.get("market_narrative", ""),
                    "macro": existing_report.get("macro"),
                    "news": existing_report.get("news"),
                    "conclusion": existing_report.get("conclusion", ""),
                    "calendar": existing_report.get("calendar", []),
                    "short_analysis": existing_report.get("short_analysis", ""),
                    "in_depth_analysis": existing_report.get("in_depth_analysis", ""),
                }
                save_result["report_id"] = existing_report.get("id")

        # Generate new report if no cache found
        if not from_cache:
            print(f"[API] No existing report for {today}, generating new analysis...")
            result = await market_agent.analyze()
            if not result:
                raise HTTPException(status_code=500, detail="Failed to generate market analysis")

            # Transform to frontend format for consistent email
            market_data = result.get("market_data", {})
            indices = transform_market_data_to_indices(market_data)

            # Build complete report data for email and database
            report_data = {
                "indices": indices,
                "timestamp": result.get("timestamp", now_iso()),
                "title": result.get("title", ""),
                "summary": result.get("summary", ""),
                "quick_take": result.get("quick_take", ""),
                "market_narrative": result.get("market_narrative", ""),
                "macro": result.get("macro"),
                "news": result.get("news"),
                "conclusion": result.get("conclusion", ""),
                "calendar": result.get("calendar", []),
                "short_analysis": result.get("short_analysis", ""),
                "in_depth_analysis": result.get("in_depth_analysis", ""),
                "economic_calendar": result.get("economic_calendar", {}),
                "earnings_calendar": result.get("earnings_calendar", {}),
                "news_data": result.get("news_data", {}),
                "market_data": market_data,
            }

            # Save report to database
            save_result = await insforge_service.save_market_report(report_data)
            if not save_result.get("success"):
                print(f"[Warning] Failed to save report to database: {save_result.get('error')}")

        # Generate RedNote content for the report
        try:
            report_id = save_result.get("report_id") if not from_cache else existing_report.get("id")
            if report_id:
                # Get the full report from database for RedNote generation
                full_report = await insforge_service.get_report_by_id(report_id)
                if full_report:
                    rednote_agent = get_rednote_agent()
                    rednote_result = await rednote_agent.generate(full_report)
                    if rednote_result.get("success"):
                        # Save RedNote content to database
                        rednote_save = await insforge_service.save_rednote_post({
                            "report_id": report_id,
                            "report_date": today,
                            "content": rednote_result.get("content", {})
                        })
                        print(f"[API] RedNote content generated and saved: {rednote_save.get('success')}")
                    else:
                        print(f"[Warning] Failed to generate RedNote content: {rednote_result.get('error')}")
        except Exception as rn_error:
            print(f"[Warning] RedNote generation failed: {rn_error}")
            # Don't fail the whole request if RedNote fails

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
            "from_cache": from_cache,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class SendEmailRequest(BaseModel):
    email: str  # Required: user's email address
    first_name: Optional[str] = None  # Optional: for personalized greeting


class BroadcastTestRequest(BaseModel):
    report_id: str  # ID of existing report to use for testing


@app.get("/api/report/preview")
async def get_email_preview(
    report_id: Optional[str] = Query(None),
    first_name: Optional[str] = Query(None),
):
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

        # Build report data for email rendering (include all structured fields)
        report_data = {
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", ""),
            # New structured fields
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
            "quick_take": report.get("quick_take", ""),
            "market_narrative": report.get("market_narrative", ""),
            "macro": report.get("macro"),
            "news": report.get("news"),
            "conclusion": report.get("conclusion", ""),
            "calendar": report.get("calendar", []),
            # Legacy fields
            "short_analysis": report.get("short_analysis", ""),
            "in_depth_analysis": report.get("in_depth_analysis", ""),
        }

        # Render HTML using the real email template
        email_service = get_email_service()
        html_content = email_service._format_html_report(report_data)

        # Replace placeholder with actual name (or default)
        display_name = first_name or "朋友"
        html_content = html_content.replace("{{{first_name|朋友}}}", display_name)

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


@app.get("/api/subscriptions/personal_digest/preview")
async def get_digest_preview(
    user_id: Optional[str] = Query(None),
    digest_id: Optional[str] = Query(None),
):
    """
    Get rendered HTML email preview for a personal digest.
    Uses existing digest data only - no API calls.

    Args:
        user_id: User ID to get the latest digest for
        digest_id: Specific digest ID to preview
    """
    import httpx

    try:
        insforge_service = get_insforge_service()
        func_url = f"{insforge_service.base_url}/functions/user-digests"

        # Get digest data via edge function
        digest = None
        async with httpx.AsyncClient() as client:
            if digest_id:
                # Get specific digest by ID
                url = f"{func_url}?digest_id={digest_id}"
                response = await client.get(url, headers=insforge_service.headers, timeout=30.0)
                if response.status_code == 200:
                    result = response.json()
                    if result.get("success") and result.get("data"):
                        digest = result["data"]
            elif user_id:
                # Get latest digest for user
                url = f"{func_url}?user_id={user_id}&limit=1"
                response = await client.get(url, headers=insforge_service.headers, timeout=30.0)
                if response.status_code == 200:
                    result = response.json()
                    if result.get("success") and result.get("data"):
                        data = result["data"]
                        if isinstance(data, list) and len(data) > 0:
                            digest = data[0]
                        elif isinstance(data, dict):
                            digest = data

        if not digest:
            if user_id:
                raise HTTPException(
                    status_code=404,
                    detail=f"No personal digest found for this user. Generate one first from the For You page."
                )
            else:
                raise HTTPException(
                    status_code=404,
                    detail="No digest found. Please provide user_id or digest_id."
                )

        # Build digest data for email rendering
        digest_data = digest.get("digest_data", {})
        email_data = {
            "timestamp": digest.get("created_at", ""),
            "greeting": digest.get("greeting", ""),
            "one_line_summary": digest.get("one_line_summary", ""),
            "stocks": digest_data.get("stocks", []),
            "news": digest_data.get("news", {}),
            "events": digest_data.get("events", []),
            "summary": digest_data.get("summary", {}),
        }

        # Render HTML using the real email template
        email_service = get_email_service()
        html_content = email_service._format_digest_html(email_data, "Preview User")

        return {
            "success": True,
            "html": html_content,
            "digest_id": digest.get("id"),
            "digest_date": digest.get("digest_date"),
            "user_id": digest.get("user_id"),
            "symbols": digest.get("symbols", []),
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

        # Build report data for email (include all structured fields)
        report_data = {
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", ""),
            # New structured fields
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
            "quick_take": report.get("quick_take", ""),
            "market_narrative": report.get("market_narrative", ""),
            "macro": report.get("macro"),
            "news": report.get("news"),
            "conclusion": report.get("conclusion", ""),
            "calendar": report.get("calendar", []),
            # Legacy fields
            "short_analysis": report.get("short_analysis", ""),
            "in_depth_analysis": report.get("in_depth_analysis", ""),
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

        # Prepare report data for email (include all structured fields)
        report_data = {
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", now_iso()),
            # New structured fields
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
            "quick_take": report.get("quick_take", ""),
            "market_narrative": report.get("market_narrative", ""),
            "macro": report.get("macro"),
            "news": report.get("news"),
            "conclusion": report.get("conclusion", ""),
            "calendar": report.get("calendar", []),
            # Legacy fields
            "short_analysis": report.get("short_analysis", ""),
            "in_depth_analysis": report.get("in_depth_analysis", ""),
        }

        # Send email to single recipient
        email_service = get_email_service()
        email_result = await email_service.send_daily_report(
            report_data,
            to_email=to_email,
            first_name=request.first_name
        )

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
# Unified Subscription Management Endpoints
# =============================================================================


@app.post("/api/subscriptions/{channel}/subscribe", response_model=SubscriptionResponse)
async def subscribe_to_channel(channel: SubscriptionChannel, request: SubscribeRequest):
    """
    Subscribe to a specific channel (daily_report or personal_digest).

    For personal_digest channel, user_id and symbols are required.
    """
    try:
        subscription_service = get_subscription_service()

        # Build metadata from request
        metadata = {}
        if request.first_name:
            metadata["first_name"] = request.first_name
        if request.user_id:
            metadata["user_id"] = request.user_id
        if request.symbols:
            metadata["symbols"] = request.symbols

        result = subscription_service.subscribe(
            channel=channel,
            email=request.email,
            metadata=metadata
        )

        return SubscriptionResponse(
            success=result.get("success", False),
            channel=channel.value,
            email=request.email,
            contact_id=result.get("contact_id"),
            metadata=result.get("metadata"),
            error=result.get("error"),
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subscriptions/{channel}/unsubscribe", response_model=SubscriptionResponse)
async def unsubscribe_from_channel(channel: SubscriptionChannel, request: UnsubscribeRequest):
    """
    Unsubscribe from a specific channel.
    """
    try:
        subscription_service = get_subscription_service()
        result = subscription_service.unsubscribe(channel=channel, email=request.email)

        return SubscriptionResponse(
            success=result.get("success", False),
            channel=channel.value,
            email=request.email,
            error=result.get("error"),
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/subscriptions/{channel}/status", response_model=SubscriptionStatusResponse)
async def get_subscription_status(
    channel: SubscriptionChannel,
    email: str = Query(..., description="Email address to check")
):
    """
    Get subscription status for an email in a specific channel.
    """
    try:
        subscription_service = get_subscription_service()
        result = subscription_service.get_status(channel=channel, email=email)

        return SubscriptionStatusResponse(
            success=result.get("success", False),
            channel=channel.value,
            subscribed=result.get("subscribed", False),
            email=email,
            metadata=result.get("metadata", {}),
            error=result.get("error"),
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/subscriptions/{channel}/update", response_model=SubscriptionResponse)
async def update_subscription(channel: SubscriptionChannel, request: SubscriptionUpdateRequest):
    """
    Update subscription metadata (e.g., watchlist symbols for personal_digest).
    """
    try:
        subscription_service = get_subscription_service()

        # Build metadata from request
        metadata = {}
        if request.first_name:
            metadata["first_name"] = request.first_name
        if request.symbols:
            metadata["symbols"] = request.symbols

        result = subscription_service.update(
            channel=channel,
            email=request.email,
            metadata=metadata
        )

        return SubscriptionResponse(
            success=result.get("success", False),
            channel=channel.value,
            email=request.email,
            metadata=result.get("metadata"),
            error=result.get("error"),
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/subscriptions/{channel}/subscribers", response_model=SubscribersListResponse)
async def list_channel_subscribers(
    channel: SubscriptionChannel,
    x_cron_secret: str = Header(None, alias="X-Cron-Secret"),
    limit: int = Query(default=100, le=500)
):
    """
    List all active subscribers for a channel (admin only, protected by CRON_SECRET).
    """
    # Verify cron secret for admin access
    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        subscription_service = get_subscription_service()
        result = subscription_service.list_subscribers(channel=channel, limit=limit)

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to list subscribers"))

        return SubscribersListResponse(
            success=True,
            channel=channel.value,
            subscribers=result.get("subscribers", []),
            count=result.get("count", 0),
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subscriptions/{channel}/broadcast", response_model=BroadcastResponse)
async def broadcast_to_channel(
    channel: SubscriptionChannel,
    x_cron_secret: str = Header(None, alias="X-Cron-Secret"),
):
    """
    Broadcast to all subscribers of a channel.
    Protected by CRON_SECRET for scheduled job authentication.

    - daily_report: Sends the daily market report
    - personal_digest: Generates and sends personalized digests (parallel processing)
    """
    # Verify cron secret
    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        email_service = get_email_service()

        if channel == SubscriptionChannel.DAILY_REPORT:
            # Generate or get today's report
            insforge_service = get_insforge_service()
            today = today_str()

            existing_report = await insforge_service.get_report_by_date(today)

            if existing_report:
                report_data = {
                    "indices": existing_report.get("indices", []),
                    "timestamp": existing_report.get("timestamp", now_iso()),
                    "title": existing_report.get("title", ""),
                    "summary": existing_report.get("summary", ""),
                    "quick_take": existing_report.get("quick_take", ""),
                    "market_narrative": existing_report.get("market_narrative", ""),
                    "macro": existing_report.get("macro"),
                    "news": existing_report.get("news"),
                    "conclusion": existing_report.get("conclusion", ""),
                    "calendar": existing_report.get("calendar", []),
                    "short_analysis": existing_report.get("short_analysis", ""),
                    "in_depth_analysis": existing_report.get("in_depth_analysis", ""),
                }
            else:
                # Generate new report
                result = await market_agent.analyze()
                if not result:
                    raise HTTPException(status_code=500, detail="Failed to generate market analysis")

                market_data = result.get("market_data", {})
                indices = transform_market_data_to_indices(market_data)

                report_data = {
                    "indices": indices,
                    "timestamp": result.get("timestamp", now_iso()),
                    "title": result.get("title", ""),
                    "summary": result.get("summary", ""),
                    "quick_take": result.get("quick_take", ""),
                    "market_narrative": result.get("market_narrative", ""),
                    "macro": result.get("macro"),
                    "news": result.get("news"),
                    "conclusion": result.get("conclusion", ""),
                    "calendar": result.get("calendar", []),
                    "short_analysis": result.get("short_analysis", ""),
                    "in_depth_analysis": result.get("in_depth_analysis", ""),
                }

                # Save to database
                await insforge_service.save_market_report({
                    **report_data,
                    "economic_calendar": result.get("economic_calendar", {}),
                    "earnings_calendar": result.get("earnings_calendar", {}),
                    "news_data": result.get("news_data", {}),
                    "market_data": market_data,
                })

            # Broadcast daily report
            broadcast_result = await email_service.broadcast_daily_report(report_data)

            return BroadcastResponse(
                success=broadcast_result.get("success", False),
                channel=channel.value,
                total=broadcast_result.get("total", 0),
                sent=broadcast_result.get("sent", 0),
                failed=broadcast_result.get("failed", 0),
                errors=broadcast_result.get("errors", []),
            )

        elif channel == SubscriptionChannel.PERSONAL_DIGEST:
            # Broadcast personal digests (parallel processing)
            broadcast_result = await email_service.broadcast_personal_digests(max_concurrent=5)

            return BroadcastResponse(
                success=broadcast_result.get("success", False),
                channel=channel.value,
                total=broadcast_result.get("total", 0),
                sent=broadcast_result.get("sent", 0),
                failed=broadcast_result.get("failed", 0),
                errors=broadcast_result.get("errors", []),
            )

        else:
            raise HTTPException(status_code=400, detail=f"Unknown channel: {channel}")

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

    Uses PersonalDigest agent (gemini-3-flash) to generate structured digest
    with 5 sections: stocks, news (8-10), events, macro impact, bottom line.

    Personalization is based on user's watchlist stocks.
    """
    try:
        if not request.user_id:
            raise HTTPException(status_code=401, detail="Authentication required. Please sign in to generate personalized digest.")

        if not request.symbols:
            raise HTTPException(status_code=400, detail="No symbols provided")

        # Use PersonalDigest for personalized digest
        digest_agent = get_personal_digest()
        result = await digest_agent.generate(symbols=request.symbols)

        if not result.get("success"):
            error_msg = result.get("error", "Failed to generate digest")
            raise HTTPException(status_code=500, detail=error_msg)

        # Transform to response model
        stocks = [
            StockAnalysis(
                symbol=s.get("symbol", ""),
                name=s.get("name", ""),
                price=s.get("price", 0),
                daily_change=s.get("daily_change", ""),
                week_change=s.get("week_change", ""),
                status=s.get("status", ""),
                quick_take=s.get("quick_take", ""),
            )
            for s in result.get("stocks", [])
        ]

        # Transform news section (headlines + briefs)
        news_data = result.get("news", {})
        if isinstance(news_data, dict):
            headlines = [
                DigestHeadlineNews(
                    title=n.get("title", ""),
                    related_symbols=n.get("related_symbols", []),
                    fact_summary=n.get("fact_summary", ""),
                    deep_analysis=n.get("deep_analysis", ""),
                    url=n.get("url", ""),
                )
                for n in news_data.get("headlines", [])
            ]
            briefs = [
                DigestBriefNews(
                    title=n.get("title", ""),
                    related_symbols=n.get("related_symbols", []),
                    summary=n.get("summary", ""),
                    analysis=n.get("analysis", ""),
                    url=n.get("url", ""),
                )
                for n in news_data.get("briefs", [])
            ]
            news = DigestNewsSection(headlines=headlines, briefs=briefs)
        else:
            news = DigestNewsSection(headlines=[], briefs=[])

        events = [
            DigestEvent(
                date=e.get("date", ""),
                event=e.get("event", ""),
                related_symbols=e.get("related_symbols", []),
                why_important=e.get("why_important", ""),
            )
            for e in result.get("events", [])
        ]

        # Transform summary
        summary_data = result.get("summary", {})
        summary = DigestSummary(
            content=summary_data.get("content", "") if isinstance(summary_data, dict) else "",
        )

        # Save to database (always save, user_id is required)
        insforge = get_insforge_service()
        save_data = {
            "user_id": request.user_id,
            "digest_date": today_str(),
            "timestamp": result.get("timestamp", now_iso()),
            "symbols": result.get("symbols_used", []),
            "greeting": result.get("greeting", ""),
            "one_line_summary": result.get("one_line_summary", ""),
            "stocks": result.get("stocks", []),
            "news": result.get("news", {}),
            "events": result.get("events", []),
            "summary": result.get("summary", {}),
        }
        save_result = await insforge.save_user_digest(save_data)
        if save_result.get("success"):
            print(f"[Digest] Saved digest for user {request.user_id}, ID: {save_result.get('digest_id')}")
        else:
            print(f"[Digest] Failed to save: {save_result.get('error')}")

        return DigestResponse(
            success=True,
            timestamp=result.get("timestamp", now_iso()),
            symbols_used=result.get("symbols_used", []),
            greeting=result.get("greeting", ""),
            one_line_summary=result.get("one_line_summary", ""),
            stocks=stocks,
            news=news,
            events=events,
            summary=summary,
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Liquidity Monitor Endpoints
# =============================================================================


@app.get("/api/liquidity/metrics")
async def get_liquidity_metrics():
    """
    Get all key liquidity metrics including calculated net liquidity.

    Returns:
        - fed_assets: Fed Total Assets (WALCL)
        - tga: Treasury General Account (WDTGAL)
        - rrp: Overnight Reverse Repo (RRPONTSYD)
        - reserves: Bank Reserves (WRESBAL)
        - sofr: SOFR Rate
        - effr: Effective Fed Funds Rate
        - nfci: Financial Conditions Index
        - net_liquidity: Calculated (WALCL - TGA - RRP)
    """
    try:
        metrics = await get_all_liquidity_metrics()
        return {
            "success": True,
            "timestamp": now_iso(),
            "metrics": metrics
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/liquidity/history")
async def get_liquidity_history_endpoint(
    days: int = Query(default=365, ge=30, le=1825, description="Number of days of history")
):
    """
    Get historical net liquidity data for charting.

    Args:
        days: Number of days of history (default: 365, max: 1825 = 5 years)

    Returns:
        Historical net liquidity with component breakdown
    """
    try:
        history = await get_liquidity_history(days=days)
        return {
            "success": True,
            "timestamp": now_iso(),
            "data": history
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/liquidity/series/{series_id}")
async def get_fred_series(
    series_id: str,
    days: int = Query(default=365, ge=30, le=1825, description="Number of days of history")
):
    """
    Get raw FRED series data.

    Args:
        series_id: FRED series ID (e.g., WALCL, WDTGAL, RRPONTSYD, NFCI)
        days: Number of days of history

    Returns:
        Raw series data with observations
    """
    try:
        start_date = days_ago(days)
        end_date = today_str()

        data = await fetch_fred_series(series_id, start_date, end_date, limit=500)
        return {
            "success": True,
            "timestamp": now_iso(),
            "data": data
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/liquidity/analysis")
async def generate_liquidity_analysis():
    """
    Generate AI-powered liquidity analysis using GPT.

    The agent will:
    1. Analyze current metrics and historical trends
    2. Search for recent news for context
    3. Generate structured analysis report
    4. Save to Insforge for historical tracking

    Returns:
        Structured analysis with status assessment
    """
    try:
        # Get current metrics
        metrics = await get_all_liquidity_metrics()

        # Get historical data for trend analysis
        history_30d_raw = await get_liquidity_history(days=30)
        history_90d_raw = await get_liquidity_history(days=90)

        history_30d = history_30d_raw.get("observations", [])
        history_90d = history_90d_raw.get("observations", [])

        # Generate analysis using the agent
        agent = get_liquidity_agent()
        result = await agent.analyze(
            current_metrics=metrics,
            history_30d=history_30d,
            history_90d=history_90d
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to generate analysis")
            )

        # Save to Insforge
        try:
            insforge_service = get_insforge_service()
            save_result = await insforge_service.save_liquidity_analysis({
                "analysis": result.get("analysis"),
                "status": result.get("status"),
                "metrics_snapshot": result.get("metrics_snapshot"),
                "generated_at": result.get("generated_at"),
                "model": result.get("model"),
            })
            result["saved"] = save_result.get("success", False)
            result["analysis_id"] = save_result.get("analysis_id")
        except Exception as save_error:
            print(f"[Warning] Failed to save analysis: {save_error}")
            result["saved"] = False

        # Return in consistent format with GET endpoint
        return {
            "success": True,
            "analysis": {
                "id": result.get("analysis_id"),
                "analysis": result.get("analysis"),
                "status": result.get("status"),
                "generated_at": result.get("generated_at"),
                "model": result.get("model"),
                "metrics_snapshot": result.get("metrics_snapshot"),
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/liquidity/analysis/latest")
async def get_latest_liquidity_analysis():
    """
    Get the most recent liquidity analysis from database.
    """
    try:
        insforge_service = get_insforge_service()
        analysis = await insforge_service.get_latest_liquidity_analysis()

        if not analysis:
            # Return empty success instead of 404
            return {
                "success": True,
                "analysis": None
            }

        return {
            "success": True,
            "analysis": analysis
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# RedNote (Xiaohongshu) Content Endpoints
# =============================================================================


class RedNoteGenerateRequest(BaseModel):
    report_id: Optional[str] = None  # Optional: specific report ID to use
    force: bool = False  # Force regenerate even if cached


@app.post("/api/rednote/generate")
async def generate_rednote_content(request: Optional[RedNoteGenerateRequest] = None):
    """
    Generate Xiaohongshu content from market report.

    Uses the latest market report by default, or a specific report if report_id is provided.
    Returns structured content ready for copy-paste to Canva templates.
    """
    try:
        force = request.force if request else False
        report_id = request.report_id if request else None

        insforge_service = get_insforge_service()

        # Get the market report
        if report_id:
            report = await insforge_service.get_report_by_id(report_id)
            if not report:
                raise HTTPException(status_code=404, detail=f"Report not found: {report_id}")
        else:
            report = await insforge_service.get_latest_report()
            if not report:
                raise HTTPException(status_code=404, detail="No market report found. Generate a market report first.")

        report_date = report.get("report_date", "")

        # Check if we already have a RedNote post for this report date
        if not force:
            existing_rednote = await insforge_service.get_rednote_by_date(report_date)
            if existing_rednote:
                print(f"[API] Found existing RedNote post for {report_date}, returning cached data")
                return {
                    "success": True,
                    "post_id": existing_rednote.get("id"),
                    "report_date": report_date,
                    "content": existing_rednote.get("content", {}),
                    "generated_at": existing_rednote.get("generated_at"),
                    "from_cache": True,
                }

        # Generate new content
        print(f"[API] Generating RedNote content for {report_date}...")
        agent = get_rednote_agent()
        result = await agent.generate(report)

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to generate RedNote content")
            )

        content = result.get("content", {})

        # Save to database
        save_result = await insforge_service.save_rednote_post({
            "report_id": report.get("id"),
            "report_date": report_date,
            "content": content,
        })

        post_id = save_result.get("post_id") if save_result.get("success") else None
        if not save_result.get("success"):
            print(f"[Warning] Failed to save RedNote post: {save_result.get('error')}")

        return {
            "success": True,
            "post_id": post_id,
            "report_date": report_date,
            "content": content,
            "generated_at": now_iso(),
            "from_cache": False,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/rednote/list")
async def list_rednote_posts(limit: int = 20):
    """
    List all RedNote posts with title and date for dropdown selection.

    Returns list of posts with id, report_date, and title.
    """
    try:
        insforge_service = get_insforge_service()
        posts = await insforge_service.list_rednote_posts(limit=limit)

        return {
            "success": True,
            "posts": posts
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/rednote/{post_id}")
async def get_rednote_by_id(post_id: str):
    """
    Get a specific RedNote post by ID.

    Returns full post content.
    """
    try:
        insforge_service = get_insforge_service()
        rednote = await insforge_service.get_rednote_by_id(post_id)

        if not rednote:
            raise HTTPException(status_code=404, detail="RedNote post not found")

        return {
            "success": True,
            "post": {
                "id": rednote.get("id"),
                "report_id": rednote.get("report_id"),
                "report_date": rednote.get("report_date"),
                "content": rednote.get("content", {}),
                "generated_at": rednote.get("generated_at"),
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/rednote/latest")
async def get_latest_rednote():
    """
    Get the latest RedNote post from database.

    Returns structured content for Canva copy-paste.
    """
    try:
        insforge_service = get_insforge_service()
        rednote = await insforge_service.get_latest_rednote()

        if not rednote:
            return {
                "success": True,
                "post": None,
                "message": "No RedNote posts found. Generate one first using POST /api/rednote/generate"
            }

        return {
            "success": True,
            "post": {
                "id": rednote.get("id"),
                "report_id": rednote.get("report_id"),
                "report_date": rednote.get("report_date"),
                "content": rednote.get("content", {}),
                "generated_at": rednote.get("generated_at"),
            }
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Stock Search API
# =============================================================================

@app.get("/api/stocks/search")
async def search_stocks(q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20)):
    """
    Search stocks by symbol or company name using yfinance.

    Returns list of matching stocks with symbol, name, type, and exchange.
    """
    try:
        from yfinance import Search

        search = Search(query=q, max_results=limit)
        results = []

        for quote in search.quotes:
            # Only include stocks and ETFs (filter out options, futures, etc.)
            quote_type = quote.get("typeDisp", "").lower()
            if quote_type in ["equity", "etf", ""]:
                results.append({
                    "symbol": quote.get("symbol"),
                    "name": quote.get("shortName") or quote.get("longName"),
                    "type": quote.get("typeDisp"),
                    "exchange": quote.get("exchange"),
                })

        return {"stocks": results}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stocks/quotes")
async def get_stock_quotes_api(symbols: str = Query(..., description="Comma-separated stock symbols")):
    """
    Get current quotes for multiple stocks.

    Args:
        symbols: Comma-separated stock symbols (e.g., "AAPL,MSFT,NVDA")

    Returns:
        Stock quotes with price and daily change.
    """
    try:
        from agents.tools.market_data import get_stock_quotes

        symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

        if not symbol_list:
            raise HTTPException(status_code=400, detail="No symbols provided")

        if len(symbol_list) > 20:
            symbol_list = symbol_list[:20]

        result = get_stock_quotes(symbol_list)

        # Transform to simpler format for frontend
        quotes = []
        for symbol, data in result.get("stocks", {}).items():
            quotes.append({
                "symbol": symbol,
                "name": data.get("name", symbol),
                "price": data.get("price", 0),
                "daily_change": data.get("daily_change", 0),
            })

        return {"success": True, "quotes": quotes}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
