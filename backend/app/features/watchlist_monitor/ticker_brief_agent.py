"""LLM pipeline for per-ticker daily brief generation."""

from __future__ import annotations

import json
import re
from typing import Any

from app.core.config import (
    WATCHLIST_MONITOR_LLM_MAX_TOKENS,
    WATCHLIST_MONITOR_LLM_MODEL,
    WATCHLIST_MONITOR_LLM_RETRIES,
    WATCHLIST_MONITOR_LLM_TEMPERATURE,
)
from app.core.logging import get_logger
from app.features.watchlist_monitor.models import (
    BriefCompositionOutput,
    MarketDiscussionOutput,
    NewsEventsSynthesisOutput,
    TechnicalInterpretationOutput,
    TickerBriefAgentOutput,
)
from app.shared.llm_clients.structured import generate_structured_json

logger = get_logger(__name__)

MODEL = WATCHLIST_MONITOR_LLM_MODEL


def _json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def _task_tokens(default: int) -> int:
    return max(400, min(WATCHLIST_MONITOR_LLM_MAX_TOKENS, default))


def _source_refs(context: dict[str, Any], prefixes: tuple[str, ...] = ()) -> list[dict[str, Any]]:
    refs = [item for item in context.get("source_refs", []) if isinstance(item, dict)]
    if not prefixes:
        return refs
    return [item for item in refs if str(item.get("id") or "").startswith(prefixes)]


NEWS_EVENTS_SYNTHESIS_INSTRUCTION = """
You synthesize recent stock news and already-collected future events in one pass.

Rules:
- Write Simplified Chinese.
- Use only input.news_items, input.deterministic_event_candidates,
  input.market_context, and input.source_refs.
- Produce the news_summary, any company-specific events extracted from news, and
  the final user-facing watchpoints together.
- For every news item in input.news_items, return translated_news_titles with
  source_ref_id matching the news id and a concise, faithful Simplified Chinese
  title. Keep company names/tickers in English when useful. Do not add analysis
  or claims not present in the original title.
- Treat deterministic_event_candidates as pre-extracted events. Do not copy them
  into news_event_candidates; use them to decide watchpoints.
- news_event_candidates may only come from input.news_items and must be
  company-specific. Do not extract macro calendar items from news_event_candidates.
- For watchpoints, dedupe across deterministic candidates and news-derived
  candidates. The same real-world event must appear at most once.
- Exact scheduled events should remain in deterministic_event_candidates or
  news_event_candidates; do not also restate the same event as a dated watchpoint.
- Use watchpoints for distinct open validation points that are not already
  represented by an event candidate.
- If FOMC/Fed decision/economic projections/press conference are present on the
  same date, keep one event reference and do not create separate Fed/FOMC
  watchpoints. Apply the same principle to any duplicate event described with
  different wording.
- Mention market/sector backdrop only if it materially changes interpretation.
- Do not give buy/sell/hold instructions.
- Never invent event dates, prices, source links, or schedules.
- Dated watchpoints must include date and source_ref_ids.
- source_ref_ids must point to ids present in input.source_refs.
- debug_notes should briefly list duplicates collapsed, weak dates rejected, or
  source issues. Keep them concise and factual.
"""


TECHNICAL_INTERPRETATION_INSTRUCTION = """
You explain deterministic technical-monitor inputs for a Chinese-speaking retail investor.

Rules:
- The technical signals have already been detected by rules. Do not invent new
  price levels, RSI/MACD values, or chart signals.
- Before describing any price sequence, inspect
  input.technical.recent_price_path.sessions and the consecutive_up/down counts.
- Do not write "连续", "连日", "两日大跌", "持续走弱", or similar sequence
  language unless the recent_price_path explicitly supports it.
- If aggregate 5d/20d changes conflict with the daily path, describe the path
  directly, e.g. rebound-then-giveback, failed rebound, or one-day reversal.
- Distinguish a one-day selloff from a multi-day breakdown and from a failed
  rebound. Keep the qualification in the user-facing explanation.
- Write a concise explanation of what the current technical setup means for
  monitoring risk.
- You may emit at most two technical SignalBlock items, and their source_ref_ids
  must use technical_1 when present.
- Do not give buy/sell/hold instructions.
"""


MARKET_DISCUSSION_INSTRUCTION = """
You summarize cached social/KOL discussion for one ticker.

Rules:
- Use only input.social. Social discussion is not a factual source for company events.
- Explain what people are debating or watching; avoid vague sentiment labels.
- You may emit social SignalBlock items if discussion is meaningful.
- Do not emit watchpoints. Future watchpoints are handled by the unified
  news/events synthesis step.
- source_ref_ids must use the supplied social_* ids when present.
- Do not give buy/sell/hold instructions.
"""


BRIEF_COMPOSITION_INSTRUCTION = """
You are the final AI watchlist monitor compositor for US stock retail investors.

Your job is NOT to write a full equity research report. Your job is to answer:
1. Does this ticker need user attention today?
2. Why?
3. What should the user watch over the next 14 days?

Audience:
- Chinese-speaking US stock investors.
- They want a calm daily monitoring note, not hype, not trading instructions.

Rules:
- Write all user-facing fields in Simplified Chinese.
- Use only facts from the input JSON and subtask outputs. Never invent dates,
  news, events, prices, or source links.
- Do not give buy/sell/hold instructions.
- status must be one of needs_attention, watch, quiet, stale.
- headline: one short neutral summary.
- ai_take: one clear paragraph, 140-260 Chinese characters when possible.
- Be market-aware without creating a separate market section.
- Do not imply precise attribution such as "most of the move came from X" unless
  the input provides direct evidence.
- For technical language, rely on input.technical_interpretation and
  input.technical_context.recent_price_path. Never invent consecutive declines,
  consecutive rallies, breakouts, breakdowns, or trend sequences.
- If recent_price_path contradicts a simple 5d/20d aggregate reading, prefer the
  daily path and say so precisely, such as "此前反弹后单日回吐" instead of
  "连续下跌".
- Do not emit signals with type=news. News belongs in news_summary.
- Pick only meaningful non-news signals: technical, social, event, fundamental,
  macro_sector. Do not fill every category.
- Do not generate watchpoints. input.news_events.watchpoints is already the
  final deduped watchpoint list.
- Do not emit event or macro_sector signals that duplicate
  input.deterministic_event_candidates, input.news_events.news_event_candidates,
  or input.news_events.watchpoints. Future events belong in those structures,
  not in signals.
- source_ref_ids must refer to ids present in input.source_refs.
- For quiet tickers, keep signals empty or very small and explain what would
  change the priority.
"""


_EVENT_STOPWORDS = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "for",
    "with",
    "on",
    "at",
    "in",
    "by",
    "from",
    "as",
    "is",
    "are",
    "be",
    "will",
    "watch",
    "watchpoint",
    "event",
    "update",
    "report",
    "release",
    "scheduled",
    "tentative",
    "rumored",
    "follow",
    "through",
    "next",
}

_EVENT_ALIASES = (
    ("macro:fomc", (("fomc",), ("federal open market committee",), ("联邦公开市场委员会",), ("federal reserve", "interest rate"), ("fed", "rate decision"), ("美联储", "利率"))),
    ("macro:cpi", (("cpi",), ("consumer price index",), ("消费者价格指数",))),
    ("macro:ppi", (("ppi",), ("producer price index",), ("生产者价格指数",))),
    ("macro:pce", (("pce",), ("personal consumption expenditures",), ("个人消费支出",))),
    ("macro:nfp", (("nfp",), ("nonfarm payroll",), ("non farm payroll",), ("非农",))),
    ("macro:gdp", (("gdp",), ("gross domestic product",), ("国内生产总值",))),
    ("macro:retail_sales", (("retail sales",), ("零售销售",))),
)


def _normalize_event_text(*parts: Any) -> str:
    text = " ".join(str(part or "") for part in parts)
    text = text.lower()
    text = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _strip_temporal_text(text: str) -> str:
    text = re.sub(r"\d{1,2}\s*月\s*\d{1,2}\s*日", " ", text)
    text = re.sub(r"\b20\d{2}\s+\d{1,2}\s+\d{1,2}\b", " ", text)
    text = re.sub(r"\b\d{1,2}\s+\d{1,2}\b", " ", text)
    text = re.sub(r"\bq[1-4]\b", " ", text)
    text = re.sub(r"\b20\d{2}\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _contains_event_term(text: str, term: str) -> bool:
    if re.fullmatch(r"[a-z0-9]+", term):
        return re.search(r"(^| )%s( |$)" % re.escape(term), text) is not None
    return term in text


def _canonical_event_subject(text: str) -> str:
    for key, groups in _EVENT_ALIASES:
        if any(all(_contains_event_term(text, term) for term in group) for group in groups):
            return key
    return ""


def _event_tokens(text: str) -> set[str]:
    return {
        token
        for token in _strip_temporal_text(text).split(" ")
        if len(token) > 1 and token not in _EVENT_STOPWORDS and not token.isdigit()
    }


def _token_overlap(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    smaller, larger = (a, b) if len(a) <= len(b) else (b, a)
    return len(smaller & larger) / len(smaller)


def _source_overlap(a: list[str], b: list[str]) -> bool:
    return bool(a and b and set(a).intersection(b))


def _event_profile(item: Any) -> dict[str, Any]:
    if isinstance(item, dict):
        title = item.get("title", "")
        summary = item.get("summary", "") or item.get("what_to_watch", "")
        why = item.get("why_it_matters", "")
        date_value = item.get("event_date") or item.get("date") or ""
        source_ref_ids = item.get("source_ref_ids") or []
    else:
        title = getattr(item, "title", "")
        summary = getattr(item, "summary", "") or getattr(item, "what_to_watch", "")
        why = getattr(item, "why_it_matters", "")
        date_value = getattr(item, "event_date", None) or getattr(item, "date", None) or ""
        source_ref_ids = getattr(item, "source_ref_ids", []) or []
    text = _normalize_event_text(title, summary, why)
    return {
        "date": date_value,
        "source_ref_ids": list(source_ref_ids),
        "subject": _canonical_event_subject(text),
        "tokens": _event_tokens(text),
        "text_key": _strip_temporal_text(text).replace(" ", ""),
    }


def _is_same_event(current: Any, existing: Any) -> bool:
    current_profile = _event_profile(current)
    existing_profile = _event_profile(existing)
    same_date = bool(
        current_profile["date"]
        and existing_profile["date"]
        and current_profile["date"] == existing_profile["date"]
    )
    source_overlap = _source_overlap(
        current_profile["source_ref_ids"],
        existing_profile["source_ref_ids"],
    )
    token_overlap = _token_overlap(current_profile["tokens"], existing_profile["tokens"])
    same_subject = bool(
        current_profile["subject"]
        and current_profile["subject"] == existing_profile["subject"]
    )
    contained_text = (
        len(current_profile["text_key"]) >= 8
        and len(existing_profile["text_key"]) >= 8
        and (
            current_profile["text_key"] in existing_profile["text_key"]
            or existing_profile["text_key"] in current_profile["text_key"]
        )
    )

    if same_subject:
        return same_date or source_overlap or token_overlap >= 0.25
    if source_overlap and token_overlap >= 0.25:
        return True
    if same_date and token_overlap >= 0.4:
        return True
    return (same_date or source_overlap) and contained_text


def _dedupe_watchpoints_against_events(
    watchpoints: list[Any],
    events: list[Any],
) -> list[Any]:
    deduped = []
    for watchpoint in watchpoints:
        if any(_is_same_event(watchpoint, event) for event in events):
            continue
        deduped.append(watchpoint)
    return deduped


def _dedupe_signals_against_future_items(
    signals: list[Any],
    future_items: list[Any],
) -> list[Any]:
    deduped = []
    for signal in signals:
        if getattr(signal, "type", "") in {"event", "macro_sector"} and any(
            _is_same_event(signal, item) for item in future_items
        ):
            continue
        deduped.append(signal)
    return deduped


async def _synthesize_news_and_events(context: dict[str, Any]) -> NewsEventsSynthesisOutput:
    news_items = context.get("news_items") or []
    event_candidates = context.get("event_candidates") or []
    if not news_items and not event_candidates:
        return NewsEventsSynthesisOutput()
    try:
        return await generate_structured_json(
            feature="watchlist_monitor.news_events_synthesis",
            agent_name="watchlist_news_events_synthesis",
            model=MODEL,
            system_prompt=NEWS_EVENTS_SYNTHESIS_INSTRUCTION,
            user_payload={
                "symbol": context.get("symbol"),
                "report_date": context.get("report_date"),
                "event_window": context.get("event_window"),
                "market_context": context.get("market_context"),
                "news_items": news_items,
                "deterministic_event_candidates": event_candidates,
                "source_refs": _source_refs(
                    context,
                    ("news_", "event_", "macro_", "social_"),
                ),
            },
            output_model=NewsEventsSynthesisOutput,
            max_tokens=_task_tokens(1600),
            retries=WATCHLIST_MONITOR_LLM_RETRIES,
            temperature=WATCHLIST_MONITOR_LLM_TEMPERATURE,
        )
    except Exception:
        logger.warning("news/events synthesis subtask failed for %s", context.get("symbol"), exc_info=True)
        return NewsEventsSynthesisOutput()


async def _interpret_technical(context: dict[str, Any]) -> TechnicalInterpretationOutput:
    technical = context.get("technical") or {}
    technical_monitor = context.get("technical_monitor") or {}
    if not technical.get("available") and not technical_monitor.get("signals"):
        return TechnicalInterpretationOutput()
    try:
        return await generate_structured_json(
            feature="watchlist_monitor.technical_interpretation",
            agent_name="watchlist_technical_interpretation",
            model=MODEL,
            system_prompt=TECHNICAL_INTERPRETATION_INSTRUCTION,
            user_payload={
                "symbol": context.get("symbol"),
                "report_date": context.get("report_date"),
                "quote": context.get("quote"),
                "technical": technical,
                "technical_monitor": {
                    "summary": technical_monitor.get("summary"),
                    "technical_view": technical_monitor.get("technical_view"),
                    "signals": technical_monitor.get("signals") or [],
                    "key_levels": technical_monitor.get("key_levels") or {},
                },
                "source_refs": _source_refs(context, ("technical_",)),
            },
            output_model=TechnicalInterpretationOutput,
            max_tokens=_task_tokens(900),
            retries=WATCHLIST_MONITOR_LLM_RETRIES,
            temperature=WATCHLIST_MONITOR_LLM_TEMPERATURE,
        )
    except Exception:
        logger.warning("technical interpretation subtask failed for %s", context.get("symbol"), exc_info=True)
        return TechnicalInterpretationOutput()


async def _summarize_market_discussion(context: dict[str, Any]) -> MarketDiscussionOutput:
    social = context.get("social") or {}
    if not social.get("available") or (
        not social.get("synthesis_zh")
        and not social.get("stance_summary")
    ):
        return MarketDiscussionOutput()
    try:
        return await generate_structured_json(
            feature="watchlist_monitor.market_discussion",
            agent_name="watchlist_market_discussion",
            model=MODEL,
            system_prompt=MARKET_DISCUSSION_INSTRUCTION,
            user_payload={
                "symbol": context.get("symbol"),
                "report_date": context.get("report_date"),
                "social": social,
                "source_refs": _source_refs(context, ("social_",)),
            },
            output_model=MarketDiscussionOutput,
            max_tokens=_task_tokens(800),
            retries=WATCHLIST_MONITOR_LLM_RETRIES,
            temperature=WATCHLIST_MONITOR_LLM_TEMPERATURE,
        )
    except Exception:
        logger.warning("market discussion subtask failed for %s", context.get("symbol"), exc_info=True)
        return MarketDiscussionOutput()


def _technical_context_for_final(context: dict[str, Any]) -> dict[str, Any]:
    technical = context.get("technical") or {}
    if not isinstance(technical, dict):
        return {"available": False}
    return {
        "available": bool(technical.get("available")),
        "price": technical.get("price"),
        "rsi_14": technical.get("rsi_14"),
        "sma_20": technical.get("sma_20"),
        "sma_50": technical.get("sma_50"),
        "sma_200": technical.get("sma_200"),
        "ma_alignment": technical.get("ma_alignment"),
        "trend_direction": technical.get("trend_direction"),
        "trend_strength": technical.get("trend_strength"),
        "price_change_5d": technical.get("price_change_5d"),
        "price_change_20d": technical.get("price_change_20d"),
        "support_1": technical.get("support_1"),
        "resistance_1": technical.get("resistance_1"),
        "recent_price_path": technical.get("recent_price_path") or {"available": False, "sessions": []},
        "usage": (
            "Use recent_price_path to verify daily sequence wording. Do not infer "
            "consecutive moves from aggregate 5d/20d changes alone."
        ),
    }


async def _compose_final_brief(
    context: dict[str, Any],
    *,
    news_events: NewsEventsSynthesisOutput,
    technical: TechnicalInterpretationOutput,
    discussion: MarketDiscussionOutput,
) -> BriefCompositionOutput:
    return await generate_structured_json(
        feature="watchlist_monitor.final_brief",
        agent_name="watchlist_final_brief",
        model=MODEL,
        system_prompt=BRIEF_COMPOSITION_INSTRUCTION,
        user_payload={
            "symbol": context.get("symbol"),
            "report_date": context.get("report_date"),
            "quote": context.get("quote"),
            "market_context": context.get("market_context"),
            "event_window": context.get("event_window"),
            "deterministic_event_candidates": context.get("event_candidates") or [],
            "news_events": news_events.model_dump(mode="json"),
            "technical_interpretation": technical.model_dump(mode="json"),
            "technical_context": _technical_context_for_final(context),
            "market_discussion": discussion.model_dump(mode="json"),
            "technical_monitor_summary": (context.get("technical_monitor") or {}).get("summary", ""),
            "source_refs": _source_refs(context),
        },
        output_model=BriefCompositionOutput,
        max_tokens=_task_tokens(1400),
        retries=WATCHLIST_MONITOR_LLM_RETRIES,
        temperature=WATCHLIST_MONITOR_LLM_TEMPERATURE,
    )


async def generate_ticker_brief(context: dict) -> TickerBriefAgentOutput:
    """Run the split DeepSeek pipeline and return the combined brief output."""
    payload = _json_safe(context)
    news_events = await _synthesize_news_and_events(payload)
    technical = await _interpret_technical(payload)
    discussion = await _summarize_market_discussion(payload)
    final = await _compose_final_brief(
        payload,
        news_events=news_events,
        technical=technical,
        discussion=discussion,
    )
    if news_events.debug_notes:
        logger.debug(
            "watchlist news/events synthesis debug for %s: %s",
            payload.get("symbol"),
            news_events.debug_notes,
        )

    future_events = [
        *(payload.get("event_candidates") or []),
        *news_events.news_event_candidates,
    ]
    watchpoints = _dedupe_watchpoints_against_events(
        news_events.watchpoints,
        future_events,
    )
    signals = _dedupe_signals_against_future_items(
        final.signals,
        [*future_events, *watchpoints],
    )

    return TickerBriefAgentOutput(
        status=final.status,
        headline=final.headline,
        ai_take=final.ai_take,
        news_summary=news_events.news_summary,
        translated_news_titles=news_events.translated_news_titles,
        signals=signals,
        watchpoints=watchpoints,
        news_event_candidates=news_events.news_event_candidates,
    )
