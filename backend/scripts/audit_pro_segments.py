"""
Audit Pro segment membership for drift.

Read-only script. Walks every contact in the main "TheMarketBrew Daily"
audience, checks which Pro segments they're in (morning_report,
weekly_report), and cross-references with the Insforge subscriptions
table to identify "free users currently receiving Pro emails" — i.e.,
the historical drift that Phase B of enforce-tier-gating.md was meant
to clean up.

Produces a stdout summary plus optional CSV report. Does NOT write to
Resend or Insforge.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/audit_pro_segments.py                # stdout summary only
    python scripts/audit_pro_segments.py --csv report.csv   # also write CSV

Exit codes:
    0 — audit completed (drift count printed)
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
from datetime import datetime, timezone
from typing import Optional

# Allow running from backend/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import resend  # noqa: E402

from app.core.config import (  # noqa: E402
    RESEND_API_KEY,
    RESEND_SEGMENT_MORNING,
    RESEND_SEGMENT_WEEKLY,
)
from app.core.logging import get_logger  # noqa: E402
from app.features.payment.db import get_subscription  # noqa: E402

logger = get_logger(__name__)

MAIN_AUDIENCE_NAME = "TheMarketBrew Daily"
RATE_LIMIT_DELAY = 0.55  # 550ms between Resend calls (Resend = 2 req/s)


@dataclass
class ContactRow:
    email: str
    first_name: Optional[str]
    user_id: Optional[str]
    in_morning: bool
    in_weekly: bool
    plan: Optional[str]
    status: Optional[str]
    is_pro_now: bool

    @property
    def is_drift(self) -> bool:
        """Drift = in a Pro segment but not actually Pro."""
        return (self.in_morning or self.in_weekly) and not self.is_pro_now


def _rate_wait() -> None:
    time.sleep(RATE_LIMIT_DELAY)


def _parse_metadata(contact: dict) -> tuple[Optional[str], Optional[str]]:
    """Extract (first_name, user_id) from a Resend contact.

    user_id is JSON-encoded inside last_name (legacy convention).
    """
    first_name = contact.get("first_name") or None
    user_id: Optional[str] = None
    last_name = contact.get("last_name")
    if last_name:
        try:
            decoded = json.loads(last_name)
            if isinstance(decoded, dict):
                user_id = decoded.get("user_id")
        except json.JSONDecodeError:
            pass
    return first_name, user_id


def _resolve_main_audience_id() -> str:
    """Find the audience ID by name."""
    _rate_wait()
    audiences = resend.Audiences.list()
    for aud in audiences.get("data", []):
        if aud.get("name") == MAIN_AUDIENCE_NAME:
            return aud["id"]
    raise RuntimeError(
        f'Audience "{MAIN_AUDIENCE_NAME}" not found in Resend. '
        "Check RESEND_API_KEY points to the right account."
    )


def _list_all_contacts(audience_id: str) -> list[dict]:
    """List every contact in the audience, paginating."""
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
        logger.info("page %d: fetched %d contacts (running total %d)", page, len(batch), len(contacts))

        if len(batch) < 100:
            break
        # Resend pagination uses the last item's id as the cursor
        after = batch[-1].get("id")
        if not after:
            break

    return contacts


def _get_segments_for_email(email: str) -> set[str]:
    """Return the set of segment IDs this email is currently in."""
    _rate_wait()
    try:
        result = resend.ContactSegments.list({"email": email})
    except Exception as e:
        logger.warning("Failed to list segments for %s: %s", email, e)
        return set()
    return {seg.get("id", "") for seg in result.get("data", []) or []}


async def _classify_user_pro_status(user_id: Optional[str]) -> tuple[Optional[str], Optional[str], bool]:
    """Look up Insforge subscription. Return (plan, status, is_pro_now).

    is_pro_now follows the same logic as router._is_pro_user:
    plan in (pro, max), status active, access_expires_at not expired.
    """
    if not user_id:
        return None, None, False
    sub = await get_subscription(user_id)
    if not sub:
        return None, None, False

    plan = sub.get("plan")
    status = sub.get("status")
    if plan not in ("pro", "max") or status != "active":
        return plan, status, False

    expires_at = sub.get("access_expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc):
                return plan, status, False
        except (ValueError, TypeError):
            return plan, status, False

    return plan, status, True


async def audit() -> list[ContactRow]:
    """Run the full audit. Returns one row per contact."""
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY not set")
    resend.api_key = RESEND_API_KEY

    if not RESEND_SEGMENT_MORNING or not RESEND_SEGMENT_WEEKLY:
        raise RuntimeError(
            "RESEND_SEGMENT_MORNING or RESEND_SEGMENT_WEEKLY not set in env"
        )

    logger.info("Resolving main audience '%s'", MAIN_AUDIENCE_NAME)
    audience_id = _resolve_main_audience_id()
    logger.info("Audience id: %s", audience_id)

    logger.info("Listing all contacts in audience (paginated)")
    contacts = _list_all_contacts(audience_id)
    logger.info("Total contacts: %d", len(contacts))
    logger.info(
        "Estimated runtime: ~%d seconds for segment + Insforge lookups",
        int(len(contacts) * (RATE_LIMIT_DELAY + 0.05)),
    )

    rows: list[ContactRow] = []
    for i, contact in enumerate(contacts, start=1):
        email = contact.get("email") or ""
        if not email:
            continue

        first_name, user_id = _parse_metadata(contact)
        seg_ids = _get_segments_for_email(email)
        in_morning = RESEND_SEGMENT_MORNING in seg_ids
        in_weekly = RESEND_SEGMENT_WEEKLY in seg_ids

        # Only spend the Insforge query on contacts who are in a Pro segment
        # (everyone else is fine — they're just on the free evening list).
        if in_morning or in_weekly:
            plan, status, is_pro_now = await _classify_user_pro_status(user_id)
        else:
            plan, status, is_pro_now = None, None, False

        rows.append(ContactRow(
            email=email,
            first_name=first_name,
            user_id=user_id,
            in_morning=in_morning,
            in_weekly=in_weekly,
            plan=plan,
            status=status,
            is_pro_now=is_pro_now,
        ))

        if i % 25 == 0:
            logger.info("Progress: %d/%d contacts processed", i, len(contacts))

    return rows


def _print_summary(rows: list[ContactRow]) -> None:
    total = len(rows)
    in_morning = [r for r in rows if r.in_morning]
    in_weekly = [r for r in rows if r.in_weekly]
    in_either = [r for r in rows if r.in_morning or r.in_weekly]
    drift = [r for r in rows if r.is_drift]
    no_user_id = [r for r in in_either if not r.user_id]
    legit_pro = [r for r in in_either if r.is_pro_now]

    print()
    print("=" * 70)
    print("PRO SEGMENT AUDIT SUMMARY")
    print("=" * 70)
    print(f"Total contacts in main audience:   {total}")
    print(f"In morning_report segment:         {len(in_morning)}")
    print(f"In weekly_report segment:          {len(in_weekly)}")
    print(f"In either Pro segment:             {len(in_either)}")
    print()
    print("OF THOSE IN PRO SEGMENTS:")
    print(f"  Legitimate Pro/Max users:        {len(legit_pro)}")
    print(f"  No linked user_id (anonymous):   {len(no_user_id)}")
    print(f"  DRIFT (not Pro, in Pro segment): {len(drift)}")
    print()

    if drift:
        print("=" * 70)
        print("DRIFT DETAIL")
        print("=" * 70)
        for r in drift:
            segs = []
            if r.in_morning:
                segs.append("morning")
            if r.in_weekly:
                segs.append("weekly")
            uid_short = (r.user_id or "<none>")[:8]
            plan_str = f"plan={r.plan or '?'} status={r.status or '?'}"
            print(f"  {r.email:40} user={uid_short}  segs={','.join(segs):15} {plan_str}")
    else:
        print("No drift detected. Resend Pro segments match Insforge state.")
    print()


def _write_csv(rows: list[ContactRow], path: str) -> None:
    fields = [
        "email", "first_name", "user_id",
        "in_morning", "in_weekly",
        "plan", "status", "is_pro_now", "is_drift",
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for r in rows:
            writer.writerow({
                "email": r.email,
                "first_name": r.first_name or "",
                "user_id": r.user_id or "",
                "in_morning": r.in_morning,
                "in_weekly": r.in_weekly,
                "plan": r.plan or "",
                "status": r.status or "",
                "is_pro_now": r.is_pro_now,
                "is_drift": r.is_drift,
            })
    print(f"Wrote {len(rows)} rows to {path}")


def _cleanup_drift(rows: list[ContactRow]) -> None:
    """Remove drift contacts from Pro segments (morning + weekly).

    Only touches contacts where is_drift is True. Leaves the evening
    (free) segment untouched so they keep receiving the daily report.
    """
    drift = [r for r in rows if r.is_drift]
    if not drift:
        print("No drift to clean up.")
        return

    print()
    print("=" * 70)
    print(f"CLEANUP: removing {len(drift)} drift contacts from Pro segments")
    print("=" * 70)

    removed_morning = 0
    removed_weekly = 0
    errors = 0

    for i, r in enumerate(drift, start=1):
        if r.in_morning and RESEND_SEGMENT_MORNING:
            _rate_wait()
            try:
                resend.ContactSegments.remove({
                    "email": r.email,
                    "segment_id": RESEND_SEGMENT_MORNING,
                })
                removed_morning += 1
            except Exception as e:
                logger.warning("Failed to remove %s from morning: %s", r.email, e)
                errors += 1

        if r.in_weekly and RESEND_SEGMENT_WEEKLY:
            _rate_wait()
            try:
                resend.ContactSegments.remove({
                    "email": r.email,
                    "segment_id": RESEND_SEGMENT_WEEKLY,
                })
                removed_weekly += 1
            except Exception as e:
                logger.warning("Failed to remove %s from weekly: %s", r.email, e)
                errors += 1

        if i % 25 == 0:
            print(f"  Progress: {i}/{len(drift)} contacts processed")

    print()
    print(f"Cleanup complete:")
    print(f"  Removed from morning_report: {removed_morning}")
    print(f"  Removed from weekly_report:  {removed_weekly}")
    if errors:
        print(f"  Errors (check logs):         {errors}")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit Pro segment membership against Insforge subscriptions"
    )
    parser.add_argument(
        "--csv",
        type=str,
        default=None,
        help="Optional path to write a per-contact CSV report",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Remove drift contacts from Pro segments (morning + weekly)",
    )
    args = parser.parse_args()

    try:
        rows = asyncio.run(audit())
    except Exception as e:
        logger.exception("Audit failed")
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    _print_summary(rows)

    if args.csv:
        _write_csv(rows, args.csv)

    if args.cleanup:
        _cleanup_drift(rows)

    return 0


if __name__ == "__main__":
    sys.exit(main())
