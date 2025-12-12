"""
Earnings Calendar Tools for Macro Agent
Provides earnings calendar fetching functions using FMP API.
"""


def get_earnings_calendar(days: int = 7) -> dict:
    """
    Fetch upcoming earnings announcements for major companies in the next N days.

    Returns earnings for well-known large-cap companies only (AAPL, MSFT, NVDA, etc.)
    Includes AI-related company markers.

    Args:
        days: Number of days to look ahead (default: 7, max: 90)

    Returns:
        Dictionary with earnings:
        {
            "status": "success|error",
            "earnings_count": int,
            "earnings": [
                {
                    "symbol": "NVDA",
                    "date": "2024-08-28",
                    "epsEstimated": 0.64,
                    "epsActual": null,
                    "revenueEstimated": 28000000000,
                    "revenueActual": null,
                    "is_ai_related": true
                }
            ],
            "date_range": {"from": "...", "to": "..."},
            "filter": "Major companies only",
            "source": "fmp"
        }
    """
    print(f"[TOOL] get_earnings_calendar(days={days})")

    try:
        from app.services.fmp_service import get_fmp_service

        fmp = get_fmp_service()
        result = fmp.get_major_earnings(days=days)

        if result.get("status") == "error":
            print(f"Earnings calendar error: {result.get('error')}")
            return result

        print(f"Earnings calendar: {result.get('earnings_count', 0)} major company earnings")

        return result

    except ValueError as e:
        print(f"Earnings calendar unavailable: {e}")
        return {
            "status": "error",
            "error": str(e),
            "earnings": [],
            "earnings_count": 0,
            "source": "fmp",
        }
    except Exception as e:
        print(f"Error fetching earnings calendar: {e}")
        return {
            "status": "error",
            "error": str(e),
            "earnings": [],
            "earnings_count": 0,
            "source": "fmp",
        }
