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
    Full login flow:
    1. Exchange code for openid via code2Session
    2. Upsert wechat_users record
    3. Check if openid is bound to an Insforge user
    4. If bound, return user info
    5. If not bound, return openid for optional binding
    """
    # Step 1: code2Session
    session_data = await code2session(code)
    if "error" in session_data:
        return {"success": False, "error": session_data["error"]}

    openid = session_data["openid"]
    session_key = session_data["session_key"]

    # Step 2: Upsert wechat user
    await db.upsert_wechat_user(openid=openid, session_key=session_key)

    # Step 3: Check binding
    lookup = await db.get_by_openid(openid)
    wechat_user = lookup.get("data")

    if wechat_user and wechat_user.get("user_id"):
        # Already bound
        user_id = wechat_user["user_id"]
        return {
            "success": True,
            "openid": openid,
            "user_id": user_id,
            "is_bound": True,
            "token": None,
        }

    # Not bound
    return {
        "success": True,
        "openid": openid,
        "user_id": None,
        "is_bound": False,
        "token": None,
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
