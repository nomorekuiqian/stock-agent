"""
Slice the corpus into per-skill evidence files.

For each ticker / sector, writes a single jsonl file containing the tweets
relevant to that skill. The Claude Code session then reads ONE file per
skill, not all 1048 tweets at once, which keeps context manageable.

Also writes core/ and macro/ slices.

Output files (under evidence/slices/):
  core.jsonl
  macro.jsonl
  sector__ai-infrastructure.jsonl     (etc., 8 sector files)
  ticker__NVDA.jsonl                  (etc., one per ticker with >= 5 mentions)
"""

from __future__ import annotations

import json
from pathlib import Path

# Production-tracked dir: ticker-index / sector-index JSONs (small, reused).
EVIDENCE_DIR = (
    Path(__file__).resolve().parents[2]
    / "app" / "features" / "twitter"
    / "methodologies" / "_drafts"
    / "qinbafrank-skill-v3" / "evidence"
)
# Gitignored artifacts dir: large jsonl corpora + per-slice outputs.
ARTIFACTS_EVIDENCE_DIR = (
    Path(__file__).resolve().parents[2]
    / "app" / "features" / "twitter"
    / "_distillation_artifacts"
    / "qinbafrank-skill-v3" / "evidence"
)
SLICES_DIR = ARTIFACTS_EVIDENCE_DIR / "slices"
MIN_TICKER_MENTIONS = 5  # tickers with fewer mentions get a marker, not a playbook


def main() -> None:
    SLICES_DIR.mkdir(parents=True, exist_ok=True)

    tweets: list[dict] = []
    with (ARTIFACTS_EVIDENCE_DIR / "all-tweets.jsonl").open(encoding="utf-8") as f:
        for line in f:
            tweets.append(json.loads(line))
    by_id = {t["tweet_id"]: t for t in tweets}

    ticker_index = json.loads((EVIDENCE_DIR / "ticker-index.json").read_text())
    sector_index = json.loads((EVIDENCE_DIR / "sector-index.json").read_text())

    bucket_per_tweet: dict[str, dict] = {}
    with (ARTIFACTS_EVIDENCE_DIR / "bucket-per-tweet.jsonl").open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            bucket_per_tweet[row["tweet_id"]] = row

    def write_slice(filename: str, tids: list[str]) -> int:
        path = SLICES_DIR / filename
        ordered = [by_id[t] for t in tids if t in by_id]
        ordered.sort(key=lambda r: r.get("created_at") or "")
        with path.open("w", encoding="utf-8") as f:
            for r in ordered:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        return len(ordered)

    # core slice
    core_tids = [tid for tid, b in bucket_per_tweet.items() if b.get("is_core")]
    n = write_slice("core.jsonl", core_tids)
    print(f"core: {n} tweets")

    # macro slice
    macro_tids = [tid for tid, b in bucket_per_tweet.items() if b.get("is_macro")]
    n = write_slice("macro.jsonl", macro_tids)
    print(f"macro: {n} tweets")

    # sectors
    for sec, data in sector_index.items():
        n = write_slice(f"sector__{sec}.jsonl", data["tweet_ids"])
        print(f"sector {sec}: {n}")

    # tickers
    skipped = []
    for ticker, data in ticker_index.items():
        if data["count"] < MIN_TICKER_MENTIONS:
            skipped.append((ticker, data["count"]))
            continue
        n = write_slice(f"ticker__{ticker}.jsonl", data["tweet_ids"])
        print(f"ticker {ticker}: {n}")

    print(f"\nMarker-only (<{MIN_TICKER_MENTIONS} mentions): {skipped}")


if __name__ == "__main__":
    main()
