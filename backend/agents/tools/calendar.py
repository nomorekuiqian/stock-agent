"""
Economic Calendar Tools for Market Agent
Provides economic calendar fetching functions using FMP API.
"""


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
    print(f"[TOOL] get_economic_calendar(days={days})")

    try:
        from app.services.fmp_service import get_fmp_service

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

        print(f"Economic calendar: {len(us_high_impact)} US high-impact events")

        return {
            "status": "success",
            "events_count": len(us_high_impact),
            "events": us_high_impact,
            "date_range": calendar.get("date_range"),
            "filter": "US High Impact only",
            "source": "fmp",
        }

    except ValueError as e:
        print(f"Economic calendar unavailable: {e}")
        return {
            "status": "error",
            "error": str(e),
            "events": [],
            "events_count": 0,
            "source": "fmp",
        }
    except Exception as e:
        print(f"Error fetching economic calendar: {e}")
        return {
            "status": "error",
            "error": str(e),
            "events": [],
            "events_count": 0,
            "source": "fmp",
        }
