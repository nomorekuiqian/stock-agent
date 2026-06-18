"""Ticker-level Twitter discussion summaries."""

from __future__ import annotations

import json
import time
from copy import deepcopy
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import (
    DEEPSEEK_API_KEY,
    WATCHLIST_MONITOR_LLM_MAX_TOKENS,
    WATCHLIST_MONITOR_LLM_MODEL,
    WATCHLIST_MONITOR_LLM_RETRIES,
    WATCHLIST_MONITOR_LLM_TEMPERATURE,
)
from app.core.logging import get_logger
from app.shared.llm_clients.structured import generate_structured_json

MAX_THEMES = 8
_CACHE_TTL_SECONDS = 15 * 60
_CACHE_MAX_SIZE = 128
_MAX_THEME_EVIDENCE_TWEETS = 4
_MAX_TWEET_TEXT_CHARS = 420
_MAX_CLAIM_CHARS = 220

logger = get_logger(__name__)

_summary_cache: dict[str, tuple[float, dict]] = {}


class _ThemeSummaryOutput(BaseModel):
    key: str = Field(..., min_length=1, max_length=80)
    summary: str = Field(..., min_length=40, max_length=520)
    representative_claims: list[str] = Field(default_factory=list, max_length=3)


class _DiscussionSummaryOutput(BaseModel):
    one_line_summary: str = Field(..., min_length=60, max_length=900)
    themes: list[_ThemeSummaryOutput] = Field(default_factory=list, max_length=MAX_THEMES)


_DISCUSSION_SUMMARY_INSTRUCTION = """
你要把一只股票的 Twitter/KOL 市场讨论，整理成中文用户能一眼读懂的讨论总结。

输出仍然只有两个层级：
1. one_line_summary：整只股票的讨论总览。
2. themes[].summary：每个主题的讨论总结。

写作要求：
- 只使用输入里的 overview、themes、evidence_tweets、representative_claims，不要编造公司事实。
- 这是“市场讨论”，不是已验证公告。可以写“市场在讨论/担心/押注/分歧在于”，不要写成公司已经确认。
- 不要把正文写成“有几条推文、几位作者、情绪偏多/偏空”。数量和情绪只是背景，不是总结主体。
- one_line_summary 要像一段深度总览：说明这轮讨论围绕什么问题展开，核心逻辑链是什么，多空分歧在哪里，接下来哪些变量会验证或推翻讨论。
- themes[].summary 要具体解释这个主题“怎么被讨论”：观点之间的因果链条、支持方和质疑方分别抓住什么证据、具体争议点是什么。
- 如果主题证据很少，也要说清楚“目前只形成了什么弱信号”，不要用空泛套话。
- 不要直接复制英文原文；把观点转成自然中文。Ticker、产品名、公司名可以保留英文。
- 不输出买入、卖出、加仓、减仓、持有、追高、抄底等操作建议。
- 每个 theme 必须返回输入中已有的 key，不要新增 theme，不要改 key。
- representative_claims 只放 1-3 条中文短句，用来概括可追溯的代表观点；没有就返回空数组。
"""


def _cache_key(symbol: str, hours: int, summary: dict) -> str:
    themes = []
    for theme in (summary.get("themes") or [])[:MAX_THEMES]:
        themes.append(
            {
                "key": theme.get("key"),
                "tweet_count": theme.get("tweet_count"),
                "evidence_tweet_ids": theme.get("evidence_tweet_ids") or [],
            }
        )
    overview = summary.get("overview") or {}
    return json.dumps(
        {
            "symbol": symbol,
            "hours": hours,
            "tweet_count": overview.get("tweet_count"),
            "latest_at": overview.get("latest_at"),
            "themes": themes,
        },
        ensure_ascii=False,
        sort_keys=True,
    )


def _get_cached_summary(cache_key: str) -> dict | None:
    cached = _summary_cache.get(cache_key)
    if not cached:
        return None
    created_at, value = cached
    if time.monotonic() - created_at > _CACHE_TTL_SECONDS:
        _summary_cache.pop(cache_key, None)
        return None
    return deepcopy(value)


def _store_cached_summary(cache_key: str, value: dict) -> None:
    if len(_summary_cache) >= _CACHE_MAX_SIZE:
        oldest_key = min(_summary_cache, key=lambda key: _summary_cache[key][0])
        _summary_cache.pop(oldest_key, None)
    _summary_cache[cache_key] = (time.monotonic(), deepcopy(value))


def _trim_text(value: object, max_chars: int) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "..."


def _chinese_char_count(text: str) -> int:
    return sum(1 for char in text if "\u4e00" <= char <= "\u9fff")


def _looks_mostly_english(text: str) -> bool:
    letters = sum(1 for char in text if char.isascii() and char.isalpha())
    chinese = _chinese_char_count(text)
    return len(text) >= 24 and letters > max(32, chinese * 2)


def _tweet_engagement(tweet: dict[str, Any]) -> int:
    return (
        int(tweet.get("like_count") or 0)
        + int(tweet.get("retweet_count") or 0) * 2
        + int(tweet.get("reply_count") or 0)
    )


def _tweet_for_prompt(tweet: dict[str, Any]) -> dict[str, Any]:
    key_claim = _trim_text(tweet.get("key_claim"), _MAX_CLAIM_CHARS)
    text = _trim_text(tweet.get("text"), _MAX_TWEET_TEXT_CHARS)
    quoted_text = _trim_text(tweet.get("quoted_tweet_text"), _MAX_TWEET_TEXT_CHARS)
    return {
        "id": str(tweet.get("id") or ""),
        "author": str(tweet.get("author_username") or ""),
        "created_at": tweet.get("created_at"),
        "tweet_type": tweet.get("tweet_type"),
        "stance": tweet.get("stance"),
        "key_claim": key_claim,
        "text": text,
        "quoted_tweet_text": quoted_text,
        "engagement_score": _tweet_engagement(tweet),
    }


def _build_llm_payload(
    *,
    symbol: str,
    hours: int,
    summary: dict[str, Any],
    tweets: list[dict[str, Any]],
) -> dict[str, Any]:
    tweets_by_id = {str(tweet.get("id") or ""): tweet for tweet in tweets}
    overview = summary.get("overview") if isinstance(summary.get("overview"), dict) else {}
    themes = []

    for theme in (summary.get("themes") or [])[:MAX_THEMES]:
        if not isinstance(theme, dict):
            continue
        evidence_ids = [
            str(tweet_id)
            for tweet_id in (theme.get("evidence_tweet_ids") or [])
            if str(tweet_id)
        ]
        evidence_tweets = [
            _tweet_for_prompt(tweets_by_id[tweet_id])
            for tweet_id in evidence_ids
            if tweet_id in tweets_by_id
        ]
        if not evidence_tweets:
            evidence_tweets = [
                _tweet_for_prompt(tweet)
                for tweet in sorted(
                    tweets,
                    key=lambda row: (_tweet_engagement(row), row.get("created_at") or ""),
                    reverse=True,
                )[:2]
            ]

        themes.append(
            {
                "key": theme.get("key"),
                "title": theme.get("title"),
                "stance": theme.get("stance"),
                "tweet_count": theme.get("tweet_count"),
                "author_count": theme.get("author_count"),
                "existing_summary": theme.get("summary"),
                "representative_claims": [
                    _trim_text(claim, _MAX_CLAIM_CHARS)
                    for claim in (theme.get("representative_claims") or [])[:3]
                    if _trim_text(claim, _MAX_CLAIM_CHARS)
                ],
                "evidence_tweets": evidence_tweets[:_MAX_THEME_EVIDENCE_TWEETS],
            }
        )

    return {
        "symbol": symbol,
        "window_hours": hours,
        "overview": {
            "tweet_count": overview.get("tweet_count"),
            "author_count": overview.get("author_count"),
            "bull_count": overview.get("bull_count"),
            "bear_count": overview.get("bear_count"),
            "neutral_count": overview.get("neutral_count"),
            "dominant_stance": overview.get("dominant_stance"),
            "latest_at": overview.get("latest_at"),
        },
        "themes": themes,
    }


def _merge_llm_summary(summary: dict[str, Any], output: _DiscussionSummaryOutput) -> dict:
    overview = dict(summary.get("overview") or {})
    overview["one_line_summary"] = output.one_line_summary.strip()

    output_by_key = {item.key: item for item in output.themes}
    themes = []
    for theme in (summary.get("themes") or [])[:MAX_THEMES]:
        if not isinstance(theme, dict):
            continue
        row = dict(theme)
        generated = output_by_key.get(str(theme.get("key") or ""))
        if generated:
            row["summary"] = generated.summary.strip()
            row["representative_claims"] = [
                claim.strip()
                for claim in generated.representative_claims
                if claim.strip() and not _looks_mostly_english(claim)
            ][:3]
        else:
            row["summary"] = _fallback_theme_summary(row)
            row["representative_claims"] = []
        themes.append(row)

    return {"overview": overview, "themes": themes}


def _stance_phrase(stance: object) -> str:
    return {
        "bull": "整体偏多",
        "bear": "整体偏空",
        "mixed": "多空分歧明显",
        "neutral": "整体偏中性",
    }.get(str(stance), "整体偏中性")


def _fallback_theme_summary(theme: dict) -> str:
    title = str(theme.get("title") or "相关讨论")
    tweet_count = int(theme.get("tweet_count") or 0)
    author_count = int(theme.get("author_count") or 0)
    stance = _stance_phrase(theme.get("stance"))
    return (
        f"{title}是当前讨论里的主要方向，样本覆盖 {tweet_count} 条讨论、"
        f"{author_count} 位作者参与，{stance}。综合来看，市场关注的是这条主线"
        "是否会改变后续预期，相关分歧暂时只适合作为观察线索。"
    )


def _fallback_summary(symbol: str, hours: int, summary: dict) -> dict:
    overview = dict(summary.get("overview") or {})
    themes = [dict(theme) for theme in summary.get("themes") or []]
    tweet_count = int(overview.get("tweet_count") or 0)
    author_count = int(overview.get("author_count") or 0)
    dominant = _stance_phrase(overview.get("dominant_stance"))

    if tweet_count:
        titles = [str(theme.get("title") or "") for theme in themes[:3] if theme.get("title")]
        overview["one_line_summary"] = (
            f"过去 {hours} 小时，{symbol} 相关讨论共 {tweet_count} 条，"
            f"{author_count} 位作者参与，{dominant}。"
            + (f"主要集中在{'、'.join(titles)}。" if titles else "")
        )
    else:
        overview["one_line_summary"] = (
            f"过去 {hours} 小时暂无结构化匹配的 {symbol} Twitter/KOL 讨论。"
        )

    for theme in themes:
        theme["summary"] = _fallback_theme_summary(theme)
        theme["representative_claims"] = []

    return {"overview": overview, "themes": themes[:MAX_THEMES]}


async def generate_chinese_discussion_summary(
    *,
    symbol: str,
    hours: int,
    summary: dict,
    tweets: list[dict],
) -> dict:
    """Return Chinese overview/theme summaries for cached ticker discussion."""
    cache_key = _cache_key(symbol, hours, summary)
    cached = _get_cached_summary(cache_key)
    if cached is not None:
        return cached

    if not tweets or not DEEPSEEK_API_KEY:
        fallback = _fallback_summary(symbol, hours, summary)
        _store_cached_summary(cache_key, fallback)
        return fallback

    try:
        output = await generate_structured_json(
            feature="twitter.ticker_discussion_summary",
            agent_name="ticker_discussion_summary",
            model=WATCHLIST_MONITOR_LLM_MODEL,
            system_prompt=_DISCUSSION_SUMMARY_INSTRUCTION,
            user_payload=_build_llm_payload(
                symbol=symbol,
                hours=hours,
                summary=summary,
                tweets=tweets,
            ),
            output_model=_DiscussionSummaryOutput,
            max_tokens=max(900, min(WATCHLIST_MONITOR_LLM_MAX_TOKENS, 1800)),
            retries=WATCHLIST_MONITOR_LLM_RETRIES,
            temperature=WATCHLIST_MONITOR_LLM_TEMPERATURE,
        )
        generated = _merge_llm_summary(summary, output)
        _store_cached_summary(cache_key, generated)
        return generated
    except Exception:
        logger.warning(
            "ticker discussion LLM summary failed for %s",
            symbol,
            exc_info=True,
        )

    fallback = _fallback_summary(symbol, hours, summary)
    _store_cached_summary(cache_key, fallback)
    return fallback
