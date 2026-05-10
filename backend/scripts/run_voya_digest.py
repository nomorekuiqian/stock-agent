"""
Generate today's digest for voya using her real watchlist (with ticker P).
Bypasses the frontend — calls PersonalDigest directly so we can see what
ticker P renders as after the profile_cache fix.

Usage:
    cd backend
    source venv/bin/activate
    PYTHONPATH=. python scripts/run_voya_digest.py
"""

from __future__ import annotations

import asyncio
import json

from dotenv import load_dotenv

load_dotenv()

from app.features.brew.agent import PersonalDigest  # noqa: E402
from app.features.brew.db import get_user_watchlist, save_user_digest  # noqa: E402
from app.core.database import get_insforge_service  # noqa: E402
from app.utils.timezone import today_str, now_iso  # noqa: E402

VOYA_EMAIL = "voya.technologies@gmail.com"


async def resolve_user_id(email: str):
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_user_profiles"},
    )
    data = result.get("data", {}) or {}
    if not data.get("success"):
        return None
    for profile in data.get("data", []):
        if (profile.get("email") or "").lower() == email.lower():
            return profile.get("user_id")
    return None


async def main():
    user_id = await resolve_user_id(VOYA_EMAIL)
    if not user_id:
        print(f"Could not resolve user_id for {VOYA_EMAIL}")
        return
    print(f"voya user_id: {user_id}")

    wl = await get_user_watchlist(user_id) or {}
    symbols = wl.get("symbols") or []
    print(f"watchlist: {symbols}\n")

    if not symbols:
        print("Empty watchlist; aborting.")
        return

    print("=== Generating digest with new profile_cache fix ===")
    digest = PersonalDigest()
    result = await digest.generate(symbols=symbols, user_id=user_id)

    if not result.get("success"):
        print(f"Generation failed: {result}")
        return

    print(f"\nresult keys: {list(result.keys())}")

    print("\n=== Stocks ===")
    for s in result.get("stocks", []):
        sym = s.get("symbol", "")
        print(f"  {sym:>6} | name={s.get('name')!r:<25} | change={s.get('daily_change')!r}")
        if sym.upper() == "P":
            print(f"\n  >>> Ticker P deep view <<<")
            print(f"  status     : {s.get('status', '')!r}")
            print(f"  quick_take :")
            print(f"    {s.get('quick_take', '').replace(chr(10), chr(10) + '    ')}")

    print("\n=== Term scan across full digest ===")
    blob = json.dumps(result, ensure_ascii=False).lower()
    for term in ["everpure", "pure storage", "pandora"]:
        print(f"  '{term}' x{blob.count(term)}")

    print("\n=== Greeting + summary ===")
    print(f"  greeting: {result.get('greeting', '')}")
    print(f"  one_line: {result.get('one_line_summary', '')}")
    summary = result.get("summary", {}) or {}
    content = summary.get("content", "") if isinstance(summary, dict) else str(summary)
    print(f"  summary: {content[:600]}...")

    # Persist so the frontend /for-you page can render it (matches router save shape)
    print("\n=== Saving digest to Insforge so frontend can render it ===")
    save_payload = {
        "user_id": user_id,
        "digest_date": today_str(),
        "timestamp": result.get("timestamp", now_iso()),
        "symbols": result.get("symbols_used", []),
        "greeting": result.get("greeting", ""),
        "one_line_summary": result.get("one_line_summary", ""),
        "stocks": result.get("stocks", []),
        "news": result.get("news", {}),
        "events": result.get("events", []),
        "summary": result.get("summary", {}),
    }
    save_result = await save_user_digest(save_payload)
    if save_result.get("success"):
        print(f"  saved OK, digest_id={save_result.get('digest_id')}")
        print(f"  reload http://localhost:3000/for-you to see it")
    else:
        print(f"  save FAILED: {save_result}")


if __name__ == "__main__":
    asyncio.run(main())
