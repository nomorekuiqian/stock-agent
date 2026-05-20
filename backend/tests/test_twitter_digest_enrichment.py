"""
Unit tests for Step 1 — daily per-tweet enrichment.

Covers:
- _is_valid_ticker / ticker denylist + dictionary
- _sanitize_enrichment: ticker hallucination filter, drop→empty stances
- _build_symbols_payload: provenance attachment
- enrich_unenriched_tweets: orchestration, batching, partial failure
- fetch_unenriched / upsert_enrichment: edge function call paths
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.features.twitter_digest.enrichment import (
    _build_symbols_payload,
    _is_valid_ticker,
    _sanitize_enrichment,
    enrich_unenriched_tweets,
    fetch_unenriched,
    upsert_enrichment,
)
from app.features.twitter_digest.models import EnrichmentOutput, TickerStance


def _enrich(quality="keep", stances=None, sectors=None):
    return EnrichmentOutput(
        quality=quality,
        ticker_stances=[TickerStance(**s) for s in (stances or [])],
        sectors=sectors or [],
    )


# ---------------------------------------------------------------------------
# Ticker validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("symbol,expected", [
    ("NVDA", True),
    ("AMD", True),
    ("META", True),
    ("GOOGL", True),       # 5 chars
    ("600519", True),      # A-share 6-digit
    ("BTC", False),        # crypto in denylist (goes in sectors)
    ("ETH", False),        # ditto
    ("CEO", False),        # English word denylist
    ("API", False),
    ("AI", False),
    ("dca", False),        # lowercase fails uppercase rule
    ("", False),
    ("TOOLONGTICKER", False),
    ("12345", False),       # 5 digits, not 6
])
def test_is_valid_ticker(symbol, expected):
    assert _is_valid_ticker(symbol) is expected


# ---------------------------------------------------------------------------
# _sanitize_enrichment — hallucination + denylist + drop→empty
# ---------------------------------------------------------------------------


def test_sanitize_drops_hallucinated_tickers():
    e = _enrich(stances=[
        {"ticker": "NVDA", "stance": "bull"},
        {"ticker": "FAKE", "stance": "bear"},  # FAKE not in source
    ])
    out = _sanitize_enrichment(e, "NVDA Q2 earnings preview, expecting beat")
    assert [(s.ticker, s.stance) for s in out.ticker_stances] == [("NVDA", "bull")]


def test_sanitize_rejects_substring_only_match():
    """Word-boundary check: 'META' must not match 'metaverse'."""
    e = _enrich(stances=[{"ticker": "META", "stance": "bull"}])
    out = _sanitize_enrichment(e, "Long-term metaverse adoption is real")
    assert out.ticker_stances == []


def test_sanitize_accepts_ticker_at_word_boundary():
    e = _enrich(stances=[{"ticker": "META", "stance": "bull"}])
    out = _sanitize_enrichment(e, "META beat on margin")
    assert [(s.ticker, s.stance) for s in out.ticker_stances] == [("META", "bull")]


def test_sanitize_accepts_dollar_prefixed_ticker_in_source():
    e = _enrich(stances=[{"ticker": "AMD", "stance": "bull"}])
    out = _sanitize_enrichment(e, "Bullish on $AMD given Q2 setup")
    assert [(s.ticker, s.stance) for s in out.ticker_stances] == [("AMD", "bull")]


def test_sanitize_drops_denylisted_words():
    e = _enrich(stances=[
        {"ticker": "AI", "stance": "bull"},  # denylisted
        {"ticker": "NVDA", "stance": "bull"},
    ])
    out = _sanitize_enrichment(e, "AI capex story for NVDA")
    assert [s.ticker for s in out.ticker_stances] == ["NVDA"]


def test_sanitize_dedupes_tickers():
    e = _enrich(stances=[
        {"ticker": "NVDA", "stance": "bull"},
        {"ticker": "NVDA", "stance": "neutral"},  # dup, dropped
        {"ticker": "nvda", "stance": "bear"},     # dup after upper
    ])
    out = _sanitize_enrichment(e, "NVDA NVDA NVDA")
    assert [(s.ticker, s.stance) for s in out.ticker_stances] == [("NVDA", "bull")]


def test_sanitize_clears_stances_for_drop():
    # If LLM accidentally writes stances for a drop verdict, clear them.
    e = _enrich(quality="drop", stances=[{"ticker": "NVDA", "stance": "bull"}])
    out = _sanitize_enrichment(e, "NVDA noise")
    assert out.ticker_stances == []


# ---------------------------------------------------------------------------
# _build_symbols_payload — provenance attached
# ---------------------------------------------------------------------------


def test_build_symbols_payload_includes_provenance():
    e = _enrich(
        stances=[{"ticker": "TSLA", "stance": "bull"}],
        sectors=["汽车"],
    )
    payload = _build_symbols_payload(e)
    assert payload["quality"] == "keep"
    assert payload["ticker_stances"] == [{"ticker": "TSLA", "stance": "bull"}]
    assert payload["sectors"] == ["汽车"]
    assert "enriched_at" in payload
    assert payload["enriched_model"]


# ---------------------------------------------------------------------------
# fetch_unenriched — edge function call shape
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_unenriched_passes_window():
    fake_db = AsyncMock()
    fake_db.call_function = AsyncMock(return_value={
        "status_code": 200,
        "data": {"success": True, "data": [{"id": "1"}]},
    })
    with patch("app.features.twitter_digest.enrichment.get_insforge_service", return_value=fake_db):
        out = await fetch_unenriched(window_hours=24, limit=100)
    assert out == [{"id": "1"}]
    call = fake_db.call_function.await_args
    assert call.kwargs["params"] == {"action": "list_unenriched"}
    body = call.kwargs["json_body"]
    assert "since" in body
    assert body["limit"] == 100


@pytest.mark.asyncio
async def test_fetch_unenriched_raises_on_http_error():
    fake_db = AsyncMock()
    fake_db.call_function = AsyncMock(return_value={"status_code": 500, "text": "boom"})
    with patch("app.features.twitter_digest.enrichment.get_insforge_service", return_value=fake_db):
        with pytest.raises(RuntimeError, match="list_unenriched failed"):
            await fetch_unenriched(window_hours=24)


# ---------------------------------------------------------------------------
# upsert_enrichment — edge function call shape
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upsert_enrichment_returns_count():
    fake_db = AsyncMock()
    fake_db.call_function = AsyncMock(return_value={
        "status_code": 200,
        "data": {"success": True, "updated": 3, "errors": 0},
    })
    with patch("app.features.twitter_digest.enrichment.get_insforge_service", return_value=fake_db):
        n = await upsert_enrichment([
            {"id": "1", "symbols": {"quality": "keep"}},
        ])
    assert n == 3


@pytest.mark.asyncio
async def test_upsert_enrichment_short_circuits_empty():
    # No edge function call when there's nothing to write.
    fake_db = AsyncMock()
    fake_db.call_function = AsyncMock()
    with patch("app.features.twitter_digest.enrichment.get_insforge_service", return_value=fake_db):
        n = await upsert_enrichment([])
    assert n == 0
    fake_db.call_function.assert_not_called()


# ---------------------------------------------------------------------------
# enrich_unenriched_tweets — orchestration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_enrich_short_circuits_when_nothing_to_enrich():
    with patch(
        "app.features.twitter_digest.enrichment.fetch_unenriched",
        AsyncMock(return_value=[]),
    ):
        summary = await enrich_unenriched_tweets()
    assert summary["scanned"] == 0
    assert summary["enriched"] == 0


@pytest.mark.asyncio
async def test_enrich_happy_path():
    raw_tweets = [
        {"id": "1", "author_username": "alice", "text": "NVDA Q2 beat with data",
         "tweet_type": "original", "created_at": "2026-05-04T01:00:00Z",
         "url": "https://x.com/alice/status/1"},
        {"id": "2", "author_username": "bob", "text": "just bought puts",
         "tweet_type": "original", "created_at": "2026-05-04T02:00:00Z",
         "url": "https://x.com/bob/status/2"},
    ]
    enrich_outputs = [
        _enrich(
            quality="keep",
            stances=[{"ticker": "NVDA", "stance": "bull"}],
            sectors=["半导体"],
        ),
        _enrich(quality="drop"),
    ]
    with patch(
        "app.features.twitter_digest.enrichment.fetch_unenriched",
        AsyncMock(return_value=raw_tweets),
    ), patch(
        "app.features.twitter_digest.enrichment._run_enrich_batch",
        AsyncMock(return_value=enrich_outputs),
    ), patch(
        "app.features.twitter_digest.enrichment.upsert_enrichment",
        AsyncMock(return_value=2),
    ) as mock_upsert:
        summary = await enrich_unenriched_tweets(window_hours=24)

    assert summary["scanned"] == 2
    assert summary["enriched"] == 2
    assert summary["batches"] == 1
    assert summary["errors"] == 0
    assert summary["by_quality"] == {"keep": 1, "drop": 1}

    # Verify the upsert payload is shaped correctly
    upserted = mock_upsert.await_args.args[0]
    assert upserted[0]["id"] == "1"
    assert upserted[0]["symbols"]["quality"] == "keep"
    assert upserted[0]["symbols"]["ticker_stances"] == [
        {"ticker": "NVDA", "stance": "bull"}
    ]
    assert upserted[1]["symbols"]["quality"] == "drop"


@pytest.mark.asyncio
async def test_enrich_batch_failure_does_not_abort_run():
    # Two batches; first batch's LLM fails. Second batch must still process.
    raw = [{"id": str(i), "author_username": "u", "text": "x",
            "tweet_type": "original", "created_at": "2026-05-04T00:00:00Z",
            "url": ""} for i in range(50)]

    call_count = {"n": 0}

    async def flaky_run_batch(batch):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("LLM hiccup")
        return [_enrich(quality="keep") for _ in batch]

    with patch(
        "app.features.twitter_digest.enrichment.fetch_unenriched",
        AsyncMock(return_value=raw),
    ), patch(
        "app.features.twitter_digest.enrichment._run_enrich_batch",
        side_effect=flaky_run_batch,
    ), patch(
        "app.features.twitter_digest.enrichment.upsert_enrichment",
        AsyncMock(return_value=25),
    ):
        summary = await enrich_unenriched_tweets(window_hours=24, batch_size=25)

    assert summary["scanned"] == 50
    assert summary["batches"] == 2
    assert summary["errors"] == 1   # batch 1 LLM failed
    # Batch 2 still wrote 25
    assert summary["enriched"] == 25
