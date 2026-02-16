"""
Shared dependencies - authentication, cron secret verification.
"""

import hmac
import time
from typing import Optional

import httpx
from fastapi import Header, HTTPException

from app.core.config import CRON_SECRET, INSFORGE_BASE_URL, INSFORGE_ANON_KEY

# Simple in-memory cache: token -> (user_id, expiry_timestamp)
_token_cache: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 60  # seconds


async def verify_user_token(
    authorization: Optional[str] = Header(None),
) -> str:
    """Verify Bearer token via Insforge Auth API. Returns the authenticated user_id."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization[7:]  # strip "Bearer "

    # Check cache first
    cached = _token_cache.get(token)
    if cached:
        user_id, expiry = cached
        if time.time() < expiry:
            return user_id
        else:
            del _token_cache[token]

    # Call Insforge Auth API to verify
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{INSFORGE_BASE_URL}/auth/v1/user",
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

    data = resp.json()
    user_id = data.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    # Cache the result
    _token_cache[token] = (user_id, time.time() + _CACHE_TTL)

    # Evict expired entries periodically (keep cache small)
    if len(_token_cache) > 100:
        now = time.time()
        expired = [k for k, (_, exp) in _token_cache.items() if now >= exp]
        for k in expired:
            del _token_cache[k]

    return user_id


async def verify_cron_secret(
    x_cron_secret: str = Header(None, alias="X-Cron-Secret"),
) -> str:
    """Verify X-Cron-Secret header for admin/cron endpoints."""
    if CRON_SECRET and not hmac.compare_digest(x_cron_secret or "", CRON_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_cron_secret
