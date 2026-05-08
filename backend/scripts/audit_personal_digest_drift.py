"""
Audit personal_digest_email entitlement drift.

Read-only. Calls the same `subscriptions list_all` data source that powers
the admin dashboard, then cross-references each subscriber against:
  - is_lifetime
  - plan / status
  - access_expires_at (trial expiry)
  - presence of "personal_digest_email" in entitlements

Goal: count how many users are currently in the broadcast list (i.e. would
receive a generated digest tomorrow) but should NOT be there because their
trial has already expired or their subscription is canceled.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/audit_personal_digest_drift.py
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import get_insforge_service  # noqa: E402

DIGEST_FEATURE = "personal_digest_email"


def _parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _categorize(user, now):
    plan = user.get("plan")
    status = user.get("status")
    is_lifetime = bool(user.get("is_lifetime"))
    expires_at = _parse_dt(user.get("access_expires_at"))
    in_digest_list = DIGEST_FEATURE in (user.get("entitlements") or [])

    if is_lifetime:
        return "lifetime", in_digest_list
    if plan in ("pro", "max") and status == "active" and not expires_at:
        return "paid_active", in_digest_list
    if expires_at:
        if expires_at > now:
            return "active_trial", in_digest_list
        return "trial_expired", in_digest_list
    if status == "canceled":
        return "canceled", in_digest_list
    return "free_no_trial", in_digest_list


async def main():
    svc = get_insforge_service()
    result = await svc.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=60.0,
    )
    data = result.get("data", {})
    if not data.get("success"):
        print(f"ERROR: list_all failed: {data}")
        return 1

    users = data.get("data", [])
    now = datetime.now(timezone.utc)

    buckets = {
        "lifetime": [0, 0],
        "paid_active": [0, 0],
        "active_trial": [0, 0],
        "trial_expired": [0, 0],
        "canceled": [0, 0],
        "free_no_trial": [0, 0],
    }
    drift_users = []

    for u in users:
        cat, in_list = _categorize(u, now)
        buckets[cat][0] += 1
        if in_list:
            buckets[cat][1] += 1
        if in_list and cat in ("trial_expired", "canceled", "free_no_trial"):
            drift_users.append((cat, u))

    total = len(users)
    in_list_total = sum(b[1] for b in buckets.values())

    print(f"\n=== personal_digest_email broadcast audit ({now.isoformat()}) ===\n")
    print(f"Total subscription rows: {total}")
    print(f"Total in broadcast list (will receive digest): {in_list_total}\n")

    print(f"{'Category':<18} {'Users':>8} {'In digest':>12}")
    print("-" * 42)
    for cat, (cnt, in_list) in buckets.items():
        flag = ""
        if cat in ("trial_expired", "canceled", "free_no_trial") and in_list > 0:
            flag = "  <-- DRIFT"
        print(f"{cat:<18} {cnt:>8} {in_list:>12}{flag}")

    if drift_users:
        print(f"\nDrift users ({len(drift_users)}) — receiving digests despite no active access:\n")
        print(f"{'Category':<16} {'Email':<40} {'Plan':<6} {'Status':<10} {'Expired':<25}")
        print("-" * 100)
        for cat, u in drift_users[:200]:
            email = (u.get("email") or "")[:38]
            plan = u.get("plan") or "-"
            status = u.get("status") or "-"
            exp = u.get("access_expires_at") or "-"
            print(f"{cat:<16} {email:<40} {plan:<6} {status:<10} {exp:<25}")
        if len(drift_users) > 200:
            print(f"... and {len(drift_users) - 200} more")
    else:
        print("\nNo drift detected.")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
