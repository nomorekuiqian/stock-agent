"""
End-to-end check: does the personal digest correctly identify PSTG as Everpure?

Runs PersonalDigest.generate() on a small watchlist that includes PSTG plus
two well-known names (NVDA, AAPL) so the LLM has context to ground against.

No INSFORGE_SERVICE_KEY needed locally — profile cache falls through to FMP.
previous_digests fetch is best-effort and will silently skip if DB is down.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/e2e_digest_pstg.py
"""

from __future__ import annotations

import asyncio
import json
import sys

from dotenv import load_dotenv

load_dotenv()

from app.features.brew.agent import PersonalDigest  # noqa: E402
from app.shared.profile_cache import get_profiles_cached  # noqa: E402


WATCHLIST = ["PSTG", "NVDA", "AAPL"]


def _scan_text_for_terms(blob: str, terms: list[str]) -> dict[str, int]:
    blob_lower = blob.lower()
    return {t: blob_lower.count(t.lower()) for t in terms}


async def main() -> int:
    print(f"Watchlist: {WATCHLIST}\n")

    # Step 1: confirm profile_cache returns Everpure
    print("=== Step 1: profile_cache ===")
    profiles = await get_profiles_cached(WATCHLIST)
    for sym in WATCHLIST:
        p = profiles.get(sym, {})
        cls = p.get("classification") or {}
        print(
            f"  {sym}: name={p.get('company_name')!r:<35} "
            f"sector={cls.get('sector')!r:<25} industry={cls.get('industry')!r}"
        )
    pstg_profile = profiles.get("PSTG", {})
    if "Everpure" not in (pstg_profile.get("company_name") or ""):
        print("  FAIL: PSTG profile does not show Everpure")
        return 1
    print("  OK: PSTG profile returns Everpure\n")

    # Step 2: full digest run
    print("=== Step 2: PersonalDigest.generate() ===")
    digest = PersonalDigest()
    result = await digest.generate(symbols=WATCHLIST, user_id="")

    if not result.get("success"):
        print(f"  FAIL: digest generation failed: {result}")
        return 1

    # Digest fields are spread directly on the top-level result dict
    digest_data = result
    print(f"  result keys: {list(result.keys())}")
    print(f"  symbols_used: {result.get('symbols_used')}")
    print()

    # Inspect the PSTG stock entry the LLM produced
    print("--- Stocks in digest output ---")
    stocks_out = digest_data.get("stocks") or []
    pstg_out = None
    for s in stocks_out:
        sym = s.get("symbol", "")
        print(f"  {sym}: name={s.get('name')!r:<20} change={s.get('daily_change')!r}")
        if sym == "PSTG":
            pstg_out = s

    if not pstg_out:
        print("  FAIL: PSTG missing from digest stocks output")
        return 1

    print("\n--- PSTG quick_take ---")
    print(pstg_out.get("quick_take", "(empty)"))
    print("\n--- PSTG status ---")
    print(pstg_out.get("status", "(empty)"))

    # Step 3: scan all output text for the rename terms
    print("\n=== Step 3: term scan across digest text ===")
    blob_parts = [
        json.dumps(digest_data, ensure_ascii=False),
    ]
    full_blob = "\n".join(blob_parts)

    terms = ["Everpure", "永储", "Pure Storage"]
    counts = _scan_text_for_terms(full_blob, terms)
    for term, n in counts.items():
        marker = "OK" if (term == "Pure Storage" and n == 0) or (term != "Pure Storage" and n >= 0) else "?"
        print(f"  {marker} {term!r:<20} appears {n} times")

    if counts["Pure Storage"] > 0 and counts["Everpure"] == 0:
        print(
            "\n  FAIL: digest still calls the company 'Pure Storage' "
            "without acknowledging the rename"
        )
        return 1
    if counts["Everpure"] >= 1:
        print("\n  OK: digest correctly references Everpure")
    else:
        print(
            "\n  WARN: digest didn't mention Everpure or Pure Storage by name "
            "(may be acceptable if PSTG had no notable activity today)"
        )

    # Step 4: full human-readable render
    print("\n" + "=" * 70)
    print("FULL DIGEST RENDER")
    print("=" * 70)
    print(f"\n[Greeting]\n  {digest_data.get('greeting', '')}")
    print(f"\n[One-line summary]\n  {digest_data.get('one_line_summary', '')}")

    print("\n[Stocks]")
    for s in digest_data.get("stocks", []):
        print(f"\n  {s.get('symbol', '?')} | {s.get('name', '')}  ({s.get('daily_change', '')})")
        print(f"    status: {s.get('status', '')}")
        qt = s.get("quick_take", "").replace("\n", "\n    ")
        print(f"    quick_take:\n    {qt}")

    news = digest_data.get("news", {}) or {}
    print("\n[News - Headlines]")
    for n in news.get("headlines", []):
        print(f"\n  - {n.get('title', '')}")
        print(f"    related: {n.get('related_symbols', [])}")
        print(f"    fact: {n.get('fact_summary', '')}")
        analysis = n.get("deep_analysis", "").replace("\n", "\n    ")
        print(f"    analysis:\n    {analysis}")

    print("\n[News - Briefs]")
    for n in news.get("briefs", []):
        print(f"\n  - {n.get('title', '')}  [{','.join(n.get('related_symbols', []))}]")
        print(f"    {n.get('summary', '')}")
        print(f"    {n.get('analysis', '')}")

    print("\n[Events]")
    for e in digest_data.get("events", []):
        print(f"\n  - {e.get('date', '')} | {e.get('event', '')}  [{','.join(e.get('related_symbols', []))}]")
        why = e.get("why_important", "").replace("\n", "\n    ")
        print(f"    {why}")

    print("\n[Summary]")
    summary = digest_data.get("summary", {}) or {}
    content = summary.get("content", "") if isinstance(summary, dict) else str(summary)
    print(f"  {content}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
