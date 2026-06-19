"""Summarize the Stripe account migration state.

This is a read-only orchestration command. It checks customer payment readiness,
preflight gates, destination-account imported subscription discovery, and export
coverage in one report.

Example:
    cd backend
    source venv/bin/activate

    python scripts/status_stripe_account_migration.py \
      --customer-map tmp/stripe-account-migration/customer-map.csv
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections import Counter
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger, setup_logging  # noqa: E402
from scripts.export_stripe_account_migration import (  # noqa: E402
    REPORT_DIR,
    build_export,
    resolve_destination_product_ids,
    validate_migration_key_modes,
)
from scripts.prepare_stripe_account_migration_customers import (  # noqa: E402
    prepare_customers,
    read_customer_map_rows,
)
from scripts.preflight_stripe_account_migration import run_preflight  # noqa: E402
from scripts.reconcile_stripe_account_migration import discover_mapping, discover_schedules  # noqa: E402

logger = get_logger(__name__)


def _counter(items: list[str]) -> dict[str, int]:
    return dict(Counter(items))


def _phase(summary: dict[str, Any]) -> str:
    if summary["discovered_mapping_rows"] > 0:
        return "post_import_reconcile_ready"
    if summary.get("discovered_schedule_rows", 0) > 0:
        if (
            summary.get("discovered_schedule_pending_rows") == 0
            and summary.get("discovered_schedule_ready_rows", 0) > 0
        ):
            return "post_import_reconcile_ready"
        return "post_import_scheduled"
    if summary["payment_risks"].get("missing_destination_payment_method", 0) > 0:
        return "awaiting_pan_copy"
    if summary["payment_risks"].get("needs_default_payment_method", 0) > 0:
        return "needs_default_payment_method"
    if not summary["preflight_ok"]:
        return "preflight_blocked"
    if summary["exported_rows"] > 0:
        return "ready_for_billing_toolkit"
    return "no_migration_rows"


def _latest_report_path(pattern: str) -> str | None:
    matches = sorted(REPORT_DIR.glob(pattern), key=lambda path: path.stat().st_mtime, reverse=True)
    return str(matches[0]) if matches else None


def _next_action(summary: dict[str, Any], *, customer_map_path: Path) -> dict[str, Any]:
    phase = summary["phase"]
    customer_map = str(customer_map_path)
    base_status_command = (
        "python scripts/status_stripe_account_migration.py --customer-map %s" % customer_map
    )

    if phase == "awaiting_pan_copy":
        missing = summary["payment_risks"].get("missing_destination_payment_method", 0)
        return {
            "action": "upload_pan_copy",
            "ready": False,
            "reason": "%s destination customers are missing payment methods" % missing,
            "blocked_by": ["destination_customer_payment_methods"],
            "artifacts": {
                "latest_pan_copy_dashboard_csv": _latest_report_path(
                    "pan-copy-remaining-customer-ids-dashboard-*.csv"
                ),
            },
            "commands": [
                "python scripts/prepare_stripe_account_migration_customers.py --customer-map %s" % customer_map,
                base_status_command,
            ],
            "operator_steps": [
                "Upload the latest pan-copy-remaining-customer-ids-dashboard CSV in Stripe Dashboard PAN copy partial CSV upload.",
                "Rerun status after Stripe finishes the copy.",
            ],
            "do_not": [
                "Do not upload a Billing migration toolkit CSV yet.",
                "Do not cancel source-account subscriptions yet.",
            ],
        }

    if phase == "needs_default_payment_method":
        needs_default = summary["payment_risks"].get("needs_default_payment_method", 0)
        return {
            "action": "apply_or_review_destination_defaults",
            "ready": False,
            "reason": "%s destination customers have payment methods but no default" % needs_default,
            "blocked_by": ["destination_customer_default_payment_method"],
            "commands": [
                "python scripts/prepare_stripe_account_migration_customers.py --customer-map %s --apply-defaults" % customer_map,
                base_status_command,
            ],
            "operator_steps": [
                "Apply safe unique default payment-method candidates.",
                "Review manual-default-payment-method-required CSV if any rows remain.",
            ],
            "do_not": [
                "Do not guess between ambiguous payment methods.",
                "Do not upload a Billing migration toolkit CSV until preflight passes.",
            ],
        }

    if phase == "preflight_blocked":
        return {
            "action": "resolve_preflight_failures",
            "ready": False,
            "reason": "preflight still has hard failures",
            "blocked_by": ["preflight"],
            "commands": [
                "python scripts/preflight_stripe_account_migration.py --customer-map %s" % customer_map,
                base_status_command,
            ],
            "operator_steps": [
                "Open the latest preflight JSON report.",
                "Fix every severity=error check before exporting a toolkit CSV.",
            ],
            "do_not": [
                "Do not proceed on warning-only intuition; use preflight.ok as the gate.",
            ],
        }

    if phase == "ready_for_billing_toolkit":
        return {
            "action": "export_and_upload_billing_toolkit_csv",
            "ready": True,
            "reason": "payment readiness and preflight gates passed",
            "blocked_by": [],
            "commands": [
                "python scripts/export_stripe_account_migration.py --customer-map %s --include-cancel-scheduled" % customer_map,
                base_status_command,
            ],
            "operator_steps": [
                "Regenerate a fresh toolkit CSV immediately before upload.",
                "Upload the latest toolkit CSV in Stripe Dashboard Billing migration toolkit.",
                "Verify Dashboard subscription/customer counts and first go-live date.",
            ],
            "do_not": [
                "Do not reuse old toolkit CSVs; live start_date must be at least 24 hours in the future.",
                "Do not cancel source-account subscriptions before destination subscriptions are active and reconciled.",
            ],
        }

    if phase == "post_import_scheduled":
        return {
            "action": "wait_for_scheduled_subscriptions_to_go_live",
            "ready": False,
            "reason": "Billing toolkit schedules exist but destination subscriptions are not ready for reconcile",
            "blocked_by": ["scheduled_subscription_go_live"],
            "commands": [
                "python scripts/reconcile_stripe_account_migration.py --discover-schedules --output tmp/stripe-account-migration/discovered-schedules-latest.csv",
                base_status_command,
            ],
            "operator_steps": [
                "Monitor scheduled subscription start dates.",
                "Rerun status after go-live.",
            ],
            "do_not": [
                "Do not write new subscription IDs into Insforge until destination subscriptions are active/trialing.",
                "Do not cancel source-account subscriptions yet.",
            ],
        }

    if phase == "post_import_reconcile_ready":
        discovered_mapping_rows = summary.get("discovered_mapping_rows", 0)
        mapping_command = (
            "python scripts/reconcile_stripe_account_migration.py --discover-mapping --output tmp/stripe-account-migration/discovered-mapping-latest.csv"
            if discovered_mapping_rows > 0
            else "python scripts/reconcile_stripe_account_migration.py --discover-schedules --output tmp/stripe-account-migration/discovered-schedules-latest.csv"
        )
        mapping_path = (
            "tmp/stripe-account-migration/discovered-mapping-latest.csv"
            if discovered_mapping_rows > 0
            else "tmp/stripe-account-migration/discovered-schedules-latest.csv"
        )
        return {
            "action": "reconcile_destination_subscriptions",
            "ready": True,
            "reason": (
                "destination subscriptions with migration metadata were discovered"
                if discovered_mapping_rows > 0
                else "destination schedules have active subscription ids and can be used as mapping input"
            ),
            "blocked_by": [],
            "commands": [
                mapping_command,
                "python scripts/reconcile_stripe_account_migration.py --mapping %s --strict-metadata --verify-portal" % mapping_path,
                "python scripts/reconcile_stripe_account_migration.py --mapping %s --strict-metadata --verify-portal --apply --cancel-source-at-period-end" % mapping_path,
            ],
            "operator_steps": [
                "Generate the mapping from destination subscription metadata or active schedules.",
                "Run dry-run reconcile first.",
                "Apply only after dry-run verifies all rows.",
            ],
            "do_not": [
                "Do not use --cancel-source-at-period-end unless local reconcile succeeds.",
            ],
        }

    return {
        "action": "verify_completion_or_inventory",
        "ready": False,
        "reason": "no migration rows are currently exportable",
        "blocked_by": [],
        "commands": [base_status_command],
        "operator_steps": [
            "Verify whether all source subscriptions are migrated or no longer active.",
        ],
        "do_not": [
            "Do not mark migration complete without reconciling Stripe and Insforge evidence.",
        ],
    }


async def build_status(
    *,
    customer_map_path: Path,
    source_account: str = "legacy",
    sample_limit: int = 10,
    min_start_hours: int = 25,
    include_cancel_scheduled: bool = True,
    discover_limit: int = 500,
) -> dict[str, Any]:
    customer_map_rows = read_customer_map_rows(customer_map_path)
    readiness = await prepare_customers(
        customer_map_path=customer_map_path,
        source_account=source_account,
        apply_defaults=False,
    )
    product_ids = await resolve_destination_product_ids()
    preflight = await run_preflight(
        customer_map_path=customer_map_path,
        adhoc_product_id=product_ids["max"],
        adhoc_product_ids=product_ids,
        source_account=source_account,
        sample_limit=sample_limit,
        min_start_hours=min_start_hours,
    )
    export_rows = await build_export(
        customer_map_path=customer_map_path,
        adhoc_product_id=product_ids["max"],
        adhoc_product_ids=product_ids,
        source_account=source_account,
        include_cancel_scheduled=include_cancel_scheduled,
        min_start_hours=min_start_hours,
    )
    discovered = await discover_mapping(limit=discover_limit)
    discovered_schedules = await discover_schedules(limit=discover_limit)

    export_errors = [
        row.error or "unknown"
        for row in export_rows
        if not row.ok
    ]
    summary = {
        "customer_map_rows": len(customer_map_rows),
        "payment_risks": _counter([row.risk for row in readiness]),
        "payment_ready_rows": sum(1 for row in readiness if row.ok),
        "preflight_ok": preflight.ok,
        "preflight_summary": preflight.summary,
        "exported_rows": sum(1 for row in export_rows if row.ok),
        "export_skipped_rows": sum(1 for row in export_rows if not row.ok),
        "export_error_counts": dict(Counter(export_errors).most_common(10)),
        "export_cancel_at_period_end_rows": sum(
            1
            for row in export_rows
            if row.ok and row.csv_row and row.csv_row.get("cancel_at_period_end") == "TRUE"
        ),
        "discovered_mapping_rows": len(discovered),
        "discovered_schedule_rows": len(discovered_schedules),
        "discovered_schedule_pending_rows": sum(
            1 for row in discovered_schedules if not row.new_subscription_id
        ),
        "discovered_schedule_ready_rows": sum(
            1 for row in discovered_schedules if row.new_subscription_id
        ),
    }
    summary["phase"] = _phase(summary)
    summary["ready_for_toolkit_upload"] = (
        summary["phase"] == "ready_for_billing_toolkit"
        and preflight.ok
    )
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "customer_map": str(customer_map_path),
        "source_account": source_account,
        "summary": summary,
        "next_action": _next_action(summary, customer_map_path=customer_map_path),
        "preflight_checks": [asdict(check) for check in preflight.checks],
        "discovered_mapping": [asdict(row) for row in discovered],
        "discovered_schedules": [asdict(row) for row in discovered_schedules],
    }


def _write_report(report: dict[str, Any]) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / (
        "migration-status-%s.json" % datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    )
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize Stripe account migration status")
    parser.add_argument("--customer-map", type=Path, required=True)
    parser.add_argument("--source-account", choices=["legacy", "primary"], default="legacy")
    parser.add_argument("--sample-limit", type=int, default=10)
    parser.add_argument("--min-start-hours", type=int, default=25)
    parser.add_argument("--discover-limit", type=int, default=500)
    parser.add_argument("--exclude-cancel-scheduled", action="store_true")
    parser.add_argument("--allow-test-mode", action="store_true")
    return parser.parse_args()


async def main() -> int:
    setup_logging()
    args = _parse_args()
    validate_migration_key_modes(
        source_account=args.source_account,
        allow_test_mode=args.allow_test_mode,
    )
    report = await build_status(
        customer_map_path=args.customer_map,
        source_account=args.source_account,
        sample_limit=args.sample_limit,
        min_start_hours=args.min_start_hours,
        include_cancel_scheduled=not args.exclude_cancel_scheduled,
        discover_limit=args.discover_limit,
    )
    report_path = _write_report(report)
    logger.info(
        "stripe migration status: phase=%s ready=%s action=%s summary=%s report=%s",
        report["summary"]["phase"],
        report["summary"]["ready_for_toolkit_upload"],
        report["next_action"]["action"],
        report["summary"],
        report_path,
    )
    await get_insforge_service().close()
    return 0 if report["summary"]["ready_for_toolkit_upload"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
