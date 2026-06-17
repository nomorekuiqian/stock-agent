"""LLM pipeline for per-ticker daily brief generation."""

from __future__ import annotations

import asyncio
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
NEWS_EVENTS_TIMEOUT_S = 90
TECHNICAL_TIMEOUT_S = 60
DISCUSSION_TIMEOUT_S = 45
FINAL_BRIEF_TIMEOUT_S = 60


def _json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def _task_tokens(default: int) -> int:
    return max(400, min(WATCHLIST_MONITOR_LLM_MAX_TOKENS, default))


def _source_refs(context: dict[str, Any], prefixes: tuple[str, ...] = ()) -> list[dict[str, Any]]:
    refs = [item for item in context.get("source_refs", []) if isinstance(item, dict)]
    if not prefixes:
        return refs
    return [item for item in refs if str(item.get("id") or "").startswith(prefixes)]


def _chinese_char_count(text: str) -> int:
    return sum(1 for char in text if "\u4e00" <= char <= "\u9fff")


def _looks_mostly_english(text: str) -> bool:
    letters = sum(1 for char in text if char.isascii() and char.isalpha())
    chinese = _chinese_char_count(text)
    return len(text) >= 80 and letters > max(80, chinese * 2)


NEWS_EVENTS_SYNTHESIS_INSTRUCTION = """
You synthesize recent stock news and already-collected future events in one pass.

Rules:
- Write Simplified Chinese.
- Use only input.news_items, input.deterministic_event_candidates,
  input.market_context, and input.source_refs.
- Produce the news_summary, any company-specific events extracted from news, and
  the final user-facing watchpoints together.
- Return translated_news_titles for the most user-visible news items only,
  prioritizing the highest-value 8 source ids. Use concise, faithful Simplified
  Chinese titles. Keep company names/tickers in English when useful. Do not add
  analysis or claims not present in the original title.
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
- If a macro candidate is included, explain why it matters to this specific
  ticker's business model, valuation, financing costs, customer demand, or
  sector multiple. Avoid generic copy that could apply to every mega-cap tech
  stock unchanged.
- If input.news_items is non-empty, news_summary must be non-empty and should
  answer what changed, why it matters, and what remains uncertain.
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
- Surface concrete debate topics that can change monitoring priority, such as
  regulatory review, delivery/usage data, capital allocation, pricing, or
  product adoption. Do not reduce the discussion to "sentiment is bullish".
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
- ai_take must explicitly cover three retail-monitoring questions inside the
  same paragraph using this rhythm: "今日信号是...；影响在于...；接下来重点看..."。
- Be market-aware without creating a separate market section.
- When macro events are present, translate them into ticker-specific impact.
  For example: financing cost for debt-heavy/AI-capex names, ad multiple for
  advertising platforms, consumer credit/demand for autos, cloud capex for
  hyperscalers. Do not reuse the same generic FOMC sentence for every ticker.
- Use market_discussion when it adds newer or more concrete debate topics than
  the news feed, but label it as market discussion rather than company fact.
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
- Do not turn ratings or investor actions into advice to the user. Analyst
  ratings or named investor buys/sells may be cited as facts, but never write
  direct user instructions such as 建议买入、建议卖出、建议加仓、追高、抄底、
  止盈、止损、不宜、建议投资者. Use observation language instead.
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


def _fallback_news_events(context: dict[str, Any]) -> NewsEventsSynthesisOutput:
    news_items = [
        item for item in (context.get("news_items") or [])
        if isinstance(item, dict)
    ]
    if not news_items:
        return NewsEventsSynthesisOutput()

    titles = [
        str(item.get("title") or "").strip()
        for item in news_items
        if str(item.get("title") or "").strip()
    ]
    source_ref_ids = [
        str(item.get("id") or "").strip()
        for item in news_items
        if str(item.get("id") or "").strip()
    ][:8]
    theme_labels = _news_theme_labels(titles)
    theme_text = "、".join(theme_labels[:6]) or "公司新闻流"
    symbol = str(context.get("symbol") or "该股票").upper()
    if theme_text:
        news_summary = (
            "最近新闻主要集中在%s。对 %s 的影响需要结合后续披露、"
            "管理层回应和价格确认继续观察，重点区分哪些是公司级催化，"
            "哪些只是板块或宏观背景。"
        ) % (theme_text, symbol)
    else:
        news_summary = (
            "最近有多条相关新闻，但标题信息不足以形成明确主题。"
            "接下来重点核对新的公司披露和价格确认。"
        )
    return NewsEventsSynthesisOutput(
        news_summary=news_summary[:1200],
        key_themes=titles[:6],
        source_ref_ids=source_ref_ids,
        debug_notes=["news/events LLM synthesis fell back to deterministic news summary"],
    )


def _news_theme_labels(titles: list[str]) -> list[str]:
    text = " ".join(titles).lower()
    rules = [
        (("antitrust", "probe", "investigation", "lawsuit", "ftc", "sec", "senator", "regulatory", "safety", "compliance", "fraud"), "监管与法律风险"),
        (("ai", "gemini", "copilot", "cloud", "aws", "tpu", "chip", "model", "data center", "datacenter"), "AI 与云/算力进展"),
        (("earnings", "revenue", "guidance", "delivery", "deliveries", "mau", "monthly active", "sales"), "经营数据与预期"),
        (("fomc", "fed", "rate", "inflation", "treasury"), "宏观利率敏感度"),
        (("bond", "debt", "capex", "capital", "cash flow", "financing"), "融资与资本开支"),
        (("product", "iphone", "airpods", "android", "threads", "fsd", "robotaxi", "wear os", "privacy"), "产品路线与用户采用"),
        (("analyst", "rating", "price target", "oppenheimer", "goldman", "bank of america", "zacks"), "机构观点与估值分歧"),
        (("options", "spacex", "valuation", "market cap", "ipo"), "市场估值与资金流"),
        (("supply", "factory", "india", "tata", "manufacturing"), "供应链与制造"),
    ]
    labels = [label for keywords, label in rules if any(keyword in text for keyword in keywords)]
    return list(dict.fromkeys(labels))


async def _synthesize_news_and_events(context: dict[str, Any]) -> NewsEventsSynthesisOutput:
    news_items = context.get("news_items") or []
    event_candidates = context.get("event_candidates") or []
    if not news_items and not event_candidates:
        return NewsEventsSynthesisOutput()
    try:
        output = await asyncio.wait_for(
            generate_structured_json(
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
                max_tokens=_task_tokens(2400),
                retries=WATCHLIST_MONITOR_LLM_RETRIES,
                temperature=WATCHLIST_MONITOR_LLM_TEMPERATURE,
            ),
            timeout=NEWS_EVENTS_TIMEOUT_S,
        )
        if news_items and (
            not output.news_summary.strip()
            or _looks_mostly_english(output.news_summary)
        ):
            fallback = _fallback_news_events(context)
            output = output.model_copy(
                update={
                    "news_summary": fallback.news_summary,
                    "source_ref_ids": output.source_ref_ids or fallback.source_ref_ids,
                    "debug_notes": [
                        *output.debug_notes,
                        "filled empty news_summary with deterministic fallback",
                    ][:6],
                }
            )
        return output
    except Exception:
        logger.warning("news/events synthesis subtask failed for %s", context.get("symbol"), exc_info=True)
        return _fallback_news_events(context)


async def _interpret_technical(context: dict[str, Any]) -> TechnicalInterpretationOutput:
    technical = context.get("technical") or {}
    technical_monitor = context.get("technical_monitor") or {}
    if not technical.get("available") and not technical_monitor.get("signals"):
        return TechnicalInterpretationOutput()
    try:
        return await asyncio.wait_for(
            generate_structured_json(
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
            ),
            timeout=TECHNICAL_TIMEOUT_S,
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
        return await asyncio.wait_for(
            generate_structured_json(
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
            ),
            timeout=DISCUSSION_TIMEOUT_S,
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


def _first_text(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _fallback_final_brief(
    context: dict[str, Any],
    *,
    news_events: NewsEventsSynthesisOutput,
    technical: TechnicalInterpretationOutput,
    discussion: MarketDiscussionOutput,
) -> BriefCompositionOutput:
    symbol = str(context.get("symbol") or "").upper()
    event_candidates = context.get("event_candidates") or []
    technical_monitor = context.get("technical_monitor") or {}
    technical_signals = technical_monitor.get("signals") or []
    news_items = context.get("news_items") or []

    signal_title = ""
    signal_summary = ""
    signal_why = ""
    signals = []
    if technical.signals:
        signals.extend(technical.signals[:1])
        signal_title = technical.signals[0].title
        signal_summary = technical.signals[0].summary
        signal_why = technical.signals[0].why_it_matters
    elif discussion.signals:
        signals.extend(discussion.signals[:1])
        signal_title = discussion.signals[0].title
        signal_summary = discussion.signals[0].summary
        signal_why = discussion.signals[0].why_it_matters
    elif technical_signals:
        signal_title = str(technical_signals[0].get("title") or "")
        signal_summary = str(technical_signals[0].get("detail") or "")
        signal_why = "这是规则检测到的硬技术信号，会影响后续价格确认度。"
    elif news_items:
        signal_title = str(news_items[0].get("title") or "新闻流更新")
        signal_summary = news_events.news_summary
        signal_why = "新闻流会影响市场对公司短期预期的重新定价。"
    else:
        signal_title = "暂无明显新增信号"
        signal_summary = "今天没有检测到足够明确的公司级新闻、社交或技术硬信号。"
        signal_why = "监控优先级较低，主要等待新的新闻、事件或价格确认。"

    next_watch = ""
    if news_events.watchpoints:
        next_watch = news_events.watchpoints[0].title
    elif event_candidates:
        next_watch = str(event_candidates[0].get("title") or "")
    elif technical_signals:
        next_watch = str(technical_signals[0].get("title") or "")
    next_watch = next_watch or "后续新闻流和价格确认"

    headline = _first_text(signal_title, "%s 今日监控更新" % symbol)[:80]
    status = "watch" if signal_title != "暂无明显新增信号" else "quiet"
    if any(signal.severity == "high" for signal in signals) or event_candidates:
        status = "needs_attention" if signals else "watch"

    ai_take = (
        "今日信号是%s；影响在于%s；接下来重点看%s。"
        % (
            signal_summary or signal_title,
            signal_why or "该信号会影响市场对短期风险和机会的判断",
            next_watch,
        )
    )
    return BriefCompositionOutput(
        status=status,
        headline=headline,
        ai_take=ai_take[:650],
        signals=signals[:4],
    )


async def _compose_final_brief(
    context: dict[str, Any],
    *,
    news_events: NewsEventsSynthesisOutput,
    technical: TechnicalInterpretationOutput,
    discussion: MarketDiscussionOutput,
) -> BriefCompositionOutput:
    try:
        return await asyncio.wait_for(
            generate_structured_json(
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
                max_tokens=_task_tokens(1200),
                retries=WATCHLIST_MONITOR_LLM_RETRIES,
                temperature=WATCHLIST_MONITOR_LLM_TEMPERATURE,
            ),
            timeout=FINAL_BRIEF_TIMEOUT_S,
        )
    except Exception:
        logger.warning("final brief subtask failed for %s", context.get("symbol"), exc_info=True)
        return _fallback_final_brief(
            context,
            news_events=news_events,
            technical=technical,
            discussion=discussion,
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
