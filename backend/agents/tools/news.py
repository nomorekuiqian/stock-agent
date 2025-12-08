"""
News Tools for Macro Agent
Provides news fetching functions using Yahoo Finance API.
Focused on macro-economic news: Fed policy, rates, inflation, etc.
"""

import yfinance as yf
import re
from datetime import datetime, timedelta, timezone


# =============================================================================
# Ticker Configuration for Macro News
# =============================================================================

# Primary: High macro-relevance tickers
MACRO_TICKERS = [
    # Treasury/Bond ETFs (Fed policy & rate sensitive)
    "TLT",   # 20+ Year Treasury Bond - long-term rates
    "IEF",   # 7-10 Year Treasury Bond - medium-term rates
    "SHY",   # 1-3 Year Treasury - short-term rates
    "BIL",   # 1-3 Month T-Bill - Fed funds rate proxy
    "TIP",   # Treasury Inflation-Protected - inflation expectations
    "SGOV",  # 0-3 Month Treasury Bill ETF

    # Gold & Commodities (inflation hedge, Fed policy sensitive)
    "GLD",   # Gold ETF - safe haven, rate sensitive
    "SLV",   # Silver ETF
    "USO",   # Oil ETF - energy/inflation
    "UNG",   # Natural Gas ETF

    # Credit spreads (risk sentiment)
    "HYG",   # High Yield Corporate Bond
    "LQD",   # Investment Grade Corporate Bond
    "JNK",   # High Yield Bond ETF

    # Financials (rate sensitive)
    "XLF",   # Financial Sector ETF
    "KRE",   # Regional Banks ETF
    "KBE",   # Bank ETF

    # Currency & International
    "UUP",   # US Dollar Index ETF
    "FXE",   # Euro ETF
    "FXY",   # Yen ETF
    "EEM",   # Emerging Markets ETF
    "EFA",   # International Developed ETF
]

# Secondary: Equity indices for market context
EQUITY_TICKERS = [
    "SPY",   # S&P 500
    "QQQ",   # Nasdaq 100
    "DIA",   # Dow Jones
    "IWM",   # Russell 2000 small caps
    "VIX",   # Volatility Index (via VXX or UVXY)
    "VXX",   # VIX Short-term futures
]

# Combine all tickers
NEWS_TICKERS = MACRO_TICKERS + EQUITY_TICKERS

# News fetch settings
NEWS_COUNT_PER_TICKER = 20  # Maximum supported by Yahoo Finance


# =============================================================================
# Macro Keywords for Filtering
# =============================================================================

MACRO_KEYWORDS = [
    # Federal Reserve & Central Banks
    "fed", "fomc", "powell", "federal reserve", "fed chair",
    "waller", "williams", "barkin", "bostic", "daly", "goolsbee",
    "harker", "kashkari", "mester", "bowman",  # Fed officials
    "ecb", "boj", "central bank", "lagarde", "ueda",

    # Monetary Policy
    "rate cut", "rate hike", "interest rate", "monetary policy",
    "quantitative", "tightening", "easing", "dovish", "hawkish",
    "basis point", "bps", "pivot", "pause",

    # Economic Indicators
    "inflation", "cpi", "pce", "core inflation", "deflation",
    "employment", "jobs", "payroll", "unemployment", "labor",
    "gdp", "growth", "recession", "soft landing", "hard landing",
    "housing", "manufacturing", "pmi", "ism",

    # Treasury/Bonds/Rates
    "treasury", "yield", "bond", "yield curve", "inversion",
    "10-year", "2-year", "spread", "duration", "coupon",

    # Market Events & Data
    "jackson hole", "fomc meeting", "fed minutes",
    "economic data", "retail sales", "consumer",
    "earnings", "guidance", "outlook", "forecast",

    # Market Sentiment & Conditions
    "bull", "bear", "rally", "selloff", "correction",
    "volatility", "vix", "risk-off", "risk-on",
    "market", "stocks", "equities", "indices",

    # Sectors & Macro Themes
    "bank", "financial", "energy", "oil", "gold", "dollar",
    "currency", "forex", "emerging market",
    "tariff", "trade", "geopolitical", "china", "europe",

    # ETF & Investment
    "etf", "fund", "portfolio", "allocation", "rebalance",
    "inflow", "outflow", "rotation",

    # Fiscal Policy
    "fiscal", "budget", "deficit", "debt ceiling", "stimulus",
    "tax", "spending", "government",
]


# =============================================================================
# Helper Functions
# =============================================================================


def _clean_html(text: str) -> str:
    """Remove HTML tags from text"""
    if not text:
        return ""
    clean = re.sub(r'<[^>]+>', '', text)
    return clean.strip()


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


def _is_macro_relevant(title: str, text: str = "") -> bool:
    """Check if news is macro-relevant based on keywords"""
    combined = (title + " " + text).lower()
    return any(keyword in combined for keyword in MACRO_KEYWORDS)


def _parse_yf_news(news_item: dict, symbol: str = None) -> dict | None:
    """Parse a yfinance news item into our standard format"""
    try:
        if not news_item:
            return None

        content = news_item.get("content")
        if not content or not isinstance(content, dict):
            return None

        title = content.get("title", "")
        if not title:
            return None

        # Get summary and clean HTML
        summary = content.get("summary", "") or content.get("description", "")
        summary = _clean_html(summary)

        # Get provider info
        provider = content.get("provider", {})
        source = provider.get("displayName", "Yahoo Finance")

        # Get URL
        click_url = content.get("clickThroughUrl", {})
        url = click_url.get("url", "")

        # Get thumbnail
        thumbnail = content.get("thumbnail", {})
        image = thumbnail.get("originalUrl", "") if thumbnail else ""

        # Get publication date
        pub_date = content.get("pubDate", "") or content.get("displayTime", "")

        return {
            "title": title,
            "text": summary[:500] if summary else "",
            "source": source,
            "publishedDate": pub_date,
            "url": url,
            "image": image,
            "symbol": symbol,
            "type": "macro" if symbol in MACRO_TICKERS else "equity",
        }
    except Exception:
        # Silently skip malformed news items
        return None


# =============================================================================
# Main News Fetching Functions
# =============================================================================


def get_market_news(days: int = 1, macro_only: bool = True) -> dict:
    """
    Fetch macro-focused market news from Yahoo Finance.

    Args:
        days: Only include news from the last N days (default: 1)
        macro_only: If True, filter for macro-relevant keywords (default: True)

    Returns:
        Dictionary with filtered news articles focused on:
        - Fed policy and officials
        - Interest rates and bonds
        - Inflation and economic indicators
        - Market-moving macro events
    """
    print("[TOOL] get_market_news(days=" + str(days) + ", macro_only=" + str(macro_only) + ")")

    try:
        all_news = []
        seen_titles = set()

        # Fetch news for each ticker (20 per ticker, max supported)
        for symbol in NEWS_TICKERS:
            try:
                ticker = yf.Ticker(symbol)
                # Use get_news() with count parameter for more results
                news = ticker.get_news(count=NEWS_COUNT_PER_TICKER)

                if not news:
                    continue

                for item in news:
                    parsed = _parse_yf_news(item, symbol)
                    if not parsed:
                        continue

                    # Skip duplicates
                    if parsed["title"] in seen_titles:
                        continue

                    # Time filter: within last N days
                    if not _is_within_time_range(parsed["publishedDate"], days):
                        continue

                    # Macro relevance filter
                    if macro_only and not _is_macro_relevant(parsed["title"], parsed["text"]):
                        continue

                    seen_titles.add(parsed["title"])
                    all_news.append(parsed)

            except Exception as e:
                print("Error fetching news for " + symbol + ": " + str(e))
                continue

        # Sort by published date (newest first)
        all_news.sort(
            key=lambda x: x.get("publishedDate", ""),
            reverse=True
        )

        # Get effective date range for display
        start_date, end_date, is_weekend = _get_effective_date_range()
        date_range = start_date.strftime("%Y-%m-%d") + " to " + end_date.strftime("%Y-%m-%d")
        if is_weekend:
            date_range += " (weekend: includes last Friday)"

        print("Fetched " + str(len(all_news)) + " macro-relevant news (" + date_range + ", " + str(len(NEWS_TICKERS)) + " tickers x " + str(NEWS_COUNT_PER_TICKER) + " each)")

        return {
            "status": "success",
            "news_count": len(all_news),
            "news": all_news,
            "source": "yahoo_finance",
            "tickers_scanned": NEWS_TICKERS,
            "filters": {
                "date_from": start_date.isoformat(),
                "date_to": end_date.isoformat(),
                "macro_only": macro_only,
                "weekend_adjusted": is_weekend,
            },
        }

    except Exception as e:
        print("Error fetching market news: " + str(e))
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "error": str(e),
            "news": [],
            "news_count": 0,
        }


