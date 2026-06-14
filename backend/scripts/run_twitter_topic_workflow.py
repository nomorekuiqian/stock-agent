"""Run the on-demand Twitter topic workflow locally.

Usage:
    python scripts/run_twitter_topic_workflow.py "SpaceX will it keep rising?" --window-hours 72
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from dotenv import load_dotenv


def _load_env() -> Path:
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    load_dotenv(root / "env", override=True)
    load_dotenv(root / ".env", override=False)
    return root


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Twitter topic workflow")
    parser.add_argument("query", help="Natural-language topic query")
    parser.add_argument("--window-hours", type=int, default=72)
    parser.add_argument("--top-k", type=int, default=12)
    parser.add_argument("--no-historical", action="store_true")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of markdown")
    return parser.parse_args()


async def _run() -> str:
    _load_env()
    from app.features.twitter_digest.topic_workflow import (
        render_topic_workflow_markdown,
        run_topic_workflow,
    )

    args = _parse_args()
    result = await run_topic_workflow(
        args.query,
        window_hours=args.window_hours,
        top_k=args.top_k,
        include_historical=not args.no_historical,
    )
    if args.json:
        return json.dumps(result.model_dump(), ensure_ascii=False, indent=2)
    return render_topic_workflow_markdown(result)


def main() -> None:
    sys.stdout.write(asyncio.run(_run()))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
