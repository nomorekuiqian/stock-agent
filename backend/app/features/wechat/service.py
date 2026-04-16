"""
WeChat Mini Program service — code2Session, JWT generation, account binding.
"""

import urllib.parse
from typing import Dict, Any, Optional

import httpx

from app.core.config import (
    WECHAT_APP_ID,
    WECHAT_APP_SECRET,
    INSFORGE_BASE_URL,
    INSFORGE_ANON_KEY,
    INSFORGE_SERVICE_KEY,
    RESEND_API_KEY,
    FRONTEND_URL,
)
from app.core.logging import get_logger
from app.features.wechat import db
from app.features.wechat.jwt_utils import (
    sign_wechat_jwt,
    generate_otp_token,
    verify_otp_token,
    mark_otp_used,
)

logger = get_logger(__name__)

_CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session"


async def code2session(code: str) -> Dict[str, Any]:
    """
    Call WeChat code2Session API to exchange temporary code for openid + session_key.

    Returns:
        {"openid": "...", "session_key": "..."} on success
        {"error": "...", "errcode": N} on failure
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                _CODE2SESSION_URL,
                params={
                    "appid": WECHAT_APP_ID,
                    "secret": WECHAT_APP_SECRET,
                    "js_code": code,
                    "grant_type": "authorization_code",
                },
            )
        data = resp.json()
        if "errcode" in data and data["errcode"] != 0:
            logger.warning("code2session failed: errcode=%s errmsg=%s", data.get("errcode"), data.get("errmsg"))
            return {"error": data.get("errmsg", "code2session failed"), "errcode": data.get("errcode")}
        return data
    except Exception as e:
        logger.error("code2session request failed: %s", e)
        return {"error": str(e)}


async def login_with_code(code: str) -> Dict[str, Any]:
    """
    Full login flow with three-state JWT dispatch:
    - wechat_bound:      insforge_user_id IS NOT NULL
    - wechat_email_only: email_verified_at IS NOT NULL (no insforge account)
    - wechat_unbound:    neither (new/unverified user)
    """
    session_data = await code2session(code)
    if "error" in session_data:
        return {"success": False, "error": session_data["error"]}

    openid = session_data["openid"]
    session_key = session_data["session_key"]

    await db.upsert_wechat_user(openid=openid, session_key=session_key)

    lookup = await db.get_by_openid(openid)
    wechat_user = lookup.get("data") or {}

    insforge_user_id = wechat_user.get("insforge_user_id") or wechat_user.get("user_id")
    email_verified_at = wechat_user.get("email_verified_at")

    if insforge_user_id:
        token = sign_wechat_jwt(
            sub=insforge_user_id, typ="wechat_bound", exp_days=7, openid=openid
        )
        return {
            "success": True, "openid": openid, "user_id": insforge_user_id,
            "is_bound": True, "account_state": "bound", "token": token,
        }

    if email_verified_at:
        wechat_row_id = wechat_user.get("id", openid)
        token = sign_wechat_jwt(
            sub=wechat_row_id, typ="wechat_email_only", exp_days=7, openid=openid
        )
        return {
            "success": True, "openid": openid, "user_id": wechat_row_id,
            "is_bound": False, "account_state": "email_only", "token": token,
        }

    token = sign_wechat_jwt(sub=openid, typ="wechat_unbound", exp_days=1)
    return {
        "success": True, "openid": openid, "user_id": None,
        "is_bound": False, "account_state": "unbound", "token": token,
    }


async def bind_account(openid: str, email: str, password: str) -> Dict[str, Any]:
    """
    Bind a wechat openid to an existing Insforge account.

    1. Verify email/password via Insforge sign-in API
    2. If valid, bind openid to the user_id
    3. Return the JWT token
    """
    # Step 1: Verify credentials via Insforge
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{INSFORGE_BASE_URL}/api/auth/sessions?client_type=mobile",
                json={"email": email, "password": password},
                headers={"apikey": INSFORGE_ANON_KEY},
            )
    except httpx.RequestError as e:
        logger.error("Insforge auth request failed: %s", e)
        return {"success": False, "error": "Auth service unavailable"}

    if resp.status_code != 200:
        return {"success": False, "error": "Invalid email or password"}

    auth_data = resp.json()
    token = auth_data.get("accessToken")
    user = auth_data.get("user", {})
    user_id = user.get("id")

    if not user_id or not token:
        return {"success": False, "error": "Auth response missing user data"}

    # Step 2: Bind openid to user_id
    bind_result = await db.bind_user(openid=openid, user_id=user_id)
    if not bind_result.get("success"):
        return {"success": False, "error": bind_result.get("error", "Binding failed")}

    return {
        "success": True,
        "token": token,
        "user_id": user_id,
    }


async def _lookup_insforge_user_by_email(email: str) -> Optional[str]:
    """
    Query Insforge admin API for user by email. Returns user_id or None.
    Uses INSFORGE_SERVICE_KEY (service_role). INSFORGE_ANON_KEY has no admin scope.
    """
    if not INSFORGE_SERVICE_KEY:
        logger.error("_lookup_insforge_user_by_email: INSFORGE_SERVICE_KEY not configured")
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{INSFORGE_BASE_URL}/api/auth/admin/users",
                params={"email": email},
                headers={
                    "apikey": INSFORGE_SERVICE_KEY,
                    "Authorization": f"Bearer {INSFORGE_SERVICE_KEY}",
                },
            )
        if resp.status_code == 200:
            users = resp.json().get("users", [])
            if users:
                return users[0].get("id")
        else:
            logger.warning("_lookup_insforge_user_by_email: status=%s", resp.status_code)
    except Exception as e:
        logger.warning("_lookup_insforge_user_by_email failed: %s", e)
    return None


async def _send_otp_email(email: str, otp_token: str) -> None:
    """Send verification link email via Resend."""
    if not RESEND_API_KEY:
        logger.warning("_send_otp_email: RESEND_API_KEY not set, skipping")
        return
    verify_url = f"{FRONTEND_URL}/wechat-verify?t={urllib.parse.quote(otp_token)}"
    html = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #059669;">TheMarketBrew 邮箱验证</h2>
      <p>点击下方按钮完成微信小程序账号绑定：</p>
      <a href="{verify_url}" style="
        display: inline-block; padding: 12px 24px;
        background: #059669; color: white; border-radius: 6px;
        text-decoration: none; font-size: 16px;">
        完成验证
      </a>
      <p style="color: #6b7280; margin-top: 16px;">链接 5 分钟内有效。如非本人操作请忽略。</p>
    </div>
    """
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            "from": "TheMarketBrew <hello@themarketbrew.com>",
            "to": [email],
            "subject": "【TheMarketBrew】验证您的邮箱",
            "html": html,
        })
        logger.info("OTP verification email sent to %s", email)
    except Exception as e:
        logger.error("_send_otp_email failed: %s", e)


async def register_request(openid: str, email: str) -> Dict[str, Any]:
    """
    Step 1: Determine bind_existing vs create_new, generate OTP token, send email link.
    """
    existing_user_id = await _lookup_insforge_user_by_email(email)
    action = "bind_existing" if existing_user_id else "create_new"

    otp_token = generate_otp_token(email=email, openid=openid, action=action)
    await _send_otp_email(email=email, otp_token=otp_token)

    logger.info("register_request: openid=%s email=%s action=%s", openid, email, action)
    return {"success": True, "action": action}


async def register_confirm(otp_token: str) -> Dict[str, Any]:
    """
    Step 2: Verify OTP token (called from web /wechat-verify page).
    On success updates DB state; mini program re-calls wx.login() to get updated JWT.
    """
    result = verify_otp_token(otp_token)
    if not result["valid"]:
        reason_map = {
            "expired": "验证链接已过期，请重新发送",
            "already_used": "验证链接已使用，请重新发送",
            "invalid": "验证链接无效",
        }
        return {"success": False, "error": reason_map.get(result["reason"], "验证失败")}

    email = result["email"]
    openid = result["openid"]
    action = result["action"]

    # Consume immediately to prevent replay
    mark_otp_used(otp_token)

    if action == "bind_existing":
        insforge_user_id = await _lookup_insforge_user_by_email(email)
        if not insforge_user_id:
            return {"success": False, "error": "找不到该邮箱对应的账号"}
        bind_result = await db.bind_insforge_user(openid=openid, insforge_user_id=insforge_user_id)
        if not bind_result.get("success"):
            return {"success": False, "error": "账号绑定失败，请重试"}
        logger.info("register_confirm: bound openid=%s to insforge_user_id=%s", openid, insforge_user_id)
        return {"success": True, "account_state": "bound"}

    # create_new: verify email, create email_only state
    verify_result = await db.update_email_verified(openid=openid, email=email)
    if not verify_result.get("success"):
        return {"success": False, "error": "账号状态更新失败"}
    logger.info("register_confirm: email_only openid=%s email=%s", openid, email)
    return {"success": True, "account_state": "email_only"}


async def _send_otp_code_email(email: str, code: str) -> None:
    """Send 6-digit OTP code email via Resend."""
    if not RESEND_API_KEY:
        logger.warning("_send_otp_code_email: RESEND_API_KEY not set, skipping")
        return
    html = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #059669;">TheMarketBrew 邮箱验证</h2>
      <p>您的验证码是：</p>
      <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px;
                  color: #059669; margin: 24px 0; text-align: center;">{code}</div>
      <p style="color: #6b7280;">验证码 5 分钟内有效，请勿泄露给他人。</p>
    </div>
    """
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            "from": "TheMarketBrew <hello@themarketbrew.com>",
            "to": [email],
            "subject": "【TheMarketBrew】您的验证码",
            "html": html,
        })
        logger.info("OTP code email sent to %s", email)
    except Exception as e:
        logger.error("_send_otp_code_email failed: %s", e)


async def send_otp(openid: str, email: str) -> Dict[str, Any]:
    """
    Determine bind_existing vs create_new, generate 6-digit OTP, send via Resend.
    openid is passed to otp_utils so it can be retrieved at verify time.
    """
    from app.shared.otp_utils import generate_numeric_otp
    existing_user_id = await _lookup_insforge_user_by_email(email)
    action = "bind_existing" if existing_user_id else "create_new"
    code = generate_numeric_otp(email=email, action=action, openid=openid)
    await _send_otp_code_email(email=email, code=code)
    logger.info("send_otp: openid=%s email=%s action=%s", openid, email, action)
    return {"success": True, "action": action}


async def verify_otp(email: str, code: str) -> Dict[str, Any]:
    """
    Verify 6-digit OTP and upgrade account state.
    openid is retrieved from the stored OTP entry (set at send time).
    Returns new JWT on success.
    """
    from app.shared.otp_utils import verify_numeric_otp
    result = verify_numeric_otp(email=email, code=code)
    if not result["valid"]:
        reason_map = {
            "not_found": "验证码已过期，请重新发送",
            "expired": "验证码已过期，请重新发送",
            "invalid_code": "验证码错误，请重试",
        }
        return {"success": False, "error": reason_map.get(result["reason"], "验证失败")}

    action = result["action"]
    openid = result["openid"]

    if action == "bind_existing":
        insforge_user_id = await _lookup_insforge_user_by_email(email)
        if not insforge_user_id:
            return {"success": False, "error": "找不到该邮箱对应的账号"}
        bind_result = await db.bind_insforge_user(openid=openid, insforge_user_id=insforge_user_id)
        if not bind_result.get("success"):
            return {"success": False, "error": "账号绑定失败，请重试"}
        token = sign_wechat_jwt(sub=insforge_user_id, typ="wechat_bound", exp_days=7, openid=openid)
        logger.info("verify_otp: bound openid=%s to insforge_user_id=%s", openid, insforge_user_id)
        return {"success": True, "account_state": "bound", "token": token}

    # create_new: store email_verified_at → wechat_email_only
    verify_result = await db.update_email_verified(openid=openid, email=email)
    if not verify_result.get("success"):
        return {"success": False, "error": "账号状态更新失败"}
    lookup = await db.get_by_openid(openid)
    wechat_user = (lookup.get("data") or {})
    wechat_row_id = wechat_user.get("id", openid)
    token = sign_wechat_jwt(sub=wechat_row_id, typ="wechat_email_only", exp_days=7, openid=openid)
    logger.info("verify_otp: email_only openid=%s email=%s", openid, email)
    return {"success": True, "account_state": "email_only", "token": token}
