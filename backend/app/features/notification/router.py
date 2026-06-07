"""
Notification router - Email sending, broadcasting, and preview endpoints.

Handles:
- Email report broadcasting (daily reports, weekly reports)
- Email sending (test emails, welcome emails)
- Email preview (HTML rendering)
- Newsletter generation and broadcasting
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Literal, Optional
from urllib.parse import quote

from app.core.deps import verify_cron_secret
from app.core.logging import get_logger
from app.utils.timezone import today_str, now_iso
from app.features.daily_report import db as market_db
from app.features.subscription.email_service import get_email_service
from app.features.subscription.models import (
    SendEmailRequest,
    BroadcastTestRequest,
    NewsletterGenerateRequest,
    NewsletterSendRequest,
    NewsletterBroadcastRequest,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["notification"])


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
async def send_daily_report(
    force: bool = Query(False, description="Force regenerate report even if cached. Use true for production cron jobs."),
    _secret: str = Depends(verify_cron_secret),
):
    """
    Generate and send daily market report via email.
    Protected by CRON_SECRET for scheduled job authentication.

    - force=false (default): use cached report if available (for testing)
    - force=true: always regenerate with latest market data (for cron jobs)
    """

    try:
        # Lazy import to avoid circular dependency with market agent
        from app.features.daily_report.agent import MarketAgent

        today = today_str()
        from_cache = False
        save_result = {"success": True}

        # Use cached report only when not forcing regeneration
        if not force:
            existing_report = await market_db.get_report_by_date(today)

            if existing_report:
                report_timestamp = existing_report.get("timestamp", "")
                report_date_from_timestamp = report_timestamp[:10] if report_timestamp else ""

                if report_date_from_timestamp == today:
                    logger.info("Found existing report for %s, using cached data for email", today)
                    from_cache = True
                    report_data = _report_data_from_db(existing_report)
                    report_data["market_data"] = existing_report.get("market_data", {})
                    save_result["report_id"] = existing_report.get("id")

        # Generate new report if no cache or force=true
        if not from_cache:
            if force:
                logger.info("Force regeneration for %s broadcast...", today)
            else:
                logger.info("No existing report for %s, generating new analysis...", today)
            market_agent = MarketAgent()
            result = await market_agent.analyze()
            if not result:
                raise HTTPException(status_code=500, detail="Failed to generate market analysis")

            # Transform to frontend format for consistent email
            market_data = result.get("market_data", {})
            from app.features.daily_report.router import transform_market_data_to_indices
            indices = transform_market_data_to_indices(market_data)

            # Build complete report data for email and database
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

            # Save report to database (upsert overwrites any stale report for today)
            save_result = await market_db.save_market_report(report_data)
            if not save_result.get("success"):
                logger.warning("Failed to save report to database: %s", save_result.get("error"))
            else:
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
        logger.exception("Error in send_daily_report")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/verification-email/preview")
async def get_verification_email_preview(
    email: str = Query("preview@example.com"),
    code: str = Query("184263"),
    redirect: str = Query("/today"),
):
    """
    Get rendered HTML preview for the verification email.

    This endpoint only renders the template. It does not send any email and does
    not depend on Insforge auth mail configuration.
    """
    try:
        email_service = get_email_service()
        verify_url = (
            f"{email_service.frontend_url}/verify-email"
            f"?email={quote(email)}&redirect={quote(redirect, safe='/')}&otp={quote(code)}"
        )
        html_content = email_service._format_verification_email_html(
            verification_code=code,
            verify_url=verify_url,
            recipient_email=email,
        )

        return {
            "success": True,
            "html": html_content,
            "email": email,
            "code": code,
            "verify_url": verify_url,
        }

    except Exception as e:
        logger.exception("Error in get_verification_email_preview")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report/preview")
async def get_email_preview(
    report_id: Optional[str] = Query(None),
    first_name: Optional[str] = Query(None),
    cta_variant: Literal["upsell", "paid"] = Query("upsell"),
):
    """
    Get rendered HTML email preview for an existing report.
    Does NOT trigger any Gemini API calls - uses existing data only.

    Args:
        report_id: Optional report ID. If not provided, uses the latest report.
        cta_variant: 'upsell' (default, free/trial users) or 'paid' (real paid).
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
        html_content = email_service._format_html_report(
            report_data, cta_variant=cta_variant
        )

        # Replace placeholder with actual name (or default)
        display_name = first_name or "朋友"
        html_content = html_content.replace("{{{FIRST_NAME|朋友}}}", display_name)

        return {
            "success": True,
            "html": html_content,
            "report_id": report.get("id"),
            "report_date": report.get("report_date"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in get_email_preview")
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
        from app.features.macro.weekly import db as weekly_db

        if week:
            report = await weekly_db.get_report_by_week(week)
        else:
            report = await weekly_db.get_latest_report()

        if not report:
            raise HTTPException(status_code=404, detail="No weekly report found")

        email_service = get_email_service()
        html_content = email_service._format_weekly_report_html(report)

        display_name = first_name or ""
        html_content = html_content.replace("{{{FIRST_NAME}}}", display_name)

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
        logger.exception("Error in get_weekly_report_preview")
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
                    detail="No personal digest found for this user. Generate one first from the 专属日报页面."
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
        logger.exception("Error in get_digest_preview")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/report/broadcast-test")
async def broadcast_test_report(request: BroadcastTestRequest):
    """
    Test broadcast functionality using an existing report from the database.
    This avoids generating a new report each time, saving API calls.
    """
    try:
        logger.info("Fetching report: %s", request.report_id)

        # Fetch report from Insforge
        report = await market_db.get_report_by_id(request.report_id)

        logger.info("Report fetched: %s", report is not None)

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
        logger.exception("Error in broadcast_test_report")
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
        logger.exception("Error in send_test_report")
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

        from app.features.macro.weekly import db as weekly_db

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
        logger.exception("Error in send_test_weekly_report")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/morning-report/send-test")
async def send_test_morning_report(request: SendEmailRequest):
    """
    Send the latest morning report email to a test recipient.
    """
    try:
        to_email = request.email
        if not to_email:
            raise HTTPException(status_code=400, detail="Email address is required")

        from app.features.morning_report import db as morning_db

        report = await morning_db.get_latest_morning_report()
        if not report:
            raise HTTPException(status_code=404, detail="No morning report found. Generate one first.")

        email_service = get_email_service()
        email_result = await email_service.send_morning_report(
            data=report,
            to_email=to_email,
            first_name=request.first_name,
        )

        if not email_result.get("success"):
            raise HTTPException(status_code=500, detail=email_result.get("error", "Failed to send morning report"))

        return {
            "success": True,
            "message": f"Morning report sent to {to_email}",
            "email_id": email_result.get("email_id"),
            "sent_to": to_email,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in send_test_morning_report")
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
        logger.exception("Error in send_test_welcome_email")
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
        logger.exception("Error in generate_newsletter")
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
        text_content = text_content.replace("{{{FIRST_NAME|朋友}}}", preview_name)
        text_content = text_content.replace("{{{FIRST_NAME}}}", preview_name)

        return {
            "success": True,
            "text": text_content,
            "subject": request.subject,
        }

    except Exception as e:
        logger.exception("Error in preview_newsletter")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/newsletter/send-test")
async def send_test_newsletter(request: NewsletterSendRequest):
    """
    Send newsletter to a single email address for testing.
    Email address is required in the request body.
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
        logger.exception("Error in send_test_newsletter")
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
        logger.exception("Error in broadcast_newsletter_endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/welcome/preview")
async def get_welcome_email_preview(
    first_name: str = Query("", description="Subscriber first name"),
    email: str = Query("preview@example.com", description="Subscriber email"),
):
    """Render unified welcome email HTML for preview. Does NOT send anything."""
    from app.features.subscription.email_templates import format_welcome_html

    html = format_welcome_html(first_name=first_name, email=email)
    return {
        "success": True,
        "subject": "欢迎来到 TheMarketBrew：先把你的持仓加进来",
        "html": html,
    }


@router.get("/onboarding/preview")
async def get_onboarding_email_preview(
    day: int = Query(3, description="Signup day: 3, 7, or 14"),
    first_name: str = Query("", description="User first name"),
):
    """Legacy preview endpoint: onboarding drip emails have been removed."""
    raise HTTPException(status_code=410, detail="onboarding_drip_emails_removed")


@router.post("/cron/onboarding-emails", dependencies=[Depends(verify_cron_secret)])
async def cron_onboarding_emails():
    """Legacy cron endpoint: onboarding drip emails have been removed."""
    try:
        from app.features.notification.onboarding import process_onboarding_emails

        result = await process_onboarding_emails()
        return {"success": True, **result}

    except Exception as e:
        logger.exception("Error in cron_onboarding_emails")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/weekly-report/broadcast")
async def broadcast_weekly_report(_secret: str = Depends(verify_cron_secret)):
    """
    Broadcast the latest weekly macro report to all weekly_report subscribers.
    Protected by CRON_SECRET for scheduled job authentication.
    """
    try:
        from app.features.macro.weekly import db as weekly_db

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
        logger.exception("Error in broadcast_weekly_report")
        raise HTTPException(status_code=500, detail=str(e))
