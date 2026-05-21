"""Time-trace a single KOL research turn end-to-end.

Logs every tool call's wall-clock cost so we can spot what's pushing the
75s timeout. Bypasses HTTP / SSE — runs agent.answer_kol_research directly.

Usage:
  conda run --no-capture-output -n stock_agent python scripts/debug_kol_timing.py "NVDA 现在怎么看?"
  or:
  source venv/bin/activate && python scripts/debug_kol_timing.py "Circle 怎么看"
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env", override=False)
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")


async def main(question: str) -> None:
    from app.features.kol_research.agent import (
        _activated_skills,
        _navigate_buffer,
        _tool_call_log,
        _tool_started_at,
        answer_kol_research,
    )
    from app.shared.kol_persona.tools import persona_chunks_buffer

    print(f"\n=== Question: {question!r} ===\n")
    t0 = time.monotonic()
    response = await answer_kol_research(
        message=question,
        history=[],
        persona_username="qinbafrank",
        timeout=120.0,  # bump above the default 75 so we can see *why* it would've timed out
    )
    total = time.monotonic() - t0
    print(f"\n=== Total wall time: {total:.2f}s ===\n")

    print(f"Final answer ({len(response.message)} chars):")
    print("-" * 60)
    print(response.message)
    print("-" * 60)

    print(f"\nActivated skills ({len(response.activated_skills)}):")
    for s in response.activated_skills:
        print(f"  - {s}")

    print(f"\nKOL chunks retrieved: {len(response.kol_chunks)}")

    print(f"\nTool call breakdown ({len(response.tool_calls)} calls):")
    if response.tool_calls:
        slowest = max(response.tool_calls, key=lambda c: (c.duration_ms or 0))
        for c in response.tool_calls:
            dur = c.duration_ms or 0
            mark = " <-- SLOWEST" if c is slowest else ""
            args = c.args_summary or ""
            print(f"  {dur:>6} ms  {c.name:<28}  {args[:60]}{mark}")
        sum_tool_ms = sum((c.duration_ms or 0) for c in response.tool_calls)
        print(f"\nSum of tool ms: {sum_tool_ms} ms ({sum_tool_ms/1000:.1f}s)")
        print(f"Time outside tools (LLM thinking + overhead): {total*1000 - sum_tool_ms:.0f} ms")


if __name__ == "__main__":
    question = sys.argv[1] if len(sys.argv) > 1 else "NVDA 现在怎么看?"
    asyncio.run(main(question))
