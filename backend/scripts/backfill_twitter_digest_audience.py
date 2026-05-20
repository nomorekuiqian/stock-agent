"""
[DEPRECATED 2026-05-14] Superseded by `migrate_twitter_digest_audience.py`,
which copies the daily-audience membership into the dedicated Twitter Digest
audience driven by `RESEND_SEGMENT_TWITTER_DIGEST`. Kept on disk for the
emergency case where the new audience needs to be re-seeded from the
Insforge user list (not the daily audience).

Original purpose ----------------------------------------------------------

Backfill the Resend "Twitter Digest" audience with all existing signed-up users.

Usage:
    # Dry run (default) — shows planned adds, makes no API calls to Resend
    python scripts/backfill_twitter_digest_audience.py

    # Execute against Resend
    python scripts/backfill_twitter_digest_audience.py --execute

Requires:
    RESEND_API_KEY            (resend.com API key)
    INSFORGE_BASE_URL         (resolves user list)
    INSFORGE_ANON_KEY         (or service key)
    RESEND_SEGMENT_TWITTER_DIGEST  (target audience id; if missing the script
                                    looks up "TheMarketBrew Twitter Digest"
                                    and creates it if absent)
"""

import argparse
import asyncio
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import resend  # type: ignore

from app.core.config import RESEND_API_KEY, RESEND_SEGMENT_TWITTER_DIGEST
from app.core.database import get_insforge_service

_AUDIENCE_NAME = "TheMarketBrew Twitter Digest"
_RATE_DELAY = 0.55  # 550ms between Resend API calls — under their 2 req/s limit


def _rate_wait() -> None:
    time.sleep(_RATE_DELAY)


def _ensure_audience() -> str:
    """Return the twitter-digest audience id; create it if necessary."""
    if RESEND_SEGMENT_TWITTER_DIGEST:
        print(
            f"[audience] using RESEND_SEGMENT_TWITTER_DIGEST="
            f"{RESEND_SEGMENT_TWITTER_DIGEST}"
        )
        return RESEND_SEGMENT_TWITTER_DIGEST

    print(f"[audience] env unset, looking up by name {_AUDIENCE_NAME!r}...")
    _rate_wait()
    existing = resend.Audiences.list().get("data", [])
    for aud in existing:
        if aud.get("name") == _AUDIENCE_NAME:
            aid = aud["id"]
            print(f"[audience] found existing id={aid}")
            return aid

    print(f"[audience] not found, creating...")
    _rate_wait()
    created = resend.Audiences.create({"name": _AUDIENCE_NAME})
    aid = created["id"]
    print(f"[audience] created id={aid}")
    return aid


async def _list_users() -> list[dict]:
    """Fetch all signed-up users from Insforge (via subscriptions list_all)."""
    db = get_insforge_service()
    result = await db.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=60.0,
    )
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(f"list_all failed: {payload}")
    return payload.get("data") or []


def _existing_contact_emails(audience_id: str) -> set[str]:
    """Return the lowercased emails already in the audience.

    Resend's Contacts.list doesn't paginate (returns up to ~1000). For a fresh
    audience this is fine; if we outgrow it later, switch to incremental sync.
    """
    _rate_wait()
    res = resend.Contacts.list(audience_id=audience_id)
    contacts = res.get("data", []) if isinstance(res, dict) else []
    return {(c.get("email") or "").lower() for c in contacts if c.get("email")}


def _add_contact(audience_id: str, email: str, user_id: str, first_name: str | None) -> dict:
    """Create a new contact in the audience. Returns the API response."""
    params: dict = {
        "audience_id": audience_id,
        "email": email,
        "unsubscribed": False,
    }
    if first_name:
        params["first_name"] = first_name
    if user_id:
        params["last_name"] = json.dumps({"user_id": user_id})
    _rate_wait()
    return resend.Contacts.create(params)


async def main(execute: bool) -> int:
    if not RESEND_API_KEY:
        print("ERROR: RESEND_API_KEY not configured", file=sys.stderr)
        return 1
    resend.api_key = RESEND_API_KEY

    users = await _list_users()
    print(f"[insforge] fetched {len(users)} subscription rows")

    candidates: list[dict] = []
    for u in users:
        email = (u.get("email") or "").strip().lower()
        if not email:
            continue
        candidates.append({
            "email": email,
            "user_id": u.get("user_id") or "",
            "first_name": u.get("first_name") or u.get("name") or "",
        })
    print(f"[insforge] {len(candidates)} candidates with valid email")

    audience_id = _ensure_audience()
    existing = _existing_contact_emails(audience_id)
    print(f"[resend] {len(existing)} contacts already in audience")

    to_add = [c for c in candidates if c["email"] not in existing]
    print(f"[plan] adding {len(to_add)} new contacts ({len(candidates) - len(to_add)} already present)")

    if not execute:
        print("\n[dry-run] would add these contacts (first 20 shown):")
        for c in to_add[:20]:
            print(f"  + {c['email']:40s} user_id={c['user_id'][:8]}... first={c['first_name'] or '-'}")
        if len(to_add) > 20:
            print(f"  ... and {len(to_add) - 20} more")
        print("\nRun with --execute to actually add them.")
        return 0

    added = 0
    failed = 0
    for i, c in enumerate(to_add):
        try:
            _add_contact(audience_id, c["email"], c["user_id"], c["first_name"])
            added += 1
            if i % 25 == 0:
                print(f"[progress] {i + 1}/{len(to_add)} added={added} failed={failed}")
        except Exception as e:
            failed += 1
            print(f"[fail] {c['email']}: {e}", file=sys.stderr)

    print(f"\n[done] added={added} failed={failed} total={len(to_add)}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute", action="store_true",
        help="Actually add contacts to Resend (default: dry run)",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.execute)))
