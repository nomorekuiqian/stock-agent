"""Unit tests for KOL tweet vector-index formatting.

No network, no database. Covers metadata/provenance extraction and TwitterAPI
createdAt date parsing used by the vector adapter.
"""

from app.features.vector.kol_tweets import (
    _content_for_tweet,
    _iso_date,
    _metadata_for_tweet,
)


def _reference_tweet() -> dict:
    return {
        "id": "2062463349573718318",
        "author_username": "qinbafrank",
        "text": "reference body",
        "tweet_type": "article",
        "created_at": "Thu Jun 04 09:15:55 +0000 2026",
        "category": "frank_interview_reference",
        "symbols": {
            "quality": "keep",
            "content_type": "sector_framework",
            "key_claim": "板块框架: Frank 访谈拆解 AI 与宏观",
            "tickers": ["nvda", "MRVL"],
            "sectors": ["AI_infra", "macro"],
            "persona_username": "qinbafrank",
            "source_author_username": "168X_Fortune",
            "source_kind": "interview_reference",
            "source_tweet_id": "2062463349573718318",
            "source_url": "https://x.com/168X_Fortune/status/2062463349573718318",
            "article_id": "2062376688043044864",
            "article_title": "Frank interview",
        },
    }


def test_iso_date_accepts_twitterapi_created_at_format():
    assert _iso_date("Thu Jun 04 09:15:55 +0000 2026") == "2026-06-04"


def test_metadata_preserves_reference_provenance_and_uppercases_tickers():
    metadata = _metadata_for_tweet(_reference_tweet())

    assert metadata["tickers"] == ["NVDA", "MRVL"]
    assert metadata["content_type"] == "sector_framework"
    assert metadata["key_claim"] == "板块框架: Frank 访谈拆解 AI 与宏观"
    assert metadata["persona_username"] == "qinbafrank"
    assert metadata["source_author_username"] == "168X_Fortune"
    assert metadata["source_kind"] == "interview_reference"
    assert metadata["source_tweet_id"] == "2062463349573718318"
    assert metadata["source_url"] == "https://x.com/168X_Fortune/status/2062463349573718318"
    assert metadata["article_id"] == "2062376688043044864"
    assert metadata["article_title"] == "Frank interview"


def test_content_uses_key_claim_fallback_and_source_author_label():
    tweet = _reference_tweet()
    metadata = _metadata_for_tweet(tweet)

    content = _content_for_tweet(tweet, metadata)

    assert "Summary: 板块框架: Frank 访谈拆解 AI 与宏观" in content
    assert "Persona: @qinbafrank" in content
    assert "Source author: @168X_Fortune" in content
    assert "Article title: Frank interview" in content
