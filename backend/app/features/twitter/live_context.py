"""
Live market context for KOL methodology chat.

The methodology package is historical and slow-moving. This module adds a small,
fresh FMP-powered context layer so chat answers can discuss the current market
environment without inventing quotes, news, or calendar events.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from app.core.logging import get_logger

logger = get_logger(__name__)


class LiveContextQuote(BaseModel):
    symbol: str
    name: str | None = None
    price: float | None = None
    change: float | None = None
    change_percent: float | None = None
    volume: float | None = None
    market_cap: float | None = None


class LiveContextNewsEvent(BaseModel):
    symbol: str | None = None
    title: str
    published_at: str | None = None
    site: str | None = None
    url: str | None = None
    text: str | None = None


class LiveContextCalendarEvent(BaseModel):
    event_type: str
    symbol: str | None = None
    name: str | None = None
    date: str | None = None
    event: str | None = None
    estimate: Any | None = None
    previous: Any | None = None


class LiveContextMarketReport(BaseModel):
    report_type: str
    date: str | None = None
    title: str | None = None
    summary: str | None = None
    key_points: list[str] = Field(default_factory=list)


class LiveContext(BaseModel):
    topic: str
    symbols: list[str] = Field(default_factory=list)
    quotes: list[LiveContextQuote] = Field(default_factory=list)
    news_events: list[LiveContextNewsEvent] = Field(default_factory=list)
    calendar_events: list[LiveContextCalendarEvent] = Field(default_factory=list)
    market_reports: list[LiveContextMarketReport] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    data_timestamp: str
    limitations: list[str] = Field(default_factory=list)


_MAX_SYMBOLS = 12
_MAX_QUOTES = 12
_MAX_NEWS = 10
_MAX_CALENDAR_EVENTS = 8
_MAX_REPORT_POINTS = 5

_SYMBOL_ALIASES: dict[str, str] = {
    "苹果": "AAPL",
    "微软": "MSFT",
    "谷歌": "GOOGL",
    "亚马逊": "AMZN",
    "英伟达": "NVDA",
    "辉达": "NVDA",
    "特斯拉": "TSLA",
    "台积电": "TSM",
    "博通": "AVGO",
    "美光": "MU",
    "超微": "AMD",
    "meta": "META",
}

_TOPIC_MAP: list[tuple[str, tuple[str, ...], list[str]]] = [
    (
        "ai_storage_optical",
        (
            "光存储",
            "光模块",
            "光通信",
            "硅光",
            "cpo",
            "存储",
            "hbm",
            "dram",
            "nand",
            "ai infra",
            "ai基建",
        ),
        ["MU", "WDC", "STX", "COHR", "LITE", "CIEN", "FN", "MRVL", "AVGO", "ANET", "SMH", "SOXX"],
    ),
    (
        "ai_semiconductors",
        ("半导体", "芯片", "gpu", "算力", "晶圆", "ai芯片", "ai 芯片"),
        ["NVDA", "AMD", "AVGO", "TSM", "ASML", "ARM", "MRVL", "SMCI", "SMH", "SOXX"],
    ),
    (
        "mega_cap_tech",
        ("大科技", "七巨头", "mag7", "科技股", "纳指", "nasdaq"),
        ["NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "TSLA", "QQQ"],
    ),
    (
        "macro_market",
        (
            "宏观",
            "大盘",
            "市场环境",
            "美联储",
            "降息",
            "加息",
            "通胀",
            "cpi",
            "pce",
            "流动性",
        ),
        ["SPY", "QQQ", "DIA", "IWM", "TLT", "GLD", "UUP", "VIX"],
    ),
]


def detect_live_context_symbols(message: str) -> tuple[str, list[str]]:
    """Infer a small ticker basket from the user's question."""
    text = message.lower()
    symbols: list[str] = []
    topic = "general_market"

    for candidate_topic, keywords, topic_symbols in _TOPIC_MAP:
        if any(keyword.lower() in text for keyword in keywords):
            topic = candidate_topic
            symbols.extend(topic_symbols)
            break

    for alias, symbol in _SYMBOL_ALIASES.items():
        if alias.lower() in text:
            symbols.append(symbol)

    for token in message.replace("$", " ").replace("，", " ").replace(",", " ").split():
        cleaned = token.strip("()[]{}:;.!?。！？、").upper()
        if 1 <= len(cleaned) <= 5 and cleaned.isalpha():
            symbols.append(cleaned)

    deduped: list[str] = []
    for symbol in symbols:
        if symbol not in deduped:
            deduped.append(symbol)

    if not deduped:
        deduped = ["SPY", "QQQ", "SMH", "TLT", "GLD", "VIX"]

    return topic, deduped[:_MAX_SYMBOLS]


def _compact_quote(item: dict[str, Any]) -> LiveContextQuote | None:
    symbol = item.get("symbol")
    if not symbol:
        return None
    return LiveContextQuote(
        symbol=str(symbol),
        name=item.get("name"),
        price=item.get("price"),
        change=item.get("change"),
        change_percent=(
            item.get("daily_change")
            or item.get("changePercentage")
            or item.get("change_percent")
        ),
        volume=item.get("volume"),
        market_cap=item.get("marketCap") or item.get("market_cap"),
    )


def _compact_news(item: dict[str, Any]) -> LiveContextNewsEvent | None:
    title = item.get("title")
    if not title:
        return None
    return LiveContextNewsEvent(
        symbol=item.get("symbol"),
        title=str(title),
        published_at=item.get("publishedDate") or item.get("published_at"),
        site=item.get("site") or item.get("publisher"),
        url=item.get("url"),
        text=item.get("text") or item.get("summary"),
    )


def _compact_earnings(item: dict[str, Any], symbols: set[str]) -> LiveContextCalendarEvent | None:
    symbol = str(item.get("symbol") or "").upper()
    if symbol not in symbols:
        return None
    return LiveContextCalendarEvent(
        event_type="earnings",
        symbol=symbol,
        name=item.get("name"),
        date=item.get("date"),
        estimate=item.get("epsEstimated") or item.get("eps_estimated"),
        previous=item.get("epsActual") or item.get("eps_actual"),
    )


def _compact_economic_event(item: dict[str, Any]) -> LiveContextCalendarEvent | None:
    event = item.get("event")
    if not event:
        return None
    return LiveContextCalendarEvent(
        event_type="economic",
        date=item.get("date"),
        event=str(event),
        estimate=item.get("estimate"),
        previous=item.get("previous"),
    )


def _stringify_point(item: Any) -> str | None:
    if isinstance(item, str):
        return item[:240]
    if isinstance(item, dict):
        for key in ("headline", "title", "summary", "text", "content"):
            value = item.get(key)
            if isinstance(value, str) and value:
                return value[:240]
    return None


def _stringify_summary(value: Any) -> str | None:
    if isinstance(value, str):
        return value[:500]
    if isinstance(value, list):
        points = [_stringify_point(item) for item in value[:3]]
        return " ".join(point for point in points if point)[:500] or None
    if isinstance(value, dict):
        return _stringify_point(value)
    return None


def _compact_market_report(
    report_type: str,
    report: dict[str, Any] | None,
) -> LiveContextMarketReport | None:
    if not report:
        return None

    points: list[str] = []
    for key in ("report_summary", "key_points", "highlights", "calendar"):
        raw_points = report.get(key)
        if not isinstance(raw_points, list):
            continue
        for raw_point in raw_points:
            point = _stringify_point(raw_point)
            if point:
                points.append(point)
            if len(points) >= _MAX_REPORT_POINTS:
                break
        if len(points) >= _MAX_REPORT_POINTS:
            break

    return LiveContextMarketReport(
        report_type=report_type,
        date=report.get("report_date") or report.get("date"),
        title=report.get("title"),
        summary=_stringify_summary(report.get("summary") or report.get("intro")),
        key_points=points,
    )


async def build_live_context(message: str) -> LiveContext:
    """Fetch a compact FMP live-context bundle for methodology chat."""
    topic, symbols = detect_live_context_symbols(message)
    limitations: list[str] = []
    sources: list[str] = []
    symbol_set = set(symbols)

    logger.info("building KOL live context topic=%s symbols=%s", topic, symbols)

    from app.shared.data_tools.calendar import get_economic_calendar
    from app.shared.data_tools.earnings import get_earnings_calendar
    from app.shared.data_tools.news import get_fmp_news
    from app.shared.data_tools.quotes import get_batch_quotes
    from app.features.daily_report.db import get_latest_report
    from app.features.morning_report.db import get_latest_morning_report

    quote_task = asyncio.to_thread(get_batch_quotes, symbols)
    news_task = asyncio.to_thread(get_fmp_news, 7, symbols)
    earnings_task = asyncio.to_thread(get_earnings_calendar, 21)
    economic_task = asyncio.to_thread(get_economic_calendar, 14)
    daily_report_task = get_latest_report()
    morning_report_task = get_latest_morning_report()

    (
        quote_result,
        news_result,
        earnings_result,
        economic_result,
        daily_report_result,
        morning_report_result,
    ) = await asyncio.gather(
        quote_task,
        news_task,
        earnings_task,
        economic_task,
        daily_report_task,
        morning_report_task,
        return_exceptions=True,
    )

    quotes: list[LiveContextQuote] = []
    if isinstance(quote_result, Exception):
        logger.error("KOL live context quote fetch failed: %s", quote_result)
        limitations.append("FMP quotes unavailable")
    else:
        sources.append("fmp_quotes")
        for item in quote_result.get("quotes", [])[:_MAX_QUOTES]:
            quote = _compact_quote(item)
            if quote:
                quotes.append(quote)

    news_events: list[LiveContextNewsEvent] = []
    if isinstance(news_result, Exception):
        logger.error("KOL live context news fetch failed: %s", news_result)
        limitations.append("FMP news unavailable")
    elif news_result.get("status") == "error":
        limitations.append(str(news_result.get("error") or "FMP news unavailable"))
    else:
        sources.append("fmp_news")
        for item in news_result.get("news", [])[:_MAX_NEWS]:
            event = _compact_news(item)
            if event:
                news_events.append(event)

    calendar_events: list[LiveContextCalendarEvent] = []
    if isinstance(earnings_result, Exception):
        logger.error("KOL live context earnings fetch failed: %s", earnings_result)
        limitations.append("FMP earnings calendar unavailable")
    elif earnings_result.get("status") == "error":
        limitations.append(str(earnings_result.get("error") or "FMP earnings calendar unavailable"))
    else:
        sources.append("fmp_earnings_calendar")
        for item in earnings_result.get("earnings", []):
            event = _compact_earnings(item, symbol_set)
            if event:
                calendar_events.append(event)
            if len(calendar_events) >= _MAX_CALENDAR_EVENTS:
                break

    if isinstance(economic_result, Exception):
        logger.error("KOL live context economic calendar fetch failed: %s", economic_result)
        limitations.append("FMP economic calendar unavailable")
    elif economic_result.get("status") == "error":
        limitations.append(str(economic_result.get("error") or "FMP economic calendar unavailable"))
    else:
        sources.append("fmp_economic_calendar")
        for item in economic_result.get("events", []):
            event = _compact_economic_event(item)
            if event:
                calendar_events.append(event)
            if len(calendar_events) >= _MAX_CALENDAR_EVENTS:
                break

    market_reports: list[LiveContextMarketReport] = []
    if isinstance(daily_report_result, Exception):
        logger.error("KOL live context daily report fetch failed: %s", daily_report_result)
        limitations.append("Latest daily report unavailable")
    else:
        daily_report = _compact_market_report("daily_report", daily_report_result)
        if daily_report:
            market_reports.append(daily_report)
            sources.append("daily_report_cache")

    if isinstance(morning_report_result, Exception):
        logger.error("KOL live context morning report fetch failed: %s", morning_report_result)
        limitations.append("Latest morning report unavailable")
    else:
        morning_report = _compact_market_report("morning_report", morning_report_result)
        if morning_report:
            market_reports.append(morning_report)
            sources.append("morning_report_cache")

    if not news_events:
        limitations.append("No recent FMP news matched the detected ticker basket")

    return LiveContext(
        topic=topic,
        symbols=symbols,
        quotes=quotes,
        news_events=news_events,
        calendar_events=calendar_events[:_MAX_CALENDAR_EVENTS],
        market_reports=market_reports,
        sources=sorted(set(sources)),
        data_timestamp=datetime.now(timezone.utc).isoformat(),
        limitations=limitations,
    )
