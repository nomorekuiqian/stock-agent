"""
FMP (Financial Modeling Prep) API Service
"""

import os
import httpx
from typing import Optional
from datetime import datetime, timedelta


# Core tickers for FMP news - Mag 7 + Semiconductors
FMP_NEWS_SYMBOLS = [
    # Market indices
    "SPY",   # S&P 500 ETF
    "QQQ",   # Nasdaq 100 ETF
    # Mag 7
    "AAPL",  # Apple
    "MSFT",  # Microsoft
    "NVDA",  # NVIDIA
    "AMZN",  # Amazon
    "GOOGL", # Alphabet
    "META",  # Meta
    "TSLA",  # Tesla
    # Semiconductors
    "AMD",   # AMD
    "AVGO",  # Broadcom
    "TSM",   # TSMC
    "ASML",  # ASML
]


class FMPService:
    """Financial Modeling Prep API"""

    BASE_URL = "https://financialmodelingprep.com"

    def __init__(self):
        self.api_key = os.getenv("FMP_API_KEY")
        if not self.api_key:
            raise ValueError("FMP_API_KEY environment variable is required")

    def _request(self, endpoint: str, params: dict = None) -> dict | list | None:
        """Send synchronous API request"""
        params = params or {}
        params["apikey"] = self.api_key

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.get(f"{self.BASE_URL}{endpoint}", params=params)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            print(f"FMP API HTTP error: {e.response.status_code} - {e.response.text}")
            return None
        except httpx.RequestError as e:
            print(f"FMP API request error: {e}")
            return None
        except Exception as e:
            print(f"FMP API unexpected error: {e}")
            return None

    def get_treasury_rates(self, date: Optional[str] = None) -> dict:
        """
        Get complete treasury yield curve (12 maturities)

        Args:
            date: Optional, specify date (YYYY-MM-DD), defaults to latest

        Returns:
            {
                "date": "2024-02-29",
                "rates": {
                    "1M": 5.53, "2M": 5.5, "3M": 5.45, "6M": 5.3,
                    "1Y": 5.01, "2Y": 4.64, "3Y": 4.43,
                    "5Y": 4.26, "7Y": 4.28,
                    "10Y": 4.25, "20Y": 4.51, "30Y": 4.38
                },
                "spreads": {
                    "10y_3m": -0.2,
                    "10y_2y": -0.39,
                    "30y_10y": 0.13
                },
                "yield_curve_shape": "inverted",
                "source": "fmp"
            }
        """
        print("[FMP] get_treasury_rates()")

        params = {}
        if date:
            params["date"] = date

        data = self._request("/stable/treasury-rates", params)

        if not data or not isinstance(data, list) or len(data) == 0:
            print("FMP Treasury Rates API returned empty data")
            return self._empty_treasury_response()

        raw = data[0]

        rates = {
            "1M": self._safe_float(raw.get("month1")),
            "2M": self._safe_float(raw.get("month2")),
            "3M": self._safe_float(raw.get("month3")),
            "6M": self._safe_float(raw.get("month6")),
            "1Y": self._safe_float(raw.get("year1")),
            "2Y": self._safe_float(raw.get("year2")),
            "3Y": self._safe_float(raw.get("year3")),
            "5Y": self._safe_float(raw.get("year5")),
            "7Y": self._safe_float(raw.get("year7")),
            "10Y": self._safe_float(raw.get("year10")),
            "20Y": self._safe_float(raw.get("year20")),
            "30Y": self._safe_float(raw.get("year30")),
        }

        spreads = self._calculate_spreads(rates)
        yield_curve_shape = self._analyze_yield_curve_shape(rates)

        return {
            "date": raw.get("date", datetime.now().strftime("%Y-%m-%d")),
            "rates": rates,
            "spreads": spreads,
            "yield_curve_shape": yield_curve_shape,
            "source": "fmp",
        }

    def _calculate_spreads(self, rates: dict) -> dict:
        """Calculate key spreads"""
        spreads = {}

        # 10Y - 3M (most important recession indicator)
        if rates.get("10Y") and rates.get("3M"):
            spreads["10y_3m"] = round(rates["10Y"] - rates["3M"], 3)

        # 10Y - 2Y (another important recession indicator)
        if rates.get("10Y") and rates.get("2Y"):
            spreads["10y_2y"] = round(rates["10Y"] - rates["2Y"], 3)

        # 30Y - 10Y (long-end slope)
        if rates.get("30Y") and rates.get("10Y"):
            spreads["30y_10y"] = round(rates["30Y"] - rates["10Y"], 3)

        # 5Y - 3M (mid-short end)
        if rates.get("5Y") and rates.get("3M"):
            spreads["5y_3m"] = round(rates["5Y"] - rates["3M"], 3)

        return spreads

    def _analyze_yield_curve_shape(self, rates: dict) -> str:
        """
        Analyze yield curve shape

        Returns:
            "normal": Normal (short < long)
            "flat": Flat (short ~ long)
            "inverted": Inverted (short > long)
        """
        short = rates.get("3M", 0) or 0
        long = rates.get("10Y", 0) or 0

        if short == 0 or long == 0:
            return "unknown"

        diff = long - short

        if diff < -0.1:  # 10Y more than 10bp below 3M
            return "inverted"
        elif diff < 0.5:  # Spread less than 50bp
            return "flat"
        else:
            return "normal"

    def _safe_float(self, value, default=None) -> float | None:
        """Safely convert to float"""
        if value is None:
            return default
        try:
            result = float(value)
            return result if result == result else default  # NaN check
        except (ValueError, TypeError):
            return default

    def _empty_treasury_response(self) -> dict:
        """Return empty treasury response structure"""
        return {
            "date": None,
            "rates": {},
            "spreads": {},
            "yield_curve_shape": "unknown",
            "source": "fmp",
            "error": "No data available",
        }

    def get_stock_news(self, symbols: list[str] = None, limit: int = 50) -> dict:
        """
        Get news for specific stock symbols from FMP API.

        Args:
            symbols: List of ticker symbols (defaults to FMP_NEWS_SYMBOLS)
            limit: Maximum news items to return (default: 50)

        Returns:
            {
                "status": "success|error",
                "news_count": int,
                "news": [...],
                "source": "fmp",
                "symbols_queried": [...]
            }
        """
        symbols = symbols or FMP_NEWS_SYMBOLS
        symbols_str = ",".join(symbols[:20])  # API limit

        print(f"[FMP] get_stock_news(symbols={len(symbols)}, limit={limit})")

        params = {"symbols": symbols_str, "limit": limit}
        data = self._request("/stable/news/stock", params)

        if not data or not isinstance(data, list):
            return self._empty_news_response("No news data returned")

        news = self._parse_fmp_news(data)

        return {
            "status": "success",
            "news_count": len(news),
            "news": news,
            "source": "fmp",
            "symbols_queried": symbols[:20],
        }

    def get_latest_news(self, limit: int = 50) -> dict:
        """
        Get latest general stock market news (no ticker required).

        Args:
            limit: Maximum news items to return (default: 50)

        Returns:
            Standardized news response dict
        """
        print(f"[FMP] get_latest_news(limit={limit})")

        params = {"limit": limit}
        data = self._request("/stable/news/stock-latest", params)

        if not data or not isinstance(data, list):
            return self._empty_news_response("No news data returned")

        news = self._parse_fmp_news(data)

        return {
            "status": "success",
            "news_count": len(news),
            "news": news,
            "source": "fmp",
        }

    def _parse_fmp_news(self, raw_news: list) -> list[dict]:
        """
        Parse FMP news items to standard format.

        FMP format: symbol, publishedDate, publisher, title, image, site, text, url
        Output format: title, text, source, publishedDate, url, image, symbol, type
        """
        parsed = []
        for item in raw_news:
            if not item.get("title"):
                continue

            parsed.append({
                "title": item.get("title", ""),
                "text": (item.get("text", "") or "")[:500],
                "source": item.get("publisher", "") or item.get("site", "FMP"),
                "publishedDate": item.get("publishedDate", ""),
                "url": item.get("url", ""),
                "image": item.get("image", ""),
                "symbol": item.get("symbol", ""),
                "type": "macro",
            })

        return parsed

    def _empty_news_response(self, error: str = None) -> dict:
        """Return empty news response structure"""
        return {
            "status": "error" if error else "success",
            "news_count": 0,
            "news": [],
            "source": "fmp",
            "error": error,
        }

    def get_economic_calendar(self, days: int = 14, country: str = None) -> dict:
        """
        Get upcoming economic events for the next N days.

        Args:
            days: Number of days to look ahead (default: 14, max: 90)
            country: Filter by country code (e.g., "US", "CN", "EU")

        Returns:
            {
                "status": "success|error",
                "events_count": int,
                "events": [
                    {
                        "date": "2024-03-01 08:30:00",
                        "country": "US",
                        "event": "Non-Farm Payrolls",
                        "currency": "USD",
                        "previous": 353000,
                        "estimate": 200000,
                        "actual": null,
                        "impact": "High",
                        "change": null,
                        "changePercentage": null
                    }
                ],
                "date_range": {"from": "...", "to": "..."},
                "source": "fmp"
            }
        """
        print(f"[FMP] get_economic_calendar(days={days}, country={country})")

        today = datetime.now()
        from_date = today.strftime("%Y-%m-%d")
        to_date = (today + timedelta(days=min(days, 90))).strftime("%Y-%m-%d")

        params = {"from": from_date, "to": to_date}
        data = self._request("/stable/economic-calendar", params)

        if not data or not isinstance(data, list):
            return self._empty_calendar_response("No calendar data returned")

        events = self._parse_economic_events(data, country)

        # Sort by date and impact
        impact_order = {"High": 0, "Medium": 1, "Low": 2}
        events.sort(key=lambda x: (x["date"], impact_order.get(x["impact"], 3)))

        return {
            "status": "success",
            "events_count": len(events),
            "events": events,
            "date_range": {"from": from_date, "to": to_date},
            "source": "fmp",
        }

    def _parse_economic_events(self, raw_events: list, country: str = None) -> list[dict]:
        """
        Parse FMP economic calendar events.

        Args:
            raw_events: Raw API response
            country: Optional country filter (e.g., "US")

        Returns:
            List of parsed event dicts
        """
        parsed = []
        for item in raw_events:
            if not item.get("event"):
                continue

            event_country = item.get("country", "")

            # Filter by country if specified
            if country and event_country.upper() != country.upper():
                continue

            parsed.append({
                "date": item.get("date", ""),
                "country": event_country,
                "event": item.get("event", ""),
                "currency": item.get("currency", ""),
                "previous": self._safe_float(item.get("previous")),
                "estimate": self._safe_float(item.get("estimate")),
                "actual": self._safe_float(item.get("actual")),
                "impact": item.get("impact", "Low"),
                "change": self._safe_float(item.get("change")),
                "changePercentage": self._safe_float(item.get("changePercentage")),
            })

        return parsed

    def get_high_impact_events(self, days: int = 14, countries: list[str] = None) -> dict:
        """
        Get only high-impact economic events for the next N days.
        Focuses on US and major economies by default.

        Args:
            days: Number of days to look ahead (default: 14)
            countries: List of country codes to include (default: ["US", "EU", "CN", "JP", "GB"])

        Returns:
            Filtered calendar with only High and Medium impact events
        """
        print(f"[FMP] get_high_impact_events(days={days})")

        countries = countries or ["US", "EU", "CN", "JP", "GB"]
        calendar = self.get_economic_calendar(days=days)

        if calendar.get("status") != "success":
            return calendar

        # Filter for high/medium impact and specified countries
        high_impact_events = [
            event for event in calendar["events"]
            if event["impact"] in ["High", "Medium"]
            and event["country"].upper() in [c.upper() for c in countries]
        ]

        # Key events to always highlight
        key_event_keywords = [
            "Fed", "FOMC", "Interest Rate", "CPI", "Inflation",
            "GDP", "Non-Farm", "Payroll", "Unemployment", "Retail Sales",
            "PMI", "Consumer Confidence", "Housing", "Trade Balance",
            "Central Bank", "ECB", "BOJ", "PBOC", "BOE"
        ]

        # Mark key events
        for event in high_impact_events:
            event["is_key_event"] = any(
                keyword.lower() in event["event"].lower()
                for keyword in key_event_keywords
            )

        return {
            "status": "success",
            "events_count": len(high_impact_events),
            "events": high_impact_events,
            "date_range": calendar["date_range"],
            "countries_filtered": countries,
            "source": "fmp",
        }

    def _empty_calendar_response(self, error: str = None) -> dict:
        """Return empty calendar response structure"""
        return {
            "status": "error" if error else "success",
            "events_count": 0,
            "events": [],
            "date_range": None,
            "source": "fmp",
            "error": error,
        }

    # =========================================================================
    # Earnings Calendar
    # =========================================================================

    def get_earnings_calendar(self, days: int = 14) -> dict:
        """
        Get upcoming earnings announcements for the next N days.

        Args:
            days: Number of days to look ahead (default: 7, max: 90)

        Returns:
            {
                "status": "success|error",
                "earnings_count": int,
                "earnings": [
                    {
                        "symbol": "AAPL",
                        "date": "2024-07-25",
                        "epsEstimated": 1.51,
                        "epsActual": null,
                        "revenueEstimated": 84000000000,
                        "revenueActual": null,
                        "time": "AMC"
                    }
                ],
                "date_range": {"from": "...", "to": "..."},
                "source": "fmp"
            }
        """
        print(f"[FMP] get_earnings_calendar(days={days})")

        today = datetime.now()
        from_date = today.strftime("%Y-%m-%d")
        to_date = (today + timedelta(days=min(days, 90))).strftime("%Y-%m-%d")

        params = {"from": from_date, "to": to_date}
        data = self._request("/stable/earnings-calendar", params)

        if not data or not isinstance(data, list):
            return self._empty_earnings_response("No earnings data returned")

        earnings = self._parse_earnings(data)

        # Sort by date
        earnings.sort(key=lambda x: x["date"])

        return {
            "status": "success",
            "earnings_count": len(earnings),
            "earnings": earnings,
            "date_range": {"from": from_date, "to": to_date},
            "source": "fmp",
        }

    def _parse_earnings(self, raw_earnings: list) -> list[dict]:
        """Parse FMP earnings calendar data."""
        parsed = []
        for item in raw_earnings:
            if not item.get("symbol"):
                continue

            parsed.append({
                "symbol": item.get("symbol", ""),
                "date": item.get("date", ""),
                "epsEstimated": self._safe_float(item.get("epsEstimated")),
                "epsActual": self._safe_float(item.get("epsActual")),
                "revenueEstimated": self._safe_float(item.get("revenueEstimated")),
                "revenueActual": self._safe_float(item.get("revenueActual")),
                "lastUpdated": item.get("lastUpdated", ""),
            })

        return parsed

    def get_major_earnings(self, days: int = 14, min_market_cap: float = 10e9) -> dict:
        """
        Get upcoming earnings for major companies (large cap).

        Filters for well-known tickers and large market cap companies.

        Args:
            days: Number of days to look ahead (default: 7)
            min_market_cap: Minimum market cap filter (not used directly, but filters known tickers)

        Returns:
            Filtered earnings with only major companies
        """
        print(f"[FMP] get_major_earnings(days={days})")

        # Major tickers we care about
        major_tickers = {
            # Tech Giants
            "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA",
            # AI & Semiconductors
            "AMD", "INTC", "AVGO", "QCOM", "TSM", "SMCI", "ARM", "MU",
            # Software & Cloud
            "CRM", "ORCL", "ADBE", "NOW", "SNOW", "PLTR", "NET", "DDOG",
            # Financials
            "JPM", "BAC", "WFC", "GS", "MS", "C", "BLK", "SCHW",
            # Consumer
            "WMT", "COST", "TGT", "HD", "LOW", "NKE", "SBUX", "MCD",
            # Healthcare
            "UNH", "JNJ", "PFE", "ABBV", "MRK", "LLY", "TMO", "ABT",
            # Energy
            "XOM", "CVX", "COP", "SLB", "EOG",
            # Industrial
            "CAT", "DE", "BA", "GE", "HON", "UPS", "FDX",
            # ETFs
            "SPY", "QQQ", "IWM", "DIA",
        }

        calendar = self.get_earnings_calendar(days=days)

        if calendar.get("status") != "success":
            return calendar

        # Filter for major tickers only
        major_earnings = [
            earning for earning in calendar["earnings"]
            if earning["symbol"] in major_tickers
        ]

        # Mark AI-related companies
        ai_tickers = {"NVDA", "AMD", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "TSM", "SMCI", "AVGO", "ARM", "PLTR", "SNOW"}
        for earning in major_earnings:
            earning["is_ai_related"] = earning["symbol"] in ai_tickers

        return {
            "status": "success",
            "earnings_count": len(major_earnings),
            "earnings": major_earnings,
            "date_range": calendar["date_range"],
            "filter": "Major companies only",
            "source": "fmp",
        }

    def _empty_earnings_response(self, error: str = None) -> dict:
        """Return empty earnings response structure"""
        return {
            "status": "error" if error else "success",
            "earnings_count": 0,
            "earnings": [],
            "date_range": None,
            "source": "fmp",
            "error": error,
        }


_fmp_service_instance = None


def get_fmp_service() -> FMPService:
    """Get FMP Service singleton"""
    global _fmp_service_instance
    if _fmp_service_instance is None:
        _fmp_service_instance = FMPService()
    return _fmp_service_instance
