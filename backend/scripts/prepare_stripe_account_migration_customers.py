"""Prepare destination Stripe customers for account migration.

Stripe's Billing migration toolkit can recreate subscriptions in the
destination account, but automatic renewal still depends on the destination
Customer having a default payment method. This helper is safe to rerun:

- reads the old -> new customer map
- checks destination customer payment readiness
- optionally sets a default payment method when there is a safe unique choice
- writes a PAN-copy CSV for customers that still have no payment method

It does not create subscriptions or trigger charges.

Example:
    cd backend
    source venv/bin/activate

    python scripts/prepare_stripe_account_migration_customers.py \
      --customer-map tmp/stripe-account-migration/customer-map.csv

    python scripts/prepare_stripe_account_migration_customers.py \
      --customer-map tmp/stripe-account-migration/customer-map.csv \
      --apply-defaults
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

from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger, setup_logging  # noqa: E402
from scripts.export_stripe_account_migration import (  # noqa: E402
    REPORT_DIR,
    _destination_api_key,
    _object_id,
    _source_api_key,
    _to_dict,
    validate_migration_key_modes,
)

logger = get_logger(__name__)


@dataclass
class CustomerMapRow:
    user_id: str
    email: str
    source_subscription_id: str
    source_customer_id: str
    destination_customer_id: str


@dataclass
class PaymentCandidate:
    id: str
    kind: str
    created: int | None
    signature: tuple[Any, ...]


@dataclass
class CustomerReadiness:
    user_id: str
    email: str
    source_subscription_id: str
    source_customer_id: str
    destination_customer_id: str
    has_default_payment_method: bool
    attached_payment_method_count: int
    attached_source_count: int
    selected_default_id: str | None
    default_action: str
    risk: str
    ok: bool
    error: str | None = None


def _first_present(row: dict[str, str], names: list[str]) -> str:
    for name in names:
        value = (row.get(name) or "").strip()
        if value:
            return value
    return ""


def read_customer_map_rows(path: Path) -> list[CustomerMapRow]:
    rows: list[CustomerMapRow] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            source_customer_id = _first_present(raw, [
                "old_stripe_customer_id",
                "old_customer_id",
                "source_customer_id",
                "source_customer",
                "customer_old",
                "customer",
            ])
            destination_customer_id = _first_present(raw, [
                "new_stripe_customer_id",
                "new_customer_id",
                "destination_customer_id",
                "destination_customer",
                "target_customer_id",
                "customer_new",
            ])
            if not source_customer_id or not destination_customer_id:
                continue
            rows.append(CustomerMapRow(
                user_id=_first_present(raw, ["user_id", "metadata_user_id"]),
                email=_first_present(raw, ["email", "customer_email"]),
                source_subscription_id=_first_present(raw, [
                    "source_subscription_id",
                    "old_stripe_subscription_id",
                    "stripe_subscription_id",
                ]),
                source_customer_id=source_customer_id,
                destination_customer_id=destination_customer_id,
            ))
    return rows


def _card_signature(obj: dict[str, Any]) -> tuple[Any, ...]:
    data = _to_dict(obj) or {}
    card = _to_dict(data.get("card")) or data
    return (
        card.get("brand"),
        card.get("last4"),
        card.get("exp_month"),
        card.get("exp_year"),
        card.get("fingerprint"),
    )


def _candidate_from_payment_method(pm: dict[str, Any]) -> PaymentCandidate | None:
    payment_method_id = pm.get("id")
    if not payment_method_id:
        return None
    return PaymentCandidate(
        id=payment_method_id,
        kind="payment_method",
        created=pm.get("created") if isinstance(pm.get("created"), int) else None,
        signature=_card_signature(pm),
    )


def _candidate_from_source(source: dict[str, Any]) -> PaymentCandidate | None:
    source_id = source.get("id")
    if not source_id:
        return None
    return PaymentCandidate(
        id=source_id,
        kind="source",
        created=source.get("created") if isinstance(source.get("created"), int) else None,
        signature=_card_signature(source),
    )


def _signature_known(signature: tuple[Any, ...]) -> bool:
    return any(value not in (None, "") for value in signature)


def _signatures_equal(left: tuple[Any, ...], right: tuple[Any, ...]) -> bool:
    return _signature_known(left) and left == right


def choose_default_candidate(
    candidates: list[PaymentCandidate],
    *,
    source_default_signature: tuple[Any, ...] | None,
) -> tuple[PaymentCandidate | None, str]:
    """Select a destination payment candidate only when the choice is safe."""
    if not candidates:
        return None, "no_candidates"
    if len(candidates) == 1:
        return candidates[0], "single_candidate"

    if source_default_signature and _signature_known(source_default_signature):
        matching = [
            candidate
            for candidate in candidates
            if _signatures_equal(candidate.signature, source_default_signature)
        ]
        if len(matching) == 1:
            return matching[0], "matched_source_default"

    known_signatures = [candidate.signature for candidate in candidates if _signature_known(candidate.signature)]
    signatures = set(known_signatures)
    if len(signatures) == 1 and len(known_signatures) == len(candidates):
        newest = sorted(
            candidates,
            key=lambda candidate: candidate.created or 0,
            reverse=True,
        )[0]
        return newest, "identical_candidates"

    return None, "multiple_candidates_no_match"


async def _retrieve_customer(customer_id: str, *, api_key: str) -> dict[str, Any]:
    customer = await asyncio.to_thread(
        stripe.Customer.retrieve,
        customer_id,
        expand=["invoice_settings.default_payment_method", "default_source"],
        api_key=api_key,
    )
    return _to_dict(customer) or {}


async def _list_payment_methods(customer_id: str, *, api_key: str) -> list[dict[str, Any]]:
    result = await asyncio.to_thread(
        stripe.PaymentMethod.list,
        customer=customer_id,
        type="card",
        limit=100,
        api_key=api_key,
    )
    return [_to_dict(item) or {} for item in ((_to_dict(result) or {}).get("data") or [])]


async def _list_sources(customer_id: str, *, api_key: str) -> list[dict[str, Any]]:
    result = await asyncio.to_thread(
        stripe.Customer.list_sources,
        customer_id,
        object="card",
        limit=100,
        api_key=api_key,
    )
    return [_to_dict(item) or {} for item in ((_to_dict(result) or {}).get("data") or [])]


def _customer_default_signature(customer: dict[str, Any]) -> tuple[Any, ...] | None:
    invoice_settings = _to_dict(customer.get("invoice_settings")) or {}
    default_payment_method = _to_dict(invoice_settings.get("default_payment_method")) or {}
    if default_payment_method:
        return _card_signature(default_payment_method)
    default_source = _to_dict(customer.get("default_source")) or {}
    if default_source:
        return _card_signature(default_source)
    return None


def _customer_has_default(customer: dict[str, Any]) -> bool:
    invoice_settings = _to_dict(customer.get("invoice_settings")) or {}
    return bool(
        _object_id(invoice_settings.get("default_payment_method"))
        or _object_id(customer.get("default_source"))
    )


async def _apply_default(customer_id: str, candidate: PaymentCandidate, *, api_key: str) -> None:
    if candidate.kind == "payment_method":
        await asyncio.to_thread(
            stripe.Customer.modify,
            customer_id,
            invoice_settings={"default_payment_method": candidate.id},
            api_key=api_key,
        )
        return
    if candidate.kind == "source":
        await asyncio.to_thread(
            stripe.Customer.modify,
            customer_id,
            default_source=candidate.id,
            api_key=api_key,
        )
        return
    raise ValueError("Unsupported payment candidate kind: %s" % candidate.kind)


async def inspect_customer(
    row: CustomerMapRow,
    *,
    source_key: str,
    destination_key: str,
    apply_defaults: bool,
) -> CustomerReadiness:
    try:
        source_customer = await _retrieve_customer(row.source_customer_id, api_key=source_key)
        destination_customer = await _retrieve_customer(row.destination_customer_id, api_key=destination_key)
        payment_methods = await _list_payment_methods(row.destination_customer_id, api_key=destination_key)
        sources = await _list_sources(row.destination_customer_id, api_key=destination_key)
        candidates = [
            candidate
            for candidate in [
                *(_candidate_from_payment_method(pm) for pm in payment_methods),
                *(_candidate_from_source(source) for source in sources),
            ]
            if candidate is not None
        ]

        has_default = _customer_has_default(destination_customer)
        selected: PaymentCandidate | None = None
        default_action = "already_default_payment_method" if has_default else "not_applied"
        if not has_default:
            selected, reason = choose_default_candidate(
                candidates,
                source_default_signature=_customer_default_signature(source_customer),
            )
            default_action = reason
            if selected and apply_defaults:
                await _apply_default(row.destination_customer_id, selected, api_key=destination_key)
                destination_customer = await _retrieve_customer(row.destination_customer_id, api_key=destination_key)
                has_default = _customer_has_default(destination_customer)
                default_action = "updated_%s" % reason

        if has_default:
            risk = "auto_charge_ready"
        elif not candidates:
            risk = "missing_destination_payment_method"
        else:
            risk = "needs_default_payment_method"

        return CustomerReadiness(
            user_id=row.user_id,
            email=row.email,
            source_subscription_id=row.source_subscription_id,
            source_customer_id=row.source_customer_id,
            destination_customer_id=row.destination_customer_id,
            has_default_payment_method=has_default,
            attached_payment_method_count=len(payment_methods),
            attached_source_count=len(sources),
            selected_default_id=selected.id if selected else None,
            default_action=default_action,
            risk=risk,
            ok=risk == "auto_charge_ready",
        )
    except Exception as e:  # noqa: BLE001
        return CustomerReadiness(
            user_id=row.user_id,
            email=row.email,
            source_subscription_id=row.source_subscription_id,
            source_customer_id=row.source_customer_id,
            destination_customer_id=row.destination_customer_id,
            has_default_payment_method=False,
            attached_payment_method_count=0,
            attached_source_count=0,
            selected_default_id=None,
            default_action="error",
            risk="lookup_error",
            ok=False,
            error=str(e),
        )


async def prepare_customers(
    *,
    customer_map_path: Path,
    source_account: str = "legacy",
    apply_defaults: bool = False,
) -> list[CustomerReadiness]:
    source_key = _source_api_key(source_account)
    destination_key = _destination_api_key()
    rows = read_customer_map_rows(customer_map_path)
    return [
        await inspect_customer(
            row,
            source_key=source_key,
            destination_key=destination_key,
            apply_defaults=apply_defaults,
        )
        for row in rows
    ]


def _write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _write_outputs(results: list[CustomerReadiness]) -> dict[str, Path]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stem = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    readiness_path = REPORT_DIR / ("payment-readiness-current-%s.csv" % stem)
    pan_copy_path = REPORT_DIR / ("pan-copy-remaining-customer-ids-%s.csv" % stem)
    pan_copy_dashboard_path = REPORT_DIR / ("pan-copy-remaining-customer-ids-dashboard-%s.csv" % stem)
    manual_path = REPORT_DIR / ("manual-default-payment-method-required-%s.csv" % stem)
    report_path = REPORT_DIR / ("payment-readiness-current-%s.json" % stem)

    readiness_rows = [asdict(result) for result in results]
    readiness_fields = list(asdict(results[0]).keys()) if results else list(CustomerReadiness.__dataclass_fields__)
    _write_csv(readiness_path, readiness_rows, readiness_fields)
    _write_csv(
        pan_copy_path,
        [
            {"customer": result.source_customer_id}
            for result in results
            if result.risk == "missing_destination_payment_method"
        ],
        ["customer"],
    )
    _write_csv(
        pan_copy_dashboard_path,
        [
            {"Customer ID": result.source_customer_id}
            for result in results
            if result.risk == "missing_destination_payment_method"
        ],
        ["Customer ID"],
    )
    _write_csv(
        manual_path,
        [
            asdict(result)
            for result in results
            if result.risk == "needs_default_payment_method"
        ],
        readiness_fields,
    )
    report_path.write_text(json.dumps(readiness_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "readiness": readiness_path,
        "pan_copy": pan_copy_path,
        "pan_copy_dashboard": pan_copy_dashboard_path,
        "manual": manual_path,
        "report": report_path,
    }


def _summarize(results: list[CustomerReadiness]) -> dict[str, int]:
    return {
        "checked": len(results),
        "ready": sum(1 for result in results if result.risk == "auto_charge_ready"),
        "missing_destination_payment_method": sum(
            1 for result in results if result.risk == "missing_destination_payment_method"
        ),
        "needs_default_payment_method": sum(
            1 for result in results if result.risk == "needs_default_payment_method"
        ),
        "lookup_error": sum(1 for result in results if result.risk == "lookup_error"),
        "updated_defaults": sum(1 for result in results if result.default_action.startswith("updated_")),
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare Stripe destination customers for account migration")
    parser.add_argument("--customer-map", type=Path, required=True)
    parser.add_argument("--source-account", choices=["legacy", "primary"], default="legacy")
    parser.add_argument("--apply-defaults", action="store_true")
    parser.add_argument("--allow-test-mode", action="store_true", help="Allow test-mode Stripe keys for sandbox validation")
    return parser.parse_args()


async def main() -> int:
    setup_logging()
    args = _parse_args()
    validate_migration_key_modes(
        source_account=args.source_account,
        allow_test_mode=args.allow_test_mode,
    )
    results = await prepare_customers(
        customer_map_path=args.customer_map,
        source_account=args.source_account,
        apply_defaults=args.apply_defaults,
    )
    paths = _write_outputs(results)
    summary = _summarize(results)
    logger.info(
        "stripe migration customer readiness complete: summary=%s readiness=%s pan_copy=%s manual=%s report=%s",
        summary,
        paths["readiness"],
        paths["pan_copy_dashboard"],
        paths["manual"],
        paths["report"],
    )
    await get_insforge_service().close()
    return 0 if summary["missing_destination_payment_method"] == 0 and summary["needs_default_payment_method"] == 0 and summary["lookup_error"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
