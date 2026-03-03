"""
News Tools for Market Agent
Provides news fetching functions using FMP API.
"""

from datetime import datetime, timedelta, timezone

from app.core.logging import get_logger
from app.utils.timezone import PACIFIC_TZ, now_pacific

logger = get_logger(__name__)


def _get_last_trading_day_cutoff() -> datetime:
    """
    Get the start of the last trading day (midnight Pacific).
    - Monday: Friday 00:00 Pacific
    - Saturday: Friday 00:00 Pacific
    - Sunday: Friday 00:00 Pacific
    - Other days: Today 00:00 Pacific
    """
    now = now_pacific()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    weekday = now.weekday()  # Monday=0, Sunday=6

    if weekday == 0:  # Monday - go back to Friday
        return today_start - timedelta(days=3)
    elif weekday == 5:  # Saturday - go back to Friday
        return today_start - timedelta(days=1)
    elif weekday == 6:  # Sunday - go back to Friday
        return today_start - timedelta(days=2)
    else:
        return today_start


def _is_within_time_range(pub_date_str: str, days: int = 1) -> bool:
    """
    Check if publication date is within the time range.
    Uses rolling 24-hour windows to ensure enough news coverage.
    On weekends/Monday: includes all news from last Friday onwards.
    On other days: includes news from past 24*days hours.
    """
    if not pub_date_str:
        return False

    try:
        pub_date = datetime.fromisoformat(pub_date_str.replace("Z", "+00:00"))
        # FMP API returns dates without timezone - assume UTC
        if pub_date.tzinfo is None:
            pub_date = pub_date.replace(tzinfo=timezone.utc)
        now = now_pacific()
        weekday = now.weekday()

        # For multi-day requests (e.g. days=7), always use rolling window
        if days > 1:
            cutoff = now - timedelta(hours=24 * days)
        elif weekday in [0, 5, 6]:  # Monday, Saturday, Sunday
            cutoff = _get_last_trading_day_cutoff()
        else:
            # Use rolling 24-hour window instead of midnight cutoff
            # This ensures we always have ~24 hours of news coverage
            cutoff = now - timedelta(hours=24 * days)

        return pub_date >= cutoff
    except (ValueError, TypeError):
        logger.warning("Skipping article with unparseable date: %r", pub_date_str)
        return False


def _get_effective_date_range() -> tuple:
    """Get the effective date range for display purposes (Pacific timezone)."""
    now = now_pacific()
    weekday = now.weekday()

    if weekday in [0, 5, 6]:  # Monday, Saturday, Sunday
        cutoff = _get_last_trading_day_cutoff()
        return cutoff, now, True  # (start, end, is_weekend_adjusted)
    else:
        # Use rolling 24-hour window
        cutoff = now - timedelta(hours=24)
        return cutoff, now, False


# =============================================================================
# FMP News Functions
# =============================================================================


def get_fmp_news(days: int = 1, symbols: list[str] | None = None) -> dict:
    """
    Fetch market news from FMP API by ticker symbols.

    Args:
        days: Only include news from the last N days (default: 1)
        symbols: Optional list of ticker symbols to query (defaults to FMP_NEWS_SYMBOLS)

    Returns:
        Dictionary with news articles from FMP (filtered by date only)
    """
    logger.info("get_fmp_news(days=%d, symbols=%s)", days, symbols)

    try:
        from app.shared.fmp_service import get_fmp_service

        fmp = get_fmp_service()
        # Pass cutoff date to FMP API for server-side filtering
        # For multi-day requests (e.g. stock news agent with days=7),
        # use the days parameter directly instead of trading day cutoff
        if days > 1:
            from_date = (now_pacific() - timedelta(days=days)).strftime("%Y-%m-%d")
        else:
            cutoff = _get_last_trading_day_cutoff()
            from_date = cutoff.strftime("%Y-%m-%d")
        result = fmp.get_stock_news(symbols=symbols, limit=50, from_date=from_date)

        if result.get("status") == "error":
            logger.error("FMP news error: %s", result.get('error'))
            return result

        news = result.get("news", [])
        filtered_news = []

        for item in news:
            # Time filter only (no keyword filtering)
            if not _is_within_time_range(item.get("publishedDate"), days):
                continue
            filtered_news.append(item)

        # Get date range for display
        start_date, end_date, is_weekend = _get_effective_date_range()

        logger.info("Fetched %d FMP news (from %d total)", len(filtered_news), len(news))

        return {
            "status": "success",
            "news_count": len(filtered_news),
            "news": filtered_news,
            "source": "fmp",
            "filters": {
                "date_from": start_date.isoformat(),
                "date_to": end_date.isoformat(),
                "weekend_adjusted": is_weekend,
            },
        }

    except ValueError as e:
        # FMP_API_KEY not configured
        logger.error("FMP news unavailable: %s", e)
        return {
            "status": "error",
            "error": str(e),
            "news": [],
            "news_count": 0,
            "source": "fmp",
        }
    except Exception as e:
        logger.error("Error fetching FMP news: %s", e)
        return {
            "status": "error",
            "error": str(e),
            "news": [],
            "news_count": 0,
            "source": "fmp",
        }


def _get_general_news(days: int = 1) -> list:
    """
    Fetch general market news (macro, policy, economy) from FMP.

    Args:
        days: Only include news from the last N days (default: 1)

    Returns:
        List of filtered news articles
    """
    try:
        from app.shared.fmp_service import get_fmp_service

        fmp = get_fmp_service()
        cutoff = _get_last_trading_day_cutoff()
        from_date = cutoff.strftime("%Y-%m-%d")
        result = fmp.get_general_news(limit=50, from_date=from_date)

        if result.get("status") == "error":
            logger.error("FMP general news error: %s", result.get('error'))
            return []

        news = result.get("news", [])
        filtered_news = []

        for item in news:
            if not _is_within_time_range(item.get("publishedDate"), days):
                continue
            item["_source"] = "fmp_general"
            filtered_news.append(item)

        logger.info("Fetched %d general news (from %d total)", len(filtered_news), len(news))
        return filtered_news

    except Exception as e:
        logger.error("Error fetching general news: %s", e)
        return []


def _get_latest_stock_news(days: int = 1) -> list:
    """
    Fetch latest stock market news (not tied to specific tickers) from FMP.
    Provides broader coverage for news that may not be associated with
    our tracked ticker list.

    Args:
        days: Only include news from the last N days (default: 1)

    Returns:
        List of filtered news articles
    """
    try:
        from app.shared.fmp_service import get_fmp_service

        fmp = get_fmp_service()
        cutoff = _get_last_trading_day_cutoff()
        from_date = cutoff.strftime("%Y-%m-%d")
        result = fmp.get_latest_news(limit=30, from_date=from_date)

        if result.get("status") == "error":
            logger.error("FMP latest news error: %s", result.get('error'))
            return []

        news = result.get("news", [])
        filtered_news = []

        for item in news:
            if not _is_within_time_range(item.get("publishedDate"), days):
                continue
            item["_source"] = "fmp_latest"
            filtered_news.append(item)

        logger.info("Fetched %d latest stock news (from %d total)", len(filtered_news), len(news))
        return filtered_news

    except Exception as e:
        logger.error("Error fetching latest stock news: %s", e)
        return []


def _deduplicate_news(news_list: list) -> list:
    """
    Remove duplicate news based on title similarity.

    Uses simple title matching to avoid showing the same story twice.
    """
    seen_titles = set()
    unique_news = []

    for item in news_list:
        title = item.get("title", "").lower().strip()
        # Create a simplified key (first 50 chars, remove punctuation)
        title_key = "".join(c for c in title[:50] if c.isalnum() or c.isspace())

        if title_key and title_key not in seen_titles:
            seen_titles.add(title_key)
            unique_news.append(item)

    return unique_news


def get_combined_market_news(days: int = 1, symbols: list[str] | None = None) -> dict:
    """
    Fetch market news from multiple FMP sources and combine them.

    Fetches from two sources:
    1. Ticker-based news (Mag 7, semiconductors, indices)
    2. General market news (macro, policy, economy)

    This provides broader coverage including Fed policy, economic data,
    and geopolitical events that may not be tied to specific tickers.

    Args:
        days: Only include news from the last N days (default: 1)
        symbols: Optional list of ticker symbols to query (defaults to FMP_NEWS_SYMBOLS)

    Returns:
        Dictionary with combined news from both sources
    """
    logger.info("get_combined_market_news(days=%d, symbols=%s)", days, symbols)

    # Fetch ticker-based news
    ticker_result = get_fmp_news(days=days, symbols=symbols)
    ticker_news = ticker_result.get("news", [])
    for news in ticker_news:
        news["_source"] = "fmp_ticker"

    # Fetch general market news
    general_news = _get_general_news(days=days)

    # Fetch latest stock news (broader coverage, not tied to our ticker list)
    latest_news = _get_latest_stock_news(days=days)

    # Combine and deduplicate
    all_news = ticker_news + general_news + latest_news
    unique_news = _deduplicate_news(all_news)

    # Sort by published date (newest first)
    unique_news.sort(
        key=lambda x: x.get("publishedDate", ""),
        reverse=True
    )

    # Get date range for display
    start_date, end_date, is_weekend = _get_effective_date_range()

    logger.info("Market news: %d articles (ticker: %d, general: %d, latest: %d, after dedup: %d)",
                len(unique_news), len(ticker_news), len(general_news), len(latest_news), len(unique_news))

    return {
        "status": "success",
        "news_count": len(unique_news),
        "news": unique_news,
        "source": "fmp_combined",
        "sources": {
            "ticker_news": len(ticker_news),
            "general_news": len(general_news),
            "latest_news": len(latest_news),
        },
        "filters": {
            "date_from": start_date.isoformat(),
            "date_to": end_date.isoformat(),
            "weekend_adjusted": is_weekend,
        },
    }
