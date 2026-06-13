"""Backend-first data plane for TheMarketBrew MCP.

The local MCP package exposes a small set of data tools. This module keeps the
actual data fetching, section limits, partial-failure handling, and usage
logging on the backend.
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from app.core.logging import get_logger
from app.features.kol_research import mcp_auth
from app.features.kol_research.models import (
    KolMcpBriefRequest,
    KolMcpMarketDataRequest,
    KolMcpNewsRequest,
    KolMcpStockDataRequest,
)
from app.features.stock.service import get_stock_service
from app.shared.data_tools import research_tools
from app.shared.data_tools.briefs import (
    get_industry_brief,
    get_macro_brief,
    get_peer_brief,
    get_stock_brief,
)
from app.shared.data_tools.news import get_combined_market_news, get_fmp_news
from app.shared.fmp_service import get_fmp_service

logger = get_logger(__name__)


BRIEF_TYPES = {
    "stock": {
        "description": "Compressed stock context: quote, profile, fundamentals, valuation, news, technicals, and risks.",
        "requires_symbol": True,
        "source": "mixed:fmp,yfinance,macro_cache",
    },
    "peer": {
        "description": "Peer and valuation comparison for one ticker.",
        "requires_symbol": True,
        "source": "mixed:fmp,profile_cache",
    },
    "macro": {
        "description": "Macro cache summary: risk, liquidity, sentiment, calendar, treasury, inflation.",
        "requires_symbol": False,
        "source": "macro_cache",
    },
    "industry": {
        "description": "Industry/theme brief inferred from one ticker.",
        "requires_symbol": True,
        "source": "mixed:fmp,profile_cache",
    },
}

STOCK_SECTIONS = {
    "quote": "Current quote, volume, market cap, daily change.",
    "profile": "Company profile and sector/industry classification.",
    "fundamentals": "Profitability, growth, balance sheet, valuation snapshot.",
    "forward_valuation": "Forward EPS/valuation estimate context.",
    "historical_valuation": "Historical valuation context.",
    "technical": "RSI/MACD/moving averages/support/resistance summary.",
    "news": "Recent ticker news.",
    "earnings_calendar": "Upcoming/recent earnings calendar items for this ticker.",
    "price_history": "OHLCV price history.",
    "earnings_data": "Aggregated earnings history, estimates, revenue segments, statements.",
    "transcript": "One specific earnings call transcript.",
    "insider_trading": "Recent insider trades and aggregate insider statistics.",
    "press_releases": "Official company press releases.",
    "market_overview": "Broad market overview for context.",
}

MARKET_SECTIONS = {
    "market_overview": "Major indices, VIX, yields, commodities, currencies.",
    "macro_brief": "Compressed macro cache brief.",
    "macro_risk": "Macro risk dashboard summary.",
    "liquidity": "Liquidity overview.",
    "sentiment": "Market sentiment snapshot.",
    "economic_calendar": "Upcoming economic calendar.",
    "earnings_calendar": "Upcoming earnings calendar.",
    "morning_report": "Latest morning report context.",
    "weekly_report": "Latest weekly report context.",
    "twitter_digest": "Latest Twitter/KOL digest context.",
}


def _auth_context(auth: dict[str, Any]) -> dict[str, Any]:
    return {
        "account_required": True,
        "authenticated": True,
        "scopes": auth.get("scopes") or [],
    }


def _json_or_text(raw: Any) -> Any:
    if not isinstance(raw, str):
        return raw
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {"text": raw}


def _normalize_symbol(symbol: str | None) -> str:
    return (symbol or "").strip().upper()


def _normalize_symbols(symbols: list[str], *, limit: int) -> list[str]:
    out: list[str] = []
    for item in symbols:
        normalized = _normalize_symbol(item)
        if normalized and normalized not in out:
            out.append(normalized)
        if len(out) >= limit:
            break
    return out


def _error(section: str, message: str) -> dict[str, Any]:
    return {"section": section, "error": message}


async def _call_json(
    section: str,
    call: Callable[[], Awaitable[Any]],
) -> tuple[str, Any, dict[str, Any] | None]:
    try:
        raw = await call()
        data = _json_or_text(raw)
        if isinstance(data, dict) and data.get("error"):
            return section, data, _error(section, str(data.get("error")))
        return section, data, None
    except Exception as exc:  # noqa: BLE001 - section-level partial failure
        logger.warning("mcp data section %s failed: %s", section, exc)
        return section, None, _error(section, f"{type(exc).__name__}: {str(exc)[:200]}")


def _freshness(source: str = "mixed", cache_policy: str = "mixed") -> dict[str, Any]:
    return {
        "source": source,
        "as_of": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "cache_policy": cache_policy,
        "is_stale": False,
    }


async def _envelope(
    *,
    tool: str,
    request: dict[str, Any],
    data: Any,
    errors: list[dict[str, Any]],
    auth: dict[str, Any],
    started: float,
    freshness: dict[str, Any] | None = None,
    limits: dict[str, Any] | None = None,
    endpoint: str,
    symbols: list[str] | None = None,
    sections: list[str] | None = None,
) -> dict[str, Any]:
    latency_ms = int((time.perf_counter() - started) * 1000)
    if not auth.get("skip_usage_log"):
        await mcp_auth.log_mcp_usage(
            user_id=auth.get("user_id", ""),
            token_id=auth.get("token_id"),
            tool=tool,
            endpoint=endpoint,
            symbols=symbols or [],
            sections=sections or [],
            latency_ms=latency_ms,
            success=not errors,
            error="; ".join(item.get("error", "") for item in errors if item.get("error")) or None,
        )
    return {
        "ok": True,
        "tool": tool,
        "request": request,
        "data": data,
        "errors": errors,
        "auth": _auth_context(auth),
        "freshness": freshness or _freshness(),
        "limits": limits or {},
        "latency_ms": latency_ms,
    }


async def data_catalog(auth: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    data = {
        "auth": {
            "required": True,
            "scopes": auth.get("scopes") or [],
            "status_tool": "market_lens_auth_status",
        },
        "tools": {
            "market_lens_get_brief": {
                "brief_types": BRIEF_TYPES,
                "max_symbols": 5,
                "recommended_first": True,
            },
            "market_lens_get_stock_data": {
                "sections": STOCK_SECTIONS,
                "max_symbols": 1,
                "max_sections": 8,
            },
            "market_lens_get_market_data": {
                "sections": MARKET_SECTIONS,
                "max_sections": 8,
            },
            "market_lens_get_news": {
                "scopes": ["stock", "market", "press_releases", "twitter_digest", "morning_report", "all"],
                "max_symbols": 10,
                "max_days": 30,
                "max_limit": 50,
            },
        },
        "routing_guidance": [
            "Use market_lens_get_brief first for broad stock, peer, macro, or industry questions.",
            "Use market_lens_get_stock_data for exact ticker sections missing from a brief.",
            "Use market_lens_get_market_data for macro, calendar, reports, and overall market context.",
            "Use market_lens_get_news for recent events and source-attributed news.",
        ],
    }
    return await _envelope(
        tool="data_catalog",
        endpoint="/api/kol_research/mcp/data/catalog",
        request={},
        data=data,
        errors=[],
        auth=auth,
        started=started,
        freshness=_freshness(source="themarketbrew_backend", cache_policy="metadata"),
    )


async def get_brief(req: KolMcpBriefRequest, auth: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    brief_type = req.brief_type
    symbol = _normalize_symbol(req.symbol)
    symbols = _normalize_symbols(req.symbols or ([symbol] if symbol else []), limit=5)
    errors: list[dict[str, Any]] = []

    if brief_type != "macro" and not symbols:
        errors.append(_error("request", "symbol is required for this brief_type"))
        return await _envelope(
            tool="brief",
            endpoint="/api/kol_research/mcp/data/brief",
            request=req.model_dump(),
            data={"briefs": []},
            errors=errors,
            auth=auth,
            started=started,
            limits={"max_symbols": 5, "trimmed": False},
        )

    async def _one(sym: str | None) -> dict[str, Any]:
        if brief_type == "stock":
            raw = await get_stock_brief(sym or "")
        elif brief_type == "peer":
            raw = await get_peer_brief(sym or "")
        elif brief_type == "industry":
            raw = await get_industry_brief(sym or "")
        elif brief_type == "macro":
            raw = await get_macro_brief()
        else:
            raise ValueError(f"Unsupported brief_type: {brief_type}")
        payload = _json_or_text(raw)
        return {"brief_type": brief_type, "symbol": sym, "payload": payload}

    target_symbols: list[str | None] = [None] if brief_type == "macro" else symbols
    if brief_type != "stock" and len(target_symbols) > 1:
        target_symbols = target_symbols[:1]
    results = await asyncio.gather(
        *[_call_json(f"{brief_type}:{sym or 'macro'}", lambda sym=sym: _one(sym)) for sym in target_symbols]
    )
    briefs: list[Any] = []
    for _section, payload, err in results:
        if err:
            errors.append(err)
        if payload is not None:
            briefs.append(payload)

    return await _envelope(
        tool="brief",
        endpoint="/api/kol_research/mcp/data/brief",
        request=req.model_dump(),
        data={"briefs": briefs},
        errors=errors,
        auth=auth,
        started=started,
        freshness=_freshness(source=BRIEF_TYPES[brief_type]["source"], cache_policy="mixed"),
        limits={"max_symbols": 5, "trimmed": len(req.symbols or []) > 5},
        symbols=[s for s in symbols if s],
        sections=[brief_type],
    )


async def legacy_market_brief_payload(req: KolMcpBriefRequest, auth: dict[str, Any]) -> dict[str, Any]:
    envelope = await get_brief(req, auth)
    briefs = ((envelope.get("data") or {}).get("briefs") or [])
    first = briefs[0] if briefs else {}
    return {
        "brief_type": req.brief_type,
        "symbol": _normalize_symbol(req.symbol) or None,
        "payload": first.get("payload"),
        "mcp_envelope": envelope,
    }


async def _price_history(symbol: str, days: int) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    end_date = now.strftime("%Y-%m-%d")
    start_date = (now - timedelta(days=days)).strftime("%Y-%m-%d")

    def _fetch() -> list[dict[str, Any]]:
        fmp = get_fmp_service()
        data = fmp._request(
            "/stable/historical-price-eod/full",
            {"symbol": symbol, "from": start_date, "to": end_date},
        )
        if not isinstance(data, list):
            return []
        items = sorted(data, key=lambda item: item.get("date", ""))
        return [
            {
                "date": item.get("date"),
                "open": item.get("open"),
                "high": item.get("high"),
                "low": item.get("low"),
                "close": item.get("close"),
                "volume": item.get("volume"),
            }
            for item in items
            if item.get("date")
        ]

    history = await asyncio.to_thread(_fetch)
    return {"symbol": symbol, "days": days, "count": len(history), "data": history}


async def _symbol_earnings_calendar(symbol: str, days: int) -> dict[str, Any]:
    raw = await research_tools.get_earnings_calendar(days=days)
    data = _json_or_text(raw)
    earnings = [
        item
        for item in (data.get("earnings") or [])
        if (item.get("symbol") or "").upper() == symbol.upper()
    ] if isinstance(data, dict) else []
    return {
        "symbol": symbol,
        "earnings_count": len(earnings),
        "earnings": earnings,
        "source": data.get("source") if isinstance(data, dict) else None,
    }


async def _insider_trading(symbol: str) -> dict[str, Any]:
    fmp = get_fmp_service()
    trades_result, stats_result = await asyncio.gather(
        asyncio.to_thread(fmp.get_insider_trading_search, symbol, 30),
        asyncio.to_thread(fmp.get_insider_trading_statistics, symbol),
        return_exceptions=True,
    )
    if isinstance(trades_result, Exception):
        trades_result = {"trades": []}
    if isinstance(stats_result, Exception):
        stats_result = {"statistics": []}
    return {
        "symbol": symbol,
        "trades": trades_result.get("trades", []) if isinstance(trades_result, dict) else [],
        "statistics": stats_result.get("statistics", []) if isinstance(stats_result, dict) else [],
    }


async def _press_releases(symbol: str, limit: int) -> dict[str, Any]:
    fmp = get_fmp_service()
    result = await asyncio.to_thread(fmp.get_press_releases, symbol, limit)
    releases = []
    for item in (result.get("releases") or [])[:limit]:
        text = item.get("text") or ""
        releases.append({
            "symbol": item.get("symbol", symbol),
            "published_at": item.get("publishedDate") or item.get("date"),
            "publisher": item.get("publisher"),
            "title": item.get("title"),
            "url": item.get("url"),
            "snippet": text[:300] + ("..." if len(text) > 300 else ""),
            "source": "press_release",
        })
    return {"symbol": symbol, "count": len(releases), "releases": releases}


async def get_stock_data(req: KolMcpStockDataRequest, auth: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    symbol = _normalize_symbol(req.symbol)
    service = get_stock_service()

    async def section_call(section: str) -> Any:
        if section == "quote":
            return await research_tools.get_stock_quote([symbol])
        if section == "profile":
            return await research_tools.get_company_profile(symbol)
        if section == "fundamentals":
            return await research_tools.get_stock_fundamentals(symbol)
        if section == "forward_valuation":
            return await research_tools.get_forward_valuation(symbol)
        if section == "historical_valuation":
            return await research_tools.get_historical_valuation(symbol)
        if section == "technical":
            return await research_tools.get_technical_analysis(symbol)
        if section == "news":
            return await research_tools.get_stock_news([symbol], days=req.days)
        if section == "earnings_calendar":
            return await _symbol_earnings_calendar(symbol, req.days)
        if section == "price_history":
            return await _price_history(symbol, req.history_days)
        if section == "earnings_data":
            return await service.get_earnings_data(symbol)
        if section == "transcript":
            if req.year is None or req.quarter is None:
                raise ValueError("year and quarter are required for transcript")
            data = await service.get_transcript(symbol, req.year, req.quarter)
            if isinstance(data, dict) and data.get("content"):
                content = str(data["content"])
                data = {**data, "content": content[:8000], "truncated": len(content) > 8000}
            return data
        if section == "insider_trading":
            return await _insider_trading(symbol)
        if section == "press_releases":
            return await _press_releases(symbol, req.limit)
        if section == "market_overview":
            return await research_tools.get_market_overview()
        raise ValueError(f"Unsupported stock data section: {section}")

    results = await asyncio.gather(
        *[_call_json(section, lambda section=section: section_call(section)) for section in req.sections]
    )
    data: dict[str, Any] = {}
    errors: list[dict[str, Any]] = []
    for section, payload, err in results:
        if err:
            errors.append(err)
        if payload is not None:
            data[section] = payload

    return await _envelope(
        tool="stock_data",
        endpoint="/api/kol_research/mcp/data/stock",
        request=req.model_dump(),
        data={"symbol": symbol, "sections": data},
        errors=errors,
        auth=auth,
        started=started,
        freshness=_freshness(source="mixed:fmp,yfinance,profile_cache", cache_policy="mixed"),
        limits={"max_symbols": 1, "max_sections": 8, "trimmed": False},
        symbols=[symbol],
        sections=list(req.sections),
    )


async def get_market_data(req: KolMcpMarketDataRequest, auth: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()

    async def section_call(section: str) -> Any:
        if section == "market_overview":
            return await research_tools.get_market_overview()
        if section == "macro_brief":
            return await get_macro_brief()
        if section == "macro_risk":
            return await research_tools.get_macro_risk_summary()
        if section == "liquidity":
            return await research_tools.get_liquidity_overview()
        if section == "sentiment":
            return await research_tools.get_market_sentiment()
        if section == "economic_calendar":
            return await research_tools.get_economic_calendar(days=req.days)
        if section == "earnings_calendar":
            return await research_tools.get_earnings_calendar(days=req.days)
        if section == "morning_report":
            return await research_tools.get_morning_report()
        if section == "weekly_report":
            return await research_tools.get_weekly_report()
        if section == "twitter_digest":
            return await research_tools.get_twitter_digest()
        raise ValueError(f"Unsupported market data section: {section}")

    results = await asyncio.gather(
        *[_call_json(section, lambda section=section: section_call(section)) for section in req.sections]
    )
    data: dict[str, Any] = {}
    errors: list[dict[str, Any]] = []
    for section, payload, err in results:
        if err:
            errors.append(err)
        if payload is not None:
            data[section] = payload

    return await _envelope(
        tool="market_data",
        endpoint="/api/kol_research/mcp/data/market",
        request=req.model_dump(),
        data={"sections": data},
        errors=errors,
        auth=auth,
        started=started,
        freshness=_freshness(source="mixed:macro_cache,fmp,insforge", cache_policy="mixed"),
        limits={"max_sections": 8, "trimmed": False},
        sections=list(req.sections),
    )


def _news_item(item: dict[str, Any], source: str, symbol: str | None = None) -> dict[str, Any]:
    return {
        "title": item.get("title") or "",
        "symbol": item.get("symbol") or symbol,
        "published_at": item.get("publishedDate") or item.get("published_at") or item.get("date"),
        "source": source,
        "url": item.get("url") or item.get("source_url") or "",
        "snippet": item.get("summary") or item.get("text") or item.get("snippet") or item.get("preview") or "",
        "related_symbols": item.get("related_symbols") or ([item.get("symbol")] if item.get("symbol") else []),
        "provenance": {
            "origin_payload_type": item.get("_source") or source,
            "site": item.get("site") or item.get("source"),
        },
    }


def _dedupe_news(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for item in items:
        title = (item.get("title") or "").lower().strip()
        url = (item.get("url") or "").lower().strip()
        key = url or "".join(ch for ch in title[:80] if ch.isalnum() or ch.isspace())
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


async def get_news(req: KolMcpNewsRequest, auth: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    symbols = _normalize_symbols(req.symbols, limit=10)
    errors: list[dict[str, Any]] = []
    collected: list[dict[str, Any]] = []

    async def add_stock_news() -> None:
        result = await asyncio.to_thread(get_fmp_news, req.days, symbols or None)
        if result.get("status") == "error":
            errors.append(_error("stock", result.get("error", "stock news failed")))
            return
        for item in (result.get("news") or []):
            collected.append(_news_item(item, item.get("_source") or "fmp_ticker"))

    async def add_market_news() -> None:
        result = await asyncio.to_thread(get_combined_market_news, req.days, symbols or None)
        if result.get("status") == "error":
            errors.append(_error("market", result.get("error", "market news failed")))
            return
        for item in (result.get("news") or []):
            collected.append(_news_item(item, item.get("_source") or "fmp_market"))

    async def add_press_releases() -> None:
        if not symbols:
            errors.append(_error("press_releases", "symbols are required for press_releases"))
            return
        results = await asyncio.gather(
            *[_call_json(f"press_releases:{symbol}", lambda symbol=symbol: _press_releases(symbol, req.limit)) for symbol in symbols]
        )
        for _section, payload, err in results:
            if err:
                errors.append(err)
            for item in (payload or {}).get("releases", []):
                collected.append(_news_item(item, "press_release", symbol=item.get("symbol")))

    async def add_twitter_digest() -> None:
        section, payload, err = await _call_json("twitter_digest", research_tools.get_twitter_digest)
        if err:
            errors.append(err)
        else:
            collected.append(_news_item({
                "title": "Latest Twitter/KOL digest",
                "published_at": payload.get("date") if isinstance(payload, dict) else None,
                "summary": json.dumps(payload, ensure_ascii=False)[:1200],
                "url": payload.get("url") if isinstance(payload, dict) else "",
            }, "twitter_digest"))

    async def add_morning_report() -> None:
        section, payload, err = await _call_json("morning_report", research_tools.get_morning_report)
        if err:
            errors.append(err)
        else:
            collected.append(_news_item({
                "title": "Latest morning report",
                "published_at": payload.get("date") if isinstance(payload, dict) else None,
                "summary": json.dumps(payload, ensure_ascii=False)[:1200],
                "url": payload.get("url") if isinstance(payload, dict) else "",
            }, "morning_report"))

    tasks: list[Awaitable[None]] = []
    if req.scope in {"stock", "all"}:
        tasks.append(add_stock_news())
    if req.scope in {"market", "all"}:
        tasks.append(add_market_news())
    if req.scope in {"press_releases", "all"}:
        tasks.append(add_press_releases())
    if req.scope in {"twitter_digest", "all"}:
        tasks.append(add_twitter_digest())
    if req.scope in {"morning_report", "all"}:
        tasks.append(add_morning_report())
    await asyncio.gather(*tasks)

    news = _dedupe_news(collected)
    news.sort(key=lambda item: item.get("published_at") or "", reverse=True)
    news = news[: req.limit]

    return await _envelope(
        tool="news",
        endpoint="/api/kol_research/mcp/data/news",
        request=req.model_dump(),
        data={"news": news, "count": len(news)},
        errors=errors,
        auth=auth,
        started=started,
        freshness=_freshness(source="mixed:fmp,insforge", cache_policy="mixed"),
        limits={"max_symbols": 10, "max_days": 30, "max_limit": 50},
        symbols=symbols,
        sections=[req.scope],
    )
