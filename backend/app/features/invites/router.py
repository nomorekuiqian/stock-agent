"""
Invite code API endpoints.
"""

from typing import Optional

import resend
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import INVITE_CODES, RESEND_API_KEY
from app.core.deps import verify_user_token, get_optional_user_email
from app.core.logging import get_logger
from app.features.invites.models import (
    RedeemInviteRequest,
    RedeemInviteResponse,
    AccessRequestInput,
    AccessRequestResponse,
    QualifyInput,
    QualifyResponse,
    AutoTrialResponse,
)
from app.features.invites.db import redeem_code, create_trial_subscription, save_qualify_response

logger = get_logger(__name__)

router = APIRouter(prefix="/api/invites", tags=["invites"])


@router.post("/redeem", response_model=RedeemInviteResponse)
async def api_redeem_invite(
    body: RedeemInviteRequest,
    user_id: str = Depends(verify_user_token),
    email: Optional[str] = Depends(get_optional_user_email),
):
    """Redeem a universal invite code to get 14-day Max access."""
    valid_codes = [c.strip() for c in INVITE_CODES.split(",") if c.strip()] or ["BREW2026"]

    result = await redeem_code(
        user_id=user_id,
        user_email=email or "",
        code=body.code,
        valid_codes=valid_codes,
        access_days=14,
    )

    if not result["success"]:
        error = result.get("error", "invalid_code")
        logger.info("Invite redeem failed: user=%s error=%s", user_id, error)
        raise HTTPException(status_code=400, detail=error)

    logger.info("Invite redeemed: user=%s code=%s", user_id, body.code)
    return RedeemInviteResponse(
        success=True,
        access_expires_at=result.get("access_expires_at"),
    )


@router.post("/auto-trial", response_model=AutoTrialResponse)
async def api_auto_trial(
    user_id: str = Depends(verify_user_token),
    email: Optional[str] = Depends(get_optional_user_email),
):
    """Auto-create a 14-day Max trial for newly registered users."""
    result = await create_trial_subscription(
        user_id=user_id,
        user_email=email or "",
        source="auto_registration",
    )

    if not result["success"]:
        error = result.get("error", "trial_creation_failed")
        logger.warning("Auto-trial failed: user=%s error=%s", user_id[:8], error)
        raise HTTPException(status_code=400, detail=error)

    # Welcome email is sent by the daily_report subscribe flow
    # (syncUserWithSubscriptions in AuthContext), not here.
    # Sending here too would cause duplicate welcome emails.

    logger.info(
        "Auto-trial created: user=%s already_active=%s",
        user_id[:8], result.get("already_active"),
    )
    return AutoTrialResponse(
        success=True,
        access_expires_at=result.get("access_expires_at"),
        already_active=result.get("already_active", False),
    )


@router.post("/request", response_model=AccessRequestResponse)
async def api_request_access(body: AccessRequestInput):
    """Submit an access request form and receive the invite code by email."""
    if not RESEND_API_KEY:
        logger.error("RESEND_API_KEY not configured, cannot send invite email")
        raise HTTPException(status_code=500, detail="email_service_unavailable")

    # Use the first configured universal code
    valid_codes = [c.strip() for c in INVITE_CODES.split(",") if c.strip()]
    invite_code = valid_codes[0] if valid_codes else "BREW2026"

    resend.api_key = RESEND_API_KEY

    html_body = f"""
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #e4e4e7; background: #09090b;">
  <div style="margin-bottom: 32px;">
    <p style="font-size: 13px; color: #71717a; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 8px;">TheMarketBrew</p>
    <h1 style="font-size: 24px; font-weight: 600; margin: 0; color: #f4f4f5;">你的邀请码</h1>
  </div>

  <p style="font-size: 15px; color: #a1a1aa; line-height: 1.6; margin: 0 0 24px;">
    Hi {body.name}，感谢你的申请！这是你的专属邀请码，可解锁 14 天全功能免费体验：
  </p>

  <div style="background: #18181b; border: 1px solid #27272a; border-radius: 10px; padding: 24px; text-align: center; margin: 0 0 28px;">
    <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.15em; color: #10b981; font-family: 'Courier New', monospace; margin: 0;">{invite_code}</p>
  </div>

  <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6; margin: 0 0 28px;">
    访问 <a href="https://themarketbrew.com" style="color: #10b981; text-decoration: none;">themarketbrew.com</a>，注册或登录后点击「有邀请码？」，输入上方邀请码即可激活。
  </p>

  <hr style="border: none; border-top: 1px solid #27272a; margin: 28px 0;" />

  <p style="font-size: 12px; color: #52525b; line-height: 1.6; margin: 0;">
    TheMarketBrew &mdash; 专业级市场分析，为你的每个决策赋能
  </p>
</div>
"""

    try:
        resend.Emails.send({
            "from": "TheMarketBrew <hello@themarketbrew.com>",
            "to": [body.email],
            "subject": f"你的 TheMarketBrew 邀请码：{invite_code}",
            "html": html_body,
        })
        logger.info("Access request email sent: email=%s name=%s", body.email, body.name)
        return AccessRequestResponse(success=True, message="邀请码已发送到你的邮箱")
    except Exception:
        logger.exception("Failed to send access request email: email=%s", body.email)
        raise HTTPException(status_code=500, detail="email_send_failed")


@router.post("/qualify", response_model=QualifyResponse)
async def api_qualify(
    body: QualifyInput,
    email: Optional[str] = Depends(get_optional_user_email),
):
    """Submit questionnaire and receive invite code directly."""
    valid_codes = [c.strip() for c in INVITE_CODES.split(",") if c.strip()]
    invite_code = valid_codes[0] if valid_codes else "BREW2026"

    saved = await save_qualify_response(
        background=body.background,
        markets=body.markets,
        trading_style=body.trading_style,
        pain_points=body.pain_points,
        feedback=body.feedback,
        email=email or "",
    )
    if not saved:
        logger.warning("qualify: failed to save questionnaire response")

    logger.info("qualify: code issued background=%s", body.background)
    return QualifyResponse(success=True, invite_code=invite_code)
