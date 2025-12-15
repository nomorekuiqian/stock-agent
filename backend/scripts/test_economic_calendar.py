#!/usr/bin/env python3
"""
Test script for Economic Calendar API

Usage:
    cd backend
    python scripts/test_economic_calendar.py

Options:
    --days N      Number of days to look ahead (default: 14)
    --country XX  Filter by country code (e.g., US, CN, EU)
    --key-only    Show only key events
    --json        Output raw JSON
"""

import sys
import os
import argparse
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()


def test_economic_calendar(days: int = 14, country: str = None, key_only: bool = False, raw_json: bool = False):
    """Test the economic calendar API."""
    from app.services.fmp_service import get_fmp_service
    import json

    print("=" * 60)
    print("Economic Calendar API Test")
    print("=" * 60)
    print()

    fmp = get_fmp_service()

    # Get high impact events
    result = fmp.get_high_impact_events(days=days)

    if raw_json:
        print(json.dumps(result, indent=2, default=str))
        return

    print(f"Status: {result.get('status')}")
    print(f"Total events: {result.get('events_count')}")
    print(f"Date range: {result.get('date_range', {}).get('from')} to {result.get('date_range', {}).get('to')}")
    print(f"Countries: {result.get('countries_filtered', [])}")
    print()

    events = result.get("events", [])

    # Filter by country if specified
    if country:
        events = [e for e in events if e["country"].upper() == country.upper()]
        print(f"Filtered to {country}: {len(events)} events")
        print()

    # Filter key events only
    if key_only:
        events = [e for e in events if e.get("is_key_event")]
        print(f"Key events only: {len(events)} events")
        print()

    # Group by date
    events_by_date = {}
    for event in events:
        date_str = event["date"][:10]  # YYYY-MM-DD
        if date_str not in events_by_date:
            events_by_date[date_str] = []
        events_by_date[date_str].append(event)

    # Print events
    print("-" * 60)
    print(f"{'Date':<12} {'Country':<6} {'Impact':<8} {'Key':<4} Event")
    print("-" * 60)

    for date_str in sorted(events_by_date.keys()):
        day_events = events_by_date[date_str]

        # Parse date for display
        try:
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            date_display = date_obj.strftime("%m/%d %a")
        except:
            date_display = date_str

        for i, event in enumerate(day_events):
            date_col = date_display if i == 0 else ""
            country_code = event["country"]
            impact = event["impact"]
            is_key = "*" if event.get("is_key_event") else ""
            event_name = event["event"][:45]

            # Color coding for impact
            if impact == "High":
                impact_display = f"\033[91m{impact}\033[0m"  # Red
            elif impact == "Medium":
                impact_display = f"\033[93m{impact}\033[0m"  # Yellow
            else:
                impact_display = impact

            print(f"{date_col:<12} {country_code:<6} {impact:<8} {is_key:<4} {event_name}")

        print()  # Blank line between dates

    # Summary
    print("-" * 60)
    print("Summary:")
    high_count = len([e for e in events if e["impact"] == "High"])
    medium_count = len([e for e in events if e["impact"] == "Medium"])
    key_count = len([e for e in events if e.get("is_key_event")])
    print(f"  High impact: {high_count}")
    print(f"  Medium impact: {medium_count}")
    print(f"  Key events (*): {key_count}")

    # US events breakdown
    us_events = [e for e in events if e["country"] == "US"]
    print(f"  US events: {len(us_events)}")


def test_agent_tool():
    """Test the agent tool wrapper."""
    from agents.tools.news import get_economic_calendar
    import json

    print()
    print("=" * 60)
    print("Agent Tool Test (get_economic_calendar)")
    print("=" * 60)
    print()

    result = get_economic_calendar(days=14)

    print(f"Status: {result.get('status')}")
    print(f"Events count: {result.get('events_count')}")
    print(f"Date range: {result.get('date_range')}")
    print()

    # Show first 5 events
    print("First 5 events:")
    for event in result.get("events", [])[:5]:
        print(f"  {event['date']} | {event['country']} | {event['event']} | {event['impact']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test Economic Calendar API")
    parser.add_argument("--days", type=int, default=14, help="Days to look ahead (default: 14)")
    parser.add_argument("--country", type=str, help="Filter by country code (e.g., US)")
    parser.add_argument("--key-only", action="store_true", help="Show only key events")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    parser.add_argument("--agent-tool", action="store_true", help="Test agent tool wrapper")

    args = parser.parse_args()

    try:
        test_economic_calendar(
            days=args.days,
            country=args.country,
            key_only=args.key_only,
            raw_json=args.json
        )

        if args.agent_tool:
            test_agent_tool()

    except ValueError as e:
        print(f"Error: {e}")
        print("Make sure FMP_API_KEY is set in your .env file")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
