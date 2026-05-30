"""Backfill `subscriptions.entitlements` from Stripe for existing paid users.

Why this script exists
----------------------
`subscriptions.entitlements` is written exclusively by the
`entitlements.active_entitlement_summary.updated` Stripe webhook. That webhook
only fires when an entitlement actually changes on a customer — so when we add
a new feature lookup key (e.g. `twitter_digest`) to an existing product in the
Stripe dashboard, existing active subscriptions do NOT receive a fresh webhook
and their cached `entitlements` array stays stale until renewal.

This script walks every user that has a `stripe_customer_id`, pulls the live
ActiveEntitlement list for that customer from Stripe, and rewrites the
Insforge row when it differs. Lifetime users are skipped (their entitlements
are derived in code, not from the column).

Usage
-----
    cd backend && source venv/bin/activate
    python scripts/backfill_stripe_entitlements.py                # dry run
    python scripts/backfill_stripe_entitlements.py --apply        # write
    python scripts/backfill_stripe_entitlements.py --plan max     # filter
    python scripts/backfill_stripe_entitlements.py --user-id ABC  # one user

Idempotent. Safe to re-run.

Exit codes
----------
0 — completed (drift count printed)
1 — config / network error before any work was done
2 — at least one Stripe call failed (partial result still printed)
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import stripe  # noqa: E402

from app.core.config import STRIPE_SECRET_KEY  # noqa: E402
from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger  # noqa: E402
from app.features.payment.db import (  # noqa: E402
    invalidate_subscription_cache,
    upsert_subscription,
)

logger = get_logger(__name__)

STRIPE_RATE_DELAY = 0.15


@dataclass
class Row:
    user_id: str
    email: Optional[str]
    plan: Optional[str]
    is_lifetime: bool
    stripe_customer_id: Optional[str]
    current_entitlements: list[str] = field(default_factory=list)
    fresh_entitlements: Optional[list[str]] = None
    error: Optional[str] = None

    @property
    def diff(self) -> bool:
        return (
            self.fresh_entitlements is not None
            and sorted(self.current_entitlements) != sorted(self.fresh_entitlements)
        )

    @property
    def added(self) -> list[str]:
        if self.fresh_entitlements is None:
            return []
        return sorted(set(self.fresh_entitlements) - set(self.current_entitlements))

    @property
    def removed(self) -> list[str]:
        if self.fresh_entitlements is None:
            return []
        return sorted(set(self.current_entitlements) - set(self.fresh_entitlements))


def _rate_wait() -> None:
    time.sleep(STRIPE_RATE_DELAY)


async def _list_users() -> list[dict]:
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=120.0,
    )
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(f"list_all failed: {payload}")
    return payload.get("data") or []


def _fetch_stripe_entitlements(customer_id: str) -> list[str]:
    """Pull active entitlement lookup_keys for a Stripe customer.

    Matches the parsing logic in `payment/router.py:387` — entitlement objects
    may expose `feature.lookup_key` or a flat `lookup_key` depending on SDK
    version / API mode.
    """
    _rate_wait()
    resp = stripe.entitlements.ActiveEntitlement.list(customer=customer_id)
    items = resp.to_dict().get("data", []) if hasattr(resp, "to_dict") else resp.get("data", [])
    keys: set[str] = set()
    for ent in items:
        if hasattr(ent, "to_dict"):
            ent = ent.to_dict()
        feature = ent.get("feature")
        if isinstance(feature, dict):
            key = feature.get("lookup_key", "")
        else:
            key = ent.get("lookup_key", "")
        if key:
            keys.add(key)
    return sorted(keys)


async def collect(
    plan_filter: Optional[str],
    user_id_filter: Optional[str],
) -> list[Row]:
    users = await _list_users()
    rows: list[Row] = []
    eligible = 0

    for u in users:
        user_id = u.get("user_id")
        if not user_id:
            continue
        if user_id_filter and user_id != user_id_filter:
            continue
        plan = u.get("plan")
        is_lifetime = bool(u.get("is_lifetime"))
        customer_id = u.get("stripe_customer_id")

        # Lifetime users derive entitlements in code; skip writes.
        if is_lifetime:
            continue
        # Only paid users can hold entitlements; nothing to refresh for free.
        if plan not in ("pro", "max"):
            continue
        if plan_filter and plan != plan_filter:
            continue
        if not customer_id:
            continue

        eligible += 1
        row = Row(
            user_id=user_id,
            email=u.get("email"),
            plan=plan,
            is_lifetime=is_lifetime,
            stripe_customer_id=customer_id,
            current_entitlements=list(u.get("entitlements") or []),
        )

        try:
            row.fresh_entitlements = _fetch_stripe_entitlements(customer_id)
        except Exception as e:  # noqa: BLE001
            row.error = str(e)
            logger.warning(
                "stripe lookup failed user=%s customer=%s: %s",
                user_id[:8], customer_id, e,
            )

        rows.append(row)
        if eligible % 25 == 0:
            logger.info("processed %d eligible users", eligible)

    return rows


def summarize(rows: list[Row]) -> None:
    drift = [r for r in rows if r.diff]
    errors = [r for r in rows if r.error]
    clean = [r for r in rows if r.fresh_entitlements is not None and not r.diff]

    print()
    print("=" * 70)
    print("STRIPE ENTITLEMENTS BACKFILL SUMMARY")
    print("=" * 70)
    print(f"Eligible paid users checked   : {len(rows)}")
    print(f"  Already in sync             : {len(clean)}")
    print(f"  Drift (needs write)         : {len(drift)}")
    print(f"  Stripe lookup errors        : {len(errors)}")
    print()

    if drift:
        print("DRIFT DETAIL (first 100):")
        for r in drift[:100]:
            added = ",".join(r.added) or "-"
            removed = ",".join(r.removed) or "-"
            email = (r.email or "?")[:38]
            print(
                f"  {email:38s} plan={r.plan:3s} "
                f"add=[{added}] remove=[{removed}]"
            )
        if len(drift) > 100:
            print(f"  ... and {len(drift) - 100} more")
        print()

    if errors:
        print("ERRORS:")
        for r in errors[:20]:
            print(f"  {(r.email or r.user_id)[:42]:42s} {r.error}")
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more")
        print()


async def apply_writes(rows: list[Row]) -> tuple[int, int]:
    # Rows whose Stripe lookup failed have fresh_entitlements=None and diff=False
    # so they are not in `drift` — never overwrite a column with empty data when
    # the source of truth was unreachable.
    drift = [r for r in rows if r.diff and r.fresh_entitlements is not None]
    written = 0
    failed = 0
    for r in drift:
        try:
            ok = await upsert_subscription(
                user_id=r.user_id,
                entitlements=r.fresh_entitlements,
            )
            if ok:
                written += 1
                invalidate_subscription_cache(r.user_id)
            else:
                failed += 1
                logger.warning("upsert returned false for user %s", r.user_id[:8])
        except Exception as e:  # noqa: BLE001
            failed += 1
            logger.warning("upsert failed for user %s: %s", r.user_id[:8], e)
    return written, failed


async def main(args: argparse.Namespace) -> int:
    if not STRIPE_SECRET_KEY:
        print("ERROR: STRIPE_SECRET_KEY not configured", file=sys.stderr)
        return 1
    stripe.api_key = STRIPE_SECRET_KEY

    try:
        rows = await collect(
            plan_filter=args.plan,
            user_id_filter=args.user_id,
        )
    except Exception as e:  # noqa: BLE001
        print(f"ERROR collecting users: {e}", file=sys.stderr)
        return 1

    summarize(rows)

    if not args.apply:
        print("Dry run only. Re-run with --apply to write changes to Insforge.")
        return 0 if not any(r.error for r in rows) else 2

    written, failed = await apply_writes(rows)
    print(f"\nApplied writes: written={written} failed={failed}")
    if failed or any(r.error for r in rows):
        return 2
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist refreshed entitlements to Insforge (default: dry run)",
    )
    parser.add_argument(
        "--plan",
        choices=("pro", "max"),
        default=None,
        help="Filter to a single plan tier",
    )
    parser.add_argument(
        "--user-id",
        default=None,
        help="Refresh a single user_id (debug / one-off)",
    )
    parsed = parser.parse_args()
    sys.exit(asyncio.run(main(parsed)))
