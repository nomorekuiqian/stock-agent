"""
Economic Calendar Tools for Market Agent
Provides economic calendar fetching functions using FMP API.
"""

from app.core.logging import get_logger

logger = get_logger(__name__)


def get_economic_calendar_past(days: int = 7) -> dict:
    """
    Fetch PAST HIGH IMPACT US economic events for the last N days.
    Includes actual values for comparison with estimates (surprise analysis).

    Returns events with actual vs estimate, and a surprise direction.
    """
    logger.info("get_economic_calendar_past(days=%d)", days)

    try:
        from app.shared.fmp_service import get_fmp_service
        from app.utils.timezone import today_str, days_ago

        fmp = get_fmp_service()

        from_date = days_ago(days)
        to_date = today_str()

        params = {"from": from_date, "to": to_date}
        data = fmp._request("/stable/economic-calendar", params)

        if not data or not isinstance(data, list):
            return {"status": "success", "events_count": 0, "events": [], "source": "fmp"}

        events = fmp._parse_economic_events(data, country="US")

        # Filter: High impact only + has actual value
        past_events = []
        for event in events:
            if event["impact"] != "High":
                continue
            # Determine surprise direction
            actual = event.get("actual")
            estimate = event.get("estimate")
            if actual is not None and estimate is not None and estimate != 0:
                if actual > estimate * 1.01:
                    event["surprise"] = "above"
                elif actual < estimate * 0.99:
                    event["surprise"] = "below"
                else:
                    event["surprise"] = "inline"
            else:
                event["surprise"] = "unknown"
            past_events.append(event)

        # Sort by date (most recent first)
        past_events.sort(key=lambda x: x["date"], reverse=True)

        logger.info("Past economic calendar: %d US high-impact events", len(past_events))

        return {
            "status": "success",
            "events_count": len(past_events),
            "events": past_events,
            "date_range": {"from": from_date, "to": to_date},
            "filter": "US High Impact, past events with actuals",
            "source": "fmp",
        }

    except Exception as e:
        logger.error("Error fetching past economic calendar: %s", e)
        return {
            "status": "error",
            "error": str(e),
            "events": [],
            "events_count": 0,
            "source": "fmp",
        }


def get_economic_calendar(days: int = 14) -> dict:
    """
    Fetch upcoming HIGH IMPACT US economic events for the next N days.

    Returns only High impact events from US.
    Events are sorted by date.

    Args:
        days: Number of days to look ahead (default: 14, max: 90)

    Returns:
        Dictionary with economic events:
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
                    "is_key_event": true
                }
            ],
            "date_range": {"from": "...", "to": "..."},
            "source": "fmp"
        }
    """
    logger.info("get_economic_calendar(days=%d)", days)

    try:
        from app.shared.fmp_service import get_fmp_service

        fmp = get_fmp_service()

        # Get calendar and filter for US only
        calendar = fmp.get_economic_calendar(days=days)

        if calendar.get("status") != "success":
            return calendar

        # Filter: High impact + US only
        us_high_impact = [
            event for event in calendar.get("events", [])
            if event["impact"] == "High" and event["country"] == "US"
        ]

        # Mark key events
        key_event_keywords = [
            "Fed", "FOMC", "Interest Rate", "CPI", "Inflation",
            "GDP", "Non-Farm", "Payroll", "Unemployment", "Retail Sales",
            "PMI", "Consumer Confidence", "Housing", "PPI"
        ]

        for event in us_high_impact:
            event["is_key_event"] = any(
                keyword.lower() in event["event"].lower()
                for keyword in key_event_keywords
            )

        logger.info("Economic calendar: %d US high-impact events", len(us_high_impact))

        return {
            "status": "success",
            "events_count": len(us_high_impact),
            "events": us_high_impact,
            "date_range": calendar.get("date_range"),
            "filter": "US High Impact only",
            "source": "fmp",
        }

    except ValueError as e:
        logger.error("Economic calendar unavailable: %s", e)
        return {
            "status": "error",
            "error": str(e),
            "events": [],
            "events_count": 0,
            "source": "fmp",
        }
    except Exception as e:
        logger.error("Error fetching economic calendar: %s", e)
        return {
            "status": "error",
            "error": str(e),
            "events": [],
            "events_count": 0,
            "source": "fmp",
        }
