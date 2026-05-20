"""
Inspect voya's watchlist + cached digest directly via Insforge edge functions
using the backend's anon-key path — no user JWT needed.

If the edge functions require user JWT, this will fail with 401/403 and we'll
know to take a different approach.

Usage:
    cd backend
    source venv/bin/activate
    PYTHONPATH=. python scripts/inspect_voya.py
"""

from __future__ import annotations

import asyncio
import json

from dotenv import load_dotenv

load_dotenv()

from app.features.brew.db import get_user_watchlist, get_user_digest  # noqa: E402
from app.core.database import get_insforge_service  # noqa: E402
from app.utils.timezone import today_str  # noqa: E402

VOYA_EMAIL = "voya.technologies@gmail.com"


async def resolve_user_id(email: str) -> str | None:
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_user_profiles"},
    )
    data = result.get("data", {}) or {}
    if not data.get("success"):
        print(f"  list_user_profiles failed: status={result.get('status_code')}")
        return None
    for profile in data.get("data", []):
        if (profile.get("email") or "").lower() == email.lower():
            return profile.get("user_id")
    return None


def find_pstg_or_p(stocks):
    for s in stocks or []:
        sym = (s.get("symbol") or "").upper()
        if sym in ("P", "PSTG"):
            return s
    return None


async def main():
    print(f"=== 0. Resolving user_id for {VOYA_EMAIL} ===")
    user_id = await resolve_user_id(VOYA_EMAIL)
    if not user_id:
        print(f"  could not resolve user_id for {VOYA_EMAIL}")
        return
    print(f"  voya user_id: {user_id}")
    print(f"  today (Pacific): {today_str()}\n")

    print("=== 1. voya watchlist ===")
    wl = await get_user_watchlist(user_id)
    if not wl:
        print("  watchlist returned None (anon key may not have read access)")
    else:
        print(f"  raw keys: {list(wl.keys())}")
        symbols = wl.get("symbols") or []
        updated = wl.get("updated_at") or wl.get("base_updated_at")
        print(f"  symbols: {symbols}")
        print(f"  updated_at: {updated}")
        upper = [s.upper() for s in symbols]
        print(f"  has 'P':    {'P' in upper}")
        print(f"  has 'PSTG': {'PSTG' in upper}")

    print("\n=== 2. voya today's cached digest ===")
    digest = await get_user_digest(user_id, today_str())
    if not digest:
        print("  no cached digest for today (anon may lack read OR no digest exists)")
        return

    print(f"  raw keys: {list(digest.keys())}")
    sym_list = digest.get("symbols") or []
    print(f"  cached symbols: {sym_list}")
    print(f"  cached digest_date: {digest.get('digest_date')}")
    print(f"  created_at: {digest.get('created_at')}")

    digest_data = digest.get("digest_data") or digest
    cached_stocks = digest_data.get("stocks") or []
    print(f"  cached stocks count: {len(cached_stocks)}")
    for s in cached_stocks:
        print(f"    - {s.get('symbol'):>6}  name={s.get('name')!r}  change={s.get('daily_change')!r}")

    found = find_pstg_or_p(cached_stocks)
    if found:
        print(f"\n  >>> Found {found.get('symbol')} in cached digest:")
        print(f"      name      : {found.get('name')!r}")
        print(f"      status    : {found.get('status', '')!r}")
        qt = found.get("quick_take") or ""
        print(f"      quick_take: {qt[:400]}")

        blob = json.dumps(digest_data, ensure_ascii=False).lower()
        print(f"\n  Term scan in cached digest:")
        print(f"    'everpure'     x{blob.count('everpure')}")
        print(f"    'pure storage' x{blob.count('pure storage')}")
    else:
        print("\n  >>> P / PSTG NOT in cached digest. Cron likely ran before the symbol was added.")


if __name__ == "__main__":
    asyncio.run(main())
