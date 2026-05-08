"""
Grant (or revoke) lifetime max access for a user by email.

Lifetime users bypass Stripe webhook downgrades — even if their Stripe
subscription is canceled or never existed, they keep full max entitlements
forever. See `docs/plans/active/lifetime-max-system.md` for design.

Usage:
    cd backend
    source venv/bin/activate

    # Grant lifetime
    python scripts/grant_lifetime.py wushaoqing1986@gmail.com

    # Revoke lifetime (back to whatever Stripe says)
    python scripts/grant_lifetime.py wushaoqing1986@gmail.com --revoke

Exit codes:
    0 — success
    1 — user not found or upsert failed
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import get_insforge_service  # noqa: E402
from app.core.logging import get_logger  # noqa: E402
from app.features.payment.db import set_lifetime  # noqa: E402
from app.features.payment.entitlements import MAX_FEATURES  # noqa: E402

logger = get_logger(__name__)


async def find_user_id_by_email(email: str) -> str | None:
    """Look up a user_id from the subscriptions list_all endpoint."""
    service = get_insforge_service()
    result = await service.call_function("subscriptions", method="GET", params={"action": "list_all"})
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("list_all failed: %s", result.get("text"))
        return None
    target = email.strip().lower()
    for row in data.get("data", []):
        if (row.get("email") or "").lower() == target:
            return row.get("user_id")
    return None


async def main(email: str, revoke: bool) -> int:
    user_id = await find_user_id_by_email(email)
    if not user_id:
        logger.error("No user found for email: %s", email)
        return 1

    if revoke:
        ok = await set_lifetime(user_id=user_id, is_lifetime=False)
        action = "revoked"
    else:
        ok = await set_lifetime(
            user_id=user_id,
            is_lifetime=True,
            entitlements=sorted(MAX_FEATURES),
        )
        action = "granted"

    if not ok:
        logger.error("set_lifetime call failed for user %s", user_id)
        return 1

    logger.info("Lifetime %s for %s (user_id=%s)", action, email, user_id)
    print(f"OK: lifetime {action} for {email} (user_id={user_id})")
    await service_close()
    return 0


async def service_close() -> None:
    """Close the shared HTTP client to allow a clean exit."""
    service = get_insforge_service()
    await service.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Grant or revoke lifetime max access")
    parser.add_argument("email", help="User email to update")
    parser.add_argument("--revoke", action="store_true", help="Revoke lifetime instead of granting")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.email, args.revoke)))
