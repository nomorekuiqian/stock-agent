from unittest.mock import AsyncMock, patch

import pytest

from app.features.twitter import db as twitter_db
from app.features.twitter import discussion_summary_agent


def _tweet(
    tweet_id: str,
    *,
    text: str = "text",
    symbols=None,
    author: str = "alice",
    created_at: str = "2026-06-15T12:00:00+00:00",
) -> dict:
    return {
        "id": tweet_id,
        "author_username": author,
        "text": text,
        "tweet_type": "original",
        "conversation_id": tweet_id,
        "quoted_tweet_text": None,
        "in_reply_to_username": None,
        "created_at": created_at,
        "url": f"https://x.com/{author}/status/{tweet_id}",
        "like_count": 10,
        "retweet_count": 2,
        "reply_count": 1,
        "view_count": 100,
        "category": "ai",
        "symbols": symbols,
    }


def test_ticker_discussion_matches_structured_ticker_stances():
    tweet = _tweet(
        "1",
        symbols={
            "quality": "keep",
            "ticker_stances": [{"ticker": "$amd", "stance": "bull"}],
            "content_type": "thesis",
            "key_claim": "AMD demand is improving.",
            "sectors": ["semis"],
        },
    )

    assert twitter_db._tweet_matches_symbol(tweet, "AMD") is True
    normalized = twitter_db._normalize_discussion_tweet(tweet, "AMD")
    assert normalized is not None
    assert normalized["stance"] == "bull"
    assert normalized["tickers"] == ["AMD"]
    assert normalized["key_claim"] == "AMD demand is improving."


def test_ticker_discussion_matches_legacy_tickers_list():
    tweet = _tweet(
        "1",
        symbols={"quality": "high", "tickers": ["nvda", "$AMD"]},
    )

    assert twitter_db._tweet_matches_symbol(tweet, "AMD") is True
    normalized = twitter_db._normalize_discussion_tweet(tweet, "AMD")
    assert normalized is not None
    assert normalized["stance"] == "neutral"
    assert normalized["tickers"] == ["NVDA", "AMD"]


def test_ticker_discussion_matches_bare_legacy_symbols_array():
    tweet = _tweet("1", symbols=["META", "$AMD"])

    assert twitter_db._tweet_matches_symbol(tweet, "AMD") is True
    normalized = twitter_db._normalize_discussion_tweet(tweet, "AMD")
    assert normalized is not None
    assert normalized["tickers"] == ["META", "AMD"]


def test_ticker_discussion_cashtag_fallback_only_for_unenriched_rows():
    unenriched = _tweet("1", text="Watching $AMD into earnings", symbols=None)
    plain_word = _tweet("2", text="AMD looks interesting", symbols=None)
    enriched_no_ticker = _tweet(
        "3",
        text="Watching $AMD into earnings",
        symbols={"quality": "keep", "ticker_stances": []},
    )

    assert twitter_db._tweet_matches_symbol(unenriched, "AMD") is True
    assert twitter_db._tweet_matches_symbol(plain_word, "AMD") is False
    assert twitter_db._tweet_matches_symbol(enriched_no_ticker, "AMD") is False


def test_build_ticker_discussion_summary_groups_multiple_themes():
    tweets = [
        {
            **_tweet(
                "ai-1",
                text="AMD AI GPU demand is improving into MI350.",
                symbols=None,
                author="alice",
            ),
            "key_claim": "AMD AI GPU demand is improving into MI350.",
            "content_type": "thesis",
            "stance": "bull",
            "tickers": ["AMD"],
            "sectors": ["semis"],
        },
        {
            **_tweet(
                "sector-1",
                text="AMD rally is part of the broader semiconductor beta trade.",
                symbols=None,
                author="bob",
            ),
            "key_claim": "AMD rally is part of the broader semiconductor beta trade.",
            "content_type": "market_reaction",
            "stance": "bull",
            "tickers": ["AMD"],
            "sectors": ["semis"],
        },
        {
            **_tweet(
                "risk-1",
                text="AMD valuation looks expensive after this move.",
                symbols=None,
                author="carol",
            ),
            "key_claim": "AMD valuation looks expensive after this move.",
            "content_type": "risk",
            "stance": "bear",
            "tickers": ["AMD"],
            "sectors": ["semis"],
        },
    ]

    summary = twitter_db.build_ticker_discussion_summary("AMD", tweets, hours=24)

    assert summary["overview"]["tweet_count"] == 3
    assert summary["overview"]["author_count"] == 3
    assert summary["overview"]["bull_count"] == 2
    assert summary["overview"]["bear_count"] == 1
    assert "AMD" in summary["overview"]["one_line_summary"]
    assert len(summary["themes"]) >= 2
    assert any(theme["title"] == "AI 需求与芯片产品线" for theme in summary["themes"])
    valuation_theme = next(
        theme for theme in summary["themes"]
        if theme["title"] == "估值与仓位分歧"
    )
    assert valuation_theme["stance"] == "bear"
    assert valuation_theme["evidence_tweet_ids"] == ["risk-1"]
    assert "risks" not in summary


def test_discussion_summary_fallback_hides_raw_english_claims():
    summary = {
        "overview": {
            "tweet_count": 1,
            "author_count": 1,
            "bull_count": 0,
            "bear_count": 1,
            "neutral_count": 0,
            "dominant_stance": "bear",
        },
        "themes": [
            {
                "key": "valuation_positioning",
                "title": "估值与仓位分歧",
                "stance": "bear",
                "summary": "AMD valuation looks expensive after this move.",
                "tweet_count": 1,
                "author_count": 1,
                "representative_claims": [
                    "AMD valuation looks expensive after this move."
                ],
                "evidence_tweet_ids": ["risk-1"],
            }
        ],
    }

    fallback = discussion_summary_agent._fallback_summary("AMD", 24, summary)

    assert fallback["themes"][0]["representative_claims"] == []
    assert "valuation looks" not in fallback["themes"][0]["summary"]
    assert "观察线索" in fallback["themes"][0]["summary"]


@pytest.mark.asyncio
async def test_generate_chinese_discussion_summary_uses_deterministic_fallback(monkeypatch):
    discussion_summary_agent._summary_cache.clear()
    monkeypatch.setattr(discussion_summary_agent, "DEEPSEEK_API_KEY", "")
    summary = {
        "overview": {
            "tweet_count": 1,
            "author_count": 1,
            "bull_count": 1,
            "bear_count": 0,
            "neutral_count": 0,
            "dominant_stance": "bull",
        },
        "themes": [
            {
                "key": "ai_demand",
                "title": "AI 需求与芯片产品线",
                "stance": "bull",
                "summary": "AMD AI GPU demand is improving.",
                "tweet_count": 1,
                "author_count": 1,
                "representative_claims": ["AMD AI GPU demand is improving."],
                "evidence_tweet_ids": ["tweet-1"],
            }
        ],
    }

    result = await discussion_summary_agent.generate_chinese_discussion_summary(
        symbol="AMD",
        hours=24,
        summary=summary,
        tweets=[_tweet("tweet-1")],
    )

    assert result["overview"]["one_line_summary"].startswith("过去 24 小时")
    assert "demand is improving" not in result["themes"][0]["summary"]


@pytest.mark.asyncio
async def test_generate_chinese_discussion_summary_uses_tweet_evidence(monkeypatch):
    discussion_summary_agent._summary_cache.clear()
    captured = {}

    async def fake_generate_structured_json(**kwargs):
        captured.update(kwargs)
        return discussion_summary_agent._DiscussionSummaryOutput(
            one_line_summary=(
                "META 的讨论核心不是简单看多或看空，而是在争论 AI 资本开支、"
                "广告效率和现金流承压之间能否形成闭环：多方认为 AI 推荐和广告"
                "转化率会消化投入，谨慎方担心回报周期太长。"
            ),
            themes=[
                discussion_summary_agent._ThemeSummaryOutput(
                    key="ai_demand",
                    summary=(
                        "这个主题主要围绕 AI 投入如何转化为广告效率展开。支持方的"
                        "逻辑是 Llama、推荐系统和自研芯片会降低长期推理成本并提升"
                        "广告变现；质疑方则把 capex 增速和自由现金流压力作为反证。"
                    ),
                    representative_claims=[
                        "AI 投入能否转化为广告效率，是这组讨论的核心验证点。",
                        "META AI capex must produce ad ROI or FCF will be questioned.",
                    ],
                )
            ],
        )

    monkeypatch.setattr(discussion_summary_agent, "DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setattr(
        discussion_summary_agent,
        "generate_structured_json",
        fake_generate_structured_json,
    )
    summary = {
        "overview": {
            "tweet_count": 2,
            "author_count": 2,
            "bull_count": 1,
            "bear_count": 1,
            "neutral_count": 0,
            "dominant_stance": "mixed",
        },
        "themes": [
            {
                "key": "ai_demand",
                "title": "AI 投入与广告效率",
                "stance": "mixed",
                "summary": "Meta AI capex debate.",
                "tweet_count": 2,
                "author_count": 2,
                "representative_claims": ["Meta AI capex must produce ad ROI."],
                "evidence_tweet_ids": ["tweet-1"],
            }
        ],
    }

    result = await discussion_summary_agent.generate_chinese_discussion_summary(
        symbol="META",
        hours=24,
        summary=summary,
        tweets=[
            {
                **_tweet(
                    "tweet-1",
                    text="META AI capex must produce ad ROI or FCF will be questioned.",
                ),
                "key_claim": "META AI capex must produce ad ROI.",
                "stance": "mixed",
            }
        ],
    )

    assert "AI 资本开支" in result["overview"]["one_line_summary"]
    assert "广告效率" in result["themes"][0]["summary"]
    assert result["themes"][0]["representative_claims"] == [
        "AI 投入能否转化为广告效率，是这组讨论的核心验证点。"
    ]
    assert "不要把正文写成" in captured["system_prompt"]
    payload_theme = captured["user_payload"]["themes"][0]
    assert payload_theme["key"] == "ai_demand"
    assert payload_theme["evidence_tweets"][0]["key_claim"] == "META AI capex must produce ad ROI."


@pytest.mark.asyncio
async def test_list_ticker_discussion_filters_and_sorts(monkeypatch):
    rows = [
        _tweet(
            "old-match",
            symbols={"ticker_stances": [{"ticker": "AMD", "stance": "bear"}]},
            created_at="2026-06-15T10:00:00+00:00",
        ),
        _tweet(
            "new-match",
            symbols={"ticker_stances": [{"ticker": "AMD", "stance": "bull"}]},
            created_at="2026-06-15T12:00:00+00:00",
        ),
        _tweet(
            "miss",
            symbols={"ticker_stances": [{"ticker": "NVDA", "stance": "bull"}]},
            created_at="2026-06-15T13:00:00+00:00",
        ),
    ]
    call_function = AsyncMock(
        return_value={
            "status_code": 200,
            "data": {"success": True, "data": rows},
            "text": "",
        }
    )
    monkeypatch.setattr(twitter_db, "_DISCUSSION_SLICE_HOURS", 24)

    with patch.object(twitter_db, "get_insforge_service") as service:
        service.return_value.call_function = call_function
        result = await twitter_db.list_ticker_discussion("amd", hours=24, limit=10)

    assert [tweet["id"] for tweet in result] == ["new-match", "old-match"]
    assert result[0]["stance"] == "bull"
    assert call_function.call_args.kwargs["params"] == {"action": "list_batch"}
