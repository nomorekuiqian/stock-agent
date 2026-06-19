"""Read-only preflight checks for Stripe account migration.

Run this before generating the Billing migration toolkit CSV. It verifies that
the local subscription inventory, customer mapping, destination Stripe product,
and source-account Stripe access are ready enough to proceed.

Example:
    cd backend
    source venv/bin/activate

    python scripts/preflight_stripe_account_migration.py \
      --customer-map tmp/stripe-account-migration/customer-map.csv
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import stripe  # noqa: E402

from app.core.config import INSFORGE_BASE_URL  # noqa: E402
from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger, setup_logging  # noqa: E402
from scripts.export_stripe_account_migration import (  # noqa: E402
    ACTIVE_STATUSES,
    REPORT_DIR,
    _customer_id,
    _destination_api_key,
    _epoch,
    _list_local_users,
    _object_id,
    _read_customer_map,
    _retrieve_source_subscription,
    _source_api_key,
    _subscription_period,
    _to_dict,
    resolve_destination_product_ids,
    validate_migration_key_modes,
)

logger = get_logger(__name__)

MIGRATION_FIELDS = {
    "stripe_account_ref",
    "legacy_stripe_customer_id",
    "legacy_stripe_subscription_id",
    "stripe_migration_state",
    "stripe_migrated_at",
    "stripe_price_id",
    "billing_amount_cents",
    "billing_currency",
    "billing_interval",
    "billing_interval_count",
}
DESTINATION_READY_MIGRATION_STATES = {"already_destination", "destination_active_by_email"}


@dataclass
class PreflightCheck:
    name: str
    ok: bool
    detail: str
    severity: str = "error"
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class PreflightReport:
    ok: bool
    summary: dict[str, Any]
    checks: list[PreflightCheck]


def _active_stripe_rows(rows: list[dict[str, Any]], user_id_filter: str | None) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for row in rows:
        user_id = row.get("user_id")
        if user_id_filter and user_id != user_id_filter:
            continue
        if row.get("is_lifetime") or row.get("access_expires_at"):
            continue
        if row.get("stripe_migration_state") in DESTINATION_READY_MIGRATION_STATES:
            continue
        if row.get("status") not in ACTIVE_STATUSES:
            continue
        if not row.get("stripe_subscription_id"):
            continue
        candidates.append(row)
    return candidates


def _source_customer_id(row: dict[str, Any]) -> str | None:
    return row.get("legacy_stripe_customer_id") or row.get("stripe_customer_id")


def _source_subscription_id(row: dict[str, Any]) -> str | None:
    return row.get("legacy_stripe_subscription_id") or row.get("stripe_subscription_id")


def _is_missing_subscription_error(exc: stripe.InvalidRequestError) -> bool:
    return "No such subscription" in str(exc) or getattr(exc, "code", None) == "resource_missing"


async def _retrieve_subscription_with_key(subscription_id: str, api_key: str) -> dict[str, Any]:
    sub = await asyncio.to_thread(
        stripe.Subscription.retrieve,
        subscription_id,
        expand=["items.data.price"],
        api_key=api_key,
    )
    return sub.to_dict() if hasattr(sub, "to_dict") else sub


async def _classify_candidate_accounts(
    candidates: list[dict[str, Any]],
    *,
    source_key: str,
    destination_key: str,
) -> dict[str, Any]:
    source_active: list[dict[str, Any]] = []
    already_destination: list[dict[str, Any]] = []
    source_cancel_at_period_end: list[dict[str, str]] = []
    source_inactive: list[dict[str, str]] = []
    unknown: list[dict[str, str]] = []
    lookup_errors: list[dict[str, str]] = []

    for row in candidates:
        subscription_id = _source_subscription_id(row)
        if not subscription_id:
            continue

        try:
            source_sub = await _retrieve_subscription_with_key(subscription_id, source_key)
            source_status = str(source_sub.get("status") or "")
            if source_status in ACTIVE_STATUSES:
                source_active.append(row)
                if source_sub.get("cancel_at_period_end"):
                    source_cancel_at_period_end.append({
                        "user_id": str(row.get("user_id") or ""),
                        "source_subscription_id": subscription_id,
                    })
            else:
                source_inactive.append({
                    "user_id": str(row.get("user_id") or ""),
                    "source_subscription_id": subscription_id,
                    "status": source_status,
                })
            continue
        except stripe.InvalidRequestError as exc:
            if not _is_missing_subscription_error(exc):
                lookup_errors.append({
                    "user_id": str(row.get("user_id") or ""),
                    "source_subscription_id": subscription_id,
                    "account": "source",
                    "error": str(exc),
                })
                continue

        try:
            destination_sub = await _retrieve_subscription_with_key(subscription_id, destination_key)
            destination_status = str(destination_sub.get("status") or "")
            if destination_status in ACTIVE_STATUSES:
                already_destination.append(row)
            else:
                unknown.append({
                    "user_id": str(row.get("user_id") or ""),
                    "source_subscription_id": subscription_id,
                    "destination_status": destination_status,
                })
        except stripe.InvalidRequestError as exc:
            if _is_missing_subscription_error(exc):
                unknown.append({
                    "user_id": str(row.get("user_id") or ""),
                    "source_subscription_id": subscription_id,
                    "destination_status": "missing",
                })
            else:
                lookup_errors.append({
                    "user_id": str(row.get("user_id") or ""),
                    "source_subscription_id": subscription_id,
                    "account": "destination",
                    "error": str(exc),
                })

    return {
        "source_active": source_active,
        "already_destination": already_destination,
        "source_cancel_at_period_end": source_cancel_at_period_end,
        "source_inactive": source_inactive,
        "unknown": unknown,
        "lookup_errors": lookup_errors,
    }


async def _verify_destination_product(product_id: str) -> tuple[bool, dict[str, Any]]:
    try:
        product = await asyncio.to_thread(
            stripe.Product.retrieve,
            product_id,
            api_key=_destination_api_key(),
        )
    except Exception as e:  # noqa: BLE001
        return False, {"error": str(e)}

    product_d = product.to_dict() if hasattr(product, "to_dict") else product
    return bool(product_d.get("id") == product_id), {
        "id": product_d.get("id"),
        "active": product_d.get("active"),
        "name": product_d.get("name"),
    }


async def _retrieve_destination_customer(customer_id: str) -> dict[str, Any]:
    customer = await asyncio.to_thread(
        stripe.Customer.retrieve,
        customer_id,
        expand=["invoice_settings.default_payment_method", "default_source"],
        api_key=_destination_api_key(),
    )
    return _to_dict(customer) or {}


def _customer_has_default_payment_method(customer: dict[str, Any]) -> bool:
    invoice_settings = _to_dict(customer.get("invoice_settings")) or {}
    return bool(
        _object_id(invoice_settings.get("default_payment_method"))
        or _object_id(customer.get("default_source"))
    )


async def _verify_destination_customers_payment_ready(
    rows: list[dict[str, Any]],
    *,
    customer_map: dict[str, str],
    assume_customer_ids_preserved: bool,
) -> dict[str, Any]:
    checked = 0
    ready = 0
    missing_default: list[dict[str, str]] = []
    lookup_errors: list[dict[str, str]] = []
    seen: set[str] = set()

    for row in rows:
        source_customer_id = _source_customer_id(row)
        if not source_customer_id:
            continue
        destination_customer_id = customer_map.get(source_customer_id) or (
            source_customer_id if assume_customer_ids_preserved else None
        )
        if not destination_customer_id or destination_customer_id in seen:
            continue
        seen.add(destination_customer_id)
        checked += 1

        try:
            customer = await _retrieve_destination_customer(destination_customer_id)
        except Exception as e:  # noqa: BLE001
            lookup_errors.append({
                "user_id": str(row.get("user_id") or ""),
                "destination_customer_id": destination_customer_id,
                "error": str(e),
            })
            continue

        if _customer_has_default_payment_method(customer):
            ready += 1
        else:
            missing_default.append({
                "user_id": str(row.get("user_id") or ""),
                "destination_customer_id": destination_customer_id,
            })

    return {
        "checked": checked,
        "ready": ready,
        "missing_default_count": len(missing_default),
        "missing_default_sample": missing_default[:20],
        "lookup_error_count": len(lookup_errors),
        "lookup_error_sample": lookup_errors[:20],
    }


async def _sample_source_subscriptions(
    rows: list[dict[str, Any]],
    *,
    api_key: str,
    sample_limit: int,
    min_start_hours: int,
) -> tuple[int, list[dict[str, str]]]:
    errors: list[dict[str, str]] = []
    checked = 0
    min_period_end = int((datetime.now(timezone.utc) + timedelta(hours=min_start_hours)).timestamp())

    for row in rows[:sample_limit]:
        checked += 1
        source_subscription_id = _source_subscription_id(row)
        source_customer_id = _source_customer_id(row)
        try:
            if not source_subscription_id or not source_customer_id:
                raise ValueError("Missing source subscription/customer")
            stripe_sub = await _retrieve_source_subscription(source_subscription_id, api_key)
            stripe_customer_id = _customer_id(stripe_sub.get("customer"))
            if stripe_customer_id and stripe_customer_id != source_customer_id:
                raise ValueError("Source subscription customer does not match local row")
            if stripe_sub.get("status") not in ACTIVE_STATUSES:
                raise ValueError("Source subscription is not active/trialing")
            _, current_period_end = _subscription_period(stripe_sub)
            if not current_period_end or current_period_end <= min_period_end:
                raise ValueError("Source subscription renewal is too close for migration buffer")
        except Exception as e:  # noqa: BLE001
            errors.append({
                "user_id": str(row.get("user_id") or ""),
                "source_subscription_id": str(source_subscription_id or ""),
                "error": str(e),
            })
    return checked, errors


async def run_preflight(
    *,
    customer_map_path: Path | None,
    adhoc_product_id: str,
    adhoc_product_ids: dict[str, str] | None = None,
    source_account: str = "legacy",
    user_id_filter: str | None = None,
    assume_customer_ids_preserved: bool = False,
    sample_limit: int = 3,
    min_start_hours: int = 25,
) -> PreflightReport:
    checks: list[PreflightCheck] = []

    destination_key_ok = bool(_destination_api_key())
    source_key = ""
    source_key_error = None
    try:
        source_key = _source_api_key(source_account)
    except Exception as e:  # noqa: BLE001
        source_key_error = str(e)
    source_key_ok = bool(source_key)

    checks.append(PreflightCheck(
        name="destination_stripe_key",
        ok=destination_key_ok,
        detail=(
            "destination Stripe key configured"
            if destination_key_ok
            else "destination Stripe key missing"
        ),
    ))
    checks.append(PreflightCheck(
        name="source_stripe_key",
        ok=source_key_ok,
        detail="source Stripe key configured" if source_key_ok else (source_key_error or "source Stripe key missing"),
    ))
    checks.append(PreflightCheck(
        name="insforge_base_url",
        ok=bool(INSFORGE_BASE_URL),
        detail="INSFORGE_BASE_URL configured" if INSFORGE_BASE_URL else "INSFORGE_BASE_URL missing",
    ))

    rows: list[dict[str, Any]] = []
    try:
        rows = await _list_local_users()
        checks.append(PreflightCheck(
            name="subscription_inventory",
            ok=True,
            detail="list_all returned %s rows" % len(rows),
            data={"rows": len(rows)},
        ))
    except Exception as e:  # noqa: BLE001
        checks.append(PreflightCheck(
            name="subscription_inventory",
            ok=False,
            detail="list_all failed",
            data={"error": str(e)},
        ))

    missing_fields = sorted(MIGRATION_FIELDS - set(rows[0].keys())) if rows else []
    checks.append(PreflightCheck(
        name="subscription_migration_fields",
        ok=not missing_fields,
        detail="migration fields present" if not missing_fields else "migration fields missing from list_all",
        severity="warning" if not rows else "error",
        data={"missing_fields": missing_fields},
    ))

    candidates = _active_stripe_rows(rows, user_id_filter)
    checks.append(PreflightCheck(
        name="active_stripe_candidates",
        ok=bool(candidates),
        detail="found %s active Stripe subscription candidates" % len(candidates),
        data={"count": len(candidates)},
    ))

    account_classes = {
        "source_active": candidates,
        "already_destination": [],
        "source_cancel_at_period_end": [],
        "source_inactive": [],
        "unknown": [],
        "lookup_errors": [],
    }
    if source_key_ok and destination_key_ok and candidates:
        account_classes = await _classify_candidate_accounts(
            candidates,
            source_key=source_key,
            destination_key=_destination_api_key(),
        )
        checks.append(PreflightCheck(
            name="candidate_account_classification",
            ok=not account_classes["lookup_errors"] and not account_classes["unknown"],
            detail="classified active local Stripe candidates by owning account",
            data={
                "source_active": len(account_classes["source_active"]),
                "already_destination": len(account_classes["already_destination"]),
                "source_cancel_at_period_end": len(account_classes.get("source_cancel_at_period_end") or []),
                "source_inactive": len(account_classes["source_inactive"]),
                "unknown": account_classes["unknown"][:20],
                "lookup_errors": account_classes["lookup_errors"][:20],
            },
        ))
        if account_classes.get("source_cancel_at_period_end"):
            checks.append(PreflightCheck(
                name="source_cancel_at_period_end_candidates",
                ok=False,
                severity="warning",
                detail="source active subscriptions are scheduled to cancel at period end",
                data={"rows": account_classes["source_cancel_at_period_end"][:20]},
            ))
        if account_classes["source_inactive"]:
            checks.append(PreflightCheck(
                name="source_inactive_local_candidates",
                ok=False,
                severity="warning",
                detail="local active rows are inactive in the source Stripe account",
                data={"rows": account_classes["source_inactive"][:20]},
            ))
        if account_classes["already_destination"]:
            checks.append(PreflightCheck(
                name="already_destination_candidates",
                ok=False,
                severity="warning",
                detail="local active rows already exist in the destination Stripe account",
                data={"count": len(account_classes["already_destination"])},
            ))

    customer_map = _read_customer_map(customer_map_path)
    source_active_candidates = account_classes["source_active"]
    missing_customer_ids = sorted({
        source_customer_id
        for row in source_active_candidates
        for source_customer_id in [_source_customer_id(row)]
        if source_customer_id
        and not assume_customer_ids_preserved
        and source_customer_id not in customer_map
    })
    checks.append(PreflightCheck(
        name="customer_mapping",
        ok=assume_customer_ids_preserved or not missing_customer_ids,
        detail=(
            "customer IDs assumed preserved"
            if assume_customer_ids_preserved
            else "customer map covers active candidates"
        ) if not missing_customer_ids else "customer map missing active candidates",
        data={
            "mapped_customers": len(customer_map),
            "missing_customer_count": len(missing_customer_ids),
            "missing_customer_sample": missing_customer_ids[:20],
        },
    ))

    if destination_key_ok:
        product_ids = adhoc_product_ids or {"max": adhoc_product_id}
        product_results: dict[str, Any] = {}
        product_ok = True
        for tier, product_id in product_ids.items():
            tier_ok, product_data = await _verify_destination_product(product_id)
            product_ok = product_ok and tier_ok
            product_results[tier] = product_data
        checks.append(PreflightCheck(
            name="destination_adhoc_products",
            ok=product_ok,
            detail="destination products found" if product_ok else "destination product lookup failed",
            data=product_results,
        ))

    if destination_key_ok and source_active_candidates:
        customer_payment = await _verify_destination_customers_payment_ready(
            source_active_candidates,
            customer_map=customer_map,
            assume_customer_ids_preserved=assume_customer_ids_preserved,
        )
        checks.append(PreflightCheck(
            name="destination_customer_payment_methods",
            ok=(
                customer_payment["missing_default_count"] == 0
                and customer_payment["lookup_error_count"] == 0
            ),
            detail="destination customers have default payment methods",
            data=customer_payment,
        ))

    if source_key_ok and source_active_candidates:
        checked, sample_errors = await _sample_source_subscriptions(
            source_active_candidates,
            api_key=source_key,
            sample_limit=max(0, sample_limit),
            min_start_hours=min_start_hours,
        )
        checks.append(PreflightCheck(
            name="source_subscription_sample",
            ok=not sample_errors,
            detail="sampled %s source subscriptions" % checked,
            data={"checked": checked, "errors": sample_errors},
        ))

    hard_failures = [check for check in checks if not check.ok and check.severity == "error"]
    summary = {
        "local_rows": len(rows),
        "candidate_rows": len(candidates),
        "source_active_candidate_rows": len(source_active_candidates),
        "already_destination_rows": len(account_classes["already_destination"]),
        "source_cancel_at_period_end_rows": len(account_classes.get("source_cancel_at_period_end") or []),
        "source_inactive_rows": len(account_classes["source_inactive"]),
        "customer_map_rows": len(customer_map),
        "hard_failures": len(hard_failures),
        "warnings": sum(1 for check in checks if not check.ok and check.severity == "warning"),
    }
    return PreflightReport(
        ok=not hard_failures,
        summary=summary,
        checks=checks,
    )


def _write_report(report: PreflightReport) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / (
        "preflight-%s.json" % datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    )
    path.write_text(
        json.dumps(asdict(report), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preflight Stripe account migration")
    parser.add_argument("--customer-map", type=Path, help="CSV mapping old/source customer IDs to destination IDs")
    parser.add_argument("--adhoc-product-id", help="Destination Stripe Product ID for ad-hoc migrated prices")
    parser.add_argument("--source-account", choices=["legacy", "primary"], default="legacy")
    parser.add_argument("--user-id", help="Only inspect one user")
    parser.add_argument("--assume-customer-ids-preserved", action="store_true")
    parser.add_argument("--sample-limit", type=int, default=3)
    parser.add_argument("--min-start-hours", type=int, default=25)
    parser.add_argument("--allow-errors", action="store_true", help="Exit 0 even if hard checks fail")
    parser.add_argument("--allow-test-mode", action="store_true", help="Allow test-mode Stripe keys for sandbox validation")
    return parser.parse_args()


async def main() -> int:
    setup_logging()
    args = _parse_args()
    validate_migration_key_modes(
        source_account=args.source_account,
        allow_test_mode=args.allow_test_mode,
    )
    adhoc_product_ids = await resolve_destination_product_ids(args.adhoc_product_id)
    adhoc_product_id = adhoc_product_ids["max"]
    report = await run_preflight(
        customer_map_path=args.customer_map,
        adhoc_product_id=adhoc_product_id,
        adhoc_product_ids=adhoc_product_ids,
        source_account=args.source_account,
        user_id_filter=args.user_id,
        assume_customer_ids_preserved=args.assume_customer_ids_preserved,
        sample_limit=args.sample_limit,
        min_start_hours=args.min_start_hours,
    )
    report_path = _write_report(report)
    logger.info(
        "stripe account migration preflight complete: ok=%s summary=%s report=%s",
        report.ok,
        report.summary,
        report_path,
    )
    await get_insforge_service().close()
    if not report.ok and not args.allow_errors:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
