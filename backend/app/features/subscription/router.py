"""
Subscription router - Subscription management endpoints.

Handles:
- Subscription management (subscribe, unsubscribe, status, update, list, broadcast, sync)
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.logging import get_logger

logger = get_logger(__name__)

from app.core.deps import verify_cron_secret
from app.utils.timezone import today_str, now_iso
from app.features.daily_report import db as market_db
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
)

router = APIRouter(prefix="/api", tags=["subscription"])


@router.post("/subscriptions/{channel}/subscribe", response_model=SubscriptionResponse)
async def subscribe_to_channel(channel: SubscriptionChannel, request: SubscribeRequest):
    """
    Subscribe to a specific channel (daily_report or personal_digest).

    For personal_digest channel, user_id is required.
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
                logger.info("Welcome email sent to %s", request.email)
            else:
                logger.warning("Failed to send welcome email: %s", welcome_result.get("error"))

        return SubscriptionResponse(
            success=result.get("success", False),
            channel=channel.value,
            email=request.email,
            contact_id=result.get("contact_id"),
            metadata=result.get("metadata"),
            error=result.get("error"),
        )

    except Exception as e:
        logger.exception("Error in subscribe_to_channel")
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
        logger.exception("Error in unsubscribe_from_channel")
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
        logger.exception("Error in get_subscription_status")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/subscriptions/{channel}/update", response_model=SubscriptionResponse)
async def update_subscription(channel: SubscriptionChannel, request: SubscriptionUpdateRequest):
    """
    Update subscription metadata (e.g., first_name for personal_digest).
    """
    try:
        subscription_service = get_subscription_service()

        # Build metadata from request
        metadata = {}
        if request.first_name:
            metadata["first_name"] = request.first_name

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
        logger.exception("Error in update_subscription")
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
        logger.exception("Error in list_channel_subscribers")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/{channel}/broadcast", response_model=BroadcastResponse)
async def broadcast_to_channel(
    channel: SubscriptionChannel,
    force: bool = Query(False, description="Force regenerate report. Use true for production cron jobs."),
    _secret: str = Depends(verify_cron_secret),
):
    """
    Broadcast to all subscribers of a channel.
    Protected by CRON_SECRET for scheduled job authentication.

    - daily_report: Sends the daily market report
      - force=false (default): use cached report if available (for testing)
      - force=true: always regenerate with latest market data (for cron jobs)
    - personal_digest: Generates and sends personalized digests (parallel processing)
    """

    try:
        email_service = get_email_service()

        if channel == SubscriptionChannel.DAILY_REPORT:
            today = today_str()
            report_data = None

            # Use cached report only when not forcing regeneration
            if not force:
                existing_report = await market_db.get_report_by_date(today)

                if existing_report:
                    logger.info("Using cached report for %s broadcast", today)
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

            # Generate new report if no cache or force=true
            if report_data is None:
                if force:
                    logger.info("Force regenerating report for %s broadcast...", today)
                else:
                    logger.info("No cached report for %s, generating new...", today)

                from app.features.daily_report.agent import MarketAgent
                market_agent = MarketAgent()
                result = await market_agent.analyze()
                if not result:
                    raise HTTPException(status_code=500, detail="Failed to generate market analysis")

                market_data = result.get("market_data", {})
                from app.features.daily_report.router import transform_market_data_to_indices
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

                # Save to database (upsert overwrites any stale report for today)
                save_result = await market_db.save_market_report({
                    **report_data,
                    "economic_calendar": result.get("economic_calendar", {}),
                    "earnings_calendar": result.get("earnings_calendar", {}),
                    "news_data": result.get("news_data", {}),
                    "market_data": market_data,
                })

                if save_result.get("success"):
                    report_data["report_id"] = save_result.get("report_id")

            # Quality gate: don't broadcast incomplete reports
            news = (report_data or {}).get("news") or {}
            has_title = bool((report_data or {}).get("title"))
            has_headlines = bool(news.get("headlines") if isinstance(news, dict) else False)
            has_summary = bool((report_data or {}).get("report_summary"))
            if not (has_title and has_headlines and has_summary):
                logger.error(
                    "Daily report quality check failed, skipping broadcast. "
                    "title=%s, headlines=%s, report_summary=%s",
                    has_title, has_headlines, has_summary,
                )
                raise HTTPException(
                    status_code=500,
                    detail="Daily report failed quality check: missing title, news, or summary. Broadcast skipped.",
                )

            # Broadcast daily report
            broadcast_result = await email_service.broadcast_daily_report(report_data)

            if not broadcast_result.get("success"):
                error_msg = broadcast_result.get("error", "Failed to broadcast daily report")
                logger.error("Daily report broadcast failed: %s", error_msg)
                raise HTTPException(status_code=500, detail=error_msg)

            return BroadcastResponse(
                success=True,
                channel=channel.value,
                total=broadcast_result.get("total", 0),
                sent=broadcast_result.get("sent", 0),
                failed=broadcast_result.get("failed", 0),
                errors=[],
            )

        elif channel == SubscriptionChannel.PERSONAL_DIGEST:
            # Broadcast personal digests (parallel processing)
            broadcast_result = await email_service.broadcast_personal_digests(max_concurrent=5)

            if not broadcast_result.get("success"):
                error_msg = broadcast_result.get("error", "Failed to broadcast personal digests")
                logger.error("Personal digest broadcast failed: %s", error_msg)
                raise HTTPException(status_code=500, detail=error_msg)

            return BroadcastResponse(
                success=True,
                channel=channel.value,
                total=broadcast_result.get("total", 0),
                sent=broadcast_result.get("sent", 0),
                failed=broadcast_result.get("failed", 0),
                errors=broadcast_result.get("errors", []),
            )

        elif channel == SubscriptionChannel.WEEKLY_REPORT:
            # Broadcast weekly macro report
            from app.features.macro.weekly import db as weekly_db

            report = await weekly_db.get_latest_report()
            if not report:
                raise HTTPException(status_code=404, detail="No weekly report found")

            broadcast_result = await email_service.broadcast_weekly_report(report)

            if not broadcast_result.get("success"):
                error_msg = broadcast_result.get("error", "Failed to broadcast weekly report")
                logger.error("Weekly report broadcast failed: %s", error_msg)
                raise HTTPException(status_code=500, detail=error_msg)

            return BroadcastResponse(
                success=True,
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
        logger.exception("Error in broadcast_to_channel")
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
        logger.exception("Error in sync_user_subscriptions")
        raise HTTPException(status_code=500, detail=str(e))
