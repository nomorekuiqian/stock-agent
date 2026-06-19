"""Repair local subscription rows found during Stripe account migration.

Default mode is dry-run. The script classifies local active Stripe rows against
the source and destination Stripe accounts, then proposes local DB fixups for:

- source subscription inactive/canceled: mark local row as free/canceled
- subscription already active in destination: sync local row to destination ids

It does not copy payment methods or create subscriptions.
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

from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger, setup_logging  # noqa: E402
from app.features.payment.db import upsert_subscription  # noqa: E402
from app.features.payment.service import (  # noqa: E402
    PRIMARY_STRIPE_ACCOUNT_REF,
    _canonical_features_for_plan,
    _extract_subscription_billing_fields,
    _get_subscription_cancellation,
    _get_subscription_period,
    _to_dict,
)
from scripts.export_stripe_account_migration import (  # noqa: E402
    ACTIVE_STATUSES,
    REPORT_DIR,
    _customer_id,
    _list_local_users,
    _source_api_key,
    validate_migration_key_modes,
)
from scripts.preflight_stripe_account_migration import (  # noqa: E402
    _active_stripe_rows,
    _classify_candidate_accounts,
    _retrieve_subscription_with_key,
)

logger = get_logger(__name__)


@dataclass
class LocalRepairResult:
    user_id: str
    email: str | None
    action: str
    ok: bool
    applied: bool
    local_subscription_id: str | None
    destination_subscription_id: str | None = None
    destination_customer_id: str | None = None
    stripe_status: str | None = None
    plan: str | None = None
    error: str | None = None


def _destination_api_key() -> str:
    from scripts.export_stripe_account_migration import _destination_api_key as key

    return key()


async def _list_destination_active_subscriptions_by_email(email: str | None) -> list[dict[str, Any]]:
    if not email:
        return []
    customers = await asyncio.to_thread(
        stripe.Customer.list,
        email=email,
        limit=10,
        api_key=_destination_api_key(),
    )
    active: list[dict[str, Any]] = []
    for customer in ((_to_dict(customers) or {}).get("data") or []):
        customer_id = customer.get("id")
        if not customer_id:
            continue
        subs = await asyncio.to_thread(
            stripe.Subscription.list,
            customer=customer_id,
            status="all",
            limit=10,
            expand=["data.items.data.price"],
            api_key=_destination_api_key(),
        )
        for sub in ((_to_dict(subs) or {}).get("data") or []):
            sub_d = _to_dict(sub) or {}
            if sub_d.get("status") in ACTIVE_STATUSES:
                active.append(sub_d)
    return active


async def _apply_destination_sync(
    row: dict[str, Any],
    *,
    destination_subscription: dict[str, Any],
    migration_state: str,
    legacy_from_current: bool = False,
) -> bool:
    user_id = row.get("user_id")
    if not user_id:
        return False

    status = destination_subscription.get("status") or "active"
    plan = row.get("plan") if row.get("plan") in {"pro", "max"} else "max"
    period_start, period_end = _get_subscription_period(destination_subscription)
    cancel_at_period_end, cancel_at, canceled_at = _get_subscription_cancellation(destination_subscription)
    billing_fields = _extract_subscription_billing_fields(destination_subscription)
    customer_id = _customer_id(destination_subscription.get("customer"))
    subscription_id = destination_subscription.get("id")
    legacy_customer_id = row.get("legacy_stripe_customer_id")
    legacy_subscription_id = row.get("legacy_stripe_subscription_id")
    if legacy_from_current:
        legacy_customer_id = legacy_customer_id or row.get("stripe_customer_id")
        legacy_subscription_id = legacy_subscription_id or row.get("stripe_subscription_id")

    return await upsert_subscription(
        user_id=user_id,
        stripe_customer_id=customer_id,
        stripe_subscription_id=subscription_id,
        plan=plan,
        status=status,
        current_period_start=period_start,
        current_period_end=period_end,
        cancel_at_period_end=cancel_at_period_end,
        cancel_at=cancel_at,
        canceled_at=canceled_at,
        clear_cancel_at=cancel_at is None,
        clear_canceled_at=canceled_at is None,
        stripe_account_ref=PRIMARY_STRIPE_ACCOUNT_REF,
        legacy_stripe_customer_id=legacy_customer_id,
        legacy_stripe_subscription_id=legacy_subscription_id,
        stripe_migration_state=migration_state,
        stripe_migrated_at=datetime.now(timezone.utc).isoformat(),
        entitlements=_canonical_features_for_plan(plan) if status in ACTIVE_STATUSES else [],
        clear_access_expires_at=True,
        **billing_fields,
    )


async def _apply_mark_canceled(row: dict[str, Any], *, migration_state: str) -> bool:
    user_id = row.get("user_id")
    if not user_id:
        return False
    return await upsert_subscription(
        user_id=user_id,
        plan="free",
        status="canceled",
        entitlements=[],
        stripe_account_ref=row.get("stripe_account_ref") or "legacy_2026",
        legacy_stripe_customer_id=row.get("legacy_stripe_customer_id") or row.get("stripe_customer_id"),
        legacy_stripe_subscription_id=row.get("legacy_stripe_subscription_id") or row.get("stripe_subscription_id"),
        stripe_migration_state=migration_state,
        stripe_migrated_at=datetime.now(timezone.utc).isoformat(),
        clear_cancellation=True,
        clear_access_expires_at=True,
    )


async def repair_local_state(*, apply: bool = False, source_account: str = "legacy") -> list[LocalRepairResult]:
    source_key = _source_api_key(source_account)
    destination_key = _destination_api_key()
    rows = await _list_local_users()
    rows_by_user = {row.get("user_id"): row for row in rows if row.get("user_id")}
    candidates = _active_stripe_rows(rows, None)
    account_classes = await _classify_candidate_accounts(
        candidates,
        source_key=source_key,
        destination_key=destination_key,
    )

    results: list[LocalRepairResult] = []

    for row in account_classes["already_destination"]:
        user_id = row.get("user_id") or ""
        subscription_id = row.get("legacy_stripe_subscription_id") or row.get("stripe_subscription_id")
        result = LocalRepairResult(
            user_id=user_id,
            email=row.get("email"),
            action="sync_destination_subscription",
            ok=False,
            applied=False,
            local_subscription_id=subscription_id,
        )
        try:
            if not subscription_id:
                raise ValueError("missing subscription id")
            destination_sub = await _retrieve_subscription_with_key(subscription_id, destination_key)
            result.destination_subscription_id = destination_sub.get("id")
            result.destination_customer_id = _customer_id(destination_sub.get("customer"))
            result.stripe_status = destination_sub.get("status")
            result.plan = row.get("plan")
            result.ok = True
            if apply:
                result.applied = await _apply_destination_sync(
                    row,
                    destination_subscription=destination_sub,
                    migration_state="already_destination",
                    legacy_from_current=False,
                )
                result.ok = result.applied
        except Exception as e:  # noqa: BLE001
            result.error = str(e)
        results.append(result)

    for inactive in account_classes["source_inactive"]:
        user_id = inactive.get("user_id") or ""
        row = rows_by_user.get(user_id) or {}
        result = LocalRepairResult(
            user_id=user_id,
            email=row.get("email"),
            action="mark_canceled",
            ok=False,
            applied=False,
            local_subscription_id=inactive.get("source_subscription_id"),
            stripe_status=inactive.get("status"),
            plan=row.get("plan"),
        )
        try:
            destination_active = await _list_destination_active_subscriptions_by_email(row.get("email"))
            if destination_active:
                result.action = "sync_destination_by_email"
                destination_sub = destination_active[0]
                result.destination_subscription_id = destination_sub.get("id")
                result.destination_customer_id = _customer_id(destination_sub.get("customer"))
                result.stripe_status = destination_sub.get("status")
                result.ok = True
                if apply:
                    result.applied = await _apply_destination_sync(
                        row,
                        destination_subscription=destination_sub,
                        migration_state="destination_active_by_email",
                        legacy_from_current=True,
                    )
                    result.ok = result.applied
            else:
                result.ok = True
                if apply:
                    result.applied = await _apply_mark_canceled(
                        row,
                        migration_state="source_inactive",
                    )
                    result.ok = result.applied
        except Exception as e:  # noqa: BLE001
            result.error = str(e)
        results.append(result)

    return results


def _write_report(results: list[LocalRepairResult]) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / (
        "local-state-repair-%s.json" % datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    )
    path.write_text(
        json.dumps([asdict(result) for result in results], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Repair local subscription state during Stripe account migration")
    parser.add_argument("--source-account", choices=["legacy", "primary"], default="legacy")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--allow-test-mode", action="store_true")
    return parser.parse_args()


async def main() -> int:
    setup_logging()
    args = _parse_args()
    validate_migration_key_modes(
        source_account=args.source_account,
        allow_test_mode=args.allow_test_mode,
    )
    results = await repair_local_state(apply=args.apply, source_account=args.source_account)
    report_path = _write_report(results)
    summary = {
        "rows": len(results),
        "ok": sum(1 for result in results if result.ok),
        "applied": sum(1 for result in results if result.applied),
        "actions": sorted({result.action for result in results}),
    }
    logger.info(
        "stripe migration local state repair complete: apply=%s summary=%s report=%s",
        args.apply,
        summary,
        report_path,
    )
    await get_insforge_service().close()
    return 0 if all(result.ok for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
