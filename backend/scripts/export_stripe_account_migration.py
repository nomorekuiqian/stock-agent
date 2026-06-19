"""Export a Stripe Billing migration-toolkit CSV for account migration.

This script prepares the *pre-migration* CSV that Stripe's Billing migration
toolkit uploads into the destination account. It is read-only: it lists local
active Stripe subscriptions, retrieves the source-account subscriptions, maps
source customers to destination customers, and writes:

- a toolkit CSV under ``backend/tmp/stripe-account-migration/``
- a JSON report with skipped/error rows next to it

Use ``reconcile_stripe_account_migration.py`` after the toolkit has created
live destination subscriptions.

Example:
    cd backend
    source venv/bin/activate

    python scripts/export_stripe_account_migration.py \
      --customer-map tmp/stripe-account-migration/customer-map.csv
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import stripe  # noqa: E402

from app.core.config import (  # noqa: E402
    STRIPE_MIGRATION_DESTINATION_MAX_PRICE_ID,
    STRIPE_MIGRATION_DESTINATION_PRO_PRICE_ID,
    STRIPE_MIGRATION_DESTINATION_SECRET_KEY,
    STRIPE_MIGRATION_SOURCE_SECRET_KEY,
    STRIPE_LEGACY_SECRET_KEY,
    STRIPE_MAX_PRICE_ID,
    STRIPE_PRO_PRICE_ID,
    STRIPE_SECRET_KEY,
)
from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger, setup_logging  # noqa: E402

logger = get_logger(__name__)

ACTIVE_STATUSES = {"active", "trialing"}
DESTINATION_READY_MIGRATION_STATES = {"already_destination", "destination_active_by_email"}
REPORT_DIR = Path(__file__).resolve().parents[1] / "tmp" / "stripe-account-migration"
ZERO_DECIMAL_CURRENCIES = {
    "bif",
    "clp",
    "djf",
    "gnf",
    "jpy",
    "kmf",
    "krw",
    "mga",
    "pyg",
    "rwf",
    "ugx",
    "vnd",
    "vuv",
    "xaf",
    "xof",
    "xpf",
}
ROUTINE_SKIP_ERRORS = {
    "Local row has no Stripe subscription/customer",
    "Local row is not a Stripe billing subscription",
    "Local subscription is not active/trialing",
    "Local row already belongs to the destination Stripe account",
}

BASE_CSV_FIELDS = [
    "customer",
    "start_date",
    "automatic_tax",
    "billing_cycle_anchor",
    "coupon",
    "trial_end",
    "proration_behavior",
    "collection_method",
    "default_tax_rate",
    "backdate_start_date",
    "days_until_due",
    "cancel_at_period_end",
    "metadata_source",
    "metadata_old_Stripe_sub_id",
    "metadata_third_party_sub_id",
    "metadata_user_id",
    "metadata_tier",
    "metadata_product",
]


@dataclass
class ExportRow:
    user_id: str | None
    email: str | None
    source_customer_id: str | None
    destination_customer_id: str | None
    source_subscription_id: str | None
    status: str | None
    current_period_start: int | None
    current_period_end: int | None
    start_date: int | None
    amount_summary: str | None
    action: str
    ok: bool
    csv_row: dict[str, str] | None = None
    error: str | None = None
    warnings: list[str] = field(default_factory=list)


def _first_present(row: dict[str, str], names: list[str]) -> str:
    for name in names:
        value = (row.get(name) or "").strip()
        if value:
            return value
    return ""


def _read_customer_map(path: Path | None) -> dict[str, str]:
    if not path:
        return {}

    mapping: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            old_customer_id = _first_present(raw, [
                "old_stripe_customer_id",
                "old_customer_id",
                "source_customer_id",
                "source_customer",
                "customer_old",
                "customer",
            ])
            new_customer_id = _first_present(raw, [
                "new_stripe_customer_id",
                "new_customer_id",
                "destination_customer_id",
                "destination_customer",
                "target_customer_id",
                "customer_new",
            ])
            if old_customer_id and new_customer_id:
                mapping[old_customer_id] = new_customer_id
    return mapping


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


def _to_dict(obj):
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return obj


async def _retrieve_source_subscription(subscription_id: str, api_key: str) -> dict[str, Any]:
    sub = await asyncio.to_thread(
        stripe.Subscription.retrieve,
        subscription_id,
        expand=["items.data.price"],
        api_key=api_key,
    )
    return _to_dict(sub) or {}


def _source_api_key(source_account: str) -> str:
    if source_account == "legacy":
        return STRIPE_MIGRATION_SOURCE_SECRET_KEY or STRIPE_LEGACY_SECRET_KEY
    if source_account == "primary":
        return _destination_api_key()
    raise ValueError("Unsupported source account: %s" % source_account)


def _destination_api_key() -> str:
    return STRIPE_MIGRATION_DESTINATION_SECRET_KEY or STRIPE_SECRET_KEY


def _destination_max_price_id() -> str:
    return STRIPE_MIGRATION_DESTINATION_MAX_PRICE_ID or STRIPE_MAX_PRICE_ID


def _destination_pro_price_id() -> str:
    return STRIPE_MIGRATION_DESTINATION_PRO_PRICE_ID or STRIPE_PRO_PRICE_ID


def _api_key_mode(api_key: str) -> str:
    if api_key.startswith(("sk_live_", "rk_live_")):
        return "live"
    if api_key.startswith(("sk_test_", "rk_test_")):
        return "test"
    return "unknown"


def validate_migration_key_modes(*, source_account: str, allow_test_mode: bool = False) -> None:
    """Fail fast if the CLI would mix production data with test-mode keys."""
    source_key = _source_api_key(source_account)
    destination_key = _destination_api_key()
    source_mode = _api_key_mode(source_key)
    destination_mode = _api_key_mode(destination_key)

    if not source_key:
        raise RuntimeError("Source Stripe API key is not configured")
    if not destination_key:
        raise RuntimeError("Destination Stripe API key is not configured")
    if source_key == destination_key:
        raise RuntimeError("Source and destination Stripe API keys must be different")
    if allow_test_mode:
        return
    if source_mode != "live" or destination_mode != "live":
        raise RuntimeError(
            "Stripe account migration requires live source and destination keys; "
            "pass --allow-test-mode only for sandbox validation"
        )


def _epoch(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            return int(float(value))
        except ValueError:
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return int(parsed.timestamp())
    return None


def _minor_amount_to_major_string(amount: Any, currency: str | None) -> str | None:
    if amount is None or not currency:
        return None
    try:
        decimal_amount = Decimal(str(amount))
    except (InvalidOperation, TypeError, ValueError):
        return None

    normalized_currency = currency.lower()
    if normalized_currency not in ZERO_DECIMAL_CURRENCIES:
        decimal_amount = decimal_amount / Decimal("100")
    quantized = decimal_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return format(quantized.normalize(), "f")


def _price_amount(price: dict[str, Any]) -> Any:
    if price.get("unit_amount_decimal") not in (None, ""):
        return price.get("unit_amount_decimal")
    return price.get("unit_amount")


def _item_price(item: dict[str, Any]) -> dict[str, Any]:
    return _to_dict(item.get("price")) or {}


def _subscription_items(sub: dict[str, Any]) -> list[dict[str, Any]]:
    items = _to_dict(sub.get("items")) or {}
    return [_to_dict(item) or {} for item in (items.get("data") or [])]


def _subscription_period(sub: dict[str, Any]) -> tuple[int | None, int | None]:
    current_period_start = _epoch(sub.get("current_period_start"))
    current_period_end = _epoch(sub.get("current_period_end"))

    if current_period_start is not None and current_period_end is not None:
        return current_period_start, current_period_end

    for item in _subscription_items(sub):
        if current_period_start is None:
            item_period_start = _epoch(item.get("current_period_start"))
            if item_period_start is not None:
                current_period_start = item_period_start
        if current_period_end is None:
            item_period_end = _epoch(item.get("current_period_end"))
            if item_period_end is not None:
                current_period_end = item_period_end
        if current_period_start is not None and current_period_end is not None:
            break

    return current_period_start, current_period_end


def _customer_id(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    value_d = _to_dict(value) or {}
    return value_d.get("id")


def _object_id(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    value_d = _to_dict(value) or {}
    return value_d.get("id")


async def resolve_destination_product_id(adhoc_product_id: str | None = None) -> str:
    if adhoc_product_id:
        return adhoc_product_id
    destination_key = _destination_api_key()
    destination_price_id = _destination_max_price_id()
    if not destination_key:
        raise RuntimeError("Destination Stripe API key is required to resolve destination product")
    if not destination_price_id:
        raise RuntimeError(
            "STRIPE_MIGRATION_DESTINATION_MAX_PRICE_ID or STRIPE_MAX_PRICE_ID is required "
            "when --adhoc-product-id is omitted"
        )

    price = await asyncio.to_thread(
        stripe.Price.retrieve,
        destination_price_id,
        expand=["product"],
        api_key=destination_key,
    )
    product_id = _object_id((_to_dict(price) or {}).get("product"))
    if not product_id:
        raise RuntimeError("Unable to resolve destination product from STRIPE_MAX_PRICE_ID")
    return product_id


async def _resolve_product_id_from_price(price_id: str, *, label: str) -> str:
    if not price_id:
        raise RuntimeError("%s destination Price ID is required when --adhoc-product-id is omitted" % label)
    price = await asyncio.to_thread(
        stripe.Price.retrieve,
        price_id,
        expand=["product"],
        api_key=_destination_api_key(),
    )
    product_id = _object_id((_to_dict(price) or {}).get("product"))
    if not product_id:
        raise RuntimeError("Unable to resolve destination product from %s Price ID" % label)
    return product_id


async def resolve_destination_product_ids(adhoc_product_id: str | None = None) -> dict[str, str]:
    if adhoc_product_id:
        return {"pro": adhoc_product_id, "max": adhoc_product_id}
    if not _destination_api_key():
        raise RuntimeError("Destination Stripe API key is required to resolve destination products")
    return {
        "pro": await _resolve_product_id_from_price(_destination_pro_price_id(), label="Pro"),
        "max": await _resolve_product_id_from_price(_destination_max_price_id(), label="Max"),
    }


def _plan_product_key(plan: str | None) -> str:
    return "pro" if str(plan or "").lower() == "pro" else "max"


def _product_id_for_plan(plan: str | None, product_ids: dict[str, str]) -> str:
    product_key = _plan_product_key(plan)
    product_id = product_ids.get(product_key) or product_ids.get("max")
    if not product_id:
        raise RuntimeError("No destination product configured for plan %s" % (plan or "unknown"))
    return product_id


def _build_item_fields(
    items: list[dict[str, Any]],
    *,
    destination_product_id: str,
) -> tuple[dict[str, str], str]:
    fields: dict[str, str] = {}
    summaries: list[str] = []

    if not items:
        raise ValueError("Source subscription has no subscription items")

    for idx, item in enumerate(items):
        price = _item_price(item)
        recurring = _to_dict(price.get("recurring")) or {}
        interval = recurring.get("interval")
        interval_count = recurring.get("interval_count") or 1
        currency = (price.get("currency") or "").lower()
        amount = _minor_amount_to_major_string(_price_amount(price), currency)
        quantity = item.get("quantity") or 1

        if interval not in {"day", "week", "month", "year"}:
            raise ValueError("Unsupported recurring interval: %s" % interval)
        if int(interval_count) != 1:
            raise ValueError("Unsupported recurring interval_count: %s" % interval_count)
        if not amount or not currency:
            raise ValueError("Source subscription item has no usable amount/currency")

        prefix = "adhoc_items.%s" % idx
        fields["%s.amount" % prefix] = amount
        fields["%s.product" % prefix] = destination_product_id
        fields["%s.interval" % prefix] = interval
        fields["%s.currency" % prefix] = currency
        fields["%s.quantity" % prefix] = str(quantity)
        summaries.append("%s %s/%s x%s" % (amount, currency, interval, quantity))

    return fields, "; ".join(summaries)


def _default_start_date(now: datetime, min_start_hours: int) -> int:
    return int((now + timedelta(hours=min_start_hours)).timestamp())


def _build_csv_row(
    *,
    local: dict[str, Any],
    stripe_sub: dict[str, Any],
    destination_customer_id: str,
    destination_product_ids: dict[str, str],
    now: datetime,
    min_start_hours: int,
    include_cancel_scheduled: bool,
) -> tuple[dict[str, str], str, list[str]]:
    warnings: list[str] = []
    status = stripe_sub.get("status")
    if status not in ACTIVE_STATUSES:
        raise ValueError("Source subscription is not active/trialing")
    if stripe_sub.get("cancel_at_period_end") and not include_cancel_scheduled:
        raise ValueError("Source subscription is already scheduled to cancel")

    current_period_start, current_period_end = _subscription_period(stripe_sub)
    start_date = _default_start_date(now, min_start_hours)
    if current_period_end is None:
        raise ValueError("Source subscription has no current_period_end")
    if current_period_end <= start_date:
        raise ValueError("Current period end is too close for migration buffer")

    collection_method = stripe_sub.get("collection_method") or "charge_automatically"
    automatic_tax = _to_dict(stripe_sub.get("automatic_tax")) or {}
    old_subscription_id = stripe_sub.get("id") or local.get("stripe_subscription_id")
    plan = local.get("plan") or ((_to_dict(stripe_sub.get("metadata")) or {}).get("tier") or "")
    destination_product_id = _product_id_for_plan(plan, destination_product_ids)
    items = _subscription_items(stripe_sub)
    item_fields, amount_summary = _build_item_fields(
        items,
        destination_product_id=destination_product_id,
    )

    csv_row = {
        "customer": destination_customer_id,
        "start_date": str(start_date),
        "automatic_tax": "TRUE" if automatic_tax.get("enabled") else "FALSE",
        "billing_cycle_anchor": str(current_period_end),
        "coupon": "",
        "trial_end": "",
        "proration_behavior": "none",
        "collection_method": collection_method,
        "default_tax_rate": "",
        "backdate_start_date": str(current_period_start or ""),
        "days_until_due": str(stripe_sub.get("days_until_due") or "")
        if collection_method == "send_invoice"
        else "",
        "cancel_at_period_end": "TRUE" if stripe_sub.get("cancel_at_period_end") else "",
        "metadata_source": "internal:Stripe",
        "metadata_old_Stripe_sub_id": old_subscription_id or "",
        "metadata_third_party_sub_id": old_subscription_id or "",
        "metadata_user_id": local.get("user_id") or "",
        "metadata_tier": plan,
        "metadata_product": plan,
        **item_fields,
    }

    trial_end = _epoch(stripe_sub.get("trial_end"))
    if status == "trialing" and trial_end and trial_end > start_date:
        csv_row["trial_end"] = str(trial_end)
    elif status == "trialing":
        warnings.append("trialing subscription has no future trial_end")

    return csv_row, amount_summary, warnings


def _csv_headers(rows: list[dict[str, str]]) -> list[str]:
    item_indices = sorted({
        int(key.split(".")[1])
        for row in rows
        for key in row
        if key.startswith("adhoc_items.") and key.split(".")[1].isdigit()
    })
    item_fields = [
        "adhoc_items.%s.%s" % (idx, field)
        for idx in item_indices
        for field in ("amount", "product", "interval", "currency", "quantity")
    ]
    return ["customer", "start_date", *item_fields, *[field for field in BASE_CSV_FIELDS if field not in {"customer", "start_date"}]]


async def build_export(
    *,
    customer_map_path: Path | None,
    adhoc_product_id: str,
    adhoc_product_ids: dict[str, str] | None = None,
    source_account: str = "legacy",
    user_id_filter: str | None = None,
    assume_customer_ids_preserved: bool = False,
    include_cancel_scheduled: bool = False,
    min_start_hours: int = 25,
    now: datetime | None = None,
) -> list[ExportRow]:
    api_key = _source_api_key(source_account)
    if not api_key:
        raise RuntimeError("Source Stripe API key is not configured")

    customer_map = _read_customer_map(customer_map_path)
    destination_product_ids = adhoc_product_ids or {
        "pro": adhoc_product_id,
        "max": adhoc_product_id,
    }
    now_dt = now or datetime.now(timezone.utc)
    if now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=timezone.utc)

    results: list[ExportRow] = []
    for local in await _list_local_users():
        user_id = local.get("user_id")
        if user_id_filter and user_id != user_id_filter:
            continue
        source_subscription_id = local.get("legacy_stripe_subscription_id") or local.get("stripe_subscription_id")
        source_customer_id = local.get("legacy_stripe_customer_id") or local.get("stripe_customer_id")

        result = ExportRow(
            user_id=user_id,
            email=local.get("email"),
            source_customer_id=source_customer_id,
            destination_customer_id=None,
            source_subscription_id=source_subscription_id,
            status=local.get("status"),
            current_period_start=None,
            current_period_end=None,
            start_date=None,
            amount_summary=None,
            action="skipped",
            ok=False,
        )

        try:
            if not user_id or not source_subscription_id or not source_customer_id:
                raise ValueError("Local row has no Stripe subscription/customer")
            if local.get("is_lifetime") or local.get("access_expires_at"):
                raise ValueError("Local row is not a Stripe billing subscription")
            if local.get("stripe_migration_state") in DESTINATION_READY_MIGRATION_STATES:
                raise ValueError("Local row already belongs to the destination Stripe account")
            if local.get("status") not in ACTIVE_STATUSES:
                raise ValueError("Local subscription is not active/trialing")

            destination_customer_id = (
                customer_map.get(source_customer_id)
                or (source_customer_id if assume_customer_ids_preserved else None)
            )
            if not destination_customer_id:
                raise ValueError("Missing destination customer mapping")

            stripe_sub = await _retrieve_source_subscription(source_subscription_id, api_key)
            stripe_customer_id = _customer_id(stripe_sub.get("customer"))
            if stripe_customer_id and stripe_customer_id != source_customer_id:
                raise ValueError("Source subscription customer does not match local row")
            result.status = stripe_sub.get("status")
            result.current_period_start, result.current_period_end = _subscription_period(stripe_sub)
            result.start_date = _default_start_date(now_dt, min_start_hours)
            result.destination_customer_id = destination_customer_id

            csv_row, amount_summary, warnings = _build_csv_row(
                local=local,
                stripe_sub=stripe_sub,
                destination_customer_id=destination_customer_id,
                destination_product_ids=destination_product_ids,
                now=now_dt,
                min_start_hours=min_start_hours,
                include_cancel_scheduled=include_cancel_scheduled,
            )
            result.csv_row = csv_row
            result.amount_summary = amount_summary
            result.warnings = warnings
            result.action = "exported"
            result.ok = True
        except Exception as e:  # noqa: BLE001
            result.error = str(e)
            log = logger.debug if result.error in ROUTINE_SKIP_ERRORS else logger.warning
            log(
                "stripe migration export skipped user=%s sub=%s: %s",
                (user_id or "")[:8],
                (source_subscription_id or "")[:12],
                e,
            )

        results.append(result)

    return results


def _write_outputs(results: list[ExportRow], output: Path | None = None) -> tuple[Path, Path]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stem = "toolkit-%s" % datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    csv_path = output or (REPORT_DIR / ("%s.csv" % stem))
    report_path = csv_path.with_suffix(".report.json")

    csv_rows = [result.csv_row for result in results if result.ok and result.csv_row]
    headers = _csv_headers(csv_rows) if csv_rows else BASE_CSV_FIELDS
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(csv_rows)

    report_path.write_text(
        json.dumps([asdict(result) for result in results], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return csv_path, report_path


def _summarize(results: list[ExportRow]) -> dict[str, int]:
    return {
        "scanned": len(results),
        "exported": sum(1 for result in results if result.ok),
        "skipped": sum(1 for result in results if not result.ok),
        "warnings": sum(len(result.warnings) for result in results),
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export Stripe account migration toolkit CSV")
    parser.add_argument("--customer-map", type=Path, help="CSV mapping old/source customer IDs to destination IDs")
    parser.add_argument("--adhoc-product-id", help="Destination Stripe Product ID for ad-hoc migrated prices")
    parser.add_argument("--output", type=Path, help="Output toolkit CSV path")
    parser.add_argument("--source-account", choices=["legacy", "primary"], default="legacy")
    parser.add_argument("--user-id", help="Only export one user")
    parser.add_argument("--assume-customer-ids-preserved", action="store_true")
    parser.add_argument("--include-cancel-scheduled", action="store_true")
    parser.add_argument("--min-start-hours", type=int, default=25)
    parser.add_argument("--allow-errors", action="store_true", help="Exit 0 even if some rows are skipped")
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
    results = await build_export(
        customer_map_path=args.customer_map,
        adhoc_product_id=adhoc_product_id,
        adhoc_product_ids=adhoc_product_ids,
        source_account=args.source_account,
        user_id_filter=args.user_id,
        assume_customer_ids_preserved=args.assume_customer_ids_preserved,
        include_cancel_scheduled=args.include_cancel_scheduled,
        min_start_hours=args.min_start_hours,
    )
    csv_path, report_path = _write_outputs(results, args.output)
    summary = _summarize(results)
    logger.info(
        "stripe migration toolkit export complete: %s csv=%s report=%s",
        summary,
        csv_path,
        report_path,
    )
    await get_insforge_service().close()
    if summary["skipped"] and not args.allow_errors:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
