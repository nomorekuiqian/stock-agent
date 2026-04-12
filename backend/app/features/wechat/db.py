"""
WeChat user database operations via Insforge Edge Functions.
"""

from typing import Dict, Any, Optional

import httpx

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "wechat-users"


def _headers() -> dict:
    """Build headers with internal secret."""
    service = get_insforge_service()
    headers = dict(service.headers)
    if EDGE_FUNCTION_SECRET:
        headers["X-Internal-Secret"] = EDGE_FUNCTION_SECRET
    return headers


async def upsert_wechat_user(
    openid: str,
    session_key: str,
    nickname: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Create or update a wechat user record by openid."""
    service = get_insforge_service()
    url = service.function_url(_FUNCTION_NAME)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                params={"action": "upsert"},
                json={
                    "openid": openid,
                    "session_key": session_key,
                    "nickname": nickname,
                    "avatar_url": avatar_url,
                },
                headers=_headers(),
                timeout=10.0,
            )
            return resp.json()
    except Exception as e:
        logger.error("upsert_wechat_user failed: %s", e)
        return {"success": False, "error": str(e)}


async def get_by_openid(openid: str) -> Dict[str, Any]:
    """Lookup wechat user by openid. Returns {success, data} where data may be None."""
    service = get_insforge_service()
    url = service.function_url(_FUNCTION_NAME)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                params={"action": "get_by_openid", "openid": openid},
                headers=_headers(),
                timeout=10.0,
            )
            return resp.json()
    except Exception as e:
        logger.error("get_by_openid failed: %s", e)
        return {"success": False, "error": str(e)}


async def bind_user(openid: str, user_id: str) -> Dict[str, Any]:
    """Bind a wechat openid to an Insforge user_id."""
    service = get_insforge_service()
    url = service.function_url(_FUNCTION_NAME)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                params={"action": "bind"},
                json={"openid": openid, "user_id": user_id},
                headers=_headers(),
                timeout=10.0,
            )
            return resp.json()
    except Exception as e:
        logger.error("bind_user failed: %s", e)
        return {"success": False, "error": str(e)}
