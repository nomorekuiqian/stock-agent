"""Market Lens MCP beta access and usage helpers."""

from __future__ import annotations

import hashlib
from typing import Any

from app.core.config import EDGE_FUNCTION_SECRET, ENVIRONMENT, FRANK_LENS_DEV_INVITE_CODE
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "frank-lens-beta"


def _invite_hash(invite_code: str) -> str:
    return hashlib.sha256(invite_code.encode("utf-8")).hexdigest()


def _short_hash(invite_code: str) -> str:
    return _invite_hash(invite_code)[:12]


def _internal_headers() -> dict[str, str]:
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


async def validate_invite_code(invite_code: str | None) -> dict[str, Any]:
    """Validate a Market Lens beta invite code against Insforge.

    Returns a normalized dict:
      {allowed, access, invite_code_id?, invite_label?, remaining_quota?}
    """
    code = (invite_code or "").strip()
    if not code:
        return {"allowed": False, "access": "missing", "error": "invite_code_required"}

    if ENVIRONMENT != "production" and FRANK_LENS_DEV_INVITE_CODE:
        if code == FRANK_LENS_DEV_INVITE_CODE:
            return {
                "allowed": True,
                "access": "dev",
                "invite_code_id": "dev",
                "invite_label": "Local dev invite",
                "remaining_quota": None,
            }

    result = await get_insforge_service().call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "validate_invite"},
        json_body={
            "invite_hash": _invite_hash(code),
        },
        extra_headers=_internal_headers(),
        timeout=15.0,
    )
    data = result.get("data") or {}
    if result.get("status_code") != 200 or not data.get("success"):
        logger.warning(
            "frank_lens invite validation failed hash=%s status=%s error=%s",
            _short_hash(code),
            result.get("status_code"),
            data.get("error") or result.get("text"),
        )
        return {
            "allowed": False,
            "access": "invalid",
            "error": data.get("error") or "invite_validation_failed",
        }

    invite = data.get("invite") or {}
    return {
        "allowed": bool(data.get("allowed")),
        "access": "valid" if data.get("allowed") else "invalid",
        "invite_code_id": invite.get("id"),
        "invite_label": invite.get("label"),
        "remaining_quota": invite.get("remaining_quota"),
    }


async def record_usage(
    *,
    invite: dict[str, Any],
    persona_username: str,
    tool_name: str,
    workflow: str | None,
    ticker: str | None = None,
    tickers: list[str] | None = None,
    status: str,
    latency_ms: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Record beta usage. Logging must never break the user workflow."""
    invite_id = invite.get("invite_code_id")
    if invite.get("access") == "dev":
        logger.info(
            "frank_lens usage dev tool=%s workflow=%s ticker=%s status=%s latency_ms=%s",
            tool_name,
            workflow,
            ticker,
            status,
            latency_ms,
        )
        return

    if not invite_id:
        return

    try:
        result = await get_insforge_service().call_function(
            _FUNCTION_NAME,
            method="POST",
            params={"action": "record_usage"},
            json_body={
                "invite_id": invite_id,
                "persona_username": persona_username,
                "tool_name": tool_name,
                "workflow": workflow,
                "ticker": ticker,
                "tickers": tickers or [],
                "status": status,
                "latency_ms": latency_ms,
                "metadata": metadata or {},
            },
            extra_headers=_internal_headers(),
            timeout=10.0,
        )
        data = result.get("data") or {}
        if result.get("status_code") != 200 or not data.get("success"):
            logger.warning(
                "frank_lens usage record failed invite=%s status=%s error=%s",
                invite_id,
                result.get("status_code"),
                data.get("error") or result.get("text"),
            )
    except Exception:
        logger.exception("frank_lens usage record failed invite=%s", invite_id)
