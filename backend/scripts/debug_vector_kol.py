"""Diagnose why search_kol_tweets returns 0 chunks.

Walks the filter chain step by step:
  1. Bare search (no filter)                  - is there ANY data?
  2. Filter by source_types=['kol_tweet']     - is the source_type name right?
  3. Filter + metadata.author_username        - is the metadata key right?
  4. Lower the similarity threshold           - is the threshold too tight?

Usage: source venv/bin/activate && python scripts/debug_vector_kol.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env", override=False)
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")


async def run_search(label, query, **kwargs):
    from app.features.vector.models import VectorSearchFilters, VectorSearchRequest
    from app.features.vector.service import search

    threshold = kwargs.pop("threshold", 0.7)
    filters_kwargs = kwargs
    print(f"\n--- {label} ---")
    print(f"    query={query!r}, threshold={threshold}, filters={filters_kwargs}")
    resp = await search(
        VectorSearchRequest(
            query=query,
            top_k=8,
            threshold=threshold,
            filters=VectorSearchFilters(**filters_kwargs),
        )
    )
    print(f"    -> {resp.count} chunks")
    for r in resp.results[:3]:
        md = r.metadata or {}
        print(
            f"       similarity={r.similarity:.3f} "
            f"source_type={r.source_type!r} source_id={r.source_id} "
            f"author_username={md.get('author_username')!r} "
            f"keys={list(md.keys())[:5]}"
        )
        snippet = r.content.replace("\n", " ")[:140]
        print(f"       content[:140]: {snippet}")
    return resp


async def main():
    q = "NVDA 英伟达 AI 算力"

    # Step 1: bare search — is there ANY data at all?
    bare = await run_search("Step 1: bare search (no filter)", q)

    # Step 2: filter source_type=kol_tweet
    by_st = await run_search(
        "Step 2: filter source_types=['kol_tweet']",
        q, source_types=["kol_tweet"],
    )

    # Step 3: + metadata.author_username
    by_st_user = await run_search(
        "Step 3: + metadata.author_username='qinbafrank'",
        q, source_types=["kol_tweet"], metadata={"author_username": "qinbafrank"},
    )

    # Step 4: drop threshold
    relaxed = await run_search(
        "Step 4: threshold=0.0 (keep all hits)",
        q, source_types=["kol_tweet"], metadata={"author_username": "qinbafrank"},
        threshold=0.0,
    )

    # Diagnosis hints
    print("\n=== Diagnosis ===")
    if bare.count == 0:
        print("[!] Table is EMPTY — vector_chunks has 0 rows.")
    elif by_st.count == 0:
        print("[!] No kol_tweet source_type — recorded names so far:")
        seen = sorted({r.source_type for r in bare.results})
        print(f"    {seen}")
    elif by_st_user.count == 0:
        if relaxed.count > 0:
            print("[?] Metadata filter rejects all — author_username key might differ.")
            for r in by_st.results[:3]:
                md = r.metadata or {}
                print(f"    chunk {r.source_id}: metadata keys = {list(md.keys())}")
                print(f"      values seen for username-ish keys: "
                      f"{[(k, md[k]) for k in md if 'user' in k.lower() or 'author' in k.lower() or 'name' in k.lower()]}")
        else:
            print("[!] Even relaxed search finds nothing for kol_tweet — source_type rows exist but query similarity too low everywhere.")
    elif by_st_user.count > 0:
        print("[OK] Data is there. Default threshold=0.7 might be too tight for some queries — relaxed shows:")
        for r in relaxed.results[:5]:
            print(f"    sim={r.similarity:.3f}  {r.content[:80]!r}")


if __name__ == "__main__":
    asyncio.run(main())
