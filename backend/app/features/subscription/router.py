"""
Subscription router - Subscription management endpoints.

Handles:
- Subscription management (subscribe, unsubscribe, status, update, list, broadcast, sync)
"""

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.logging import get_logger

logger = get_logger(__name__)

from app.core.database import get_insforge_service
from app.core.deps import verify_cron_secret, verify_user_token_with_email
from app.utils.timezone import today_str, now_iso
from app.features.daily_report import db as market_db
from app.features.payment.entitlements import has_entitlement
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
    UpdatePreferencesRequest,
    PreferencesResponse,
    EmailPreferences,
)


async def _check_account_exists(email: str) -> bool:
    """Check if an Insforge auth account exists for the given email."""
    try:
        service = get_insforge_service()
        result = await service.call_function(
            "subscriptions",
            method="GET",
            params={"action": "check_email", "email": email},
        )
        data = result.get("data", {})
        return data.get("exists", False)
    except Exception:
        logger.warning("Failed to check account existence for %s", email)
        return False


async def _find_user_id_by_email(email: str) -> str | None:
    """Best-effort lookup for public unsubscribe preference persistence."""
    try:
        service = get_insforge_service()
        result = await service.call_function(
            "subscriptions",
            method="GET",
            params={"action": "list_user_profiles"},
        )
        data = result.get("data", {})
        if not data.get("success"):
            return None
        needle = email.strip().lower()
        for profile in data.get("data", []):
            if (profile.get("email") or "").strip().lower() == needle:
                return profile.get("user_id")
    except Exception:
        logger.warning("Failed to resolve user_id for unsubscribe email %s", email)
    return None


router = APIRouter(prefix="/api", tags=["subscription"])

EMAIL_ENTITLEMENT_BY_FIELD = {
    "morning_report": "morning_report_email",
    "weekly_report": "weekly_report_email",
    "personal_digest": "personal_digest_email",
    "twitter_digest": "twitter_digest",
}


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
    if channel == SubscriptionChannel.TWITTER_DIGEST:
        raise HTTPException(
            status_code=403,
            detail=(
                "Twitter digest subscription is managed from account email "
                "preferences and requires Max"
            ),
        )

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

        # Check if user has an existing Insforge auth account
        has_account = None
        if result.get("success") and channel == SubscriptionChannel.DAILY_REPORT:
            has_account = await _check_account_exists(request.email)

        # Send unified welcome email for NEW daily_report subscribers
        if (
            result.get("success")
            and result.get("is_new")
            and channel == SubscriptionChannel.DAILY_REPORT
        ):
            welcome_result = await email_service.send_welcome_email(
                to_email=request.email,
                first_name=request.first_name,
            )
            if welcome_result.get("success"):
                logger.info("Welcome email sent to %s", request.email)
            else:
                logger.warning(
                    "Failed to send welcome email: %s",
                    welcome_result.get("error"),
                )

        return SubscriptionResponse(
            success=result.get("success", False),
            channel=channel.value,
            email=request.email,
            contact_id=result.get("contact_id"),
            metadata=result.get("metadata"),
            has_account=has_account,
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
        if result.get("success") and channel == SubscriptionChannel.TWITTER_DIGEST:
            user_id = await _find_user_id_by_email(request.email)
            if user_id:
                try:
                    from app.features.payment.db import update_email_preferences

                    await update_email_preferences(
                        user_id,
                        {"twitter_digest": False},
                    )
                except Exception as e:
                    logger.warning(
                        "twitter unsubscribe: app preference write failed for %s: %s",
                        user_id[:8],
                        e,
                    )

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

        elif channel.value == "personal_digest":
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


@router.get("/subscriptions/preferences", response_model=PreferencesResponse)
async def get_email_preferences(
    user: dict = Depends(verify_user_token_with_email),
):
    """Get email subscription preferences for the authenticated user."""
    email = user["email"]
    if not email:
        raise HTTPException(status_code=400, detail="User email not available")

    try:
        subscription_service = get_subscription_service()
        prefs = await asyncio.to_thread(
            subscription_service.get_email_preferences, email
        )

        # personal_digest is auto-managed: has entitlement + has watchlist = receives digest
        prefs["personal_digest"] = await has_entitlement(user["user_id"], "personal_digest_email")
        if not await has_entitlement(user["user_id"], "twitter_digest"):
            prefs["twitter_digest"] = False

        return PreferencesResponse(
            success=True,
            preferences=EmailPreferences(**prefs),
        )
    except Exception as e:
        logger.exception("Error getting email preferences")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/preferences", response_model=PreferencesResponse)
async def update_email_preferences(
    request: UpdatePreferencesRequest,
    user: dict = Depends(verify_user_token_with_email),
):
    """Update email subscription preferences for the authenticated user."""
    email = user["email"]
    if not email:
        raise HTTPException(status_code=400, detail="User email not available")

    # Entitlement gate: block users from ENABLING paid email types they
    # don't currently have access to. Disabling remains allowed.
    for field_name, feature in EMAIL_ENTITLEMENT_BY_FIELD.items():
        if getattr(request, field_name) is True:
            entitled = await has_entitlement(user["user_id"], feature)
            if not entitled:
                logger.info(
                    "Entitlement gate: blocked user=%s field=%s feature=%s",
                    user["user_id"][:8],
                    field_name,
                    feature,
                )
                raise HTTPException(
                    status_code=403,
                    detail="This feature requires an active entitlement",
                )

    try:
        subscription_service = get_subscription_service()

        # Update segment-based preferences (morning, daily, weekly, twitter_digest)
        segment_prefs = {}
        if request.morning_report is not None:
            segment_prefs["morning_report"] = request.morning_report
        if request.daily_report is not None:
            segment_prefs["daily_report"] = request.daily_report
        if request.weekly_report is not None:
            segment_prefs["weekly_report"] = request.weekly_report
        if request.twitter_digest is not None:
            segment_prefs["twitter_digest"] = request.twitter_digest

        if segment_prefs:
            # Best-effort sub lookup for CTA tier classification. If it
            # fails we fall back to free CTA — drift audit will reconcile.
            sub = None
            try:
                from app.features.payment.db import get_subscription
                sub = await get_subscription(user["user_id"])
            except Exception as e:
                logger.warning(
                    "preferences: sub lookup failed for %s: %s",
                    user["user_id"][:8], e,
                )
            await asyncio.to_thread(
                subscription_service.update_email_preferences,
                email,
                segment_prefs,
                sub,
            )

            if request.twitter_digest is not None and sub:
                try:
                    from app.features.payment.db import (
                        update_email_preferences as update_app_email_preferences,
                    )

                    await update_app_email_preferences(
                        user["user_id"],
                        {"twitter_digest": bool(request.twitter_digest)},
                    )
                except Exception as e:
                    logger.warning(
                        "preferences: app preference write failed for %s: %s",
                        user["user_id"][:8],
                        e,
                    )

        # Return current preferences
        prefs = await asyncio.to_thread(
            subscription_service.get_email_preferences, email
        )
        # personal_digest is auto-managed: has entitlement + has watchlist = receives digest
        prefs["personal_digest"] = await has_entitlement(user["user_id"], "personal_digest_email")
        if not await has_entitlement(user["user_id"], "twitter_digest"):
            prefs["twitter_digest"] = False

        return PreferencesResponse(
            success=True,
            preferences=EmailPreferences(**prefs),
        )
    except Exception as e:
        logger.exception("Error updating email preferences")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Admin: Backfill Resend contact first_name from Insforge auth profiles
# ---------------------------------------------------------------------------


@router.post("/subscriptions/backfill-resend-names")
async def backfill_resend_names(
    dry_run: bool = Query(default=True, description="Preview changes without applying"),
    _secret: str = Depends(verify_cron_secret),
) -> dict[str, Any]:
    """
    One-time migration: sync user profile names from Insforge auth to Resend contacts.

    Reads all user profiles from Insforge, then updates Resend contacts that are
    missing first_name. Protected by CRON_SECRET.

    Query params:
        dry_run=true (default): preview changes without applying
        dry_run=false: apply updates to Resend
    """
    service = get_insforge_service()

    # 1. Get all user profiles from Insforge auth via edge function
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_user_profiles"},
        timeout=60.0,
    )
    data = result.get("data", {})
    if not data.get("success"):
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch user profiles: {data.get('error', result.get('text', 'unknown'))}",
        )

    profiles = data.get("data", [])
    # Build email -> name lookup (only users that have a profile name)
    email_to_name: dict[str, str] = {}
    for p in profiles:
        email = (p.get("email") or "").lower().strip()
        name = (p.get("profile_name") or "").strip()
        if email and name:
            email_to_name[email] = name

    logger.info(
        "Backfill: loaded %d user profiles, %d have names",
        len(profiles),
        len(email_to_name),
    )

    # 2. For each Resend audience, find contacts missing first_name and update
    subscription_service = get_subscription_service()
    subscription_service._validate_api_key()

    import resend
    import time

    updates: list[dict[str, Any]] = []
    skipped_no_name = 0
    already_has_name = 0

    for channel in SubscriptionChannel:
        config = subscription_service._get_channel_config(channel)
        if not config.get("audience_name"):
            continue  # Skip channels without Resend audiences

        try:
            audience_id = subscription_service.ensure_audience(channel)
        except Exception as e:
            logger.warning("Backfill: skip channel %s: %s", channel, e)
            continue

        time.sleep(0.55)
        contacts = resend.Contacts.list(audience_id=audience_id)

        for contact in contacts.get("data", []):
            contact_email = (contact.get("email") or "").lower().strip()
            existing_name = (contact.get("first_name") or "").strip()

            if existing_name:
                already_has_name += 1
                continue

            profile_name = email_to_name.get(contact_email)
            if not profile_name:
                skipped_no_name += 1
                continue

            entry = {
                "channel": channel.value,
                "email": contact_email,
                "new_first_name": profile_name,
            }

            if not dry_run:
                try:
                    time.sleep(0.55)
                    resend.Contacts.update({
                        "audience_id": audience_id,
                        "email": contact_email,
                        "first_name": profile_name,
                    })
                    entry["status"] = "updated"
                except Exception as e:
                    entry["status"] = f"error: {e}"
                    logger.warning(
                        "Backfill: failed to update %s: %s", contact_email, e
                    )
            else:
                entry["status"] = "dry_run"

            updates.append(entry)

    return {
        "dry_run": dry_run,
        "profiles_loaded": len(profiles),
        "profiles_with_name": len(email_to_name),
        "already_has_name": already_has_name,
        "skipped_no_profile_name": skipped_no_name,
        "updates": updates,
        "total_updates": len(updates),
    }
