"""
Shared dependencies - authentication, cron secret verification.
"""

import hmac
import os
import time
from typing import Optional

import httpx
import jwt as pyjwt
from fastapi import Header, HTTPException

from app.core.config import CRON_SECRET, INSFORGE_BASE_URL, INSFORGE_ANON_KEY
from app.core.logging import get_logger

logger = get_logger(__name__)

# Simple in-memory cache: token -> (user_id, email, expiry_timestamp)
_token_cache: dict[str, tuple[str, str, float]] = {}
_CACHE_TTL = 60  # seconds


async def verify_user_token(
    authorization: Optional[str] = Header(None),
) -> str:
    """
    Verify Bearer token. Two token families:
    1. WeChat JWT (HS256, WECHAT_JWT_SECRET) — decoded locally
       wechat_bound / wechat_email_only → return sub (user_id)
       wechat_unbound → 403
    2. Insforge accessToken — verified via Insforge API (existing path)
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization[7:]  # strip "Bearer "

    # --- Try WeChat JWT first (local, cheap) ---
    wechat_secret = os.environ.get("WECHAT_JWT_SECRET", "")
    if wechat_secret:
        try:
            payload = pyjwt.decode(token, wechat_secret, algorithms=["HS256"])
            typ = payload.get("typ", "")
            if typ in ("wechat_bound", "wechat_email_only"):
                return payload["sub"]
            elif typ == "wechat_unbound":
                raise HTTPException(status_code=403, detail="请先验证邮箱后再访问此功能")
            # Unknown typ — fall through to Insforge
        except HTTPException:
            raise
        except Exception:
            pass  # Not a WeChat JWT — try Insforge path

    # --- Insforge path (unchanged) ---
    cached = _token_cache.get(token)
    if cached:
        user_id, _email, expiry = cached
        if time.time() < expiry:
            return user_id
        else:
            del _token_cache[token]

    # Call Insforge Auth API to verify
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{INSFORGE_BASE_URL}/api/auth/sessions/current",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": INSFORGE_ANON_KEY,
                },
            )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Auth service unavailable")

    if resp.status_code >= 500:
        raise HTTPException(status_code=502, detail="Auth service error")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        data = resp.json()
    except (ValueError, TypeError):
        raise HTTPException(status_code=502, detail="Auth service returned invalid response")

    # Insforge returns { user: { id, email, ... } }
    user_obj = data.get("user", data)
    user_id = user_obj.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    email = user_obj.get("email", "")

    # Cache the result
    _token_cache[token] = (user_id, email, time.time() + _CACHE_TTL)

    # Evict expired entries periodically (keep cache small)
    if len(_token_cache) > 100:
        now = time.time()
        expired = [k for k, (_, _, exp) in _token_cache.items() if now >= exp]
        for k in expired:
            del _token_cache[k]

    return user_id


async def verify_user_token_with_email(
    authorization: Optional[str] = Header(None),
) -> dict:
    """Verify Bearer token and return both user_id and email."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization[7:]

    # Check cache first
    cached = _token_cache.get(token)
    if cached:
        user_id, email, expiry = cached
        if time.time() < expiry:
            return {"user_id": user_id, "email": email}
        else:
            del _token_cache[token]

    # Reuse verify_user_token to populate cache, then read from cache
    user_id = await verify_user_token(authorization)
    cached = _token_cache.get(token)
    email = cached[1] if cached else ""
    return {"user_id": user_id, "email": email}


async def get_optional_user_email(
    authorization: Optional[str] = Header(None),
) -> Optional[str]:
    """Try to get user email from token. Returns None if no token or invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        user_info = await verify_user_token_with_email(authorization)
        return user_info.get("email") or None
    except Exception:
        logger.debug("get_optional_user_email: failed to resolve email from token", exc_info=True)
        return None


async def optional_user_token(
    authorization: Optional[str] = Header(None),
) -> Optional[str]:
    """
    Try to verify Bearer token. Returns user_id if valid, None if missing/invalid.
    Never raises — anonymous access is allowed.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await verify_user_token(authorization)
    except HTTPException:
        return None


async def verify_cron_secret(
    x_cron_secret: str = Header(None, alias="X-Cron-Secret"),
) -> str:
    """Verify X-Cron-Secret header for admin/cron endpoints."""
    if CRON_SECRET and not hmac.compare_digest(x_cron_secret or "", CRON_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_cron_secret
