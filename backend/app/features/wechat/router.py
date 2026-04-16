"""
WeChat Mini Program router — login, OTP registration/binding, profile, and home cards.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from app.core.logging import get_logger
from app.core.deps import verify_user_token
from app.core.rate_limit import limiter
from app.features.wechat.models import (
    WechatLoginRequest, WechatLoginResponse,
    WechatMeResponse, HomeCard, HomeCardsResponse,
    WechatOtpSendRequest, WechatOtpSendResponse,
    WechatOtpVerifyRequest, WechatOtpVerifyResponse,
)
from app.features.wechat import service
from app.features.wechat import db
from app.features.wechat.jwt_utils import decode_wechat_jwt, extract_openid_from_jwt

logger = get_logger(__name__)
router = APIRouter(prefix="/api/wechat", tags=["wechat"])

HOME_CARDS = [
    HomeCard(id="today",   title="今日市场日报", subtitle="AI 驱动的每日行情分析", url="/today",   icon="chart",  order=1),
    HomeCard(id="morning", title="盘前早报",     subtitle="开盘前必看要闻",         url="/morning", icon="sun",    order=2),
    HomeCard(id="for-you", title="专属 Brew",    subtitle="个性化投资摘要",         url="/for-you", icon="brew",   order=3),
    HomeCard(id="stock",   title="个股投研",     subtitle="深度个股分析",           url="/stock",   icon="search", order=4),
    HomeCard(id="macro",   title="宏观仪表盘",   subtitle="流动性、风险、周报",     url="/macro",   icon="globe",  order=5),
]


def _require_wechat_token(authorization: str | None) -> dict:
    """
    Extract and decode any WeChat JWT (including wechat_unbound).
    Used for endpoints that must accept unbound users (verify_user_token rejects them).
    Returns decoded payload. Raises 401 on missing/invalid token.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    try:
        payload = decode_wechat_jwt(authorization[7:])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired WeChat token")
    if payload.get("typ") not in ("wechat_unbound", "wechat_email_only", "wechat_bound"):
        raise HTTPException(status_code=401, detail="Not a WeChat token")
    return payload


@router.post("/login", response_model=WechatLoginResponse)
async def wechat_login(request: WechatLoginRequest):
    try:
        result = await service.login_with_code(request.code)
        return WechatLoginResponse(**result)
    except Exception:
        logger.exception("wechat_login failed")
        raise HTTPException(status_code=500, detail="Login failed")



@router.post("/otp/send", response_model=WechatOtpSendResponse)
@limiter.limit("1/minute")
async def wechat_otp_send(request: Request, body: WechatOtpSendRequest):
    """
    Send 6-digit OTP to email.
    Accepts any WeChat JWT including wechat_unbound.
    Rate-limited 1/min per IP to prevent abuse.
    """
    auth_header = request.headers.get("Authorization")
    payload = _require_wechat_token(auth_header)
    openid = extract_openid_from_jwt(payload)
    try:
        result = await service.send_otp(openid=openid, email=body.email)
        return WechatOtpSendResponse(**result)
    except Exception:
        logger.exception("wechat_otp_send failed")
        raise HTTPException(status_code=500, detail="Failed to send OTP")


@router.post("/otp/verify", response_model=WechatOtpVerifyResponse)
async def wechat_otp_verify(body: WechatOtpVerifyRequest, request: Request):
    """
    Verify 6-digit OTP. Returns new JWT on success.
    Accepts any WeChat JWT including wechat_unbound.
    openid is NOT passed here — it was stored inside the OTP entry at send time.
    """
    auth_header = request.headers.get("Authorization")
    _require_wechat_token(auth_header)
    result = await service.verify_otp(email=body.email, code=body.code)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return WechatOtpVerifyResponse(**result)


@router.get("/me", response_model=WechatMeResponse)
async def wechat_me(
    request: Request,
    user_id: str = Depends(verify_user_token),
):
    """Return account state and email. Accepts wechat_bound / wechat_email_only."""
    auth_header = request.headers.get("Authorization")
    token = auth_header[7:] if auth_header and auth_header.startswith("Bearer ") else ""
    email = None
    try:
        payload = decode_wechat_jwt(token)
        typ = payload.get("typ", "")
        account_state = typ.replace("wechat_", "")

        if typ == "wechat_email_only":
            openid = extract_openid_from_jwt(payload)
            lookup = await db.get_by_openid(openid)
            wechat_user = lookup.get("data") or {}
            email = wechat_user.get("email")

        return WechatMeResponse(success=True, account_state=account_state, user_id=user_id, email=email)
    except Exception:
        return WechatMeResponse(success=True, account_state="bound", user_id=user_id)


@router.get("/home-cards", response_model=HomeCardsResponse)
async def get_home_cards():
    return HomeCardsResponse(success=True, cards=sorted(HOME_CARDS, key=lambda c: c.order))
