#!/usr/bin/env python
"""Run the lightweight KOL research eval suite.

Modes:
- live: calls the current Frank/KOL agent.
- fixture: evaluates saved response payloads without network or model calls.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

from app.core.logging import get_logger
from evals.kol_research.evaluator import (
    EvalCase,
    evaluate_case,
    load_cases,
    load_fixture_responses,
    render_markdown_report,
    result_to_json,
    summarize_results,
)

logger = get_logger(__name__)

DEFAULT_CASES = BACKEND_ROOT / "evals" / "kol_research" / "cases.yaml"
DEFAULT_FIXTURE = BACKEND_ROOT / "evals" / "kol_research" / "fixtures_smoke.json"
DEFAULT_OUT_DIR = BACKEND_ROOT / "evals" / "kol_research" / "runs"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run KOL research evals.")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--mode", choices=("live", "fixture"), default="fixture")
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--case-id", action="append", default=[])
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--timeout", type=float, default=120.0)
    return parser.parse_args()


async def main() -> int:
    args = parse_args()
    load_dotenv(BACKEND_ROOT / ".env")

    cases = load_cases(args.cases)
    if args.case_id:
        wanted = set(args.case_id)
        cases = [case for case in cases if case.id in wanted]
    if args.mode == "fixture":
        fixture = load_fixture_responses(args.fixture)
        if not args.case_id and args.limit <= 0:
            cases = [case for case in cases if case.id in fixture]
    else:
        fixture = {}

    if args.limit > 0:
        cases = cases[: args.limit]

    if not cases:
        logger.error("No eval cases selected from %s", args.cases)
        return 2

    run_dir = _make_run_dir(args.out_dir)
    logger.info("Running %d KOL eval case(s), mode=%s, out=%s", len(cases), args.mode, run_dir)

    if args.mode == "fixture":
        results = []
        for case in cases:
            response = fixture.get(case.id)
            if response is None:
                results.append(evaluate_case(case, {}, error="missing fixture response"))
            else:
                results.append(evaluate_case(case, response, latency_ms=0))
    else:
        results = []
        for case in cases:
            results.append(await _run_live_case(case, timeout=args.timeout))

    jsonl_path = run_dir / "results.jsonl"
    with jsonl_path.open("w") as fh:
        for result in results:
            # Keep JSONL one physical line even when retrieved source text
            # contains Unicode line separators.
            fh.write(json.dumps(result_to_json(result), ensure_ascii=True, default=str) + "\n")

    report_path = run_dir / "report.md"
    report_path.write_text(render_markdown_report(results))

    summary = summarize_results(results)
    summary_path = run_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=str))

    logger.info(
        "KOL eval complete: %d/%d passed, hard_failures=%d, report=%s",
        summary["passed"],
        summary["total"],
        summary["hard_failures"],
        report_path,
    )
    return 0 if summary["failed"] == 0 else 1


async def _run_live_case(case: EvalCase, *, timeout: float) -> Any:
    from app.features.kol_research.agent import answer_kol_research

    started = time.monotonic()
    try:
        response = await answer_kol_research(
            message=case.message,
            history=case.history,
            persona_username="qinbafrank",
            content_context=case.content_context,
            timeout=timeout,
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        return evaluate_case(case, response.model_dump(), latency_ms=latency_ms)
    except Exception as exc:  # noqa: BLE001
        latency_ms = int((time.monotonic() - started) * 1000)
        logger.exception("Live eval case failed: %s", case.id)
        return evaluate_case(case, {}, latency_ms=latency_ms, error=str(exc))


def _make_run_dir(base: Path) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    for idx in range(100):
        suffix = "" if idx == 0 else "-%02d" % idx
        run_dir = base / ("%s%s" % (stamp, suffix))
        try:
            run_dir.mkdir(parents=True, exist_ok=False)
            return run_dir
        except FileExistsError:
            continue
    raise RuntimeError("Could not allocate eval run directory under %s" % base)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
