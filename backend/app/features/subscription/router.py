"""
Subscription router - Email report and subscription management endpoints.

Handles:
- Email report broadcasting (daily reports, personal digests)
- Email sending (test emails, welcome emails)
- Email preview (HTML rendering)
- Subscription management (subscribe, unsubscribe, status, update, list, sync)
"""

import traceback

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.core.deps import verify_cron_secret
from app.utils.timezone import today_str, now_iso
from app.features.market import db as market_db
from app.features.subscription.service import (
    get_subscription_service,
    SubscriptionChannel,
)
from app.features.subscription.email_service import get_email_service
from app.features.subscription.models import (
    SubscribeRequest,
    UnsubscribeRequest,
    SubscriptionUpdateRequest,
    SubscriptionStatusResponse,
    SubscriptionResponse,
    BroadcastResponse,
    SubscribersListResponse,
    SyncUserRequest,
    SyncUserResponse,
    SyncedChannelInfo,
    SendEmailRequest,
    BroadcastTestRequest,
    NewsletterGenerateRequest,
    NewsletterSendRequest,
    NewsletterBroadcastRequest,
)

router = APIRouter(prefix="/api", tags=["subscription"])


def _report_data_from_db(report: dict) -> dict:
    """Extract report data dict from a DB report row for email rendering."""
    return {
        "report_id": report.get("id"),
        "report_date": report.get("report_date", today_str()),
        "indices": report.get("indices", []),
        "timestamp": report.get("timestamp", now_iso()),
        "title": report.get("title", ""),
        "summary": report.get("summary", ""),
        "intro": report.get("intro", ""),
        "news": report.get("news"),
        "report_summary": report.get("report_summary", []),
        "calendar": report.get("calendar", []),
    }


@router.post("/report/send")
async def send_daily_report(_secret: str = Depends(verify_cron_secret)):
    """
    Generate and send daily market report via email.
    Protected by CRON_SECRET for scheduled job authentication.

    If today's report already exists, use it instead of generating a new one.
    """

    try:
        # Lazy import to avoid circular dependency with market agent
        from app.features.market.agent import MarketAgent

        today = today_str()
        from_cache = False
        save_result = {"success": True}

        # Check if today's report already exists
        existing_report = await market_db.get_report_by_date(today)

        if existing_report:
            report_timestamp = existing_report.get("timestamp", "")
            report_date_from_timestamp = report_timestamp[:10] if report_timestamp else ""

            if report_date_from_timestamp == today:
                print(f"[API] Found existing report for {today}, using cached data for email")
                from_cache = True
                report_data = _report_data_from_db(existing_report)
                report_data["market_data"] = existing_report.get("market_data", {})
                save_result["report_id"] = existing_report.get("id")

        # Generate new report if no cache found
        if not from_cache:
            print(f"[API] No existing report for {today}, generating new analysis...")
            market_agent = MarketAgent()
            result = await market_agent.analyze()
            if not result:
                raise HTTPException(status_code=500, detail="Failed to generate market analysis")

            # Transform to frontend format for consistent email
            market_data = result.get("market_data", {})
            from app.features.market.router import transform_market_data_to_indices
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
                "news": result.get("news"),
                "report_summary": result.get("report_summary", []),
                "calendar": result.get("calendar", []),
                "market_data": market_data,
            }

            # Save report to database
            save_result = await market_db.save_market_report(report_data)
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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report/preview")
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
        if report_id:
            report = await market_db.get_report_by_id(report_id)
        else:
            report = await market_db.get_latest_report()

        if not report:
            raise HTTPException(status_code=404, detail="No report found")

        report_data = _report_data_from_db(report)

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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/weekly-report/preview")
async def get_weekly_report_preview(
    week: Optional[str] = Query(None),
    first_name: Optional[str] = Query(None),
):
    """
    Get rendered HTML email preview for a weekly macro report.
    Uses existing report data only - no AI generation.

    Args:
        week: Optional week label like '2025.W06'. If not provided, uses latest.
        first_name: Optional name for greeting personalization.
    """
    try:
        from app.features.weekly_report import db as weekly_db

        if week:
            report = await weekly_db.get_report_by_week(week)
        else:
            report = await weekly_db.get_latest_report()

        if not report:
            raise HTTPException(status_code=404, detail="No weekly report found")

        email_service = get_email_service()
        html_content = email_service._format_weekly_report_html(report)

        display_name = first_name or ""
        html_content = html_content.replace("{{{first_name}}}", display_name)

        from urllib.parse import quote
        html_content = html_content.replace("{{{email}}}", quote("preview@example.com"))

        return {
            "success": True,
            "html": html_content,
            "week_label": report.get("week_label", ""),
            "title": report.get("title", ""),
            "report_id": report.get("id"),
            "generated_at": report.get("generated_at", ""),
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions/personal_digest/preview")
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
    try:
        from app.core.database import get_insforge_service
        insforge_svc = get_insforge_service()
        func_url = f"{insforge_svc.base_url}/functions/user-digests"

        # Get digest data via edge function
        digest = None
        async with httpx.AsyncClient() as client:
            if digest_id:
                # Get specific digest by ID
                url = f"{func_url}?digest_id={digest_id}"
                response = await client.get(url, headers=insforge_svc.headers, timeout=30.0)
                if response.status_code == 200:
                    result = response.json()
                    if result.get("success") and result.get("data"):
                        digest = result["data"]
            elif user_id:
                # Get latest digest for user
                url = f"{func_url}?user_id={user_id}&limit=1"
                response = await client.get(url, headers=insforge_svc.headers, timeout=30.0)
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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/report/broadcast-test")
async def broadcast_test_report(request: BroadcastTestRequest):
    """
    Test broadcast functionality using an existing report from the database.
    This avoids generating a new report each time, saving API calls.
    """
    try:
        print(f"[broadcast-test] Fetching report: {request.report_id}")

        # Fetch report from Insforge
        report = await market_db.get_report_by_id(request.report_id)

        print(f"[broadcast-test] Report fetched: {report is not None}")

        if not report:
            raise HTTPException(status_code=404, detail=f"Report not found: {request.report_id}")

        report_data = _report_data_from_db(report)
        report_data["report_id"] = report.get("id") or request.report_id

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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/report/send-test")
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
        if request.report_id:
            report = await market_db.get_report_by_id(request.report_id)
        else:
            report = await market_db.get_latest_report()

        if not report:
            raise HTTPException(status_code=404, detail="No report found in database. Please generate a report first.")

        report_data = _report_data_from_db(report)

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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/weekly-report/send-test")
async def send_test_weekly_report(request: SendEmailRequest):
    """
    Send the latest weekly macro report email to a test recipient.
    """
    try:
        to_email = request.email
        if not to_email:
            raise HTTPException(status_code=400, detail="Email address is required")

        from app.features.weekly_report import db as weekly_db

        report = await weekly_db.get_latest_report()
        if not report:
            raise HTTPException(status_code=404, detail="No weekly report found. Generate one first.")

        email_service = get_email_service()
        email_result = await email_service.send_weekly_report(
            data=report,
            to_email=to_email,
            first_name=request.first_name,
        )

        if not email_result.get("success"):
            raise HTTPException(status_code=500, detail=email_result.get("error", "Failed to send weekly report"))

        return {
            "success": True,
            "message": f"Weekly report sent to {to_email}",
            "email_id": email_result.get("email_id"),
            "sent_to": to_email,
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/welcome/send-test")
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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/newsletter/generate")
async def generate_newsletter(
    request: NewsletterGenerateRequest,
    _secret: str = Depends(verify_cron_secret),
):
    """
    Generate newsletter content using AI agent.
    Returns structured content (subject, greeting, sections, closing) for review.
    Protected by CRON_SECRET to prevent unauthorized API cost consumption.
    """
    try:
        from app.features.subscription.newsletter_agent import NewsletterAgent

        agent = NewsletterAgent()
        result = await agent.generate(
            intent=request.intent,
            tone=request.tone,
            language=request.language,
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to generate newsletter content"),
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/newsletter/preview")
async def preview_newsletter(request: NewsletterSendRequest):
    """
    Render newsletter as plain text for preview.
    Template variables are replaced with preview values.
    """
    try:
        email_service = get_email_service()

        data = {
            "greeting": request.greeting,
            "sections": [s.model_dump() for s in request.sections],
            "closing": request.closing,
            "sign_off_name": request.sign_off_name,
            "sign_off_title": request.sign_off_title,
        }

        text_content = email_service._format_newsletter_plaintext(data)

        preview_name = request.first_name or "朋友"
        text_content = text_content.replace("{{{first_name|朋友}}}", preview_name)
        text_content = text_content.replace("{{{first_name}}}", preview_name)

        return {
            "success": True,
            "text": text_content,
            "subject": request.subject,
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/newsletter/send-test")
async def send_test_newsletter(request: NewsletterSendRequest):
    """
    Send newsletter to a single email address for testing.
    Email address is required in the request body.
    Protected by CRON_SECRET to prevent abuse as spam relay.
    """
    try:
        if not request.email:
            raise HTTPException(status_code=400, detail="Email address is required")

        email_service = get_email_service()

        data = {
            "greeting": request.greeting,
            "sections": [s.model_dump() for s in request.sections],
            "closing": request.closing,
            "sign_off_name": request.sign_off_name,
            "sign_off_title": request.sign_off_title,
        }

        result = await email_service.send_newsletter(
            data=data,
            subject=request.subject,
            to_email=request.email,
            first_name=request.first_name,
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to send newsletter"),
            )

        return {
            "success": True,
            "message": f"Newsletter sent to {request.email}",
            "email_id": result.get("email_id"),
            "sent_to": request.email,
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/newsletter/broadcast")
async def broadcast_newsletter(
    request: NewsletterBroadcastRequest,
    _secret: str = Depends(verify_cron_secret),
):
    """
    Broadcast newsletter to all daily report subscribers.
    Protected by CRON_SECRET authentication.
    """
    try:
        email_service = get_email_service()

        data = {
            "greeting": request.greeting,
            "sections": [s.model_dump() for s in request.sections],
            "closing": request.closing,
            "sign_off_name": request.sign_off_name,
            "sign_off_title": request.sign_off_title,
        }

        result = await email_service.broadcast_newsletter(
            data=data,
            subject=request.subject,
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to broadcast newsletter"),
            )

        return {
            "success": True,
            "message": "Newsletter broadcast to all subscribers",
            "broadcast_id": result.get("broadcast_id"),
            "audience_id": result.get("audience_id"),
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/weekly-report/broadcast")
async def broadcast_weekly_report(_secret: str = Depends(verify_cron_secret)):
    """
    Broadcast the latest weekly macro report to all weekly_report subscribers.
    Protected by CRON_SECRET for scheduled job authentication.
    """
    try:
        from app.features.weekly_report import db as weekly_db

        # 1. Get the latest weekly report
        report = await weekly_db.get_latest_report()
        if not report:
            raise HTTPException(status_code=404, detail="No weekly report found")

        # 2. Broadcast
        email_service = get_email_service()
        result = await email_service.broadcast_weekly_report(report)

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to broadcast weekly report"),
            )

        return {
            "success": True,
            "message": "Weekly report broadcast to all subscribers",
            "broadcast_id": result.get("broadcast_id"),
            "audience_id": result.get("audience_id"),
            "week_label": report.get("week_label"),
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/{channel}/subscribe", response_model=SubscriptionResponse)
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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/{channel}/unsubscribe", response_model=SubscriptionResponse)
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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions/{channel}/status", response_model=SubscriptionStatusResponse)
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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/subscriptions/{channel}/update", response_model=SubscriptionResponse)
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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions/{channel}/subscribers", response_model=SubscribersListResponse)
async def list_channel_subscribers(
    channel: SubscriptionChannel,
    _secret: str = Depends(verify_cron_secret),
    limit: int = Query(default=100, le=500)
):
    """
    List all active subscribers for a channel (admin only, protected by CRON_SECRET).
    """

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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/{channel}/broadcast", response_model=BroadcastResponse)
async def broadcast_to_channel(
    channel: SubscriptionChannel,
    _secret: str = Depends(verify_cron_secret),
):
    """
    Broadcast to all subscribers of a channel.
    Protected by CRON_SECRET for scheduled job authentication.

    - daily_report: Sends the daily market report
    - personal_digest: Generates and sends personalized digests (parallel processing)
    """

    try:
        email_service = get_email_service()

        if channel == SubscriptionChannel.DAILY_REPORT:
            # Generate or get today's report
            today = today_str()

            existing_report = await market_db.get_report_by_date(today)

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
                from app.features.market.agent import MarketAgent
                market_agent = MarketAgent()
                result = await market_agent.analyze()
                if not result:
                    raise HTTPException(status_code=500, detail="Failed to generate market analysis")

                market_data = result.get("market_data", {})
                from app.features.market.router import transform_market_data_to_indices
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
                save_result = await market_db.save_market_report({
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

        elif channel == SubscriptionChannel.WEEKLY_REPORT:
            # Broadcast weekly macro report
            from app.features.weekly_report import db as weekly_db

            report = await weekly_db.get_latest_report()
            if not report:
                raise HTTPException(status_code=404, detail="No weekly report found")

            broadcast_result = await email_service.broadcast_weekly_report(report)

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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/sync-user", response_model=SyncUserResponse)
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
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
