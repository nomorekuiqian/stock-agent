"""
News Tools for Market Agent
Provides news fetching functions using FMP API.
"""

from datetime import datetime, timedelta, timezone

from app.utils.timezone import PACIFIC_TZ, now_pacific


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
    On weekends/Monday: includes all news from last Friday onwards.
    On other days: includes news from last N days.
    """
    if not pub_date_str:
        return False

    try:
        pub_date = datetime.fromisoformat(pub_date_str.replace("Z", "+00:00"))
        now = now_pacific()
        weekday = now.weekday()

        # On weekends or Monday, use trading day logic
        if weekday in [0, 5, 6]:  # Monday, Saturday, Sunday
            cutoff = _get_last_trading_day_cutoff()
        else:
            # Normal days: go back N days from start of today
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            cutoff = today_start - timedelta(days=days - 1)

        return pub_date >= cutoff
    except (ValueError, TypeError):
        return True  # Include if date parsing fails


def _get_effective_date_range() -> tuple:
    """Get the effective date range for display purposes (Pacific timezone)."""
    now = now_pacific()
    weekday = now.weekday()

    if weekday in [0, 5, 6]:  # Monday, Saturday, Sunday
        cutoff = _get_last_trading_day_cutoff()
        return cutoff, now, True  # (start, end, is_weekend_adjusted)
    else:
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return today_start, now, False


# =============================================================================
# FMP News Functions
# =============================================================================


def get_fmp_news(days: int = 1, symbols: list[str] = None) -> dict:
    """
    Fetch market news from FMP API by ticker symbols.

    Args:
        days: Only include news from the last N days (default: 1)
        symbols: Optional list of ticker symbols to query (defaults to FMP_NEWS_SYMBOLS)

    Returns:
        Dictionary with news articles from FMP (filtered by date only)
    """
    print(f"[TOOL] get_fmp_news(days={days}, symbols={symbols})")

    try:
        from app.services.fmp_service import get_fmp_service

        fmp = get_fmp_service()
        result = fmp.get_stock_news(symbols=symbols, limit=50)

        if result.get("status") == "error":
            print(f"FMP news error: {result.get('error')}")
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

        print(f"Fetched {len(filtered_news)} FMP news (from {len(news)} total)")

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
        print(f"FMP news unavailable: {e}")
        return {
            "status": "error",
            "error": str(e),
            "news": [],
            "news_count": 0,
            "source": "fmp",
        }
    except Exception as e:
        print(f"Error fetching FMP news: {e}")
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
        from app.services.fmp_service import get_fmp_service

        fmp = get_fmp_service()
        result = fmp.get_general_news(limit=30)

        if result.get("status") == "error":
            print(f"FMP general news error: {result.get('error')}")
            return []

        news = result.get("news", [])
        filtered_news = []

        for item in news:
            if not _is_within_time_range(item.get("publishedDate"), days):
                continue
            item["_source"] = "fmp_general"
            filtered_news.append(item)

        print(f"Fetched {len(filtered_news)} general news (from {len(news)} total)")
        return filtered_news

    except Exception as e:
        print(f"Error fetching general news: {e}")
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


def get_combined_market_news(days: int = 1, symbols: list[str] = None) -> dict:
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
    print(f"[TOOL] get_combined_market_news(days={days}, symbols={symbols})")

    # Fetch ticker-based news
    ticker_result = get_fmp_news(days=days, symbols=symbols)
    ticker_news = ticker_result.get("news", [])
    for news in ticker_news:
        news["_source"] = "fmp_ticker"

    # Fetch general market news
    general_news = _get_general_news(days=days)

    # Combine and deduplicate
    all_news = ticker_news + general_news
    unique_news = _deduplicate_news(all_news)

    # Sort by published date (newest first)
    unique_news.sort(
        key=lambda x: x.get("publishedDate", ""),
        reverse=True
    )

    # Get date range for display
    start_date, end_date, is_weekend = _get_effective_date_range()

    print(f"Market news: {len(unique_news)} articles "
          f"(ticker: {len(ticker_news)}, general: {len(general_news)}, "
          f"after dedup: {len(unique_news)})")

    return {
        "status": "success",
        "news_count": len(unique_news),
        "news": unique_news,
        "source": "fmp_combined",
        "sources": {
            "ticker_news": len(ticker_news),
            "general_news": len(general_news),
        },
        "filters": {
            "date_from": start_date.isoformat(),
            "date_to": end_date.isoformat(),
            "weekend_adjusted": is_weekend,
        },
    }
