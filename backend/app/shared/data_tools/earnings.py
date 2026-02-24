"""
Earnings Calendar Tools for Market Agent
Provides earnings calendar fetching functions using FMP API.
"""

from app.core.logging import get_logger

logger = get_logger(__name__)


def get_earnings_calendar(days: int = 14) -> dict:
    """
    Fetch upcoming earnings announcements for major companies in the next N days.

    Returns earnings for well-known large-cap companies only (AAPL, MSFT, NVDA, etc.)
    Includes AI-related company markers.

    Args:
        days: Number of days to look ahead (default: 14, max: 90)

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
    logger.info("get_earnings_calendar(days=%d)", days)

    try:
        from app.shared.fmp_service import get_fmp_service

        fmp = get_fmp_service()
        result = fmp.get_major_earnings(days=days)

        if result.get("status") == "error":
            logger.error("Earnings calendar error: %s", result.get('error'))
            return result

        logger.info("Earnings calendar: %d major company earnings", result.get('earnings_count', 0))

        return result

    except ValueError as e:
        logger.error("Earnings calendar unavailable: %s", e)
        return {
            "status": "error",
            "error": str(e),
            "earnings": [],
            "earnings_count": 0,
            "source": "fmp",
        }
    except Exception as e:
        logger.error("Error fetching earnings calendar: %s", e)
        return {
            "status": "error",
            "error": str(e),
            "earnings": [],
            "earnings_count": 0,
            "source": "fmp",
        }
