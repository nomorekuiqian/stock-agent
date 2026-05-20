# pyright: reportMissingImports=false, reportUnreachable=false
"""Grant or revoke lifetime entitlement for a user.

Used by the主理人 to make a contributor's account effectively Max-tier
without going through Stripe. See docs/contributing.md "测试账号 / Admin / 终身付费".

Usage (from project root, with backend venv activated):

    # Grant
    python scripts/grant_lifetime.py --user-id <uuid>

    # Revoke
    python scripts/grant_lifetime.py --user-id <uuid> --revoke

    # Look up user_id by email first (helpful when you only know the email)
    python scripts/grant_lifetime.py --email alice@gmail.com

Requirements:
- backend/.env has INSFORGE_BASE_URL and INSFORGE_SERVICE_KEY set
  (this script bypasses RLS, so service key is required)
- Run from the project root
"""

import argparse
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(PROJECT_ROOT / "backend" / ".env")

from app.features.payment.db import set_lifetime, get_user_email_by_id  # noqa: E402
from app.shared.insforge_service import get_insforge_service  # noqa: E402


MAX_ENTITLEMENTS = [
    "daily_report_email",
    "morning_report_email",
    "weekly_report_email",
    "personal_digest_email",
    "stock_analysis",
    "macro_dashboard",
    "screener",
    "twitter_digest",
]


async def lookup_user_id_by_email(email: str) -> str | None:
    """Reverse lookup user_id by email via Insforge profiles edge function."""
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_user_profiles"},
    )
    data = result.get("data", {}) or {}
    profiles = data.get("data", []) if isinstance(data, dict) else []
    for profile in profiles:
        if profile.get("email", "").lower() == email.lower():
            return profile.get("user_id") or profile.get("id")
    return None


async def main() -> int:
    parser = argparse.ArgumentParser(description="Grant or revoke lifetime entitlement.")
    parser.add_argument("--user-id", help="Insforge user_id (UUID).")
    parser.add_argument("--email", help="Look up user_id by email first.")
    parser.add_argument(
        "--revoke",
        action="store_true",
        help="Revoke lifetime instead of granting.",
    )
    args = parser.parse_args()

    if not args.user_id and not args.email:
        parser.error("Provide either --user-id or --email")
        return 2

    user_id = args.user_id
    if args.email and not user_id:
        print(f"Looking up user_id for email {args.email}...")
        user_id = await lookup_user_id_by_email(args.email)
        if not user_id:
            print(f"ERROR: no Insforge user found with email {args.email}")
            return 1
        print(f"Resolved user_id = {user_id}")

    is_lifetime = not args.revoke
    entitlements = MAX_ENTITLEMENTS if is_lifetime else []

    action = "Granting" if is_lifetime else "Revoking"
    print(f"{action} lifetime for user {user_id} ...")

    ok = await set_lifetime(user_id, is_lifetime=is_lifetime, entitlements=entitlements)

    if not ok:
        print(f"FAILED — set_lifetime returned False for {user_id}")
        print("Check that INSFORGE_SERVICE_KEY is set and the user_id exists.")
        return 1

    try:
        email = await get_user_email_by_id(user_id)
    except Exception:
        email = None
    suffix = f" ({email})" if email else ""
    verb = "granted" if is_lifetime else "revoked"
    print(f"OK — lifetime {verb} for {user_id}{suffix}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
