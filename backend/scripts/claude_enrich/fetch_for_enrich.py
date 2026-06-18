"""Fetch slim JSONL batches of un-enriched tweets for Claude to classify.

Reads `kol_tweets` via the `kol-tweets` edge function (`list_batch` action),
filters out rows whose `symbols.quality` is already a string (already v2/v3
enriched), slims each surviving row, and writes batches of 50 to
`scripts/claude_enrich/_work/tweets/<username>-<stamp>-batchNN.jsonl`.
Use `--include-enriched` for explicit manual v3 reclassification of rows that
already passed the daily light enrichment pipeline.

Usage:
    cd backend && source venv/bin/activate
    python scripts/claude_enrich/fetch_for_enrich.py \\
        --username qinbafrank \\
        --since 2024-01-01 --until 2025-01-01 \\
        --batch-size 50 --max-batches 12

    # Manual v3 reclassification for the latest already-enriched rows:
    python scripts/claude_enrich/fetch_for_enrich.py \\
        --username qinbafrank \\
        --since 2026-01-01 --until 2026-12-31 \\
        --include-enriched --limit 50 --batch-size 50 --max-batches 1

The stamp printed at the end is the shared prefix for the matching enrichment
files that `push_enrichments.py` will write back under
`_work/enrichments/<username>-<stamp>-batchNN.jsonl`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def _bootstrap() -> Path:
    root = Path(__file__).resolve().parents[2]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    from dotenv import load_dotenv
    load_dotenv(root / "env", override=True)
    load_dotenv(root / ".env", override=False)
    return root


_QUOTED_LIMIT = 220


def _slim(row: dict) -> dict:
    created = row.get("created_at") or ""
    if "T" in created:
        created = created.split("T", 1)[0]
    quoted = row.get("quoted_tweet_text") or None
    if quoted and len(quoted) > _QUOTED_LIMIT:
        quoted = quoted[:_QUOTED_LIMIT - 1] + "…"
    canonical_text = (row.get("canonical_text") or "").strip()
    return {
        "id": row.get("id"),
        "created_at": created,
        "tweet_type": row.get("tweet_type"),
        "text": canonical_text or row.get("text") or "",
        "raw_text": row.get("text") or "",
        "quoted_excerpt": quoted,
        "reply_to": row.get("in_reply_to_username") or None,
        "media": row.get("media") or [],
        "canonical_status": row.get("canonical_status") or "raw_only",
        "content_parts": row.get("content_parts") or [],
    }


def _needs_enrichment(row: dict) -> bool:
    """Mirror the edge function's list_unenriched judgment."""
    s = row.get("symbols")
    if s is None:
        return True
    if isinstance(s, list):  # legacy Phase 1 ticker array
        return True
    if not isinstance(s, dict):
        return True
    return not isinstance(s.get("quality"), str)


async def _fetch_window(db, username: str, since: str, until: str) -> list[dict]:
    """Paginate list_batch by shrinking `until` until the window is exhausted."""
    from app.core.config import EDGE_FUNCTION_SECRET

    seen: dict[str, dict] = {}
    cur_until = until
    pages = 0
    while True:
        r = await db.call_function(
            "kol-tweets",
            method="POST",
            params={"action": "list_batch"},
            json_body={
                "usernames": [username],
                "since": since,
                "until": cur_until,
                "limit": 1000,
            },
            timeout=120.0,
            extra_headers={"X-Internal-Secret": EDGE_FUNCTION_SECRET},
        )
        data = json.loads(r["text"]).get("data", []) or []
        if not data:
            break

        pages += 1
        oldest = cur_until
        new = 0
        for row in data:
            tid = row.get("id")
            if not tid or tid in seen:
                continue
            seen[tid] = row
            new += 1
            ca = row.get("created_at")
            if ca and ca < oldest:
                oldest = ca

        print(
            f"  page {pages}: returned={len(data)} new={new} "
            f"cumulative={len(seen)} oldest={oldest}"
        )

        if len(data) < 1000:
            break
        if oldest == cur_until:
            print("  no progress, stopping")
            break
        cur_until = oldest
        if pages > 50:
            print("  safety stop at 50 pages")
            break

    rows = list(seen.values())
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return rows


def _write_batches(
    rows: list[dict],
    username: str,
    batch_size: int,
    max_batches: int,
    out_dir: Path,
) -> tuple[str, int]:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)

    batches_written = 0
    total_rows = 0
    for i in range(0, len(rows), batch_size):
        if batches_written >= max_batches:
            print(
                f"  reached --max-batches={max_batches}; "
                f"{len(rows) - total_rows} rows remain unfetched"
            )
            break
        chunk = rows[i:i + batch_size]
        batches_written += 1
        path = out_dir / f"{username}-{stamp}-batch{batches_written:02d}.jsonl"
        with path.open("w", encoding="utf-8") as f:
            for row in chunk:
                f.write(json.dumps(_slim(row), ensure_ascii=False) + "\n")
        total_rows += len(chunk)
        print(f"  wrote {path.name}  ({len(chunk)} rows)")

    return stamp, batches_written


async def _run(args: argparse.Namespace) -> None:
    from app.core.database import get_insforge_service

    db = get_insforge_service()
    print(
        f"INFO  fetch_for_enrich start\n"
        f"      username=@{args.username}\n"
        f"      window=[{args.since}, {args.until})\n"
        f"      batch_size={args.batch_size} max_batches={args.max_batches}\n"
        f"      include_enriched={args.include_enriched} limit={args.limit or 'none'}"
    )

    print("\nINFO  pulling list_batch window...")
    rows = await _fetch_window(db, args.username, args.since, args.until)
    print(f"INFO  fetched {len(rows)} rows in window")

    unenriched = [r for r in rows if _needs_enrichment(r)]
    selected = rows if args.include_enriched else unenriched
    if args.limit is not None:
        selected = selected[:args.limit]
    print(f"INFO  unenriched: {len(unenriched)} / {len(rows)}")
    print(f"INFO  selected for output: {len(selected)}")

    if not selected:
        print("INFO  nothing to do — no rows selected for output")
        return

    out_dir = Path(__file__).resolve().parent / "_work" / "tweets"
    print(f"\nINFO  writing batches to {out_dir}")
    stamp, written = _write_batches(
        selected, args.username, args.batch_size, args.max_batches, out_dir
    )

    print(
        f"\nSUMMARY  stamp={stamp}  batches_written={written}\n"
        f"  selected_total={len(selected)}\n"
        f"  remaining_after_this_wave={max(0, len(selected) - written * args.batch_size)}\n"
        f"  next step: classify each batch jsonl, write to\n"
        f"    _work/enrichments/{args.username}-{stamp}-batchNN.jsonl\n"
        f"  then: python scripts/claude_enrich/push_enrichments.py "
        f"_work/enrichments/{args.username}-{stamp}-batch01.jsonl"
    )


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Fetch slim JSONL batches of un-enriched KOL tweets."
    )
    p.add_argument("--username", required=True, help="Twitter handle without @")
    p.add_argument("--since", required=True, help="ISO date or datetime (inclusive)")
    p.add_argument("--until", required=True, help="ISO date or datetime (exclusive)")
    p.add_argument("--batch-size", type=int, default=50)
    p.add_argument("--max-batches", type=int, default=12)
    p.add_argument(
        "--include-enriched",
        action="store_true",
        help="Include rows that already have symbols.quality; useful for manual v3 reclassification.",
    )
    p.add_argument("--limit", type=int, default=None, help="Cap selected rows before batching")
    return p.parse_args()


if __name__ == "__main__":
    _bootstrap()
    asyncio.run(_run(_parse_args()))
