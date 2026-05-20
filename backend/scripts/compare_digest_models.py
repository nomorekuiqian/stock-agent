"""
Side-by-side digest output across models.

Same watchlist, same prompt, same input data (cached) — only the model differs.
Compares gemini-3-flash-preview (current) vs gemini-3.5-flash.

Usage:
    cd backend
    source venv/bin/activate
    PYTHONPATH=. python scripts/compare_digest_models.py
"""

from __future__ import annotations

import asyncio
import json
import time

from dotenv import load_dotenv

load_dotenv()

from google.adk.agents import LlmAgent  # noqa: E402
from google.adk.runners import InMemoryRunner  # noqa: E402

from app.features.brew.agent import PersonalDigest, DIGEST_INSTRUCTION  # noqa: E402
from app.features.brew.db import get_user_watchlist  # noqa: E402
from app.features.brew.models import PersonalDigestOutput  # noqa: E402
from app.core.database import get_insforge_service  # noqa: E402

VOYA_EMAIL = "voya.technologies@gmail.com"

MODELS_TO_COMPARE = [
    "gemini-3-flash-preview",   # current
    "gemini-3.1-flash-lite",    # cheaper/faster candidate
    "gemini-3.5-flash",   # high-quality candidate
]


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


def make_runner(model: str) -> InMemoryRunner:
    agent = LlmAgent(
        name="personal_digest",
        model=model,
        description="Generates personalized daily digest",
        instruction=DIGEST_INSTRUCTION,
        output_schema=PersonalDigestOutput,
        output_key="digest",
    )
    return InMemoryRunner(agent=agent, app_name="personal_digest")


async def run_with_model(symbols: list[str], user_id: str, model: str) -> tuple[dict, float]:
    digest = PersonalDigest()
    digest._runner = make_runner(model)
    t0 = time.time()
    result = await digest.generate(symbols=symbols, user_id=user_id)
    elapsed = time.time() - t0
    return result, elapsed


def find_stock(stocks: list[dict], symbol: str) -> dict | None:
    for s in stocks or []:
        if (s.get("symbol") or "").upper() == symbol.upper():
            return s
    return None


def char_count(value) -> int:
    if isinstance(value, str):
        return len(value)
    if isinstance(value, dict):
        return sum(char_count(v) for v in value.values())
    if isinstance(value, list):
        return sum(char_count(v) for v in value)
    return 0


def render_stock_card(s: dict) -> str:
    if not s:
        return "(missing)"
    lines = [
        f"  symbol: {s.get('symbol')}  name: {s.get('name')!r}  daily_change: {s.get('daily_change')}",
        f"  status: {s.get('status', '')}",
        f"  quick_take ({len(s.get('quick_take', ''))} chars):",
    ]
    qt = s.get("quick_take", "")
    for ln in qt.split("\n"):
        lines.append(f"    {ln}")
    return "\n".join(lines)


def render_summary(d: dict) -> str:
    summary = d.get("summary", {}) or {}
    content = summary.get("content", "") if isinstance(summary, dict) else str(summary)
    return content


async def main():
    user_id = await resolve_user_id(VOYA_EMAIL)
    if not user_id:
        print(f"failed to resolve {VOYA_EMAIL}")
        return
    wl = await get_user_watchlist(user_id) or {}
    symbols = wl.get("symbols") or []
    print(f"voya user_id: {user_id}")
    print(f"watchlist: {symbols}")
    print(f"models: {MODELS_TO_COMPARE}\n")

    results: dict[str, tuple[dict, float]] = {}
    for model in MODELS_TO_COMPARE:
        print(f"=== Running model: {model} ===")
        try:
            r, elapsed = await run_with_model(symbols, user_id, model)
            results[model] = (r, elapsed)
            print(f"  done in {elapsed:.1f}s, success={r.get('success')}")
        except Exception as e:
            print(f"  FAILED: {type(e).__name__}: {e}")
            results[model] = ({"success": False, "error": str(e)}, 0.0)
        print()

    # =========================================================================
    # Side-by-side comparison
    # =========================================================================
    print("=" * 80)
    print("COMPARISON")
    print("=" * 80)

    # Aggregate sizes
    print("\n--- Output volume (chars) ---")
    print(f"{'field':<25}", *(f"{m:<30}" for m in MODELS_TO_COMPARE))
    for field in ["greeting", "one_line_summary", "stocks", "news", "events", "summary"]:
        row = [f"{field:<25}"]
        for m in MODELS_TO_COMPARE:
            r = results[m][0]
            row.append(f"{char_count(r.get(field)):<30}")
        print("".join(row))

    total_row = [f"{'TOTAL':<25}"]
    for m in MODELS_TO_COMPARE:
        r = results[m][0]
        total = sum(char_count(r.get(f)) for f in ["greeting", "one_line_summary", "stocks", "news", "events", "summary"])
        total_row.append(f"{total:<30}")
    print("".join(total_row))

    # Latency
    print("\n--- Latency ---")
    for m in MODELS_TO_COMPARE:
        print(f"  {m}: {results[m][1]:.1f}s")

    # Stock-level: P (Everpure) deep dive
    print("\n--- Ticker P (Everpure) — quick_take comparison ---")
    for m in MODELS_TO_COMPARE:
        r = results[m][0]
        if not r.get("success"):
            print(f"\n[{m}] FAILED")
            continue
        p = find_stock(r.get("stocks", []), "P")
        print(f"\n[{m}]")
        print(render_stock_card(p))

    # News headline counts
    print("\n--- News volume ---")
    for m in MODELS_TO_COMPARE:
        r = results[m][0]
        news = r.get("news", {}) or {}
        h = len(news.get("headlines", []) or [])
        b = len(news.get("briefs", []) or [])
        print(f"  {m}: {h} headlines, {b} briefs")

    # Events count
    print("\n--- Events volume ---")
    for m in MODELS_TO_COMPARE:
        r = results[m][0]
        events = r.get("events", []) or []
        print(f"  {m}: {len(events)} events")

    # Summary preview
    print("\n--- Summary[:600] ---")
    for m in MODELS_TO_COMPARE:
        r = results[m][0]
        print(f"\n[{m}]")
        print(render_summary(r)[:600] + ("..." if len(render_summary(r)) > 600 else ""))

    # First headline deep_analysis comparison
    print("\n--- First news headline — deep_analysis ---")
    for m in MODELS_TO_COMPARE:
        r = results[m][0]
        news = r.get("news", {}) or {}
        h = (news.get("headlines") or [])
        first = h[0] if h else None
        print(f"\n[{m}]")
        if first:
            print(f"  title: {first.get('title')}")
            print(f"  related: {first.get('related_symbols')}")
            print(f"  fact_summary: {first.get('fact_summary')}")
            print(f"  deep_analysis ({len(first.get('deep_analysis', ''))} chars):")
            print(f"    {first.get('deep_analysis', '')}")
        else:
            print("  (no headline)")

    # Save full outputs
    out_path = "/tmp/digest_compare.json"
    payload = {m: {"elapsed": results[m][1], "result": results[m][0]} for m in MODELS_TO_COMPARE}
    with open(out_path, "w") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"\n\nFull outputs saved to: {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
