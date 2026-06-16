"""AI synthesis for ticker-level Twitter discussion summaries."""

from __future__ import annotations

import json
import re
import time
from copy import deepcopy
from typing import Literal

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import BaseModel, Field, ValidationError

from app.core.logging import get_logger
from app.shared.llm_metering import meter

logger = get_logger(__name__)

MODEL = "gemini-3.5-flash"
APP_NAME = "twitter_ticker_discussion"
OUTPUT_KEY = "discussion_summary"
MAX_THEMES = 8
MAX_EVIDENCE_PER_THEME = 5
MAX_TEXT_CHARS = 520
_CACHE_TTL_SECONDS = 15 * 60
_CACHE_MAX_SIZE = 128

DiscussionStance = Literal["bull", "bear", "neutral", "mixed"]
_summary_cache: dict[str, tuple[float, dict]] = {}


class DiscussionOverviewOutput(BaseModel):
    one_line_summary: str = Field(
        ...,
        description="One Chinese paragraph summarizing the last 24h discussion.",
    )


class DiscussionThemeOutput(BaseModel):
    key: str
    title: str
    stance: DiscussionStance
    summary: str
    representative_claims: list[str] = Field(default_factory=list)


class DiscussionSynthesisOutput(BaseModel):
    overview: DiscussionOverviewOutput
    themes: list[DiscussionThemeOutput] = Field(default_factory=list)


DISCUSSION_SYNTHESIS_INSTRUCTION = """
你是 TheMarketBrew 的美股社交讨论编辑，面向中文用户。

任务：
- 输入是一只股票在过去若干小时内的 Twitter/KOL 讨论，已经按主题预分组。
- 你需要保留这些主题区分方法，并把主题内证据总结成中文。
- 如果某个主题里包含多空分歧、估值风险、执行风险、回调风险或反对意见，把它自然写进该主题，不要单独生成“风险”模块。

写作规则：
- 所有用户可见字段必须以简体中文为主。ticker、公司名、产品名、英文专有名词可以保留英文。
- 不要直接复制英文推文原文；需要转述成中文。
- 不要编造输入中不存在的事实、价格、日期、作者观点或因果关系。
- 不要给买入、卖出、持有建议。
- overview.one_line_summary 写 1 段，80-150 个中文字符，说明讨论量、主导情绪、主要主题和关键分歧。
- themes 使用输入里已有的 theme key。重要主题都可以保留，最多 8 个；不要为了固定数量而凑数，也不要固定为 3 个。
- theme.title 写 6-16 个中文字符，避免泛泛的“其他讨论”。
- theme.summary 写 1-2 句中文，具体说明这个主题在讨论什么，以及其中的分歧或风险点。
- representative_claims 写 0-3 条中文转述，用来表达该主题下最有代表性的观点，不要包含链接，不要用英文原句。
- stance 只能是 bull、bear、neutral、mixed。优先尊重输入主题的 stance，除非证据明显更适合 mixed。

输出必须严格匹配 schema。
"""


_agent = LlmAgent(
    name="ticker_discussion_summary",
    model=MODEL,
    description="Summarizes ticker-level Twitter discussion into Chinese themes",
    instruction=DISCUSSION_SYNTHESIS_INSTRUCTION,
    output_schema=DiscussionSynthesisOutput,
    output_key=OUTPUT_KEY,
    after_model_callback=meter("twitter.ticker_discussion_summary", model=MODEL),
)

_runner: InMemoryRunner | None = None


def _get_runner() -> InMemoryRunner:
    global _runner
    if _runner is None:
        _runner = InMemoryRunner(agent=_agent, app_name=APP_NAME)
    return _runner


def _compact_text(value: object, *, max_chars: int = MAX_TEXT_CHARS) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def _chinese_char_count(text: str) -> int:
    return sum(1 for char in text if "\u4e00" <= char <= "\u9fff")


def _looks_mostly_english(text: str) -> bool:
    letters = sum(1 for char in text if char.isascii() and char.isalpha())
    chinese = _chinese_char_count(text)
    return len(text) >= 24 and letters > max(32, chinese * 2)


def _clean_user_text(value: object, *, max_chars: int = 240) -> str:
    text = _compact_text(value, max_chars=max_chars)
    if _looks_mostly_english(text):
        return ""
    return text


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
        f"{title}是当前讨论里的一个主要方向，共 {tweet_count} 条推文、"
        f"{author_count} 位作者参与，{stance}。相关分歧和风险已合并在该主题下，"
        "可继续对照下方原文判断。"
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


def _build_agent_payload(
    *,
    symbol: str,
    hours: int,
    summary: dict,
    tweets: list[dict],
) -> dict:
    tweets_by_id = {str(tweet.get("id")): tweet for tweet in tweets if tweet.get("id")}
    theme_payloads = []

    for theme in (summary.get("themes") or [])[:MAX_THEMES]:
        evidence = []
        for tweet_id in theme.get("evidence_tweet_ids") or []:
            tweet = tweets_by_id.get(str(tweet_id))
            if not tweet:
                continue
            evidence.append(
                {
                    "id": str(tweet.get("id") or ""),
                    "author": tweet.get("author_username"),
                    "stance": tweet.get("stance") or "neutral",
                    "content_type": tweet.get("content_type"),
                    "key_claim": _compact_text(tweet.get("key_claim"), max_chars=220),
                    "text": _compact_text(tweet.get("text"), max_chars=MAX_TEXT_CHARS),
                    "quoted_text": _compact_text(
                        tweet.get("quoted_tweet_text"),
                        max_chars=220,
                    ),
                    "engagement": {
                        "likes": tweet.get("like_count", 0),
                        "retweets": tweet.get("retweet_count", 0),
                        "replies": tweet.get("reply_count", 0),
                    },
                }
            )
            if len(evidence) >= MAX_EVIDENCE_PER_THEME:
                break

        theme_payloads.append(
            {
                "key": theme.get("key"),
                "current_title": theme.get("title"),
                "stance": theme.get("stance"),
                "tweet_count": theme.get("tweet_count"),
                "author_count": theme.get("author_count"),
                "evidence": evidence,
            }
        )

    return {
        "symbol": symbol,
        "hours": hours,
        "overview": summary.get("overview") or {},
        "themes": theme_payloads,
    }


async def _run_agent(input_payload: dict) -> DiscussionSynthesisOutput:
    runner = _get_runner()
    user_id = "ticker_discussion_summary_caller"
    session = await runner.session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
    )
    payload = json.dumps(input_payload, ensure_ascii=False, default=str)
    message = Content(
        parts=[
            Part(
                text=(
                    "请根据下面 JSON 生成中文市场讨论摘要。"
                    "只使用 JSON 内的信息：\n\n"
                    + payload
                )
            )
        ],
        role="user",
    )

    async for _ in runner.run_async(
        user_id=user_id,
        session_id=session.id,
        new_message=message,
    ):
        pass

    session_data = await runner.session_service.get_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session.id,
    )
    state = (session_data.state if session_data else {}) or {}
    raw = state.get(OUTPUT_KEY)
    if raw is None:
        raise RuntimeError("ticker discussion summary agent produced no output")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError("ticker discussion summary agent output was not valid JSON") from exc

    try:
        return DiscussionSynthesisOutput.model_validate(raw)
    except ValidationError as exc:
        raise RuntimeError("ticker discussion summary agent output did not match schema") from exc


def _merge_agent_output(summary: dict, output: DiscussionSynthesisOutput) -> dict:
    overview = dict(summary.get("overview") or {})
    one_line = _clean_user_text(output.overview.one_line_summary, max_chars=260)
    if one_line:
        overview["one_line_summary"] = one_line

    base_themes = [dict(theme) for theme in summary.get("themes") or []][:MAX_THEMES]
    base_by_key = {str(theme.get("key")): theme for theme in base_themes}
    merged_by_key: dict[str, dict] = {}

    for generated in output.themes[:MAX_THEMES]:
        base = base_by_key.get(generated.key)
        if not base:
            continue
        merged = dict(base)
        title = _clean_user_text(generated.title, max_chars=40)
        summary_text = _clean_user_text(generated.summary, max_chars=320)
        claims = [
            claim
            for claim in (
                _clean_user_text(item, max_chars=160)
                for item in generated.representative_claims[:3]
            )
            if claim
        ]

        if title:
            merged["title"] = title
        merged["summary"] = summary_text or _fallback_theme_summary(base)
        merged["representative_claims"] = claims
        if generated.stance in ("bull", "bear", "neutral", "mixed"):
            merged["stance"] = generated.stance
        merged_by_key[generated.key] = merged

    themes = []
    for base in base_themes:
        key = str(base.get("key"))
        if key in merged_by_key:
            themes.append(merged_by_key[key])
            continue
        fallback = dict(base)
        fallback["summary"] = _fallback_theme_summary(base)
        fallback["representative_claims"] = []
        themes.append(fallback)

    return {"overview": overview, "themes": themes}


async def generate_chinese_discussion_summary(
    *,
    symbol: str,
    hours: int,
    summary: dict,
    tweets: list[dict],
) -> dict:
    """Generate a Chinese summary and fall back to deterministic Chinese copy."""
    cache_key = _cache_key(symbol, hours, summary)
    cached = _get_cached_summary(cache_key)
    if cached is not None:
        return cached

    if not tweets:
        fallback = _fallback_summary(symbol, hours, summary)
        _store_cached_summary(cache_key, fallback)
        return fallback

    payload = _build_agent_payload(
        symbol=symbol,
        hours=hours,
        summary=summary,
        tweets=tweets,
    )
    try:
        output = await _run_agent(payload)
    except Exception:
        logger.exception(
            "ticker discussion summary generation failed: symbol=%s hours=%d",
            symbol,
            hours,
        )
        return _fallback_summary(symbol, hours, summary)

    merged = _merge_agent_output(summary, output)
    if not merged.get("themes"):
        return _fallback_summary(symbol, hours, summary)
    _store_cached_summary(cache_key, merged)
    return merged
