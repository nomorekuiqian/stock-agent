#!/usr/bin/env python3
"""
Quick script to display market news from Yahoo Finance.
Run: python show_news.py
"""

from dotenv import load_dotenv

load_dotenv()

from agents.tools.news import get_market_news


def main():
    print("=" * 70)
    print("Market News from Yahoo Finance")
    print("=" * 70)

    result = get_market_news()

    print("\nStatus: " + result["status"])
    print("Source: " + result.get("source", "N/A"))
    print("Tickers: " + str(result.get("tickers_scanned", [])))
    print("Total Articles: " + str(result["news_count"]))
    print()

    for i, news in enumerate(result["news"], 1):
        print("-" * 70)
        print(str(i) + ". " + news["title"])
        print("   Date: " + news["publishedDate"])
        print("   Source: " + news["source"] + " | Symbol: " + news.get("symbol", "N/A"))
        if news.get("text"):
            text = news.get("text", "")
            if len(text) > 150:
                summary = text[:150] + "..."
            else:
                summary = text
            print("   Summary: " + summary)
        print("   URL: " + news["url"])
        print()


if __name__ == "__main__":
    main()
