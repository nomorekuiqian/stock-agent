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
    AccessRequestInput,
    AccessRequestResponse,
    QualifyInput,
    QualifyResponse,
)
from app.features.invites.db import save_qualify_response

logger = get_logger(__name__)

router = APIRouter(prefix="/api/invites", tags=["invites"])


@router.post("/redeem")
async def api_redeem_invite(
    body: RedeemInviteRequest,
    user_id: str = Depends(verify_user_token),
):
    # Invite code flow removed alongside trial (freemium transition).
    logger.info("Redeem endpoint called by user=%s — returning 410 Gone", user_id[:8])
    raise HTTPException(
        status_code=410,
        detail="redeem_deprecated",
    )


@router.post("/auto-trial")
async def api_auto_trial(
    user_id: str = Depends(verify_user_token),
):
    # Trial model removed (freemium transition). Plan: docs/plans/active/freemium-lifecycle-email.md
    logger.info("Auto-trial endpoint called by user=%s — returning 410 Gone", user_id[:8])
    raise HTTPException(
        status_code=410,
        detail="auto_trial_deprecated",
    )


@router.post("/request", response_model=AccessRequestResponse)
async def api_request_access(body: AccessRequestInput):
    """Submit an access request form and send a welcome email.

    Post-freemium: 不再附带 14 天 trial 邀请码承诺. 邮件只是个欢迎回执 +
    引导用户去站点注册免费账户.
    """
    if not RESEND_API_KEY:
        logger.error("RESEND_API_KEY not configured, cannot send welcome email")
        raise HTTPException(status_code=500, detail="email_service_unavailable")

    resend.api_key = RESEND_API_KEY

    html_body = f"""
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #e4e4e7; background: #09090b;">
  <div style="margin-bottom: 32px;">
    <p style="font-size: 13px; color: #71717a; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 8px;">TheMarketBrew</p>
    <h1 style="font-size: 24px; font-weight: 600; margin: 0; color: #f4f4f5;">欢迎来到 TheMarketBrew</h1>
  </div>

  <p style="font-size: 15px; color: #a1a1aa; line-height: 1.6; margin: 0 0 24px;">
    Hi {body.name}, 感谢你的兴趣! 我们已经收到你的申请, 现在 TheMarketBrew 已经向所有用户免费开放, 不再需要邀请码.
  </p>

  <div style="background: #18181b; border: 1px solid #27272a; border-radius: 10px; padding: 20px; margin: 0 0 28px;">
    <p style="font-size: 14px; color: #f4f4f5; line-height: 1.7; margin: 0;">
      免费用户可以使用:
      <br/>· 每日市场日报 (邮件 + 站内)
      <br/>· 宏观仪表盘 (经济 / 流动性 / 情绪)
      <br/>· 自选股管理 (最多 25 只)
      <br/>· AI 投研引擎 (每天 2 次免费对话)
    </p>
  </div>

  <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6; margin: 0 0 28px;">
    访问 <a href="https://themarketbrew.com" style="color: #10b981; text-decoration: none;">themarketbrew.com</a> 即刻注册免费账户. 想要专属持仓日报、推特 KOL 日报或无限次 AI 投研, 可以随时升级 Pro / Max.
  </p>

  <hr style="border: none; border-top: 1px solid #27272a; margin: 28px 0;" />

  <p style="font-size: 12px; color: #52525b; line-height: 1.6; margin: 0;">
    TheMarketBrew &mdash; 专业级市场分析, 为你的每个决策赋能
  </p>
</div>
"""

    try:
        resend.Emails.send({
            "from": "TheMarketBrew <hello@themarketbrew.com>",
            "to": [body.email],
            "subject": "欢迎来到 TheMarketBrew",
            "html": html_body,
        })
        logger.info("Access welcome email sent: email=%s name=%s", body.email, body.name)
        return AccessRequestResponse(success=True, message="欢迎邮件已发送到你的邮箱")
    except Exception:
        logger.exception("Failed to send welcome email: email=%s", body.email)
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
