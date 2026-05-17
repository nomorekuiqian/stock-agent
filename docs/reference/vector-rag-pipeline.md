# Vector Embedding and Retrieval Pipeline

This document explains how to build embeddings and run retrieval with the
current stock-agent vector pipeline.

## Mental Model

The vector layer is domain-agnostic. Business tables such as `kol_tweets` are
not embedded directly. Each source row is normalized into:

```text
source_type + source_id + content + metadata
```

For KOL tweets:

```text
source_type = kol_tweet
source_id = kol_tweets.id
```

Retrieval is a two-stage process:

```text
rule filters first
  -> source_type, author_username, tweet_type, quality, symbol, metadata
semantic similarity second
  -> query embedding compared against vector_chunks.embedding
```

## Storage

The generic vector tables are:

```text
vector_documents
vector_chunks
```

Important fields:

```text
vector_documents.source_type
vector_documents.source_id
vector_documents.content_hash
vector_documents.metadata

vector_chunks.document_id
vector_chunks.source_type
vector_chunks.source_id
vector_chunks.content
vector_chunks.metadata
vector_chunks.embedding
```

`similarity` is not a physical column. It is returned only by vector search via
the `match_vector_chunks(...)` RPC / `vector-store?action=search`.

## Build Embeddings

KOL tweets are indexed through:

```text
backend/scripts/index_kol_tweets.py
```

The script pulls tweets from the `kol-tweets` Edge Function, applies filters,
normalizes each tweet into `VectorDocumentInput`, and calls:

```text
app.features.vector.service.index_document()
```

### Dry Run

Always dry-run first:

```powershell
python scripts\index_kol_tweets.py --authors qinbafrank --tweet-types quote original article --window-hours 72 --limit 10 --dry-run
```

The output includes:

```text
raw
eligible
raw_breakdown
eligible_breakdown
```

Use the breakdown to understand why a row was skipped. For example:

```text
raw_breakdown: {"original/drop": 1, "quote/drop": 1, "quote/keep": 8}
eligible_breakdown: {"quote/keep": 8}
```

### Write Embeddings

After the dry-run looks right:

```powershell
python scripts\index_kol_tweets.py --authors qinbafrank --tweet-types quote original article --window-hours 72 --limit 10
```

To reindex already indexed rows:

```powershell
python scripts\index_kol_tweets.py --authors qinbafrank --tweet-types quote original article --window-hours 72 --limit 10 --force
```

### Common Filters

Author filter:

```powershell
--authors qinbafrank Beth_Kindig
```

Tweet type filter:

```powershell
--tweet-types quote original article
```

Quality filter:

```powershell
--qualities keep high medium
```

Disable quality filtering and include unenriched rows:

```powershell
--qualities --include-unenriched
```

Default tweet types are:

```text
original, quote, thread, article
```

Default quality labels are:

```text
keep, high, medium
```

## Embedded Text

The embedded text is not the raw database row. The KOL tweet adapter builds a
retrieval-friendly text block:

```text
Author: @qinbafrank
Date: 2026-05-16T13:05:23+00:00
Tweet type: quote
Quality: keep
Tickers: ...
Sectors: ...
Events: ...
Summary: ...

Original tweet:
<kol_tweets.text>

Quoted tweet:
<kol_tweets.quoted_tweet_text>
```

Structured metadata is stored separately:

```text
author_username
tweet_type
conversation_id
created_at
category
like_count
retweet_count
reply_count
view_count
quality
quality_features
content_summary_zh
tickers
sectors
events
enriched_at
enriched_model
```

## Retrieval From Python

Run from `backend/` with the `stock_agent` environment loaded.

```powershell
conda run --no-capture-output -n stock_agent python -c "import asyncio,sys; from pathlib import Path; from dotenv import load_dotenv; root=Path.cwd(); sys.path.insert(0,str(root)); load_dotenv(root/'env',override=True); from app.features.vector.models import VectorSearchRequest,VectorSearchFilters; from app.features.vector.service import search; req=VectorSearchRequest(query='AI hardware and market correction',top_k=10,threshold=0.2,filters=VectorSearchFilters(source_types=['kol_tweet'],metadata={'author_username':'qinbafrank','tweet_type':'quote'})); res=asyncio.run(search(req)); print(res.model_dump())"
```

Equivalent Python shape:

```python
from app.features.vector.models import VectorSearchFilters, VectorSearchRequest
from app.features.vector.service import search

response = await search(
    VectorSearchRequest(
        query="AI hardware and market correction",
        top_k=10,
        threshold=0.2,
        filters=VectorSearchFilters(
            source_types=["kol_tweet"],
            metadata={
                "author_username": "qinbafrank",
                "tweet_type": "quote",
                "quality": "keep",
            },
        ),
    )
)
```

The response contains:

```text
source_type
source_id
content
metadata
similarity
```

For KOL tweets, `source_id` is `kol_tweets.id`.

## Retrieval From API

The FastAPI endpoint is:

```http
POST /api/vector/search
```

Request body:

```json
{
  "query": "AI hardware and market correction",
  "top_k": 10,
  "threshold": 0.2,
  "filters": {
    "source_types": ["kol_tweet"],
    "metadata": {
      "author_username": "qinbafrank",
      "tweet_type": "quote",
      "quality": "keep"
    }
  }
}
```

The API endpoint requires a user bearer token. Internal jobs can call the Python
service directly.

## Build RAG Context

Use the context endpoint when the caller needs LLM-ready source text:

```http
POST /api/vector/context
```

Request body:

```json
{
  "query": "AI hardware and market correction",
  "top_k": 10,
  "threshold": 0.2,
  "max_context_chars": 8000,
  "filters": {
    "source_types": ["kol_tweet"],
    "metadata": {
      "author_username": "qinbafrank",
      "tweet_type": "quote"
    }
  }
}
```

This returns search results plus a `context` string assembled from retrieved
chunks.

## Join Back To Source Table

Join through `source_type` and `source_id`:

```sql
select
  t.id,
  t.author_username,
  t.tweet_type,
  t.created_at,
  vd.id as vector_document_id,
  vc.id as vector_chunk_id,
  vc.content as embedded_chunk_text,
  vc.metadata
from kol_tweets t
join vector_documents vd
  on vd.source_type = 'kol_tweet'
 and vd.source_id = t.id
join vector_chunks vc
  on vc.document_id = vd.id
where t.author_username = 'qinbafrank';
```

Direct chunk join:

```sql
select
  t.id,
  t.author_username,
  t.tweet_type,
  t.created_at,
  vc.content,
  vc.metadata
from vector_chunks vc
join kol_tweets t
  on t.id = vc.source_id
where vc.source_type = 'kol_tweet';
```

Do not select `vc.similarity`; it does not exist. Similarity is returned by
vector retrieval only.

## Troubleshooting

No rows in `vector_chunks` after indexing:

```text
Check dry-run output.
If eligible=0, inspect raw_breakdown and eligible_breakdown.
```

Common causes:

```text
tweet_type filter excludes useful rows, e.g. quote
quality filter excludes rows, e.g. original/drop
author has no rows in the selected window
content was already indexed and skipped by content hash
```

Search returns no results:

```text
Lower threshold to 0.1 or 0.2.
Confirm source_type is kol_tweet.
Confirm metadata filters exactly match stored metadata.
Confirm rows exist in vector_chunks.
```

Embedding dimension errors:

```text
Current vector dimension is 1536.
Use VECTOR_EMBEDDING_MODEL=openai/text-embedding-3-small.
```
