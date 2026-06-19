"""Reconcile Stripe-to-Stripe migrated subscriptions into Insforge.

Use after Stripe's Billing migration toolkit has produced live subscriptions
in the new Stripe account. The input CSV should map old subscription IDs to
new subscription IDs. Default mode is dry-run and writes a JSON report under
``backend/tmp/stripe-account-migration/``.

Example:
    cd backend
    source venv/bin/activate

    python scripts/reconcile_stripe_account_migration.py \
      --mapping tmp/stripe-account-migration/mapping.csv

    python scripts/reconcile_stripe_account_migration.py \
      --mapping tmp/stripe-account-migration/mapping.csv --apply
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import stripe  # noqa: E402

from app.core.config import FRONTEND_URL, STRIPE_MIGRATION_DESTINATION_SECRET_KEY, STRIPE_SECRET_KEY  # noqa: E402
from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger, setup_logging  # noqa: E402
from app.features.payment.service import (  # noqa: E402
    PRIMARY_STRIPE_ACCOUNT_REF,
    sync_subscription_from_stripe,
)
from scripts.export_stripe_account_migration import _source_api_key, validate_migration_key_modes  # noqa: E402

logger = get_logger(__name__)

ACTIVE_STATUSES = {"active", "trialing"}
REPORT_DIR = Path(__file__).resolve().parents[1] / "tmp" / "stripe-account-migration"


def _destination_api_key() -> str:
    return STRIPE_MIGRATION_DESTINATION_SECRET_KEY or STRIPE_SECRET_KEY


def _api_key_mode(api_key: str) -> str:
    if api_key.startswith(("sk_live_", "rk_live_")):
        return "live"
    if api_key.startswith(("sk_test_", "rk_test_")):
        return "test"
    return "unknown"


def validate_destination_key_mode(*, allow_test_mode: bool = False) -> None:
    destination_key = _destination_api_key()
    if not destination_key:
        raise RuntimeError("Destination Stripe API key is not configured")
    if not allow_test_mode and _api_key_mode(destination_key) != "live":
        raise RuntimeError(
            "Stripe account migration reconcile requires a live destination key; "
            "pass --allow-test-mode only for sandbox validation"
        )


@dataclass
class MappingRow:
    user_id: str | None
    old_subscription_id: str
    new_subscription_id: str
    expected_amount_cents: int | None
    schedule_id: str | None = None


@dataclass
class DiscoveredMapping:
    user_id: str | None
    old_subscription_id: str
    new_subscription_id: str
    expected_amount_cents: int | None
    status: str | None
    created: int | None


@dataclass
class DiscoveredSchedule:
    user_id: str | None
    old_subscription_id: str
    schedule_id: str
    new_subscription_id: str | None
    expected_amount_cents: int | None
    status: str | None
    created: int | None
    start_date: int | None


@dataclass
class ReconcileResult:
    user_id: str | None
    old_subscription_id: str
    new_subscription_id: str
    new_customer_id: str | None
    status: str | None
    plan: str | None
    amount_cents: int | None
    metadata_old_subscription_id: str | None
    metadata_user_id: str | None
    portal_verified: bool
    action: str
    ok: bool
    error: str | None = None
    source_cancel_scheduled: bool = False


def _first_present(row: dict[str, str], names: list[str]) -> str:
    for name in names:
        value = (row.get(name) or "").strip()
        if value:
            return value
    return ""


def _parse_optional_int(value: str) -> int | None:
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _read_mapping(path: Path) -> list[MappingRow]:
    rows: list[MappingRow] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            old_subscription_id = _first_present(raw, [
                "old_stripe_subscription_id",
                "old_Stripe_sub_id",
                "metadata.old_Stripe_sub_id",
                "metadata_old_Stripe_sub_id",
                "third_party_sub_id",
                "metadata.third_party_sub_id",
                "metadata_third_party_sub_id",
            ])
            new_subscription_id = _first_present(raw, [
                "new_stripe_subscription_id",
                "new_subscription_id",
                "stripe_subscription_id",
                "subscription",
                "id",
                "ID",
            ])
            if not old_subscription_id or not new_subscription_id:
                raise ValueError("mapping CSV requires old and new subscription IDs")
            rows.append(MappingRow(
                user_id=_first_present(raw, [
                    "user_id",
                    "metadata.user_id",
                    "metadata_user_id",
                ]) or None,
                old_subscription_id=old_subscription_id,
                new_subscription_id=new_subscription_id,
                expected_amount_cents=_parse_optional_int(
                    _first_present(raw, ["expected_amount_cents", "billing_amount_cents"])
                ),
                schedule_id=_first_present(raw, [
                    "schedule_id",
                    "subscription_schedule_id",
                    "stripe_subscription_schedule_id",
                ]) or None,
            ))
    return rows


async def _list_local_users() -> list[dict[str, Any]]:
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=120.0,
    )
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError("subscriptions list_all failed: %s" % payload)
    return payload.get("data") or []


def _index_local_users(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_subscription: dict[str, dict[str, Any]] = {}
    for row in rows:
        for key in ("legacy_stripe_subscription_id", "stripe_subscription_id"):
            sub_id = row.get(key)
            if sub_id:
                by_subscription[sub_id] = row
    return by_subscription


def _to_dict(obj):
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return obj


def _object_id(value: Any) -> str | None:
    value_d = _to_dict(value)
    if isinstance(value_d, str):
        return value_d
    if isinstance(value_d, dict):
        object_id = value_d.get("id")
        return str(object_id) if object_id else None
    return None


def _first_price(sub: dict[str, Any]) -> dict[str, Any]:
    items = _to_dict(sub.get("items")) or {}
    data = items.get("data") or []
    if not data:
        return {}
    item = _to_dict(data[0]) or {}
    return _to_dict(item.get("price")) or {}


def _price_amount_cents(price: dict[str, Any]) -> int | None:
    amount = price.get("unit_amount")
    if isinstance(amount, int):
        return amount
    if amount is None:
        return None
    try:
        return int(amount)
    except (TypeError, ValueError):
        return None


async def _retrieve_new_subscription(subscription_id: str) -> dict[str, Any]:
    sub = await asyncio.to_thread(
        stripe.Subscription.retrieve,
        subscription_id,
        expand=["items.data.price"],
        api_key=_destination_api_key(),
    )
    return _to_dict(sub) or {}


async def _retrieve_schedule(schedule_id: str) -> dict[str, Any]:
    schedule = await asyncio.to_thread(
        stripe.SubscriptionSchedule.retrieve,
        schedule_id,
        expand=["phases.items.price"],
        api_key=_destination_api_key(),
    )
    return _to_dict(schedule) or {}


async def _list_destination_pages(list_method, *, limit: int, **params) -> list[dict[str, Any]]:
    if limit <= 0:
        return []

    remaining = limit
    starting_after: str | None = None
    rows: list[dict[str, Any]] = []
    while remaining > 0:
        page_limit = min(100, remaining)
        kwargs = {
            **params,
            "limit": page_limit,
            "api_key": _destination_api_key(),
        }
        if starting_after:
            kwargs["starting_after"] = starting_after
        response = await asyncio.to_thread(list_method, **kwargs)
        response_d = _to_dict(response) or {}
        data = [_to_dict(item) or {} for item in response_d.get("data") or []]
        rows.extend(data)
        if not data or not response_d.get("has_more"):
            break
        remaining -= len(data)
        starting_after = data[-1].get("id")
        if not starting_after:
            break
    return rows


def _old_subscription_id_from_metadata(metadata: dict[str, Any]) -> str | None:
    return _metadata_value(metadata, [
        "old_Stripe_sub_id",
        "old_stripe_subscription_id",
        "third_party_sub_id",
    ])


async def discover_mapping(*, limit: int = 100) -> list[DiscoveredMapping]:
    """Discover imported destination subscriptions by migration metadata."""
    subscriptions = await _list_destination_pages(
        stripe.Subscription.list,
        limit=limit,
        status="all",
        expand=["data.items.data.price"],
    )
    discovered: list[DiscoveredMapping] = []
    seen_old: set[str] = set()
    for sub in subscriptions:
        sub_d = _to_dict(sub) or {}
        metadata = sub_d.get("metadata") or {}
        old_subscription_id = _old_subscription_id_from_metadata(metadata)
        if not old_subscription_id or old_subscription_id in seen_old:
            continue
        seen_old.add(old_subscription_id)
        discovered.append(DiscoveredMapping(
            user_id=_metadata_value(metadata, ["user_id"]),
            old_subscription_id=old_subscription_id,
            new_subscription_id=sub_d.get("id") or "",
            expected_amount_cents=_price_amount_cents(_first_price(sub_d)),
            status=sub_d.get("status"),
            created=sub_d.get("created") if isinstance(sub_d.get("created"), int) else None,
        ))
    return discovered


def _phase_metadata_candidates(schedule: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = [_to_dict(schedule.get("metadata")) or {}]
    for phase in schedule.get("phases") or []:
        phase_d = _to_dict(phase) or {}
        candidates.append(_to_dict(phase_d.get("metadata")) or {})
        for item in phase_d.get("items") or []:
            item_d = _to_dict(item) or {}
            candidates.append(_to_dict(item_d.get("metadata")) or {})
    return candidates


def _first_schedule_phase(schedule: dict[str, Any]) -> dict[str, Any]:
    phases = schedule.get("phases") or []
    if not phases:
        return {}
    return _to_dict(phases[0]) or {}


def _first_phase_price(phase: dict[str, Any]) -> dict[str, Any]:
    items = phase.get("items") or []
    if not items:
        return {}
    item = _to_dict(items[0]) or {}
    price = _to_dict(item.get("price")) or {}
    return price if isinstance(price, dict) else {}


def _metadata_from_candidates(candidates: list[dict[str, Any]], names: list[str]) -> str | None:
    for metadata in candidates:
        value = _metadata_value(metadata, names)
        if value:
            return value
    return None


async def _verify_schedule_mapping(
    row: MappingRow,
    *,
    user_id: str,
) -> tuple[bool, str | None, str | None]:
    if not row.schedule_id:
        return False, None, None

    schedule = await _retrieve_schedule(row.schedule_id)
    schedule_subscription_id = (
        _object_id(schedule.get("subscription"))
        or _object_id(schedule.get("released_subscription"))
    )
    if schedule_subscription_id != row.new_subscription_id:
        return False, None, None

    metadata_candidates = _phase_metadata_candidates(schedule)
    schedule_old_subscription_id = _metadata_from_candidates(
        metadata_candidates,
        [
            "old_Stripe_sub_id",
            "old_stripe_subscription_id",
            "third_party_sub_id",
        ],
    )
    schedule_user_id = _metadata_from_candidates(metadata_candidates, ["user_id"])
    if schedule_old_subscription_id != row.old_subscription_id:
        return False, schedule_old_subscription_id, schedule_user_id
    if schedule_user_id and schedule_user_id != user_id:
        return False, schedule_old_subscription_id, schedule_user_id

    return True, schedule_old_subscription_id, schedule_user_id


async def discover_schedules(*, limit: int = 100) -> list[DiscoveredSchedule]:
    """Discover scheduled toolkit imports before destination subscriptions go live."""
    schedules = await _list_destination_pages(
        stripe.SubscriptionSchedule.list,
        limit=limit,
        expand=["data.phases.items.price"],
    )
    discovered: list[DiscoveredSchedule] = []
    seen_old: set[str] = set()
    for schedule in schedules:
        schedule_d = _to_dict(schedule) or {}
        metadata_candidates = _phase_metadata_candidates(schedule_d)
        old_subscription_id = _metadata_from_candidates(
            metadata_candidates,
            [
                "old_Stripe_sub_id",
                "old_stripe_subscription_id",
                "third_party_sub_id",
            ],
        )
        if not old_subscription_id or old_subscription_id in seen_old:
            continue
        seen_old.add(old_subscription_id)
        phase = _first_schedule_phase(schedule_d)
        discovered.append(DiscoveredSchedule(
            user_id=_metadata_from_candidates(metadata_candidates, ["user_id"]),
            old_subscription_id=old_subscription_id,
            schedule_id=schedule_d.get("id") or "",
            new_subscription_id=(
                _object_id(schedule_d.get("subscription"))
                or _object_id(schedule_d.get("released_subscription"))
            ),
            expected_amount_cents=_price_amount_cents(_first_phase_price(phase)),
            status=schedule_d.get("status"),
            created=schedule_d.get("created") if isinstance(schedule_d.get("created"), int) else None,
            start_date=phase.get("start_date") if isinstance(phase.get("start_date"), int) else None,
        ))
    return discovered


async def _verify_portal(customer_id: str) -> bool:
    session = await asyncio.to_thread(
        stripe.billing_portal.Session.create,
        customer=customer_id,
        return_url=FRONTEND_URL,
        api_key=_destination_api_key(),
    )
    return bool(getattr(session, "url", None) or (_to_dict(session) or {}).get("url"))


async def _schedule_source_cancel_at_period_end(subscription_id: str, *, source_account: str) -> bool:
    sub = await asyncio.to_thread(
        stripe.Subscription.modify,
        subscription_id,
        cancel_at_period_end=True,
        api_key=_source_api_key(source_account),
    )
    sub_d = _to_dict(sub) or {}
    return bool(sub_d.get("cancel_at_period_end"))


def _metadata_value(metadata: dict[str, Any], names: list[str]) -> str | None:
    for name in names:
        value = metadata.get(name)
        if value:
            return str(value)
    return None


async def reconcile(
    mapping_path: Path,
    *,
    apply: bool = False,
    verify_portal: bool = False,
    strict_metadata: bool = False,
    cancel_source_at_period_end: bool = False,
    source_account: str = "legacy",
) -> list[ReconcileResult]:
    local_by_sub = _index_local_users(await _list_local_users())
    results: list[ReconcileResult] = []
    migrated_at = datetime.now(timezone.utc).isoformat()

    for row in _read_mapping(mapping_path):
        local = local_by_sub.get(row.old_subscription_id) or {}
        user_id = row.user_id or local.get("user_id")
        result = ReconcileResult(
            user_id=user_id,
            old_subscription_id=row.old_subscription_id,
            new_subscription_id=row.new_subscription_id,
            new_customer_id=None,
            status=None,
            plan=None,
            amount_cents=None,
            metadata_old_subscription_id=None,
            metadata_user_id=None,
            portal_verified=False,
            action="dry_run",
            ok=False,
        )

        try:
            if not user_id:
                raise ValueError("Unable to resolve user_id for old subscription")

            stripe_sub = await _retrieve_new_subscription(row.new_subscription_id)
            metadata = stripe_sub.get("metadata") or {}
            result.status = stripe_sub.get("status")
            result.new_customer_id = stripe_sub.get("customer")
            result.metadata_old_subscription_id = _metadata_value(metadata, [
                "old_Stripe_sub_id",
                "old_stripe_subscription_id",
                "third_party_sub_id",
            ])
            result.metadata_user_id = _metadata_value(metadata, ["user_id"])

            price = _first_price(stripe_sub)
            result.amount_cents = _price_amount_cents(price)
            result.plan = (metadata.get("tier") or metadata.get("product") or None)

            if result.status not in ACTIVE_STATUSES:
                raise ValueError("New subscription is not active/trialing")
            if row.expected_amount_cents is not None and result.amount_cents != row.expected_amount_cents:
                raise ValueError("Migrated price amount does not match expected amount")
            if strict_metadata:
                metadata_matches = result.metadata_old_subscription_id == row.old_subscription_id
                metadata_user_matches = not result.metadata_user_id or result.metadata_user_id == user_id
                if not metadata_matches or not metadata_user_matches:
                    schedule_matches, schedule_old_subscription_id, schedule_user_id = (
                        await _verify_schedule_mapping(row, user_id=user_id)
                    )
                    if schedule_matches:
                        result.metadata_old_subscription_id = schedule_old_subscription_id
                        result.metadata_user_id = schedule_user_id
                    elif not metadata_matches:
                        raise ValueError("New subscription metadata does not match old subscription id")
                    else:
                        raise ValueError("New subscription metadata user_id does not match local user")

            if verify_portal and result.new_customer_id:
                result.portal_verified = await _verify_portal(result.new_customer_id)

            if apply:
                await sync_subscription_from_stripe(
                    user_id,
                    customer_id=result.new_customer_id,
                    subscription_id=row.new_subscription_id,
                    stripe_subscription=stripe_sub,
                    stripe_account_ref=PRIMARY_STRIPE_ACCOUNT_REF,
                    legacy_stripe_customer_id=local.get("stripe_customer_id"),
                    legacy_stripe_subscription_id=row.old_subscription_id,
                    stripe_migration_state="reconciled",
                    stripe_migrated_at=migrated_at,
                    source="stripe-account-migration.reconcile",
                )
                if cancel_source_at_period_end:
                    result.source_cancel_scheduled = await _schedule_source_cancel_at_period_end(
                        row.old_subscription_id,
                        source_account=source_account,
                    )
                result.action = "applied"
            result.ok = True
        except Exception as e:  # noqa: BLE001
            result.error = str(e)
            logger.warning(
                "migration reconcile failed old_sub=%s new_sub=%s: %s",
                row.old_subscription_id,
                row.new_subscription_id,
                e,
            )

        results.append(result)

    return results


def _write_report(results: list[ReconcileResult]) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / (
        "reconcile-%s.json" % datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    )
    path.write_text(
        json.dumps([asdict(result) for result in results], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


def _write_discovered_mapping(rows: list[DiscoveredMapping], output: Path | None = None) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = output or (
        REPORT_DIR / (
            "discovered-mapping-%s.csv" % datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        )
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "user_id",
                "old_stripe_subscription_id",
                "new_stripe_subscription_id",
                "expected_amount_cents",
                "status",
                "created",
            ],
        )
        writer.writeheader()
        writer.writerows([asdict(row) for row in rows])
    return path


def _write_discovered_schedules(rows: list[DiscoveredSchedule], output: Path | None = None) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = output or (
        REPORT_DIR / (
            "discovered-schedules-%s.csv" % datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        )
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "user_id",
                "old_stripe_subscription_id",
                "schedule_id",
                "new_stripe_subscription_id",
                "expected_amount_cents",
                "status",
                "created",
                "start_date",
            ],
        )
        writer.writeheader()
        writer.writerows([asdict(row) for row in rows])
    return path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mapping", type=Path)
    parser.add_argument("--discover-mapping", action="store_true")
    parser.add_argument("--discover-schedules", action="store_true")
    parser.add_argument("--discover-limit", type=int, default=500)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--verify-portal", action="store_true")
    parser.add_argument("--strict-metadata", action="store_true")
    parser.add_argument("--cancel-source-at-period-end", action="store_true")
    parser.add_argument("--source-account", choices=["legacy", "primary"], default="legacy")
    parser.add_argument("--allow-test-mode", action="store_true", help="Allow test-mode Stripe keys for sandbox validation")
    return parser.parse_args()


async def main() -> None:
    setup_logging()
    args = _parse_args()
    if args.cancel_source_at_period_end:
        validate_migration_key_modes(
            source_account=args.source_account,
            allow_test_mode=args.allow_test_mode,
        )
    else:
        validate_destination_key_mode(allow_test_mode=args.allow_test_mode)
    if args.discover_schedules:
        rows = await discover_schedules(limit=args.discover_limit)
        path = _write_discovered_schedules(rows, args.output)
        logger.info(
            "stripe account migration discovered schedules: rows=%s output=%s",
            len(rows),
            path,
        )
        await get_insforge_service().close()
        return
    if args.discover_mapping:
        rows = await discover_mapping(limit=args.discover_limit)
        path = _write_discovered_mapping(rows, args.output)
        logger.info(
            "stripe account migration discovered mapping: rows=%s output=%s",
            len(rows),
            path,
        )
        await get_insforge_service().close()
        return
    if not args.mapping:
        raise SystemExit("--mapping is required unless --discover-mapping is used")
    results = await reconcile(
        args.mapping,
        apply=args.apply,
        verify_portal=args.verify_portal,
        strict_metadata=args.strict_metadata,
        cancel_source_at_period_end=args.cancel_source_at_period_end,
        source_account=args.source_account,
    )
    report = _write_report(results)
    ok_count = sum(1 for result in results if result.ok)
    logger.info(
        "stripe account migration reconcile complete: ok=%s total=%s report=%s apply=%s",
        ok_count,
        len(results),
        report,
        args.apply,
    )
    if ok_count != len(results):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
