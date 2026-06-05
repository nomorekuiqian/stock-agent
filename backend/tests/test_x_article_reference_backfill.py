from __future__ import annotations

import pytest

from scripts.backfill_x_article_reference import (
    _build_storage_tweet,
    _parse_tweet_id,
)


def _raw_article_tweet() -> dict:
    return {
        "id": "2062463349573718318",
        "text": "article teaser",
        "createdAt": "Thu Jun 04 09:15:55 +0000 2026",
        "url": "https://x.com/168X_Fortune/status/2062463349573718318",
        "conversationId": "2062463349573718318",
        "likeCount": 10,
        "retweetCount": 2,
        "replyCount": 1,
        "viewCount": 1000,
        "isReply": False,
        "author": {"userName": "168X_Fortune"},
        "entities": {
            "urls": [
                {"expanded_url": "http://x.com/i/article/2062376688043044864"}
            ]
        },
    }


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2062463349573718318", "2062463349573718318"),
        (
            "https://x.com/168X_Fortune/status/2062463349573718318?s=46",
            "2062463349573718318",
        ),
    ],
)
def test_parse_tweet_id(value: str, expected: str):
    assert _parse_tweet_id(value) == expected


def test_build_storage_tweet_defaults_to_persona_author_with_source_metadata():
    row = _build_storage_tweet(
        tweet=_raw_article_tweet(),
        article_title="Frank interview",
        article_text="long interview body",
        persona="qinbafrank",
        source_kind="interview_reference",
        category="frank_interview_reference",
        storage_author_mode="persona",
        content_type="sector_framework",
        key_claim="板块框架: Frank 访谈拆解 AI 与宏观",
        sectors=["AI_infra", "macro"],
        tickers=["NVDA", "MRVL"],
        stance="neutral",
    )

    assert row["id"] == "2062463349573718318"
    assert row["author_username"] == "qinbafrank"
    assert row["tweet_type"] == "article"
    assert row["created_at"] == "2026-06-04T09:15:55+00:00"
    assert row["text"] == "long interview body"
    assert row["category"] == "frank_interview_reference"
    assert row["symbols"]["persona_username"] == "qinbafrank"
    assert row["symbols"]["source_author_username"] == "168X_Fortune"
    assert row["symbols"]["source_tweet_id"] == "2062463349573718318"
    assert row["symbols"]["article_id"] == "2062376688043044864"
    assert row["symbols"]["article_title"] == "Frank interview"
    assert row["symbols"]["content_type"] == "sector_framework"
    assert row["symbols"]["quality"] == "keep"


def test_build_storage_tweet_can_preserve_literal_source_author():
    row = _build_storage_tweet(
        tweet=_raw_article_tweet(),
        article_title="Frank interview",
        article_text="long interview body",
        persona="qinbafrank",
        source_kind="interview_reference",
        category="frank_interview_reference",
        storage_author_mode="source",
        content_type="sector_framework",
        key_claim="板块框架: Frank 访谈拆解 AI 与宏观",
        sectors=["AI_infra"],
        tickers=[],
        stance="neutral",
    )

    assert row["author_username"] == "168X_Fortune"
    assert row["symbols"]["persona_username"] == "qinbafrank"
