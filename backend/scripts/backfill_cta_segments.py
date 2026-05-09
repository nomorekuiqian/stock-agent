"""
One-shot backfill of daily report CTA segment membership.

Walks every contact in the "TheMarketBrew Daily" audience, looks up each
recipient's Insforge subscription, computes the desired CTA tier via
``is_real_paid_sub``, and either reports the diff (default) or applies the
change via ``sync_resend_segments`` (``--apply``).

Run after deploying the new tier-aware segment routing logic to migrate
existing subscribers off the hand-curated paid_cta whitelist.

Usage:
    cd backend && source venv/bin/activate
    python scripts/backfill_cta_segments.py             # dry-run summary
    python scripts/backfill_cta_segments.py --csv out.csv
    python scripts/backfill_cta_segments.py --apply     # actually move users

Exit codes:
    0 — completed (with or without diff)
    1 — config or unrecoverable Resend/Insforge failure
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
RATE_LIMIT_DELAY = 0.55  # 550ms between Resend calls


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
            return "both"  # invalid state — needs reconciling
        return "none"

    @property
    def needs_change(self) -> bool:
        return self.current_segment != self.desired_segment


def _rate_wait() -> None:
    time.sleep(RATE_LIMIT_DELAY)


def _parse_user_id(contact: dict) -> Optional[str]:
    """user_id is JSON-encoded inside last_name (legacy convention)."""
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
    raise RuntimeError(
        f'Audience "{MAIN_AUDIENCE_NAME}" not found. Check RESEND_API_KEY.'
    )


def _resend_call_with_retry(fn, *args, max_attempts: int = 3, **kwargs):
    """Call Resend API with exponential backoff for transient errors."""
    last_err: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            last_err = e
            if attempt < max_attempts:
                wait = 2 ** attempt  # 2s, 4s
                logger.warning("Resend call failed (attempt %d/%d): %s; retrying in %ds",
                               attempt, max_attempts, e, wait)
                time.sleep(wait)
    assert last_err is not None
    raise last_err


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
        result = _resend_call_with_retry(
            resend.Contacts.list, audience_id=audience_id, params=params
        )
        batch = result.get("data", []) or []
        contacts.extend(batch)
        logger.info("page %d fetched %d (total %d)", page, len(batch), len(contacts))
        if len(batch) < 100:
            break
        after = batch[-1].get("id")
        if not after:
            break
    return contacts


def _segments_for_email(email: str) -> Optional[set[str]]:
    """Return current segment IDs for the email, or None if lookup failed.

    Returning None (rather than empty set) lets the caller skip this contact
    so we don't misclassify a real paid user as having no segments due to a
    transient API error.
    """
    _rate_wait()
    try:
        result = _resend_call_with_retry(
            resend.ContactSegments.list, {"email": email}
        )
    except Exception as e:
        logger.warning("segments lookup failed for %s: %s", email, e)
        return None
    return {seg.get("id", "") for seg in result.get("data", []) or []}


async def _find_sub_for_email(email: str, user_id: Optional[str]) -> Optional[dict]:
    """Resolve a subscription record from email or user_id.

    Best-effort: returns None on network failures so a single transient
    blip doesn't crash a 500-contact run. Drift audit will reconcile.
    """
    if user_id:
        try:
            return await get_subscription(user_id)
        except Exception as e:
            logger.warning("get_subscription failed for %s: %s", user_id[:8], e)
            return None

    # Legacy contact — fall back to email lookup via list_user_profiles.
    try:
        from app.core.database import get_insforge_service
        service = get_insforge_service()
        result = await service.call_function(
            "subscriptions",
            method="GET",
            params={"action": "list_user_profiles"},
        )
    except Exception as e:
        logger.warning("list_user_profiles failed for %s: %s", email, e)
        return None
    data = result.get("data", {})
    if not data.get("success"):
        return None
    for profile in data.get("data", []):
        if (profile.get("email") or "").lower() == email.lower():
            return await get_subscription(profile.get("user_id"))
    return None


async def collect() -> list[CtaRow]:
    """Walk Resend audience + Insforge subs, build a row per contact."""
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY not set")
    resend.api_key = RESEND_API_KEY

    if not RESEND_SEGMENT_DAILY_FREE_CTA or not RESEND_SEGMENT_DAILY_PAID_CTA:
        raise RuntimeError(
            "RESEND_SEGMENT_DAILY_FREE_CTA / RESEND_SEGMENT_DAILY_PAID_CTA "
            "not set in env"
        )

    logger.info("Resolving main audience '%s'", MAIN_AUDIENCE_NAME)
    audience_id = _resolve_main_audience_id()
    logger.info("Listing all contacts (paginated)")
    contacts = _list_all_contacts(audience_id)
    logger.info("Total contacts: %d", len(contacts))

    rows: list[CtaRow] = []
    for i, contact in enumerate(contacts, start=1):
        email = (contact.get("email") or "").strip()
        if not email:
            continue
        user_id = _parse_user_id(contact)

        seg_ids = _segments_for_email(email)
        if seg_ids is None:
            # Transient lookup failure — skip rather than risk misclassifying.
            # Drift audit will catch up next run.
            logger.warning("skipping %s (segments lookup failed after retries)", email)
            continue
        in_free = RESEND_SEGMENT_DAILY_FREE_CTA in seg_ids
        in_paid = RESEND_SEGMENT_DAILY_PAID_CTA in seg_ids

        sub = await _find_sub_for_email(email, user_id)
        is_paid = is_real_paid_sub(sub)

        rows.append(
            CtaRow(
                email=email,
                user_id=user_id,
                in_free_cta=in_free,
                in_paid_cta=in_paid,
                has_sub=sub is not None,
                is_paid=is_paid,
            )
        )

        if i % 25 == 0:
            logger.info("processed %d/%d", i, len(contacts))

    return rows


def summarize(rows: list[CtaRow]) -> None:
    total = len(rows)
    paid_correct = sum(1 for r in rows if r.is_paid and r.current_segment == "paid")
    free_correct = sum(1 for r in rows if not r.is_paid and r.current_segment == "free")
    drift = [r for r in rows if r.needs_change]

    print(f"\n=== CTA Segment Backfill Audit ===")
    print(f"Total daily subscribers : {total}")
    print(f"Real paid (lifetime + Stripe-active): {sum(1 for r in rows if r.is_paid)}")
    print(f"Free / trial / expired              : {sum(1 for r in rows if not r.is_paid)}")
    print(f"")
    print(f"Already in correct paid CTA: {paid_correct}")
    print(f"Already in correct free CTA: {free_correct}")
    print(f"Drift (needs migration)    : {len(drift)}")
    print(f"")

    if not drift:
        print("Nothing to do.")
        return

    by_transition: dict[str, list[CtaRow]] = {}
    for r in drift:
        key = f"{r.current_segment} -> {r.desired_segment}"
        by_transition.setdefault(key, []).append(r)

    print("Drift breakdown:")
    for key, items in sorted(by_transition.items()):
        print(f"  {key:18s}: {len(items)}")
        for r in items[:25]:
            sub_marker = "" if r.has_sub else " (no_sub)"
            print(f"    - {r.email}{sub_marker}")
        if len(items) > 25:
            print(f"    ... and {len(items) - 25} more")
    print()


async def apply_changes(rows: list[CtaRow]) -> None:
    """Apply via sync_resend_segments. Idempotent."""
    drift = [r for r in rows if r.needs_change]
    if not drift:
        print("No changes to apply.")
        return

    print(f"Applying {len(drift)} change(s)...")
    svc = SubscriptionService()
    fixed = 0
    failed = 0
    for r in drift:
        sub = await _find_sub_for_email(r.email, r.user_id)
        try:
            actions = svc.sync_resend_segments(r.email, sub)
            print(f"  [{r.current_segment} -> {r.desired_segment}] {r.email} :: {actions}")
            fixed += 1
        except Exception as e:
            print(f"  FAILED {r.email}: {e}")
            failed += 1
    print(f"\nApplied {fixed}, failed {failed}")


def write_csv(rows: list[CtaRow], path: str) -> None:
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            ["email", "user_id", "has_sub", "is_paid",
             "current", "desired", "needs_change"]
        )
        for r in rows:
            w.writerow([
                r.email, r.user_id or "", r.has_sub, r.is_paid,
                r.current_segment, r.desired_segment, r.needs_change,
            ])
    print(f"CSV written: {path}")


async def _async_main(args) -> int:
    """Run collect + (optional) apply in a single event loop.

    Both ``collect`` and ``apply_changes`` await Insforge via httpx, whose
    client is a singleton bound to whichever event loop first touched it.
    Calling ``asyncio.run`` twice (once for each phase) closes that loop in
    between and the second call crashes with "Event loop is closed". So we
    keep the whole pipeline in one loop.
    """
    rows = await collect()
    summarize(rows)
    if args.csv:
        write_csv(rows, args.csv)

    if args.apply:
        await apply_changes(rows)
    else:
        print("Dry run only. Re-run with --apply to migrate.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true",
                        help="Actually apply changes via sync_resend_segments")
    parser.add_argument("--csv", help="Write full per-contact diff to CSV")
    args = parser.parse_args()

    return asyncio.run(_async_main(args))


if __name__ == "__main__":
    sys.exit(main())
