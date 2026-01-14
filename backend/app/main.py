from dotenv import load_dotenv
load_dotenv()  # Load .env before importing agents

import os
from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.responses import RedirectResponse, HTMLResponse
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
from app.services.fmp_service import get_fmp_service
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
    SyncUserRequest,
    SyncUserResponse,
    SyncedChannelInfo,
)
from agents.personal_digest import get_personal_digest
from agents.sector_digest import get_sector_digest, SectorDigest
from app.models.sector_digest_models import get_enabled_sectors, get_sector_by_id
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
                    "title": existing_report.get("title", ""),
                    "summary": existing_report.get("summary", ""),
                    "intro": existing_report.get("intro", ""),
                    "macro": existing_report.get("macro"),
                    "news": existing_report.get("news"),
                    "report_summary": existing_report.get("report_summary", ""),
                    "calendar": existing_report.get("calendar", []),
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
            "title": result.get("title", ""),
            "summary": result.get("summary", ""),
            "intro": result.get("intro", ""),
            "macro": result.get("macro"),
            "news": result.get("news"),
            "report_summary": result.get("report_summary", ""),
            "calendar": result.get("calendar", []),
            "market_data": market_data,
            "from_cache": False,
        }

        # Save new report to database (field names match DB schema directly)
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
                    "report_id": existing_report.get("id"),
                    "report_date": existing_report.get("report_date", today),
                    "indices": existing_report.get("indices", []),
                    "timestamp": existing_report.get("timestamp", now_iso()),
                    "title": existing_report.get("title", ""),
                    "summary": existing_report.get("summary", ""),
                    "intro": existing_report.get("intro", ""),
                    "macro": existing_report.get("macro"),
                    "news": existing_report.get("news"),
                    "report_summary": existing_report.get("report_summary", ""),
                    "calendar": existing_report.get("calendar", []),
                    "market_data": existing_report.get("market_data", {}),
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
            # Field names match DB schema directly (intro, report_summary)
            report_data = {
                "report_date": today,
                "indices": indices,
                "timestamp": result.get("timestamp", now_iso()),
                "title": result.get("title", ""),
                "summary": result.get("summary", ""),
                "intro": result.get("intro", ""),
                "macro": result.get("macro"),
                "news": result.get("news"),
                "report_summary": result.get("report_summary", ""),
                "calendar": result.get("calendar", []),
                "market_data": market_data,
            }

            # Save report to database
            save_result = await insforge_service.save_market_report(report_data)
            if not save_result.get("success"):
                print(f"[Warning] Failed to save report to database: {save_result.get('error')}")
            else:
                # Add report_id to report_data for email feedback links
                report_data["report_id"] = save_result.get("report_id")

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
    report_id: Optional[str] = None  # Optional: specific report ID to send


class BroadcastTestRequest(BaseModel):
    report_id: str  # ID of existing report to use for testing
    audience_id: Optional[str] = None  # Optional: specific audience ID (e.g., Test Broadcast)


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

        # Build report data for email rendering
        report_data = {
            "report_id": report.get("id"),
            "report_date": report.get("report_date", today_str()),
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", ""),
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
            "intro": report.get("intro", ""),
            "macro": report.get("macro"),
            "news": report.get("news"),
            "report_summary": report.get("report_summary", ""),
            "calendar": report.get("calendar", []),
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
        html_content = email_service._format_digest_html(
            email_data,
            first_name="Preview User",
            digest_date=digest.get("digest_date"),
            digest_id=digest.get("id"),
        )

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
            "report_id": report.get("id") or request.report_id,
            "report_date": report.get("report_date"),
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", ""),
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
            "intro": report.get("intro", ""),
            "macro": report.get("macro"),
            "news": report.get("news"),
            "report_summary": report.get("report_summary", ""),
            "calendar": report.get("calendar", []),
        }

        # Broadcast to audience (default or specified test audience)
        email_service = get_email_service()
        email_result = await email_service.broadcast_daily_report(report_data, audience_id=request.audience_id)

        if not email_result.get("success"):
            raise HTTPException(status_code=500, detail=email_result.get("error", "Failed to broadcast email"))

        return {
            "success": True,
            "message": f"Test broadcast sent to audience {email_result.get('audience_id')}",
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
    Send a market report from database to the user's email.
    Email address is required. Optionally specify report_id to send a specific report.
    """
    try:
        to_email = request.email
        if not to_email:
            raise HTTPException(status_code=400, detail="Email address is required")

        # Get report from database (specific or latest)
        insforge_service = get_insforge_service()
        if request.report_id:
            report = await insforge_service.get_report_by_id(request.report_id)
        else:
            report = await insforge_service.get_latest_report()

        if not report:
            raise HTTPException(status_code=404, detail="No report found in database. Please generate a report first.")

        # Prepare report data for email (include all structured fields)
        report_data = {
            "report_id": report.get("id"),
            "report_date": report.get("report_date"),
            "indices": report.get("indices", []),
            "timestamp": report.get("timestamp", now_iso()),
            "title": report.get("title", ""),
            "summary": report.get("summary", ""),
            "intro": report.get("intro", ""),
            "macro": report.get("macro"),
            "news": report.get("news"),
            "report_summary": report.get("report_summary", ""),
            "calendar": report.get("calendar", []),
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


@app.post("/api/welcome/send-test")
async def send_test_welcome_email(request: SendEmailRequest):
    """
    Send a test welcome email to the specified email address.
    Does not affect subscription status or welcome_sent flag.
    """
    try:
        to_email = request.email
        if not to_email:
            raise HTTPException(status_code=400, detail="Email address is required")

        email_service = get_email_service()
        email_result = await email_service.send_welcome_email(
            to_email=to_email,
            first_name=request.first_name
        )

        if not email_result.get("success"):
            raise HTTPException(status_code=500, detail=email_result.get("error", "Failed to send welcome email"))

        return {
            "success": True,
            "message": f"Welcome email sent to {to_email}",
            "email_id": email_result.get("email_id"),
            "sent_to": to_email,
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
    Sends welcome email for new daily_report subscribers.

    Optimized flow (2-3 API calls vs old 6-7):
    1. subscribe_with_welcome - creates contact with welcome_sent pre-set
    2. if is_new: send welcome email
    """
    try:
        subscription_service = get_subscription_service()
        email_service = get_email_service()

        # Build metadata from request
        metadata = {}
        if request.first_name:
            metadata["first_name"] = request.first_name
        if request.user_id:
            metadata["user_id"] = request.user_id
        if request.symbols:
            metadata["symbols"] = request.symbols

        # Single optimized call that handles subscribe + welcome tracking
        result = subscription_service.subscribe_with_welcome(
            channel=channel,
            email=request.email,
            metadata=metadata
        )

        # Send welcome email only for NEW daily_report subscribers
        if (
            result.get("success")
            and result.get("is_new")
            and channel == SubscriptionChannel.DAILY_REPORT
        ):
            welcome_result = await email_service.send_welcome_email(
                to_email=request.email,
                first_name=request.first_name
            )
            if welcome_result.get("success"):
                print(f"[API] Welcome email sent to {request.email}")
            else:
                print(f"[API] Failed to send welcome email: {welcome_result.get('error')}")

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
                    "report_id": existing_report.get("id"),
                    "report_date": existing_report.get("report_date", today),
                    "indices": existing_report.get("indices", []),
                    "timestamp": existing_report.get("timestamp", now_iso()),
                    "title": existing_report.get("title", ""),
                    "summary": existing_report.get("summary", ""),
                    "intro": existing_report.get("intro", ""),
                    "macro": existing_report.get("macro"),
                    "news": existing_report.get("news"),
                    "report_summary": existing_report.get("report_summary", ""),
                    "calendar": existing_report.get("calendar", []),
                }
            else:
                # Generate new report
                result = await market_agent.analyze()
                if not result:
                    raise HTTPException(status_code=500, detail="Failed to generate market analysis")

                market_data = result.get("market_data", {})
                indices = transform_market_data_to_indices(market_data)

                report_data = {
                    "report_date": today,
                    "indices": indices,
                    "timestamp": result.get("timestamp", now_iso()),
                    "title": result.get("title", ""),
                    "summary": result.get("summary", ""),
                    "intro": result.get("intro", ""),
                    "macro": result.get("macro"),
                    "news": result.get("news"),
                    "report_summary": result.get("report_summary", ""),
                    "calendar": result.get("calendar", []),
                }

                # Save to database
                save_result = await insforge_service.save_market_report({
                    **report_data,
                    "economic_calendar": result.get("economic_calendar", {}),
                    "earnings_calendar": result.get("earnings_calendar", {}),
                    "news_data": result.get("news_data", {}),
                    "market_data": market_data,
                })

                # Add report_id to report_data for feedback links
                if save_result.get("success"):
                    report_data["report_id"] = save_result.get("report_id")

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


@app.post("/api/subscriptions/sync-user", response_model=SyncUserResponse)
async def sync_user_subscriptions(request: SyncUserRequest):
    """
    Sync a website user with their existing Resend subscriptions.

    When a user logs in or registers, call this endpoint to link their
    website account (user_id) with any existing email subscriptions in Resend.

    This enables:
    - Matching existing subscribers to website accounts
    - Personalized broadcasts using user_id
    - Unified subscription management across channels
    """
    try:
        subscription_service = get_subscription_service()

        result = subscription_service.sync_user(
            user_id=request.user_id,
            email=request.email,
            first_name=request.first_name,
        )

        return SyncUserResponse(
            success=result.get("success", False),
            email=result.get("email", request.email),
            user_id=result.get("user_id", request.user_id),
            synced_channels=[
                SyncedChannelInfo(**ch) for ch in result.get("synced_channels", [])
            ],
            errors=result.get("errors", []),
        )

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
# Stock Search API (using FMP for faster response)
# =============================================================================

@app.get("/api/stocks/search")
async def search_stocks(q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20)):
    """
    Search stocks by symbol or company name using FMP API.

    Returns list of matching stocks with symbol, name, type, and exchange.
    """
    try:
        fmp = get_fmp_service()
        result = fmp.search_stocks(query=q, limit=limit)

        if result.get("status") == "error":
            return {"stocks": []}

        return {"stocks": result.get("stocks", [])}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stocks/quotes")
async def get_stock_quotes_api(symbols: str = Query(..., description="Comma-separated stock symbols")):
    """
    Get current quotes for multiple stocks using FMP API with 5-minute caching.

    Args:
        symbols: Comma-separated stock symbols (e.g., "AAPL,MSFT,NVDA")

    Returns:
        Stock quotes with price and daily change.
    """
    try:
        symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

        if not symbol_list:
            raise HTTPException(status_code=400, detail="No symbols provided")

        if len(symbol_list) > 20:
            symbol_list = symbol_list[:20]

        fmp = get_fmp_service()
        result = fmp.get_stock_quotes(symbol_list, use_cache=True)

        # Transform to frontend format
        quotes = []
        for quote in result.get("quotes", []):
            quotes.append({
                "symbol": quote.get("symbol", ""),
                "name": quote.get("name", ""),
                "price": quote.get("price", 0),
                "daily_change": quote.get("daily_change", 0),
            })

        print(f"[API] get_stock_quotes: {len(quotes)} quotes, {result.get('from_cache', 0)} from cache")

        return {"success": True, "quotes": quotes}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Email Feedback Endpoints
# =============================================================================

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def _feedback_html_page(status: str, rating: str = None, message: str = None) -> str:
    """Generate a simple HTML page for feedback response."""
    rating_display = {
        "satisfied": ("&#128077;", "helpful", "#10b981"),
        "dissatisfied": ("&#128078;", "not helpful", "#ef4444"),
    }

    if status == "success":
        emoji, text, color = rating_display.get(rating, ("&#128522;", "", "#10b981"))
        title = "Thanks for your feedback!"
        subtitle = "Your opinion helps us improve."
        icon_bg = "#d1fae5"
        icon_color = "#10b981"
    elif status == "duplicate":
        emoji, text, color = rating_display.get(rating, ("", "", "#3b82f6"))
        title = "Already received!"
        subtitle = "You've already submitted feedback for this report."
        icon_bg = "#dbeafe"
        icon_color = "#3b82f6"
    else:
        title = "Something went wrong"
        subtitle = message or "Please try again later."
        emoji, text, color = "", "", "#ef4444"
        icon_bg = "#fee2e2"
        icon_color = "#ef4444"

    rating_badge = ""
    if rating and text:
        rating_badge = f'<div style="margin-top: 16px;"><span style="display: inline-block; padding: 6px 12px; background: {icon_bg}; color: {color}; border-radius: 20px; font-size: 14px;">{emoji} {text}</span></div>'

    # Simple feedback confirmation page (no auto-close)
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            background: #f9fafb;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
        }}
        .container {{
            text-align: center;
            padding: 32px;
            max-width: 320px;
        }}
        .icon {{
            width: 64px;
            height: 64px;
            background: {icon_bg};
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px;
            font-size: 28px;
            color: {icon_color};
        }}
        h1 {{
            margin: 0 0 8px;
            font-size: 20px;
            font-weight: 600;
            color: #111827;
        }}
        p {{
            margin: 0;
            color: #6b7280;
            font-size: 14px;
        }}
        .close-hint {{
            margin-top: 24px;
            font-size: 12px;
            color: #9ca3af;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">{"&#10003;" if status in ["success", "duplicate"] else "&#9888;"}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {rating_badge}
        <p class="close-hint">You can close this tab.</p>
    </div>
</body>
</html>"""


@app.get("/api/feedback")
async def record_email_feedback(
    report_date: str = Query(None, description="Report date in YYYY-MM-DD format"),
    email: str = Query(None, description="User email"),
    rating: str = Query(None, description="Rating: satisfied or dissatisfied"),
    report_id: str = Query(None, description="Optional report UUID"),
):
    """
    Record email feedback from daily report.
    Called when user clicks feedback button in email.
    Redirects to frontend feedback page after recording.
    """
    # Validate required parameters
    if not report_date or not email or not rating:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/feedback?status=error&error=missing_params",
            status_code=302,
        )

    # Validate rating value
    valid_ratings = ["satisfied", "dissatisfied"]
    if rating not in valid_ratings:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/feedback?status=error&error=invalid_rating",
            status_code=302,
        )

    try:
        insforge_service = get_insforge_service()
        result = await insforge_service.save_email_feedback(
            report_date=report_date,
            email=email,
            rating=rating,
            report_id=report_id,
        )

        if result.get("success"):
            is_duplicate = result.get("is_duplicate", False)
            status = "duplicate" if is_duplicate else "success"
            return RedirectResponse(
                url=f"{FRONTEND_URL}/feedback?status={status}&rating={rating}",
                status_code=302,
            )
        else:
            error = result.get("error", "server_error")
            return RedirectResponse(
                url=f"{FRONTEND_URL}/feedback?status=error&error={error}",
                status_code=302,
            )

    except Exception as e:
        print(f"[Feedback] Exception: {e}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/feedback?status=error&error=server_error",
            status_code=302,
        )


@app.post("/api/feedback/submit")
async def submit_email_feedback(
    report_date: str = Query(..., description="Report date in YYYY-MM-DD format"),
    email: str = Query(..., description="User email"),
    rating: str = Query(..., description="Rating: satisfied or dissatisfied"),
    report_id: str = Query(None, description="Optional report UUID"),
):
    """
    Submit email feedback from frontend (async).
    Called by frontend after page loads to save feedback without blocking UX.

    Returns JSON response instead of redirect.
    """
    # Validate rating value
    valid_ratings = ["satisfied", "dissatisfied"]
    if rating not in valid_ratings:
        return {"success": False, "error": "invalid_rating"}

    try:
        insforge_service = get_insforge_service()
        result = await insforge_service.save_email_feedback(
            report_date=report_date,
            email=email,
            rating=rating,
            report_id=report_id,
        )

        if result.get("success"):
            is_duplicate = result.get("is_duplicate", False)
            return {
                "success": True,
                "is_duplicate": is_duplicate,
                "rating": rating,
            }
        else:
            return {"success": False, "error": result.get("error", "save_failed")}

    except Exception as e:
        print(f"[Feedback Submit] Exception: {e}")
        return {"success": False, "error": "server_error"}


@app.get("/api/feedback/stats")
async def get_feedback_stats(
    start_date: str = Query(None, description="Start date (YYYY-MM-DD), defaults to 7 days ago"),
    end_date: str = Query(None, description="End date (YYYY-MM-DD), defaults to today"),
    x_cron_secret: str = Header(None, alias="X-Cron-Secret"),
):
    """
    Get email feedback statistics for a date range.
    Protected by CRON_SECRET for admin access.

    Returns:
        Statistics including total count, breakdown by rating, satisfaction rate, and daily data.
    """
    # Verify cron secret for admin access
    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # Default date range: last 7 days
        if not end_date:
            end_date = today_str()
        if not start_date:
            start_date = days_ago(7)

        insforge_service = get_insforge_service()
        result = await insforge_service.get_feedback_stats(
            start_date=start_date,
            end_date=end_date,
        )

        if result.get("success"):
            return {
                "success": True,
                "period": result.get("period"),
                "total": result.get("total", 0),
                "breakdown": result.get("breakdown", {}),
                "satisfaction_rate": result.get("satisfaction_rate", 0),
                "daily": result.get("daily", []),
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to get feedback stats"),
            )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Sector Digest Endpoints
# =============================================================================


class SectorSubscribeRequest(BaseModel):
    user_id: str
    sector_id: str


class SectorUnsubscribeRequest(BaseModel):
    user_id: str
    sector_id: str


@app.get("/api/sectors")
async def list_sectors():
    """
    List all available sectors for subscription.
    """
    try:
        sectors = get_enabled_sectors()
        return {
            "success": True,
            "sectors": [
                {
                    "id": s.id,
                    "name_en": s.name_en,
                    "name_zh": s.name_zh,
                    "description": s.description,
                    "symbols": s.symbols,
                    "symbol_count": len(s.symbols),
                }
                for s in sectors
            ],
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sectors/{sector_id}/digest")
async def generate_sector_digest(sector_id: str):
    """
    Generate a sector digest for a specific sector.

    Uses SectorDigest agent (gemini-3-pro-preview) to generate
    in-depth sector analysis.
    """
    try:
        sector = get_sector_by_id(sector_id)
        if not sector:
            raise HTTPException(status_code=404, detail=f"Sector '{sector_id}' not found")

        if not sector.enabled:
            raise HTTPException(status_code=400, detail=f"Sector '{sector_id}' is disabled")

        digest_agent = get_sector_digest()
        result = await digest_agent.generate(sector_id=sector_id)

        if not result.get("success"):
            error_msg = result.get("error", "Failed to generate sector digest")
            raise HTTPException(status_code=500, detail=error_msg)

        # Save to database
        try:
            insforge_service = get_insforge_service()
            save_result = await insforge_service.save_sector_digest(
                sector_id=sector_id,
                digest_date=today_str(),
                digest_data=result,
            )
            result["saved"] = save_result.get("success", False)
            result["digest_id"] = save_result.get("digest_id")
        except Exception as save_error:
            print(f"[Warning] Failed to save sector digest: {save_error}")
            result["saved"] = False

        return result

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sectors/{sector_id}/digest/latest")
async def get_latest_sector_digest(sector_id: str):
    """
    Get the latest sector digest from database.
    """
    try:
        sector = get_sector_by_id(sector_id)
        if not sector:
            raise HTTPException(status_code=404, detail=f"Sector '{sector_id}' not found")

        insforge_service = get_insforge_service()
        digest = await insforge_service.get_latest_sector_digest(sector_id)

        if not digest:
            return {
                "success": True,
                "digest": None,
                "sector_id": sector_id,
                "sector_name": sector.name_zh,
            }

        return {
            "success": True,
            "digest": digest.get("digest_data"),
            "digest_date": digest.get("digest_date"),
            "generated_at": digest.get("generated_at"),
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sectors/subscribe")
async def subscribe_to_sector(request: SectorSubscribeRequest):
    """
    Subscribe a user to a sector for daily digests.
    """
    try:
        sector = get_sector_by_id(request.sector_id)
        if not sector:
            raise HTTPException(status_code=404, detail=f"Sector '{request.sector_id}' not found")

        if not sector.enabled:
            raise HTTPException(status_code=400, detail=f"Sector '{request.sector_id}' is disabled")

        insforge_service = get_insforge_service()
        result = await insforge_service.subscribe_to_sector(
            user_id=request.user_id,
            sector_id=request.sector_id,
        )

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to subscribe"))

        return {
            "success": True,
            "message": f"Subscribed to {sector.name_zh}",
            "sector_id": request.sector_id,
            "is_new": result.get("is_new", True),
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sectors/subscriptions")
async def get_sector_subscriptions(user_id: str = Query(..., description="User ID")):
    """
    Get user's sector subscriptions.
    """
    try:
        insforge_service = get_insforge_service()
        result = await insforge_service.get_user_sector_subscriptions(user_id)

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to get subscriptions"))

        # Enrich with sector info
        subscriptions = []
        for sub in result.get("subscriptions", []):
            sector = get_sector_by_id(sub.get("sector_id"))
            if sector:
                subscriptions.append({
                    "sector_id": sector.id,
                    "name_en": sector.name_en,
                    "name_zh": sector.name_zh,
                    "description": sector.description,
                    "symbols": sector.symbols,
                    "subscribed_at": sub.get("subscribed_at"),
                })

        return {
            "success": True,
            "subscriptions": subscriptions,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/sectors/{sector_id}/unsubscribe")
async def unsubscribe_from_sector(sector_id: str, user_id: str = Query(..., description="User ID")):
    """
    Unsubscribe a user from a sector.
    """
    try:
        insforge_service = get_insforge_service()
        result = await insforge_service.unsubscribe_from_sector(
            user_id=user_id,
            sector_id=sector_id,
        )

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to unsubscribe"))

        return {
            "success": True,
            "message": f"Unsubscribed from sector",
            "sector_id": sector_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
