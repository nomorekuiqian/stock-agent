"""
V3 Step 1 — daily per-tweet enrichment.

Reads `kol_tweets` rows where `symbols IS NULL` and `created_at >= 24h ago`,
runs flash-lite to extract {quality, quality_features, content_summary_zh,
tickers, sectors, events}, and writes the result back into
`kol_tweets.symbols` JSONB.

The downstream digest pipeline (V3) uses this metadata to filter
`quality != "low"` and to cluster topics by event/ticker/sector.
"""

import json
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.twitter_digest.agents import (
    APP_NAME,
    ENRICH_MODEL,
    enrich_agent,
    get_runner,
)
from app.features.twitter_digest.models import EnrichmentOutput

logger = get_logger(__name__)

_FUNCTION_NAME = "kol-tweets"

# Process tweets in batches so a single LLM call stays within token budget
# and so a partial failure only loses one batch instead of the whole day.
_ENRICH_BATCH_SIZE = 25

# Conservative ticker dictionary. Stock symbols that are <=2 chars or words
# that are common English (e.g. "CEO", "USA") get stripped because flash-lite
# occasionally hallucinates them as tickers. This is a denylist of false
# positives; the broader "is this a real ticker" check is just "uppercase
# 2-5 alphabetic chars OR 6 digits" to keep the dictionary small.
_TICKER_DENYLIST = {
    # Common confusables — words that look like tickers
    "CEO", "CFO", "CTO", "USA", "USD", "EUR", "GDP", "CPI", "FED",
    "ETF", "IPO", "API", "SEC", "AI", "EV", "PE", "PEG", "VC", "PR",
    "OK", "FYI", "TBD", "TLDR", "DCA", "FOMO", "DYOR",
    "XYZ", "ABC", "FOO", "BAR",
    # Two-letter or shorter mostly bogus
    "HE", "OR", "AT", "BE", "TO", "SO", "DO", "GO", "ON", "AS", "ME",
    "IS", "AM", "MY", "WE", "US", "IT", "IF", "OF", "IN",
    # Crypto names that should be in sectors, not tickers
    "BTC", "ETH",
}

# Tweet IDs we treat as "needing enrichment". Keep in sync with the row
# schema — `symbols` JSONB null/missing means unenriched.
_TICKER_RE = re.compile(r"^[A-Z]{2,5}$|^[0-9]{6}$")


def _is_valid_ticker(t: str) -> bool:
    if not t:
        return False
    t = t.strip().upper()
    if t in _TICKER_DENYLIST:
        return False
    return bool(_TICKER_RE.match(t))


def _internal_headers() -> Optional[dict]:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


# ---------------------------------------------------------------------------
# Data pull
# ---------------------------------------------------------------------------

async def fetch_unenriched(window_hours: int = 24, limit: int = 5000) -> list[dict]:
    """Pull unenriched tweets from the last `window_hours`.

    Returns the raw tweet rows (full columns) that have no `symbols` set yet.
    """
    since = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "list_unenriched"},
        json_body={"since": since, "limit": limit},
        timeout=30.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] != 200:
        raise RuntimeError(
            f"list_unenriched failed: HTTP {result['status_code']} "
            f"{result.get('text', '')[:200]}"
        )
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(f"list_unenriched returned error: {payload.get('error')}")
    return payload.get("data", []) or []


# ---------------------------------------------------------------------------
# LLM call (per batch)
# ---------------------------------------------------------------------------

def _slim_for_enrichment(t: dict) -> dict:
    return {
        "id": t["id"],
        "author_username": t.get("author_username"),
        "text": t.get("text"),
        "tweet_type": t.get("tweet_type"),
        "created_at": t.get("created_at"),
        "url": t.get("url"),
        "quoted_tweet_text": t.get("quoted_tweet_text"),
        "in_reply_to_username": t.get("in_reply_to_username"),
        "like_count": t.get("like_count", 0),
        "retweet_count": t.get("retweet_count", 0),
        "reply_count": t.get("reply_count", 0),
    }


async def _run_enrich_batch(tweets: list[dict]) -> list[EnrichmentOutput]:
    """Send one batch to flash-lite and return parallel-indexed enrichments."""
    from google.genai.types import Content, Part
    from pydantic import ValidationError

    from app.features.twitter_digest.agents import _EnrichmentBatchOutput

    if not tweets:
        return []

    runner = get_runner(enrich_agent)
    user_id = f"{enrich_agent.name}_caller"
    session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id=user_id,
    )

    payload = {"tweets": [_slim_for_enrichment(t) for t in tweets]}
    payload_text = json.dumps(payload, ensure_ascii=False, default=str)
    message = Content(parts=[Part(text=payload_text)], role="user")

    async for _ in runner.run_async(
        user_id=user_id, session_id=session.id, new_message=message,
    ):
        pass

    session_data = await runner.session_service.get_session(
        app_name=APP_NAME, user_id=user_id, session_id=session.id,
    )
    state = (session_data.state if session_data else {}) or {}
    raw = state.get(enrich_agent.output_key)

    if raw is None:
        raise RuntimeError(f"{enrich_agent.name} produced no output")

    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"{enrich_agent.name} output was not valid JSON: {raw[:200]}"
            ) from exc

    try:
        wrapper = _EnrichmentBatchOutput.model_validate(raw)
    except ValidationError as exc:
        raise RuntimeError(f"{enrich_agent.name} output did not match schema: {exc}") from exc

    enrichments = wrapper.enrichments
    if len(enrichments) != len(tweets):
        # Pad / truncate to match input length so position-based pairing stays
        # valid. The mismatch itself is a strong signal of LLM degradation,
        # so log a warning that ops can monitor.
        logger.warning(
            "enrich batch length mismatch: input=%d output=%d (padding/truncating)",
            len(tweets), len(enrichments),
        )
        enrichments = list(enrichments)
        while len(enrichments) < len(tweets):
            enrichments.append(EnrichmentOutput(quality="low"))
        enrichments = enrichments[: len(tweets)]

    return enrichments


# ---------------------------------------------------------------------------
# Post-processing — sanitize tickers, drop invalid output, attach metadata
# ---------------------------------------------------------------------------

def _ticker_appears_in(source_upper: str, ticker_upper: str) -> bool:
    """Check the ticker appears as a discrete token in the source text.

    Substring matching would let `META` match `metaverse`, `ON` match `convention`,
    etc. We require word-boundary edges (no neighboring alphanumeric) and either
    the bare ticker or `$TICKER` form.
    """
    # `(?<![A-Z0-9])\$?TICKER(?![A-Z0-9])` — boundary on both sides;
    # optional $ allows e.g. "$NVDA" or "NVDA Q2".
    pattern = re.compile(rf"(?<![A-Z0-9])\$?{re.escape(ticker_upper)}(?![A-Z0-9])")
    return bool(pattern.search(source_upper))


def _sanitize_enrichment(e: EnrichmentOutput, source_text: str) -> EnrichmentOutput:
    """Belt-and-braces filtering of the LLM output.

    - Drops tickers that aren't 2-5 alpha or 6-digit, or that are in denylist.
    - Drops tickers not actually present in the source text as a discrete token
      (hallucination check, word-boundary aware).
    - Empty quality_features for low quality.
    """
    src_upper = (source_text or "").upper()

    valid_tickers: list[str] = []
    for t in e.tickers:
        ut = t.strip().upper()
        if not _is_valid_ticker(ut):
            continue
        if not _ticker_appears_in(src_upper, ut):
            continue
        valid_tickers.append(ut)
    # Dedup while preserving order
    seen: set[str] = set()
    deduped: list[str] = []
    for t in valid_tickers:
        if t not in seen:
            seen.add(t)
            deduped.append(t)
    e.tickers = deduped

    if e.quality == "low":
        e.quality_features = []

    return e


def _build_symbols_payload(e: EnrichmentOutput) -> dict:
    """Wrap an EnrichmentOutput + provenance into the JSONB structure stored
    on `kol_tweets.symbols`."""
    return {
        "quality": e.quality,
        "quality_features": list(e.quality_features),
        "content_summary_zh": e.content_summary_zh,
        "tickers": list(e.tickers),
        "sectors": list(e.sectors),
        "events": list(e.events),
        "enriched_at": datetime.now(timezone.utc).isoformat(),
        "enriched_model": ENRICH_MODEL,
    }


# ---------------------------------------------------------------------------
# Persist
# ---------------------------------------------------------------------------

async def upsert_enrichment(updates: list[dict]) -> int:
    """Push a list of {id, symbols} updates back via the edge function.

    `updates` shape: [{"id": "...", "symbols": {<EnrichmentOutput payload>}}].
    Returns count of rows successfully updated.
    """
    if not updates:
        return 0
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "upsert_enrichment"},
        json_body={"updates": updates},
        timeout=60.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] != 200:
        raise RuntimeError(
            f"upsert_enrichment failed: HTTP {result['status_code']} "
            f"{result.get('text', '')[:200]}"
        )
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(f"upsert_enrichment returned error: {payload.get('error')}")
    return int(payload.get("updated", 0))


# ---------------------------------------------------------------------------
# Top-level orchestration
# ---------------------------------------------------------------------------

async def enrich_unenriched_tweets(
    window_hours: int = 24,
    batch_size: int = _ENRICH_BATCH_SIZE,
) -> dict:
    """Run the full enrichment pass over recent unenriched tweets.

    Returns a summary dict for cron logging:
      {scanned, enriched, batches, errors, by_quality}
    """
    tweets = await fetch_unenriched(window_hours=window_hours)
    if not tweets:
        logger.info("enrich_unenriched_tweets: no unenriched tweets in last %dh", window_hours)
        return {
            "scanned": 0, "enriched": 0, "batches": 0, "errors": 0,
            "by_quality": {"high": 0, "medium": 0, "low": 0},
        }

    by_quality = {"high": 0, "medium": 0, "low": 0}
    total_enriched = 0
    errors = 0
    batches = 0

    for batch_start in range(0, len(tweets), batch_size):
        batch = tweets[batch_start: batch_start + batch_size]
        batches += 1
        try:
            enrichments = await _run_enrich_batch(batch)
        except Exception as exc:  # noqa: BLE001 — single-batch failure must not fail the run
            errors += 1
            logger.warning(
                "enrich batch %d failed (continuing): %s", batches, exc,
            )
            continue

        updates: list[dict] = []
        for src, e in zip(batch, enrichments):
            sanitized = _sanitize_enrichment(e, src.get("text") or "")
            by_quality[sanitized.quality] = by_quality.get(sanitized.quality, 0) + 1
            updates.append({
                "id": src["id"],
                "symbols": _build_symbols_payload(sanitized),
            })

        try:
            written = await upsert_enrichment(updates)
            total_enriched += written
        except Exception as exc:  # noqa: BLE001
            errors += 1
            logger.warning("upsert_enrichment batch %d failed: %s", batches, exc)
            continue

    summary = {
        "scanned": len(tweets),
        "enriched": total_enriched,
        "batches": batches,
        "errors": errors,
        "by_quality": by_quality,
    }
    logger.info("enrich_unenriched_tweets summary: %s", summary)
    return summary
