"""
WeChat Mini Program service — code2Session, JWT generation, account binding.
"""

from typing import Dict, Any

import httpx

from app.core.config import (
    WECHAT_APP_ID,
    WECHAT_APP_SECRET,
    INSFORGE_BASE_URL,
    INSFORGE_ANON_KEY,
)
from app.core.logging import get_logger
from app.features.wechat import db
from app.features.wechat.jwt_utils import sign_wechat_jwt

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
