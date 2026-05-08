"""
Unit tests for V3 Step 1 — daily per-tweet enrichment.

Covers:
- _is_valid_ticker / ticker denylist + dictionary
- _sanitize_enrichment: ticker hallucination filter, low-quality features clear
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
from app.features.twitter_digest.models import EnrichmentOutput


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
# _sanitize_enrichment — hallucination + denylist + low-quality features clear
# ---------------------------------------------------------------------------


def test_sanitize_drops_hallucinated_tickers():
    e = EnrichmentOutput(
        quality="high",
        quality_features=["data", "reasoning"],
        content_summary_zh="NVDA 财报前瞻",
        tickers=["NVDA", "FAKE"],   # FAKE not in source text
        sectors=[],
        events=[],
    )
    src = "NVDA Q2 earnings preview, expecting beat"
    out = _sanitize_enrichment(e, src)
    assert out.tickers == ["NVDA"]


def test_sanitize_rejects_substring_only_match():
    """Word-boundary check: 'META' must not match 'metaverse'."""
    e = EnrichmentOutput(
        quality="high",
        quality_features=["data", "reasoning"],
        content_summary_zh="metaverse 长期叙事",
        tickers=["META"],
        sectors=[],
        events=[],
    )
    src = "Long-term metaverse adoption is real"
    out = _sanitize_enrichment(e, src)
    assert out.tickers == []


def test_sanitize_accepts_ticker_at_word_boundary():
    e = EnrichmentOutput(
        quality="high",
        quality_features=["data", "reasoning"],
        content_summary_zh="META 财报",
        tickers=["META"],
        sectors=[],
        events=[],
    )
    src = "META beat on margin"
    out = _sanitize_enrichment(e, src)
    assert out.tickers == ["META"]


def test_sanitize_accepts_dollar_prefixed_ticker_in_source():
    e = EnrichmentOutput(
        quality="high",
        quality_features=["data"],
        content_summary_zh="$AMD 看多",
        tickers=["AMD"],
        sectors=[],
        events=[],
    )
    src = "Bullish on $AMD given Q2 setup"
    out = _sanitize_enrichment(e, src)
    assert out.tickers == ["AMD"]


def test_sanitize_drops_denylisted_words():
    e = EnrichmentOutput(
        quality="medium",
        quality_features=["catalyst"],
        content_summary_zh="AI 投资",
        tickers=["AI", "NVDA"],   # AI is denylisted; NVDA real
        sectors=[],
        events=[],
    )
    src = "AI capex story for NVDA"
    out = _sanitize_enrichment(e, src)
    assert out.tickers == ["NVDA"]


def test_sanitize_dedupes_tickers():
    e = EnrichmentOutput(
        quality="high",
        quality_features=["data", "reasoning"],
        content_summary_zh="x",
        tickers=["NVDA", "NVDA", "nvda"],
        sectors=[],
        events=[],
    )
    src = "NVDA NVDA NVDA"
    out = _sanitize_enrichment(e, src)
    assert out.tickers == ["NVDA"]


def test_sanitize_clears_features_for_low_quality():
    # If LLM accidentally writes features for a low-quality verdict, drop them.
    e = EnrichmentOutput(
        quality="low",
        quality_features=["data"],   # contradiction
        content_summary_zh="",
        tickers=[],
        sectors=[],
        events=[],
    )
    out = _sanitize_enrichment(e, "noise")
    assert out.quality_features == []


# ---------------------------------------------------------------------------
# _build_symbols_payload — provenance attached
# ---------------------------------------------------------------------------


def test_build_symbols_payload_includes_provenance():
    e = EnrichmentOutput(
        quality="medium",
        quality_features=["catalyst"],
        content_summary_zh="单一催化剂",
        tickers=["TSLA"],
        sectors=[],
        events=["Q2 deliveries"],
    )
    payload = _build_symbols_payload(e)
    assert payload["quality"] == "medium"
    assert payload["quality_features"] == ["catalyst"]
    assert payload["tickers"] == ["TSLA"]
    assert payload["events"] == ["Q2 deliveries"]
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
            {"id": "1", "symbols": {"quality": "high"}},
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
        {"id": "1", "author_username": "alice", "text": "NVDA Q2 beat",
         "tweet_type": "original", "created_at": "2026-05-04T01:00:00Z",
         "url": "https://x.com/alice/status/1"},
        {"id": "2", "author_username": "bob", "text": "just bought puts",
         "tweet_type": "original", "created_at": "2026-05-04T02:00:00Z",
         "url": "https://x.com/bob/status/2"},
    ]
    enrich_outputs = [
        EnrichmentOutput(
            quality="high", quality_features=["data", "reasoning"],
            content_summary_zh="NVDA Q2 财报超预期", tickers=["NVDA"],
            sectors=[], events=["Q2 财报"],
        ),
        EnrichmentOutput(
            quality="low", quality_features=[],
            content_summary_zh="", tickers=[], sectors=[], events=[],
        ),
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
    assert summary["by_quality"] == {"high": 1, "medium": 0, "low": 1}

    # Verify the upsert payload is shaped correctly
    upserted = mock_upsert.await_args.args[0]
    assert upserted[0]["id"] == "1"
    assert upserted[0]["symbols"]["quality"] == "high"
    assert upserted[0]["symbols"]["tickers"] == ["NVDA"]
    assert upserted[1]["symbols"]["quality"] == "low"


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
        return [
            EnrichmentOutput(quality="medium", quality_features=["catalyst"],
                             content_summary_zh="x", tickers=[], sectors=[],
                             events=[])
            for _ in batch
        ]

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
