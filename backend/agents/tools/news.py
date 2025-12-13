"""
News Tools for Market Agent
Provides news fetching functions using FMP API.
"""

from datetime import datetime, timedelta, timezone


def _get_last_trading_day_cutoff() -> datetime:
    """
    Get the start of the last trading day (midnight UTC).
    - Monday: Friday 00:00 UTC
    - Saturday: Friday 00:00 UTC
    - Sunday: Friday 00:00 UTC
    - Other days: Today 00:00 UTC
    """
    now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
    """Get the effective date range for display purposes."""
    now = datetime.now(timezone.utc)
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


def get_fmp_news(days: int = 1) -> dict:
    """
    Fetch market news from FMP API by ticker symbols.

    Args:
        days: Only include news from the last N days (default: 1)

    Returns:
        Dictionary with news articles from FMP (filtered by date only)
    """
    print(f"[TOOL] get_fmp_news(days={days})")

    try:
        from app.services.fmp_service import get_fmp_service

        fmp = get_fmp_service()
        result = fmp.get_stock_news(limit=50)

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


def get_combined_market_news(days: int = 1) -> dict:
    """
    Fetch market news from FMP API by ticker symbols.

    Fetches news for macro-focused ticker symbols and filters by date.
    This is the main news function used by the agent.

    Args:
        days: Only include news from the last N days (default: 1)

    Returns:
        Dictionary with news from FMP
    """
    print(f"[TOOL] get_combined_market_news(days={days})")

    # Fetch from FMP only
    result = get_fmp_news(days=days)

    # Add source marker
    for news in result.get("news", []):
        news["_source"] = "fmp"

    print(f"Market news: {result.get('news_count', 0)} articles from FMP")

    return result
