"""
Daily report CTA segment drift audit (and auto-fix).

Walks all contacts in "TheMarketBrew Daily" audience, computes the desired
CTA tier from each contact's Insforge subscription via ``is_real_paid_sub``,
compares with their current Resend FREE_CTA / PAID_CTA membership, and:

  * default mode: prints drift summary (read-only)
  * ``--apply``  : reconciles by calling ``sync_resend_segments``

This script is the safety net for missed Stripe webhooks AND the cleanup
mechanism for trial expirations (see Step 6 of the plan — there is no
dedicated trial-expiry cleanup task, this is it). Run daily via cron.

Usage:
    cd backend && source venv/bin/activate
    python scripts/audit_cta_segments.py             # dry-run
    python scripts/audit_cta_segments.py --apply     # auto-fix drift
    python scripts/audit_cta_segments.py --csv out.csv

Exit codes:
    0 — completed (drift count printed)
    1 — config error or unrecoverable Resend/Insforge failure
"""

import argparse
import asyncio
import csv
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import resend  # noqa: E402

from app.core.config import (  # noqa: E402
    RESEND_API_KEY,
    RESEND_SEGMENT_DAILY_FREE_CTA,
    RESEND_SEGMENT_DAILY_PAID_CTA,
)
from app.core.logging import get_logger  # noqa: E402
from app.features.payment.db import get_subscription  # noqa: E402
from app.features.subscription.cta_tier import is_real_paid_sub  # noqa: E402
from app.features.subscription.service import SubscriptionService  # noqa: E402

logger = get_logger(__name__)

MAIN_AUDIENCE_NAME = "TheMarketBrew Daily"
RATE_LIMIT_DELAY = 0.55


@dataclass
class CtaRow:
    email: str
    user_id: Optional[str]
    in_free_cta: bool
    in_paid_cta: bool
    has_sub: bool
    is_paid: bool

    @property
    def desired_segment(self) -> str:
        return "paid" if self.is_paid else "free"

    @property
    def current_segment(self) -> str:
        if self.in_paid_cta and not self.in_free_cta:
            return "paid"
        if self.in_free_cta and not self.in_paid_cta:
            return "free"
        if self.in_free_cta and self.in_paid_cta:
            return "both"
        return "none"

    @property
    def needs_change(self) -> bool:
        return self.current_segment != self.desired_segment


def _rate_wait() -> None:
    time.sleep(RATE_LIMIT_DELAY)


def _parse_user_id(contact: dict) -> Optional[str]:
    last_name = contact.get("last_name")
    if not last_name:
        return None
    try:
        decoded = json.loads(last_name)
        if isinstance(decoded, dict):
            return decoded.get("user_id")
    except json.JSONDecodeError:
        pass
    return None


def _resolve_main_audience_id() -> str:
    _rate_wait()
    audiences = resend.Audiences.list()
    for aud in audiences.get("data", []):
        if aud.get("name") == MAIN_AUDIENCE_NAME:
            return aud["id"]
    raise RuntimeError(f'Audience "{MAIN_AUDIENCE_NAME}" not found.')


def _list_all_contacts(audience_id: str) -> list[dict]:
    contacts: list[dict] = []
    after: Optional[str] = None
    page = 0
    while True:
        page += 1
        params: dict = {"limit": 100}
        if after:
            params["after"] = after
        _rate_wait()
        result = resend.Contacts.list(audience_id=audience_id, params=params)
        batch = result.get("data", []) or []
        contacts.extend(batch)
        if len(batch) < 100:
            break
        after = batch[-1].get("id")
        if not after:
            break
    return contacts


def _segments_for_email(email: str) -> set[str]:
    _rate_wait()
    try:
        result = resend.ContactSegments.list({"email": email})
    except Exception as e:
        logger.warning("segments lookup failed for %s: %s", email, e)
        return set()
    return {seg.get("id", "") for seg in result.get("data", []) or []}


async def _find_sub(email: str, user_id: Optional[str]) -> Optional[dict]:
    if user_id:
        return await get_subscription(user_id)
    # Fall back to email lookup via list_user_profiles for legacy contacts.
    from app.core.database import get_insforge_service
    result = await get_insforge_service().call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_user_profiles"},
    )
    data = result.get("data", {})
    if not data.get("success"):
        return None
    for profile in data.get("data", []):
        if (profile.get("email") or "").lower() == email.lower():
            return await get_subscription(profile.get("user_id"))
    return None


async def collect() -> list[CtaRow]:
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY not set")
    resend.api_key = RESEND_API_KEY

    if not RESEND_SEGMENT_DAILY_FREE_CTA or not RESEND_SEGMENT_DAILY_PAID_CTA:
        raise RuntimeError(
            "RESEND_SEGMENT_DAILY_FREE_CTA / RESEND_SEGMENT_DAILY_PAID_CTA "
            "not set in env"
        )

    audience_id = _resolve_main_audience_id()
    contacts = _list_all_contacts(audience_id)
    logger.info("Total daily subscribers: %d", len(contacts))

    rows: list[CtaRow] = []
    for i, contact in enumerate(contacts, start=1):
        email = (contact.get("email") or "").strip()
        if not email:
            continue
        user_id = _parse_user_id(contact)
        seg_ids = _segments_for_email(email)
        sub = await _find_sub(email, user_id)
        rows.append(CtaRow(
            email=email,
            user_id=user_id,
            in_free_cta=RESEND_SEGMENT_DAILY_FREE_CTA in seg_ids,
            in_paid_cta=RESEND_SEGMENT_DAILY_PAID_CTA in seg_ids,
            has_sub=sub is not None,
            is_paid=is_real_paid_sub(sub),
        ))
        if i % 50 == 0:
            logger.info("processed %d/%d", i, len(contacts))
    return rows


def summarize(rows: list[CtaRow]) -> int:
    """Print summary, return drift count."""
    drift = [r for r in rows if r.needs_change]

    paid_total = sum(1 for r in rows if r.is_paid)
    free_total = sum(1 for r in rows if not r.is_paid)
    paid_correct = sum(1 for r in rows if r.is_paid and r.current_segment == "paid")
    free_correct = sum(1 for r in rows if not r.is_paid and r.current_segment == "free")

    print(f"\n=== CTA Segment Drift Audit ===")
    print(f"Total daily subscribers : {len(rows)}")
    print(f"Real paid (lifetime + Stripe-active): {paid_total}")
    print(f"  in correct paid CTA   : {paid_correct}")
    print(f"Free / trial / expired              : {free_total}")
    print(f"  in correct free CTA   : {free_correct}")
    print(f"Drift                   : {len(drift)}")
    print()

    if drift:
        by_transition: dict[str, list[CtaRow]] = {}
        for r in drift:
            key = f"{r.current_segment} -> {r.desired_segment}"
            by_transition.setdefault(key, []).append(r)
        print("Drift breakdown:")
        for key, items in sorted(by_transition.items()):
            print(f"  {key:18s}: {len(items)}")
            for r in items[:25]:
                marker = "" if r.has_sub else " (no_sub)"
                print(f"    - {r.email}{marker}")
            if len(items) > 25:
                print(f"    ... and {len(items) - 25} more")
        print()

    return len(drift)


async def apply_changes(rows: list[CtaRow]) -> tuple[int, int]:
    drift = [r for r in rows if r.needs_change]
    if not drift:
        return 0, 0
    svc = SubscriptionService()
    fixed = 0
    failed = 0
    for r in drift:
        sub = await _find_sub(r.email, r.user_id)
        try:
            actions = svc.sync_resend_segments(r.email, sub)
            logger.info(
                "AUDIT FIX %s [%s -> %s] :: %s",
                r.email, r.current_segment, r.desired_segment, actions,
            )
            fixed += 1
        except Exception as e:
            logger.error("AUDIT FIX FAILED %s: %s", r.email, e)
            failed += 1
    return fixed, failed


def write_csv(rows: list[CtaRow], path: str) -> None:
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "email", "user_id", "has_sub", "is_paid",
            "current", "desired", "needs_change",
        ])
        for r in rows:
            w.writerow([
                r.email, r.user_id or "", r.has_sub, r.is_paid,
                r.current_segment, r.desired_segment, r.needs_change,
            ])


async def _async_main(args) -> int:
    """Single-loop pipeline. See backfill_cta_segments.py for why."""
    rows = await collect()
    drift_count = summarize(rows)
    if args.csv:
        write_csv(rows, args.csv)
        print(f"CSV written: {args.csv}")

    if args.apply and drift_count > 0:
        print(f"Applying {drift_count} fix(es)...")
        fixed, failed = await apply_changes(rows)
        print(f"Fixed: {fixed}  Failed: {failed}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true",
                        help="Auto-fix drift via sync_resend_segments")
    parser.add_argument("--csv", help="Write per-contact diff CSV")
    args = parser.parse_args()
    return asyncio.run(_async_main(args))


if __name__ == "__main__":
    sys.exit(main())
