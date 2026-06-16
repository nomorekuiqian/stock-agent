"""Migrate legacy Ultra subscription rows back to Max.

Ultra is no longer a sellable tier. Qinbafrank / KOL research access is folded
into Max through the existing Max research entitlement model, so active rows
should not keep `plan="ultra"` or the legacy `kol_pack_qinbafrank` key.

Usage:
    cd backend
    source venv/bin/activate

    python scripts/migrate_ultra_to_max.py
    python scripts/migrate_ultra_to_max.py --apply
    python scripts/migrate_ultra_to_max.py --user-id USER_ID --apply

Default mode is dry-run. It writes a JSON snapshot under
`backend/tmp/ultra-to-max-migration/`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import stripe  # noqa: E402

from app.core.config import STRIPE_SECRET_KEY, STRIPE_ULTRA_PRICE_ID  # noqa: E402
from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger  # noqa: E402
from app.features.payment.db import upsert_subscription  # noqa: E402
from app.features.payment.entitlements import (  # noqa: E402
    KOL_PACK_QINBAFRANK,
    MAX_FEATURES,
)
from app.features.subscription.service import SubscriptionService  # noqa: E402

logger = get_logger(__name__)

ACTIVE_STATUSES = {"active", "trialing"}
LEGACY_ULTRA_LOOKUP_KEY = "themarketbrew_ultra_monthly"
SNAPSHOT_DIR = Path(__file__).resolve().parents[1] / "tmp" / "ultra-to-max-migration"

stripe.api_key = STRIPE_SECRET_KEY


@dataclass
class MigrationRow:
    user_id: str
    email: str | None
    current_plan: str | None
    current_status: str | None
    is_lifetime: bool
    access_expires_at: str | None
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    current_entitlements: list[str]
    stripe_price_id: str | None
    stripe_lookup_key: str | None
    target_plan: str | None
    target_status: str | None
    target_entitlements: list[str] | None
    clear_access_expires_at: bool
    billing_action: str
    reason: str
    will_update: bool
    error: str | None = None


async def _list_users() -> list[dict[str, Any]]:
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=120.0,
    )
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError("list_all failed: %s" % payload)
    return payload.get("data") or []


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _access_active(access_expires_at: str | None, now: datetime) -> bool:
    expires = _parse_dt(access_expires_at)
    return bool(expires and expires > now)


def _stripe_subscription_price(subscription_id: str | None) -> tuple[str | None, str | None, str | None]:
    if not subscription_id or not STRIPE_SECRET_KEY:
        return None, None, None
    try:
        sub = stripe.Subscription.retrieve(subscription_id, expand=["items.data.price"])
    except Exception as e:  # noqa: BLE001
        return None, None, str(e)

    sub_d = sub.to_dict() if hasattr(sub, "to_dict") else dict(sub)
    items = ((sub_d.get("items") or {}).get("data") or [])
    if not items:
        return None, None, None
    price = (items[0].get("price") or {})
    return price.get("id"), price.get("lookup_key"), None


def _target_for_row(
    row: dict[str, Any],
    now: datetime,
) -> tuple[str | None, str | None, list[str] | None, bool, str, str, bool]:
    plan = row.get("plan")
    status = row.get("status")
    access_expires_at = row.get("access_expires_at")
    entitlements = set(row.get("entitlements") or [])
    is_lifetime = bool(row.get("is_lifetime"))
    has_stripe_subscription = bool(row.get("stripe_subscription_id"))
    has_legacy_key = KOL_PACK_QINBAFRANK in entitlements
    is_ultra_plan = plan == "ultra"
    has_active_status = status in ACTIVE_STATUSES
    has_active_grant = _access_active(access_expires_at, now)

    if not is_ultra_plan and not has_legacy_key:
        return None, None, None, False, "none", "no_legacy_ultra_state", False

    if is_lifetime:
        return "max", "active", sorted(MAX_FEATURES), bool(access_expires_at), "none", "lifetime_cleanup", True

    if has_stripe_subscription and has_active_status:
        target_status = status if status else "active"
        return (
            "max",
            target_status,
            sorted(MAX_FEATURES),
            bool(access_expires_at),
            "review_stripe_price",
            "stripe_active_to_max",
            True,
        )

    if has_active_grant:
        target_status = status if status else "active"
        return "max", target_status, sorted(MAX_FEATURES), False, "none", "active_grant_to_max", True

    target_status = "expired" if access_expires_at else (status or "canceled")
    return "free", target_status, [], False, "none", "inactive_legacy_cleanup", True


async def collect(user_id_filter: str | None = None) -> list[MigrationRow]:
    now = datetime.now(timezone.utc)
    rows: list[MigrationRow] = []
    for user in await _list_users():
        user_id = user.get("user_id")
        if not user_id:
            continue
        if user_id_filter and user_id != user_id_filter:
            continue

        price_id, lookup_key, stripe_error = _stripe_subscription_price(
            user.get("stripe_subscription_id")
        )
        (
            target_plan,
            target_status,
            target_entitlements,
            clear_access_expires_at,
            billing_action,
            reason,
            will_update,
        ) = _target_for_row(user, now)
        if price_id == STRIPE_ULTRA_PRICE_ID or lookup_key == LEGACY_ULTRA_LOOKUP_KEY:
            billing_action = "move_stripe_subscription_to_max_price"

        rows.append(MigrationRow(
            user_id=user_id,
            email=user.get("email"),
            current_plan=user.get("plan"),
            current_status=user.get("status"),
            is_lifetime=bool(user.get("is_lifetime")),
            access_expires_at=user.get("access_expires_at"),
            stripe_customer_id=user.get("stripe_customer_id"),
            stripe_subscription_id=user.get("stripe_subscription_id"),
            current_entitlements=sorted(user.get("entitlements") or []),
            stripe_price_id=price_id,
            stripe_lookup_key=lookup_key,
            target_plan=target_plan,
            target_status=target_status,
            target_entitlements=target_entitlements,
            clear_access_expires_at=clear_access_expires_at,
            billing_action=billing_action,
            reason=reason,
            will_update=will_update,
            error=stripe_error,
        ))
    return rows


def _write_snapshot(rows: list[MigrationRow]) -> Path:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SNAPSHOT_DIR / ("%s.json" % datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    path.write_text(
        json.dumps([asdict(row) for row in rows], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


async def _sync_resend(email: str | None, sub_payload: dict[str, Any]) -> None:
    if not email:
        return
    await asyncio.to_thread(SubscriptionService().sync_resend_segments, email, sub_payload)


async def apply(rows: list[MigrationRow]) -> int:
    updated = 0
    for row in rows:
        if not row.will_update:
            continue
        ok = await upsert_subscription(
            user_id=row.user_id,
            plan=row.target_plan,
            status=row.target_status,
            entitlements=row.target_entitlements,
            clear_access_expires_at=row.clear_access_expires_at,
        )
        if not ok:
            raise RuntimeError("upsert failed for user_id=%s" % row.user_id)
        await _sync_resend(row.email, {
            "user_id": row.user_id,
            "plan": row.target_plan,
            "status": row.target_status,
            "is_lifetime": row.is_lifetime,
            "access_expires_at": None if row.clear_access_expires_at else row.access_expires_at,
            "stripe_subscription_id": row.stripe_subscription_id,
            "entitlements": row.target_entitlements or [],
        })
        updated += 1
    return updated


def _summarize(rows: list[MigrationRow]) -> dict[str, int]:
    summary: dict[str, int] = {
        "scanned": len(rows),
        "will_update": 0,
        "stripe_price_moves": 0,
        "legacy_key_rows": 0,
        "ultra_plan_rows": 0,
        "clear_access_expires_at": 0,
        "errors": 0,
    }
    for row in rows:
        if row.will_update:
            summary["will_update"] += 1
        if row.billing_action == "move_stripe_subscription_to_max_price":
            summary["stripe_price_moves"] += 1
        if KOL_PACK_QINBAFRANK in row.current_entitlements:
            summary["legacy_key_rows"] += 1
        if row.current_plan == "ultra":
            summary["ultra_plan_rows"] += 1
        if row.clear_access_expires_at:
            summary["clear_access_expires_at"] += 1
        if row.error:
            summary["errors"] += 1
    return summary


async def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate Ultra subscription state to Max")
    parser.add_argument("--apply", action="store_true", help="Write DB changes")
    parser.add_argument("--user-id", help="Only inspect/apply one user")
    args = parser.parse_args()

    rows = await collect(args.user_id)
    snapshot = _write_snapshot(rows)
    summary = _summarize(rows)
    logger.info("Ultra -> Max migration snapshot written: %s", snapshot)
    logger.info("Ultra -> Max migration summary: %s", summary)

    if not args.apply:
        logger.info("Dry-run only. Re-run with --apply to write DB changes.")
        await get_insforge_service().close()
        return 0

    updated = await apply(rows)
    logger.info("Ultra -> Max migration applied rows=%s", updated)
    await get_insforge_service().close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
