"""
Debug voya's personal digest end-to-end:

1. Log in as voya via Insforge Auth API (using anon key) -> access token
2. GET  /api/watchlist            -> what symbols are currently saved
3. GET  /api/digests              -> what's cached (today's digest, if any)
4. POST /api/digest               -> server returns either cached or fresh

The router regenerates only when current request symbols differ from cached
symbols (router.py:227-233). If that condition is true (which it should be
right after PSTG was added to the watchlist), the response is generated with
the new profile_cache fix.

Usage:
    cd backend
    source venv/bin/activate
    PYTHONPATH=. python scripts/debug_voya_digest.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

INSFORGE_BASE_URL = os.getenv("INSFORGE_BASE_URL", "https://9wmhxyi4.us-east.insforge.app")
INSFORGE_ANON_KEY = os.getenv("INSFORGE_ANON_KEY", "")
BACKEND_URL = "http://localhost:8000"

EMAIL = "voya.technologies@gmail.com"
PASSWORD = "123456"


async def login() -> str:
    """Get access token. Prefers VOYA_TOKEN env var (paste from browser cookie);
    falls back to programmatic Insforge sign-in if password works."""
    token_env = os.getenv("VOYA_TOKEN", "").strip()
    if token_env:
        print(f"  using VOYA_TOKEN env var (len {len(token_env)})")
        return token_env

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{INSFORGE_BASE_URL}/api/auth/sessions",
            headers={
                "apikey": INSFORGE_ANON_KEY,
                "Content-Type": "application/json",
            },
            json={"email": EMAIL, "password": PASSWORD},
        )
        if resp.status_code != 200:
            print(f"  password login failed [{resp.status_code}]: {resp.text[:200]}")
            print(
                "\n  Set VOYA_TOKEN env var with the cookie value from your browser:\n"
                "    Chrome: F12 -> Application -> Cookies -> http://localhost:3000\n"
                "      -> click 'app_access_token' row -> copy Value\n"
                "    Then: VOYA_TOKEN=<paste> python scripts/debug_voya_digest.py"
            )
            sys.exit(1)
        data = resp.json()
        token = data.get("accessToken") or data.get("access_token")
        user_id = (data.get("user") or {}).get("id")
        if not token:
            print(f"  no accessToken in response: {list(data.keys())}")
            sys.exit(1)
        print(f"  login OK, user_id={user_id}, token len={len(token)}")
        return token


async def get_watchlist(token: str) -> list[str]:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{BACKEND_URL}/api/watchlist",
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code != 200:
            print(f"  watchlist fetch failed [{resp.status_code}]: {resp.text[:200]}")
            return []
        data = resp.json()
        # Likely shape: {"success": true, "data": {"symbols": [...]}}
        wl = data.get("data") or data
        symbols = wl.get("symbols") or wl.get("watchlist", {}).get("symbols") or []
        return symbols


async def get_digest_history(token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{BACKEND_URL}/api/digests?limit=5",
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code != 200:
            print(f"  digest history fetch failed [{resp.status_code}]: {resp.text[:200]}")
            return []
        data = resp.json()
        items = data.get("data") or data.get("digests") or []
        return items


async def post_digest(token: str, symbols: list[str]) -> dict:
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(
            f"{BACKEND_URL}/api/digest",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"symbols": symbols},
        )
        if resp.status_code != 200:
            print(f"  digest POST failed [{resp.status_code}]: {resp.text[:300]}")
            sys.exit(1)
        return resp.json()


def find_pstg(stocks: list[dict]) -> dict | None:
    for s in stocks or []:
        if (s.get("symbol") or "").upper() == "PSTG":
            return s
    return None


async def main():
    if not INSFORGE_ANON_KEY:
        print("Missing INSFORGE_ANON_KEY"); sys.exit(1)

    print("=== 1. Login as voya ===")
    token = await login()

    print("\n=== 2. Current watchlist (live from Insforge) ===")
    wl_symbols = await get_watchlist(token)
    print(f"  symbols: {wl_symbols}")
    print(f"  has PSTG: {'PSTG' in [s.upper() for s in wl_symbols]}")

    print("\n=== 3. Digest history (what frontend renders) ===")
    history = await get_digest_history(token)
    print(f"  found {len(history)} historical digests")
    for i, d in enumerate(history[:3]):
        date = d.get("digest_date") or d.get("date") or "?"
        syms = d.get("symbols") or []
        print(f"  [{i}] date={date}  symbols={syms}  has PSTG: {'PSTG' in [s.upper() for s in syms]}")
        # Look at the cached PSTG entry if any
        digest_data = d.get("digest_data") or d
        cached_stocks = digest_data.get("stocks", [])
        pstg = find_pstg(cached_stocks)
        if pstg:
            print(f"       cached PSTG name={pstg.get('name')!r}")
            qt = pstg.get("quick_take", "")[:160]
            print(f"       cached PSTG quick_take[:160]={qt!r}")

    print("\n=== 4. POST /api/digest (server decides cache vs regen) ===")
    if not wl_symbols:
        print("  watchlist empty; using fallback test set")
        wl_symbols = ["PSTG", "NVDA", "AAPL"]
    result = await post_digest(token, wl_symbols)
    print(f"  response from_cache: {result.get('from_cache')}")
    print(f"  response symbols_used: {result.get('symbols_used')}")

    pstg_resp = find_pstg(result.get("stocks", []))
    if pstg_resp:
        print(f"\n  RESPONSE PSTG name: {pstg_resp.get('name')!r}")
        print(f"  RESPONSE PSTG status: {pstg_resp.get('status', '')!r}")
        qt = pstg_resp.get("quick_take", "")
        print(f"  RESPONSE PSTG quick_take:\n    {qt[:500]}")
    else:
        print("  PSTG not present in response")

    blob = json.dumps(result, ensure_ascii=False)
    print(f"\n  term scan in response:")
    print(f"    'Everpure'     x{blob.lower().count('everpure')}")
    print(f"    'Pure Storage' x{blob.lower().count('pure storage')}")


if __name__ == "__main__":
    asyncio.run(main())
