"""Account-bound auth for TheMarketBrew MCP clients.

MCP clients run outside the browser, so they cannot safely reuse first-party
web cookies. This module implements a browser/device-style flow: the adapter
starts an authorization, the user approves it on themarketbrew.com while logged
in, then the adapter receives an opaque MCP token bound to that account.
"""

from __future__ import annotations

import hashlib
import secrets
import string
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

from fastapi import Header, HTTPException

from app.core.config import EDGE_FUNCTION_SECRET, FRONTEND_URL
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "mcp-auth"
_DEVICE_TTL_SECONDS = 10 * 60
_TOKEN_TTL_DAYS = 30
_POLL_INTERVAL_SECONDS = 2
_VERIFY_CACHE_TTL = 60
_USER_CODE_ALPHABET = string.ascii_uppercase + string.digits
_TOKEN_PREFIX = "tmb_mcp_"

_verify_cache: dict[str, tuple[dict[str, Any], float]] = {}


def _headers() -> dict[str, str] | None:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _normalize_user_code(value: str) -> str:
    return "".join(ch for ch in value.upper() if ch.isalnum())


def _format_user_code(value: str) -> str:
    normalized = _normalize_user_code(value)
    if len(normalized) <= 4:
        return normalized
    return f"{normalized[:4]}-{normalized[4:]}"


def _new_user_code() -> str:
    raw = "".join(secrets.choice(_USER_CODE_ALPHABET) for _ in range(8))
    return _format_user_code(raw)


def _auth_required_detail(message: str = "TheMarketBrew account login is required.") -> dict[str, Any]:
    return {
        "code": "auth_required",
        "message": message,
        "login_tool": "market_lens_login",
        "verification_url": f"{FRONTEND_URL.rstrip('/')}/mcp/authorize",
    }


async def _call(
    action: str,
    *,
    method: str = "POST",
    params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
    timeout: float = 10.0,
) -> dict[str, Any]:
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method=method,
        params={"action": action, **(params or {})},
        json_body=body,
        timeout=timeout,
        extra_headers=_headers(),
    )
    data = result.get("data") or {}
    if data.get("success"):
        payload = data.get("data")
        return payload if isinstance(payload, dict) else {"value": payload}
    status = result.get("status_code")
    error = data.get("error") or result.get("text") or "mcp auth request failed"
    logger.warning("mcp-auth edge function action=%s status=%s error=%s", action, status, error)
    raise RuntimeError(str(error))


async def start_device_authorization(client_name: str | None = None) -> dict[str, Any]:
    device_code = secrets.token_urlsafe(32)
    user_code = _new_user_code()
    expires_at = _utc_now() + timedelta(seconds=_DEVICE_TTL_SECONDS)
    display_name = (client_name or "TheMarketBrew MCP").strip()[:120]

    await _call(
        "start",
        body={
            "device_code_hash": _hash_secret(device_code),
            "user_code_hash": _hash_secret(_normalize_user_code(user_code)),
            "client_name": display_name,
            "expires_at": _iso(expires_at),
            "poll_interval_s": _POLL_INTERVAL_SECONDS,
        },
    )

    query = urlencode({"user_code": user_code})
    verification_url = f"{FRONTEND_URL.rstrip('/')}/mcp/authorize?{query}"
    return {
        "ok": True,
        "status": "authorization_pending",
        "device_code": device_code,
        "user_code": user_code,
        "verification_url": verification_url,
        "verification_uri": verification_url,
        "expires_in": _DEVICE_TTL_SECONDS,
        "poll_interval_s": _POLL_INTERVAL_SECONDS,
        "client_name": display_name,
        "instructions": [
            "Open verification_url in a browser.",
            "Log in with your TheMarketBrew account.",
            "Approve this MCP client.",
            "Then poll market_lens_auth_status or call market_lens_login again to complete.",
        ],
    }


async def authorize_device_code(*, user_code: str, user_id: str) -> dict[str, Any]:
    normalized = _normalize_user_code(user_code)
    if not normalized:
        raise HTTPException(status_code=400, detail="user_code is required")
    try:
        payload = await _call(
            "authorize",
            body={
                "user_code_hash": _hash_secret(normalized),
                "user_id": user_id,
            },
        )
    except RuntimeError as exc:
        message = str(exc)
        if "not_found" in message:
            raise HTTPException(status_code=404, detail="Authorization code not found") from exc
        if "expired" in message:
            raise HTTPException(status_code=410, detail="Authorization code expired") from exc
        raise HTTPException(status_code=502, detail="MCP authorization service unavailable") from exc

    return {
        "ok": True,
        "status": payload.get("status", "authorized"),
        "client_name": payload.get("client_name"),
        "expires_at": payload.get("expires_at"),
    }


async def exchange_device_token(device_code: str) -> dict[str, Any]:
    token = f"{_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"
    token_expires_at = _utc_now() + timedelta(days=_TOKEN_TTL_DAYS)
    try:
        payload = await _call(
            "exchange",
            body={
                "device_code_hash": _hash_secret(device_code),
                "token_hash": _hash_secret(token),
                "token_expires_at": _iso(token_expires_at),
                "scopes": ["mcp:persona", "mcp:data"],
            },
        )
    except RuntimeError as exc:
        message = str(exc)
        if "pending" in message:
            return {
                "ok": True,
                "status": "authorization_pending",
                "poll_interval_s": _POLL_INTERVAL_SECONDS,
            }
        if "expired" in message:
            return {"ok": False, "status": "expired", "error": "Authorization code expired"}
        if "denied" in message:
            return {"ok": False, "status": "denied", "error": "Authorization was denied"}
        if "not_found" in message:
            return {"ok": False, "status": "not_found", "error": "Authorization code not found"}
        raise HTTPException(status_code=502, detail="MCP authorization service unavailable") from exc

    if payload.get("status") != "authorized":
        return {
            "ok": True,
            "status": payload.get("status", "authorization_pending"),
            "poll_interval_s": payload.get("poll_interval_s", _POLL_INTERVAL_SECONDS),
        }

    return {
        "ok": True,
        "status": "authorized",
        "mcp_token": token,
        "token_type": "Bearer",
        "expires_at": _iso(token_expires_at),
        "scopes": payload.get("scopes") or ["mcp:persona", "mcp:data"],
        "user_id": payload.get("user_id"),
    }


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    return token or None


async def verify_mcp_token(
    authorization: Optional[str] = Header(None),
) -> dict[str, Any]:
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail=_auth_required_detail())

    token_hash = _hash_secret(token)
    cached = _verify_cache.get(token_hash)
    if cached and time.time() < cached[1]:
        return cached[0]
    if cached:
        _verify_cache.pop(token_hash, None)

    try:
        payload = await _call("verify", body={"token_hash": token_hash}, timeout=5.0)
    except RuntimeError as exc:
        message = str(exc)
        if any(term in message for term in ("invalid", "expired", "revoked", "not_found")):
            raise HTTPException(
                status_code=401,
                detail=_auth_required_detail("TheMarketBrew MCP token is invalid or expired."),
            ) from exc
        raise HTTPException(status_code=502, detail="MCP auth service unavailable") from exc

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail=_auth_required_detail("TheMarketBrew MCP token is invalid."),
        )

    auth_info = {
        "user_id": user_id,
        "token_id": payload.get("token_id"),
        "scopes": payload.get("scopes") or [],
        "expires_at": payload.get("expires_at"),
        "client_name": payload.get("client_name"),
        "auth_type": "mcp_token",
    }
    _verify_cache[token_hash] = (auth_info, time.time() + _VERIFY_CACHE_TTL)
    return auth_info


async def mcp_auth_status(token: str) -> dict[str, Any]:
    payload = await _call("verify", body={"token_hash": _hash_secret(token)}, timeout=5.0)
    return {
        "ok": True,
        "authenticated": True,
        "user_id": payload.get("user_id"),
        "token_id": payload.get("token_id"),
        "scopes": payload.get("scopes") or [],
        "expires_at": payload.get("expires_at"),
        "client_name": payload.get("client_name"),
    }


async def revoke_mcp_token(token: str) -> dict[str, Any]:
    token_hash = _hash_secret(token)
    _verify_cache.pop(token_hash, None)
    payload = await _call("revoke", body={"token_hash": token_hash})
    return {"ok": True, "revoked": bool(payload.get("revoked", True))}


async def log_mcp_usage(
    *,
    user_id: str,
    token_id: str | None,
    tool: str,
    endpoint: str,
    symbols: list[str] | None = None,
    sections: list[str] | None = None,
    latency_ms: int | None = None,
    success: bool = True,
    error: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    try:
        await _call(
            "log_usage",
            body={
                "user_id": user_id,
                "token_id": token_id,
                "tool": tool,
                "endpoint": endpoint,
                "symbols": symbols or [],
                "sections": sections or [],
                "latency_ms": latency_ms,
                "success": success,
                "error": error,
                "metadata": metadata or {},
            },
            timeout=3.0,
        )
    except Exception:
        logger.debug("mcp usage log failed", exc_info=True)
