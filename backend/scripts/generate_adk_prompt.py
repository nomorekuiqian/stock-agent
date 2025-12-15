#!/usr/bin/env python3
"""
Generate a prompt with real market data for testing in ADK Web UI.

Usage:
    python scripts/generate_adk_prompt.py
    python scripts/generate_adk_prompt.py --copy  # Copy to clipboard (macOS)
"""

import json
import sys
import os
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from agents.tools import get_all_market_data
from agents.tools.news import get_combined_market_news
from agents.tools.calendar import get_economic_calendar
from agents.tools.earnings import get_earnings_calendar


def generate_prompt() -> str:
    """Fetch all data and generate the prompt."""
    print("[Fetching] Market data...", file=sys.stderr)
    market_data = get_all_market_data()

    print("[Fetching] News...", file=sys.stderr)
    news_result = get_combined_market_news(days=1)

    print("[Fetching] Economic calendar...", file=sys.stderr)
    calendar_result = get_economic_calendar(days=14)

    print("[Fetching] Earnings calendar...", file=sys.stderr)
    earnings_result = get_earnings_calendar(days=7)

    # Prepare data JSON
    report_date = datetime.now().strftime("%Y-%m-%d %A")

    data = {
        "report_date": report_date,
        "market_data": market_data,
        "news": news_result.get("news", [])[:50],
        "economic_calendar": calendar_result.get("events", []),
        "earnings_calendar": earnings_result.get("earnings", []),
    }

    # Generate prompt
    prompt = f"""Please analyze the following market data and provide a comprehensive report:

{json.dumps(data, ensure_ascii=False, indent=2, default=str)}"""

    return prompt


def main():
    prompt = generate_prompt()

    # Check if --copy flag is passed
    if "--copy" in sys.argv:
        try:
            import subprocess
            process = subprocess.Popen(
                ["pbcopy"],
                stdin=subprocess.PIPE,
            )
            process.communicate(prompt.encode("utf-8"))
            print(f"\n[Done] Prompt copied to clipboard! ({len(prompt)} chars)", file=sys.stderr)
            print(f"[Info] News: {prompt.count('title')//2} articles", file=sys.stderr)
        except Exception as e:
            print(f"[Error] Failed to copy: {e}", file=sys.stderr)
            print(prompt)
    else:
        # Print to stdout
        print(prompt)
        print(f"\n---\n[Info] Prompt length: {len(prompt)} chars", file=sys.stderr)
        print("[Tip] Use --copy to copy to clipboard", file=sys.stderr)


if __name__ == "__main__":
    main()
