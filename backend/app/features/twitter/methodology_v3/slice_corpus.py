"""
Slice the corpus into per-skill evidence files.

For each ticker / sector, writes a single jsonl file containing the tweets
relevant to that skill. The Claude Code session then reads ONE file per
skill, not all tweets at once, which keeps context manageable.

Also writes core/ and macro/ slices.

Output files (under <draft>/evidence/slices/):
  core.jsonl
  macro.jsonl
  sector__<name>.jsonl     (one per sector)
  ticker__<TICKER>.jsonl   (one per ticker with >= MIN_TICKER_MENTIONS)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.core.logging import get_logger
from app.features.twitter.methodology_v3.personas import get_persona

logger = get_logger(__name__)

MIN_TICKER_MENTIONS = 5  # tickers below this get a marker, not a playbook


def _evidence_dir(draft_dir: str) -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "methodologies" / "_drafts"
        / draft_dir / "evidence"
    )


def run(persona_key: str) -> None:
    cfg = get_persona(persona_key)
    evidence_dir = _evidence_dir(cfg["draft_dir"])
    slices_dir = evidence_dir / "slices"
    slices_dir.mkdir(exist_ok=True)

    tweets: list[dict] = []
    with (evidence_dir / "all-tweets.jsonl").open(encoding="utf-8") as f:
        for line in f:
            tweets.append(json.loads(line))
    by_id = {t["tweet_id"]: t for t in tweets}

    ticker_index = json.loads((evidence_dir / "ticker-index.json").read_text())
    sector_index = json.loads((evidence_dir / "sector-index.json").read_text())

    bucket_per_tweet: dict[str, dict] = {}
    with (evidence_dir / "bucket-per-tweet.jsonl").open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            bucket_per_tweet[row["tweet_id"]] = row

    def write_slice(filename: str, tids: list[str]) -> int:
        path = slices_dir / filename
        ordered = [by_id[t] for t in tids if t in by_id]
        ordered.sort(key=lambda r: r.get("created_at") or "")
        with path.open("w", encoding="utf-8") as f:
            for r in ordered:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        return len(ordered)

    core_tids = [tid for tid, b in bucket_per_tweet.items() if b.get("is_core")]
    n = write_slice("core.jsonl", core_tids)
    logger.info("[%s] core: %s tweets", persona_key, n)

    macro_tids = [tid for tid, b in bucket_per_tweet.items() if b.get("is_macro")]
    n = write_slice("macro.jsonl", macro_tids)
    logger.info("[%s] macro: %s tweets", persona_key, n)

    for sec, data in sector_index.items():
        n = write_slice(f"sector__{sec}.jsonl", data["tweet_ids"])
        logger.info("sector %s: %s", sec, n)

    skipped = []
    for ticker, data in ticker_index.items():
        if data["count"] < MIN_TICKER_MENTIONS:
            skipped.append((ticker, data["count"]))
            continue
        n = write_slice(f"ticker__{ticker}.jsonl", data["tweet_ids"])
        logger.info("ticker %s: %s", ticker, n)

    logger.info(
        "Marker-only (<%s mentions): %s",
        MIN_TICKER_MENTIONS,
        skipped,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--persona-key",
        default="qinbafrank-skill-v3",
        help="Persona key from methodology_v3/personas.py",
    )
    args = parser.parse_args()
    run(args.persona_key)


if __name__ == "__main__":
    main()
