#!/usr/bin/env python3
"""
Quick script to display market news from FMP API.
Run: python test_yahoo_news.py
"""

from dotenv import load_dotenv

load_dotenv()

from app.shared.data_tools.news import get_fmp_news


def main():
    print("=" * 70)
    print("Market News from FMP API")
    print("=" * 70)

    result = get_fmp_news()

    print(f"\nStatus: {result['status']}")
    print(f"Source: {result.get('source', 'N/A')}")
    print(f"Total Articles: {result['news_count']}")
    print()

    for i, news in enumerate(result["news"], 1):
        print("-" * 70)
        print(f"{i}. {news['title']}")
        print(f"   Date: {news['publishedDate']}")
        print(f"   Source: {news['source']} | Symbol: {news.get('symbol', 'N/A')}")
        if news.get("text"):
            text = news["text"]
            summary = f"{text[:150]}..." if len(text) > 150 else text
            print(f"   Summary: {summary}")
        print(f"   URL: {news['url']}")
        print()


if __name__ == "__main__":
    main()
