"""
Index a 知识星球 (zsxq) thread export into the generic vector pipeline as a
single KOL persona corpus (RAG-only; no cockpit, no separate domain table).

Design decisions (see the design discussion that produced this script):

- One stage: cleaned `threads.jsonl` -> `index_document()` -> Insforge pgvector
  (`vector_documents` + `vector_chunks`). The JSONL committed alongside the data
  pack is the source of truth; re-running is idempotent via `content_hash`.

- New `source_type = "zsxq_thread"`, kept cleanly separate from `kol_tweet`.

- Persona pin: every chunk gets `metadata.author_username = <persona_key>` AND
  `metadata.persona_username = <persona_key>`. This circle has ~147 sub-authors
  but is ONE persona, so the real sub-author goes to
  `metadata.source_author_username`. That triggers the existing
  provenance-aware citation in `shared/kol_persona/tools._format_chunks_for_llm`
  (renders `@<sub-author> / persona @<persona>`). Setting `author_username` to
  the persona key means `search_kol_tweets` retrieves this corpus once the
  persona is registered and the source_type pin is added (a separate ~10-line
  retrieval-side change; this script only produces the data).

- Tier 0 enrichment only (deterministic, no LLM), baked INTO the embedded text
  so it actually helps recall (metadata alone does not help pure semantic RAG):
    * content_type  : qa / fragment / note / analysis  (by type + length)
    * tags          : reused verbatim from the export (444 posts already tagged)
    * tickers       : dictionary match via kol_research.cockpit.TICKER_ALIASES
                      (中文名/英文名 -> ticker), augmented with crypto names
  LLM enrichment (summary / key_claim / stance) is intentionally skipped for v1.

- Chunking caveat: `features.vector.chunking` prepends its own per-chunk header
  and splits docs > ~3200 chars. The Chinese header below therefore only lands
  in chunk 0 of multi-chunk docs (~34 long posts/columns). This is acceptable:
  tickers/author/date also live in per-chunk metadata, so citations stay correct
  on every chunk; only the embedded-token boost is lost on later chunks of long
  posts, which already repeat the names in their analytical body.

Usage:
    conda run --no-capture-output -n stock_agent \
        python scripts/index_zsxq_threads.py --dry-run            # inspect distribution
    conda run --no-capture-output -n stock_agent \
        python scripts/index_zsxq_threads.py                      # embed for real
    python scripts/index_zsxq_threads.py --input /path/threads.jsonl --limit 20 --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv


def _load_env() -> Path:
    root = Path(__file__).resolve().parents[1]  # backend/
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    load_dotenv(root / "env", override=True)
    load_dotenv(root / ".env", override=False)
    return root


def _read_jsonl(path: Path) -> list[dict]:
    records: list[dict] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


async def run(args: argparse.Namespace) -> None:
    from app.features.zsxq_ingest import indexing

    records = _read_jsonl(args.input)

    prepared, drop_reasons = indexing.prepare_records(
        records,
        min_chars=args.min_chars,
        persona_key=args.persona_key,
        persona_name=args.persona_name,
    )
    if args.limit:
        prepared = prepared[: args.limit]

    # --- distribution report (always printed) ---
    print("INPUT", {"path": str(args.input), "total": len(records),
                    "selected": len(prepared), "dropped": dict(drop_reasons)})
    print("CONTENT_TYPE", dict(Counter(p.content_type for p in prepared)))
    print("ROLE", dict(Counter((p.raw.get("author") or {}).get("role") for p in prepared)))
    print("ASSISTANT_POSTS",
          sum(1 for p in prepared if "研究助理" in ((p.raw.get("author") or {}).get("name") or "")))
    with_ticker = sum(1 for p in prepared if p.tickers)
    print("TICKER_COVERAGE",
          {"with_ticker": with_ticker, "ratio": round(with_ticker / max(1, len(prepared)), 2)})
    print("TOP_TICKERS", dict(Counter(t for p in prepared for t in p.tickers).most_common(15)))
    print("CHUNKING", {"docs": len(prepared),
                       "multi_chunk_docs(>3200chars)": sum(1 for p in prepared if len(p.content) > 3200)})

    if args.dry_run:
        for prep in prepared[:4]:
            print("-" * 64)
            print("SAMPLE", {"source_id": prep.source_id, "type": prep.content_type,
                              "tickers": prep.tickers})
            print(prep.content[:600] + ("…" if len(prep.content) > 600 else ""))
        return

    total = len(prepared)
    indexed = skipped = failed = 0
    for i, prep in enumerate(prepared, 1):
        try:
            resp = await indexing.index_prepared(prep, force=args.force)
        except Exception as exc:  # noqa: BLE001 - keep the batch moving
            failed += 1
            print("ERROR", {"source_id": prep.source_id, "error": str(exc)[:300]}, flush=True)
            continue
        if resp.skipped:
            skipped += 1
        elif resp.success:
            indexed += 1
        else:
            failed += 1
            print("ERROR", resp.model_dump(), flush=True)
        if i % 50 == 0 or i == total:
            print("PROGRESS", {"done": i, "total": total, "indexed": indexed,
                                "skipped": skipped, "failed": failed}, flush=True)

    print("SUMMARY", {"selected": total, "indexed": indexed,
                      "skipped": skipped, "failed": failed}, flush=True)


def parse_args() -> argparse.Namespace:
    default_input = os.getenv("ZSXQ_THREADS") or str(
        Path(__file__).resolve().parents[3] / "zsxq" / "threads.jsonl"
    )
    parser = argparse.ArgumentParser(description="Index a zsxq thread export into vector storage.")
    parser.add_argument("--input", default=default_input, help="Path to threads.jsonl")
    parser.add_argument("--persona-key", default="pandacircle",
                        help="Persona username pin written to metadata.author_username/persona_username")
    parser.add_argument("--persona-name", default="潘大的科技交流圈",
                        help="Display name for the content header")
    parser.add_argument("--source-type", default="zsxq_thread")
    parser.add_argument("--min-chars", type=int, default=0,
                        help="Drop posts whose body is shorter than this (0 = keep all; inspect dry-run first)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Only process the first N eligible records (0 = all)")
    parser.add_argument("--force", action="store_true", help="Reindex even if content hash matches.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report distribution + samples without embedding.")
    return parser.parse_args()


if __name__ == "__main__":
    _load_env()
    asyncio.run(run(parse_args()))
