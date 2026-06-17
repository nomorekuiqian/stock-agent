"""Deterministic ticker-level Twitter discussion summaries."""

from __future__ import annotations

import json
import time
from copy import deepcopy

MAX_THEMES = 8
_CACHE_TTL_SECONDS = 15 * 60
_CACHE_MAX_SIZE = 128

_summary_cache: dict[str, tuple[float, dict]] = {}


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
    """Return a deterministic Chinese summary without calling an LLM."""
    _ = tweets
    cache_key = _cache_key(symbol, hours, summary)
    cached = _get_cached_summary(cache_key)
    if cached is not None:
        return cached

    fallback = _fallback_summary(symbol, hours, summary)
    _store_cached_summary(cache_key, fallback)
    return fallback
