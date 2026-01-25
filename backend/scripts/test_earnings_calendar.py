#!/usr/bin/env python3
"""
Test script for Earnings Calendar API

Usage:
    cd backend
    python scripts/test_earnings_calendar.py

Options:
    --days N       Number of days to look ahead (default: 7)
    --all          Show all earnings, not just major companies
    --ai-only      Show only AI-related companies
    --json         Output raw JSON
"""

import sys
import os
import argparse
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()


def format_revenue(value):
    """Format revenue in human-readable format."""
    if value is None:
        return "N/A"
    if value >= 1e12:
        return f"${value/1e12:.1f}T"
    if value >= 1e9:
        return f"${value/1e9:.1f}B"
    if value >= 1e6:
        return f"${value/1e6:.1f}M"
    return f"${value:,.0f}"


def test_earnings_calendar(days: int = 7, show_all: bool = False, ai_only: bool = False, raw_json: bool = False):
    """Test the earnings calendar API."""
    from app.shared.fmp_service import get_fmp_service
    import json

    print("=" * 70)
    print("Earnings Calendar API Test")
    print("=" * 70)
    print()

    fmp = get_fmp_service()

    # Get earnings
    if show_all:
        result = fmp.get_earnings_calendar(days=days)
    else:
        result = fmp.get_major_earnings(days=days)

    if raw_json:
        print(json.dumps(result, indent=2, default=str))
        return

    print(f"Status: {result.get('status')}")
    print(f"Total earnings: {result.get('earnings_count')}")
    print(f"Date range: {result.get('date_range', {}).get('from')} to {result.get('date_range', {}).get('to')}")
    if result.get("filter"):
        print(f"Filter: {result.get('filter')}")
    print()

    earnings = result.get("earnings", [])

    # Filter AI only if requested
    if ai_only and not show_all:
        earnings = [e for e in earnings if e.get("is_ai_related")]
        print(f"AI-related companies only: {len(earnings)} earnings")
        print()

    # Group by date
    earnings_by_date = {}
    for earning in earnings:
        date_str = earning["date"]
        if date_str not in earnings_by_date:
            earnings_by_date[date_str] = []
        earnings_by_date[date_str].append(earning)

    # Print earnings
    print("-" * 70)
    print(f"{'Date':<12} {'Symbol':<8} {'AI':<4} {'EPS Est':<10} {'Revenue Est':<12}")
    print("-" * 70)

    for date_str in sorted(earnings_by_date.keys()):
        day_earnings = earnings_by_date[date_str]

        # Parse date for display
        try:
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            date_display = date_obj.strftime("%m/%d %a")
        except:
            date_display = date_str

        for i, earning in enumerate(day_earnings):
            date_col = date_display if i == 0 else ""
            symbol = earning["symbol"]
            is_ai = "*" if earning.get("is_ai_related") else ""
            eps_est = f"${earning['epsEstimated']:.2f}" if earning.get("epsEstimated") else "N/A"
            rev_est = format_revenue(earning.get("revenueEstimated"))

            print(f"{date_col:<12} {symbol:<8} {is_ai:<4} {eps_est:<10} {rev_est:<12}")

        print()  # Blank line between dates

    # Summary
    print("-" * 70)
    print("Summary:")
    ai_count = len([e for e in earnings if e.get("is_ai_related")])
    print(f"  Total earnings: {len(earnings)}")
    if not show_all:
        print(f"  AI-related (*): {ai_count}")

    # Group by sector (based on known tickers)
    tech_tickers = {"AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA", "AMD", "INTC", "AVGO", "QCOM"}
    tech_count = len([e for e in earnings if e["symbol"] in tech_tickers])
    print(f"  Tech companies: {tech_count}")


def test_agent_tool():
    """Test the agent tool wrapper."""
    from app.shared.data_tools.earnings import get_earnings_calendar
    import json

    print()
    print("=" * 70)
    print("Agent Tool Test (get_earnings_calendar)")
    print("=" * 70)
    print()

    result = get_earnings_calendar(days=7)

    print(f"Status: {result.get('status')}")
    print(f"Earnings count: {result.get('earnings_count')}")
    print(f"Date range: {result.get('date_range')}")
    print(f"Filter: {result.get('filter')}")
    print()

    # Show first 5 earnings
    print("First 5 earnings:")
    for earning in result.get("earnings", [])[:5]:
        ai_marker = " [AI]" if earning.get("is_ai_related") else ""
        print(f"  {earning['date']} | {earning['symbol']}{ai_marker} | EPS: {earning.get('epsEstimated', 'N/A')}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test Earnings Calendar API")
    parser.add_argument("--days", type=int, default=7, help="Days to look ahead (default: 7)")
    parser.add_argument("--all", action="store_true", help="Show all earnings, not just major companies")
    parser.add_argument("--ai-only", action="store_true", help="Show only AI-related companies")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    parser.add_argument("--agent-tool", action="store_true", help="Test agent tool wrapper")

    args = parser.parse_args()

    try:
        test_earnings_calendar(
            days=args.days,
            show_all=args.all,
            ai_only=args.ai_only,
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
