"""
Bucket assignment for v3 skill distillation.

Pure rule-based — NO LLM calls. Augments existing enrichment with
alias matching, and re-buckets sectors into a per-persona v3 taxonomy.

Per-persona configurations live in `personas.py`. Pass --persona-key
to select; default is qinbafrank-skill-v3.

Produces three indices under <draft>/evidence/:
  ticker-index.json   ticker -> {count, tweet_ids[]}
  sector-index.json   sector -> {count, tweet_ids[]}
  bucket-summary.json overall stats + macro/core flagging

Run:
    cd backend && source venv/bin/activate
    python -m app.features.twitter.methodology_v3.bucketize
    python -m app.features.twitter.methodology_v3.bucketize --persona-key serenity-skill-v1
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from app.core.logging import get_logger
from app.features.twitter.methodology_v3.personas import get_persona

logger = get_logger(__name__)


def _evidence_dir(draft_dir: str) -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "methodologies" / "_drafts"
        / draft_dir / "evidence"
    )


def _make_patterns(aliases: list[str]) -> list[re.Pattern]:
    pats = []
    for a in aliases:
        has_cjk = any("一" <= ch <= "鿿" for ch in a)
        if has_cjk:
            pats.append(re.compile(re.escape(a)))
        else:
            pats.append(re.compile(r"(?<![A-Za-z])" + re.escape(a) + r"(?![A-Za-z])"))
    return pats


def find_tickers(text: str, alias_patterns: dict[str, list[re.Pattern]]) -> set[str]:
    if not text:
        return set()
    hits: set[str] = set()
    for ticker, patterns in alias_patterns.items():
        for p in patterns:
            if p.search(text):
                hits.add(ticker)
                break
    return hits


def find_sectors(text: str, sector_keywords: dict[str, list[str]]) -> set[str]:
    if not text:
        return set()
    text_l = text.lower()
    hits: set[str] = set()
    for sector, keywords in sector_keywords.items():
        for kw in keywords:
            if kw in text or kw.lower() in text_l:
                hits.add(sector)
                break
    return hits


def is_macro(text: str, macro_keywords: list[str]) -> bool:
    if not text:
        return False
    text_l = text.lower()
    return any(kw in text or kw.lower() in text_l for kw in macro_keywords)


def is_core(text: str, core_keywords: list[str]) -> bool:
    if not text:
        return False
    text_l = text.lower()
    return any(kw in text or kw.lower() in text_l for kw in core_keywords)


def run(persona_key: str) -> None:
    cfg = get_persona(persona_key)
    evidence_dir = _evidence_dir(cfg["draft_dir"])

    alias_patterns: dict[str, list[re.Pattern]] = {
        ticker: _make_patterns(aliases)
        for ticker, aliases in cfg["ticker_aliases"].items()
    }

    jsonl_path = evidence_dir / "all-tweets.jsonl"
    tweets: list[dict] = []
    with jsonl_path.open(encoding="utf-8") as f:
        for line in f:
            tweets.append(json.loads(line))

    ticker_to_tids: dict[str, list[str]] = defaultdict(list)
    sector_to_tids: dict[str, list[str]] = defaultdict(list)
    macro_tids: list[str] = []
    core_tids: list[str] = []

    enriched_ticker_counts: Counter = Counter()
    discovered_ticker_counts: Counter = Counter()

    bucket_per_tweet: list[dict] = []

    for t in tweets:
        tid = t["tweet_id"]
        text = t.get("text") or ""
        quoted = t.get("quoted_tweet_text") or ""
        full_text = f"{text}\n{quoted}".strip()
        symbols = t.get("symbols") or {}

        enr_tickers = set(symbols.get("tickers") or [])
        for tk in enr_tickers:
            enriched_ticker_counts[tk] += 1
        alias_tickers = find_tickers(full_text, alias_patterns)
        for tk in alias_tickers:
            discovered_ticker_counts[tk] += 1
        all_tickers = enr_tickers | alias_tickers

        sectors = find_sectors(full_text, cfg["sector_keywords"])
        macro_flag = is_macro(full_text, cfg["macro_keywords"])
        core_flag = is_core(full_text, cfg["core_keywords"])

        for tk in all_tickers:
            ticker_to_tids[tk].append(tid)
        for sec in sectors:
            sector_to_tids[sec].append(tid)
        if macro_flag:
            macro_tids.append(tid)
        if core_flag:
            core_tids.append(tid)

        bucket_per_tweet.append({
            "tweet_id": tid,
            "tickers": sorted(all_tickers),
            "sectors": sorted(sectors),
            "is_macro": macro_flag,
            "is_core": core_flag,
        })

    ticker_index = {
        tk: {"count": len(tids), "tweet_ids": tids}
        for tk, tids in sorted(
            ticker_to_tids.items(), key=lambda kv: -len(kv[1])
        )
    }
    sector_index = {
        sec: {"count": len(tids), "tweet_ids": tids}
        for sec, tids in sorted(
            sector_to_tids.items(), key=lambda kv: -len(kv[1])
        )
    }

    (evidence_dir / "ticker-index.json").write_text(
        json.dumps(ticker_index, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (evidence_dir / "sector-index.json").write_text(
        json.dumps(sector_index, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (evidence_dir / "bucket-per-tweet.jsonl").write_text(
        "\n".join(json.dumps(b, ensure_ascii=False) for b in bucket_per_tweet) + "\n",
        encoding="utf-8",
    )

    summary = {
        "persona_key": persona_key,
        "total_tweets": len(tweets),
        "ticker_counts_combined": {tk: len(tids) for tk, tids in ticker_to_tids.items()},
        "ticker_counts_enrichment_only": dict(enriched_ticker_counts),
        "ticker_counts_alias_discovery_only": dict(discovered_ticker_counts),
        "tickers_recovered_by_alias_matching": sorted(
            {tk for tk in discovered_ticker_counts if tk not in enriched_ticker_counts}
            | {tk for tk in discovered_ticker_counts
               if discovered_ticker_counts[tk] > enriched_ticker_counts.get(tk, 0) * 1.5}
        ),
        "sector_counts": {sec: len(tids) for sec, tids in sector_to_tids.items()},
        "macro_tweet_count": len(macro_tids),
        "core_tweet_count": len(core_tids),
    }
    (evidence_dir / "bucket-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    logger.info("[%s] Indexed %s tweets", persona_key, len(tweets))
    logger.info("Tickers (combined): %s", len(ticker_to_tids))
    logger.info(
        "Top 25 tickers: %s",
        sorted(((len(v), k) for k, v in ticker_to_tids.items()), reverse=True)[:25],
    )
    logger.info("Sectors: %s", dict((s, len(v)) for s, v in sector_to_tids.items()))
    logger.info("Macro tweets: %s", len(macro_tids))
    logger.info("Core tweets: %s", len(core_tids))


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
