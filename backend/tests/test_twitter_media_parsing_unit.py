"""Unit tests for KOL tweet media extraction."""

from app.features.vector.kol_tweets import (
    _content_for_tweet,
    _metadata_for_tweet,
)
from app.features.twitter.service import _parse_tweet
from scripts.claude_enrich.fetch_for_enrich import _slim


def test_parse_tweet_extracts_photo_media_metadata() -> None:
    raw = {
        "id": "2064265925122253011",
        "author": {"userName": "JohnsonZ91127"},
        "text": "软件股预计下半年会跑赢大盘",
        "createdAt": "Tue Jun 09 08:38:43 +0000 2026",
        "url": "https://x.com/JohnsonZ91127/status/2064265925122253011",
        "extendedEntities": {
            "media": [
                {
                    "type": "photo",
                    "media_key": "3_2064265922123284480",
                    "media_url_https": "https://pbs.twimg.com/media/HKW-61IaQAAZOwy.jpg",
                    "expanded_url": "https://x.com/JohnsonZ91127/status/2064265925122253011/photo/1",
                    "original_info": {"width": 1055, "height": 1491},
                },
                {
                    "type": "photo",
                    "media_key": "3_2064265922123284480",
                    "media_url_https": "https://pbs.twimg.com/media/HKW-61IaQAAZOwy.jpg",
                    "expanded_url": "https://x.com/JohnsonZ91127/status/2064265925122253011/photo/1",
                    "original_info": {"width": 1055, "height": 1491},
                },
            ]
        },
    }

    parsed = _parse_tweet(raw)

    assert parsed is not None
    assert parsed["media"] == [
        {
            "type": "photo",
            "media_key": "3_2064265922123284480",
            "source_url": "https://pbs.twimg.com/media/HKW-61IaQAAZOwy.jpg",
            "expanded_url": "https://x.com/JohnsonZ91127/status/2064265925122253011/photo/1",
            "width": 1055,
            "height": 1491,
        }
    ]


def test_parse_tweet_defaults_media_to_empty_list() -> None:
    parsed = _parse_tweet(
        {
            "id": "1",
            "author": {"userName": "author"},
            "text": "plain text tweet",
        }
    )

    assert parsed is not None
    assert parsed["media"] == []


def test_fetch_for_enrich_prefers_canonical_text() -> None:
    row = {
        "id": "2064265925122253011",
        "created_at": "2026-06-09T08:38:43+00:00",
        "tweet_type": "original",
        "text": "软件股预计下半年会跑赢大盘",
        "canonical_text": "软件股预计下半年会跑赢大盘\n\n[Image 1 text]\n企业AI落地前必补的四个底座",
        "canonical_status": "vision_done",
        "content_parts": [
            {"type": "tweet_text", "text": "软件股预计下半年会跑赢大盘"},
            {"type": "image_text", "text": "企业AI落地前必补的四个底座"},
        ],
        "media": [{"type": "photo", "source_url": "https://pbs.twimg.com/media/example.jpg"}],
    }

    slim = _slim(row)

    assert slim["text"] == row["canonical_text"]
    assert slim["raw_text"] == row["text"]
    assert slim["canonical_status"] == "vision_done"
    assert slim["content_parts"][1]["type"] == "image_text"


def test_vector_kol_tweet_uses_canonical_text_and_metadata() -> None:
    tweet = {
        "id": "2064265925122253011",
        "author_username": "JohnsonZ91127",
        "text": "软件股预计下半年会跑赢大盘",
        "tweet_type": "original",
        "created_at": "2026-06-09T08:38:43+00:00",
        "media": [{"type": "photo", "source_url": "https://pbs.twimg.com/media/example.jpg"}],
        "content_parts": [
            {"type": "tweet_text", "text": "软件股预计下半年会跑赢大盘"},
            {"type": "image_text", "text": "企业AI落地前必补的四个底座"},
        ],
        "canonical_text": "软件股预计下半年会跑赢大盘\n\n[Image 1 text]\n企业AI落地前必补的四个底座",
        "canonical_status": "vision_done",
        "canonical_hash": "abc123",
        "canonical_extracted_at": "2026-06-17T23:55:00+00:00",
        "canonical_extracted_model": "gemini-3.5-flash+canonical-builder-v1",
        "symbols": {
            "quality": "keep",
            "tickers": ["SNOW", "CRWD"],
            "sectors": ["AI_infra"],
            "content_type": "thesis",
            "key_claim": "投资逻辑: 企业AI落地需数据、流程、安全、防护四底座",
        },
    }

    metadata = _metadata_for_tweet(tweet)
    content = _content_for_tweet(tweet, metadata)

    assert metadata["media_count"] == 1
    assert metadata["content_part_types"] == ["tweet_text", "image_text"]
    assert metadata["canonical_status"] == "vision_done"
    assert metadata["canonical_hash"] == "abc123"
    assert "Canonical tweet content:" in content
    assert "企业AI落地前必补的四个底座" in content
    assert "Original tweet:" not in content
