"""External news enrichment for watchlist monitor generation."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import (
    TAVILY_API_KEY,
    WATCHLIST_MONITOR_TAVILY_ENABLED,
    WATCHLIST_MONITOR_TAVILY_QUERIES_PER_TICKER,
    WATCHLIST_MONITOR_TAVILY_INCLUDE_DOMAINS,
    WATCHLIST_MONITOR_TAVILY_RESULTS_PER_QUERY,
    WATCHLIST_MONITOR_TAVILY_TIMEOUT_S,
    WATCHLIST_MONITOR_TAVILY_TOPIC,
)
from app.core.logging import get_logger

logger = get_logger(__name__)

_TAVILY_SEARCH_URL = "https://api.tavily.com/search"
_LEGAL_SUFFIX_RE = re.compile(
    r"\b(incorporated|inc|corp|corporation|company|co|ltd|limited|plc|class a|class b|common stock|ordinary shares)\b\.?",
    re.IGNORECASE,
)
_URL_DATE_RE = re.compile(r"(20\d{2})[-_/](\d{2})[-_/](\d{2})")


def _company_name(profile: dict[str, Any] | None) -> str:
    if not isinstance(profile, dict):
        return ""
    return str(
        profile.get("company_name")
        or profile.get("companyName")
        or profile.get("name")
        or ""
    ).strip()


def _search_company_name(profile: dict[str, Any] | None) -> str:
    name = _company_name(profile)
    if not name:
        return ""
    cleaned = _LEGAL_SUFFIX_RE.sub("", name.replace(",", " "))
    return " ".join(cleaned.split())


def _build_tavily_queries(symbol: str, profile: dict[str, Any] | None) -> list[str]:
    symbol = symbol.strip().upper()
    company = _search_company_name(profile)
    if company:
        return [
            "%s %s stock news" % (symbol, company),
            "%s stock news" % symbol,
        ]
    return ["%s stock news" % symbol]


def _include_domains() -> list[str]:
    return [
        domain.strip().lower()
        for domain in WATCHLIST_MONITOR_TAVILY_INCLUDE_DOMAINS.split(",")
        if domain.strip()
    ]


def _published_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    for parser in (
        lambda text: datetime.fromisoformat(text.replace("Z", "+00:00")),
        parsedate_to_datetime,
    ):
        try:
            parsed = parser(raw)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        except (TypeError, ValueError, AttributeError):
            continue
    return raw


def _published_date_from_url(url: str) -> str:
    match = _URL_DATE_RE.search(url)
    if not match:
        return ""
    return "%s-%s-%s 00:00:00" % match.groups()


def _publisher_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def _normalize_tavily_result(result: dict[str, Any]) -> dict[str, Any] | None:
    title = str(result.get("title") or "").strip()
    url = str(result.get("url") or "").strip()
    if not title or not url:
        return None
    return {
        "title": title,
        "text": str(result.get("content") or result.get("raw_content") or "")[:1000],
        "url": url,
        "source": _publisher_from_url(url),
        "publishedDate": _published_date(
            result.get("published_date") or result.get("publishedDate")
        ) or _published_date_from_url(url),
        "_source": "tavily",
        "score": result.get("score"),
    }


def get_tavily_ticker_news(
    symbol: str,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Fetch recent ticker news from Tavily for watchlist monitor generation."""
    symbol = symbol.strip().upper()
    if not symbol:
        return {"status": "success", "news": [], "news_count": 0, "source": "tavily"}
    if not WATCHLIST_MONITOR_TAVILY_ENABLED or not TAVILY_API_KEY:
        return {
            "status": "skipped",
            "news": [],
            "news_count": 0,
            "source": "tavily",
            "reason": "disabled_or_missing_key",
        }

    max_queries = max(1, WATCHLIST_MONITOR_TAVILY_QUERIES_PER_TICKER)
    max_results = min(max(1, WATCHLIST_MONITOR_TAVILY_RESULTS_PER_QUERY), 20)
    queries = _build_tavily_queries(symbol, profile)[:max_queries]
    headers = {
        "Authorization": "Bearer %s" % TAVILY_API_KEY,
        "Content-Type": "application/json",
    }
    payload_base = {
        "topic": WATCHLIST_MONITOR_TAVILY_TOPIC or "news",
        "time_range": "week",
        "search_depth": "basic",
        "max_results": max_results,
        "include_answer": False,
        "include_raw_content": False,
        "include_images": False,
        "include_favicon": False,
    }
    include_domains = _include_domains()
    if include_domains:
        payload_base["include_domains"] = include_domains

    news: list[dict[str, Any]] = []
    errors: list[str] = []
    timeout = httpx.Timeout(WATCHLIST_MONITOR_TAVILY_TIMEOUT_S)
    with httpx.Client(timeout=timeout) as client:
        for query in queries:
            try:
                response = client.post(
                    _TAVILY_SEARCH_URL,
                    headers=headers,
                    json={**payload_base, "query": query},
                )
                response.raise_for_status()
                data = response.json()
            except Exception as exc:
                logger.warning("Tavily news search failed for %s: %s", symbol, exc)
                errors.append(str(exc))
                continue

            for raw in data.get("results") or []:
                if not isinstance(raw, dict):
                    continue
                item = _normalize_tavily_result(raw)
                if item:
                    item["query"] = query
                    news.append(item)

    status = "success" if news or not errors else "error"
    return {
        "status": status,
        "news": news,
        "news_count": len(news),
        "source": "tavily",
        "queries": queries,
        "errors": errors,
    }
