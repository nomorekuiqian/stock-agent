"""
Portfolio database access - thin wrapper over the `portfolio` Edge Function.

Edge Function source: backend/app/edge_functions/portfolio.js
Schema:               backend/migrations/u0a_portfolio_schema.sql

All operations require user_id (caller passes the authenticated user's id;
Edge Function does not re-validate JWT — that is done in router.py).
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.portfolio.models import (
    HoldingInput,
    HoldingRow,
    ProfileInput,
    ProfileView,
)

logger = get_logger(__name__)


_FUNCTION = "portfolio"
_TIMEOUT = 10.0


# =============================================================================
# Internal helpers
# =============================================================================


async def _call(action: str, *, method: str = "POST",
                params: Optional[Dict[str, Any]] = None,
                body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Invoke the portfolio edge function. Returns parsed JSON dict."""
    service = get_insforge_service()
    url = f"{service.base_url}/functions/{_FUNCTION}"

    qs = dict(params or {})
    qs["action"] = action

    headers = dict(service.headers)
    if EDGE_FUNCTION_SECRET:
        headers["X-Internal-Secret"] = EDGE_FUNCTION_SECRET

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        if method == "GET":
            resp = await client.get(url, params=qs, headers=headers)
        else:
            resp = await client.post(url, params=qs, headers=headers, json=body or {})

    if resp.status_code >= 500:
        logger.error("portfolio EF %s status=%s body=%s", action, resp.status_code, resp.text[:200])
        return {"success": False, "error": f"HTTP {resp.status_code}"}

    try:
        data = resp.json()
    except ValueError:
        logger.error("portfolio EF %s non-JSON response: %s", action, resp.text[:200])
        return {"success": False, "error": "non-JSON response"}

    if not data.get("success"):
        logger.warning("portfolio EF %s failed: %s", action, data.get("error"))
    return data


# =============================================================================
# Portfolio rows
# =============================================================================


async def list_portfolio(user_id: str) -> List[HoldingRow]:
    data = await _call("list", method="GET", params={"user_id": user_id})
    if not data.get("success"):
        return []
    return [HoldingRow(**row) for row in (data.get("data") or [])]


async def bulk_replace_portfolio(user_id: str, rows: List[HoldingInput]) -> List[HoldingRow]:
    payload_rows = [
        {
            "symbol": r.symbol,
            "weight_pct": r.weight_pct,
            "shares": r.shares,
            "cost_basis": r.cost_basis,
            "thesis": r.thesis,
            "target": r.target,
            "stop_loss": r.stop_loss,
            "conviction": r.conviction,
            "entry_price": r.entry_price,
            "source": r.source,
            "source_synced_at": r.source_synced_at.isoformat() if r.source_synced_at else None,
            "external_account_id": r.external_account_id,
        }
        for r in rows
    ]
    data = await _call("bulk", body={"user_id": user_id, "rows": payload_rows})
    if not data.get("success"):
        raise RuntimeError(data.get("error") or "bulk save failed")
    return [HoldingRow(**row) for row in (data.get("data") or [])]


async def reconcile_portfolio(
    user_id: str,
    source: str,
    rows: List[HoldingInput],
    *,
    clear_source: bool = False,
) -> List[HoldingRow]:
    """Track M replace-by-source upsert (design §3.4/§3.5).

    Sends ONLY quantitative + provenance fields. P1 (thesis/target/stop_loss/
    conviction) is INTENTIONALLY never forwarded — the `reconcile` Edge Function
    COALESCEs P1 from the existing row, which is the single source of truth.
    This keeps a buggy import structurally unable to carry/zero P1.

    `rows` must be the COMPLETE target set for `source` (not a delta): the EF
    deletes rows of `source` not present here. Empty `rows` is only honored
    with `clear_source=True` (explicit "remove all imported rows of this
    source"); $CASH is a source-agnostic singleton and is never source-deleted.
    """
    payload_rows = [
        {
            "symbol": r.symbol,
            "shares": r.shares,
            "cost_basis": r.cost_basis,
            "entry_price": r.entry_price,
            "weight_pct": r.weight_pct,
            "external_account_id": r.external_account_id,
            # NOTE: deliberately NO thesis/target/stop_loss/conviction here.
        }
        for r in rows
    ]
    data = await _call(
        "reconcile",
        body={
            "user_id": user_id,
            "source": source,
            "rows": payload_rows,
            "clear_source": clear_source,
        },
    )
    if not data.get("success"):
        raise RuntimeError(data.get("error") or "reconcile failed")
    return [HoldingRow(**row) for row in (data.get("data") or [])]


async def patch_holding(user_id: str, symbol: str, fields: Dict[str, Any]) -> Optional[HoldingRow]:
    body = {"user_id": user_id, "symbol": symbol, **fields}
    data = await _call("patch", body=body)
    if not data.get("success"):
        raise RuntimeError(data.get("error") or "patch failed")
    row = data.get("data")
    return HoldingRow(**row) if row else None


async def delete_holding(user_id: str, symbol: str) -> bool:
    data = await _call("delete", body={"user_id": user_id, "symbol": symbol})
    return bool(data.get("success"))


async def touch_portfolio(user_id: str) -> datetime:
    data = await _call("touch", body={"user_id": user_id})
    if not data.get("success"):
        raise RuntimeError(data.get("error") or "touch failed")
    iso = (data.get("data") or {}).get("confirmed_at")
    if isinstance(iso, str) and iso:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return datetime.utcnow()


# =============================================================================
# Profile
# =============================================================================


_DEFAULT_PROFILE_FIELDS = dict(
    style="passive", horizon="long",
    risk_tolerance="moderate", notify_mode="events_only",
    version=1, onboarded_at=None,
    portfolio_confirmed_at=None, updated_at=None,
)


async def get_profile(user_id: str) -> ProfileView:
    data = await _call("profile", method="GET", params={"user_id": user_id})
    if not data.get("success"):
        # EF outage: serve defaults so the UI doesn't 500, but log loudly.
        logger.warning("get_profile EF failed user=%s err=%s — serving defaults", user_id, data.get("error"))
        raw = None
    else:
        raw = data.get("data")
    if not raw:
        return ProfileView(user_id=user_id, **_DEFAULT_PROFILE_FIELDS)
    # Fill any null columns (style/horizon/risk) with defaults so caller sees a complete profile.
    merged = {**_DEFAULT_PROFILE_FIELDS, **{k: v for k, v in raw.items() if v is not None}}
    merged["user_id"] = user_id
    return ProfileView(**merged)


async def upsert_profile(user_id: str, patch: ProfileInput) -> ProfileView:
    body: Dict[str, Any] = {"user_id": user_id}
    for field in ("style", "horizon", "risk_tolerance", "notify_mode"):
        v = getattr(patch, field)
        if v is not None:
            body[field] = v
    data = await _call("upsert_profile", body=body)
    if not data.get("success"):
        raise RuntimeError(data.get("error") or "profile upsert failed")
    return await get_profile(user_id)
