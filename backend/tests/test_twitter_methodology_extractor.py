"""Tests for Twitter KOL methodology extraction helpers."""

import pytest

from app.features.twitter import db as twitter_db
from app.features.twitter.methodology_extractor import (
    repair_evidence_quotes,
    validate_evidence,
)
from app.features.twitter.methodology_models import CategoryMethodology


def _sample_methodology(quote: str) -> CategoryMethodology:
    return CategoryMethodology.model_validate(
        {
            "analyst": "qinbafrank",
            "category": "macro_analysis",
            "source_tweet_count": 1,
            "methodology_version": "v1.0",
            "prompt_version": "v1.1",
            "data_preferences": [
                {
                    "name": "银行准备金",
                    "frequency": "high",
                    "description": "用银行准备金判断美元流动性是否实质改善。",
                    "evidence": [
                        {"tweet_id": "1", "quote": quote},
                        {"tweet_id": "1", "quote": "准备金回升到3万亿美金以上"},
                    ],
                }
            ],
        }
    )


def test_repair_evidence_quotes_replaces_ellipsis_with_exact_source_quote():
    methodology = _sample_methodology(
        "准备金回升到3万亿美金以上...才能看到流动性实质性改善"
    )
    tweets = [
        {
            "id": "1",
            "text": "准备金回升到3万亿美金以上，才能看到流动性实质性改善。",
        }
    ]

    repaired = repair_evidence_quotes(methodology, tweets)

    assert repaired == 1
    assert validate_evidence(methodology, tweets) == []
    assert methodology.data_preferences[0].evidence[0].quote == (
        "准备金回升到3万亿美金以上"
    )


@pytest.mark.asyncio
async def test_list_tweets_by_category_pages_until_limit(monkeypatch):
    calls = []

    async def fake_get_tweets(username, category=None, page=1, limit=20):
        calls.append(
            {
                "username": username,
                "category": category,
                "page": page,
                "limit": limit,
            }
        )
        if page == 1:
            return [{"id": str(i)} for i in range(100)]
        return [{"id": str(i)} for i in range(100, 150)]

    monkeypatch.setattr(twitter_db, "get_tweets", fake_get_tweets)

    rows = await twitter_db.list_tweets_by_category(
        username="qinbafrank",
        category="stock_analysis",
        limit=120,
    )

    assert len(rows) == 120
    assert calls == [
        {
            "username": "qinbafrank",
            "category": "stock_analysis",
            "page": 1,
            "limit": 100,
        },
        {
            "username": "qinbafrank",
            "category": "stock_analysis",
            "page": 2,
            "limit": 20,
        },
    ]
