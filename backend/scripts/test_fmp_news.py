"""
Test FMP News Fetching with Core Macro Tickers

Run: cd backend && source venv/bin/activate && python scripts/test_fmp_news.py
"""

import sys
from pathlib import Path

# Ensure the backend package path is available whether run from repo root or /backend
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv()

from app.shared.fmp_service import get_fmp_service, FMP_NEWS_SYMBOLS


def test_fmp_news():
    """Test FMP news fetching with core macro tickers"""

    print("=" * 70)
    print("FMP News Test - Core Macro Tickers")
    print("=" * 70)

    print(f"\nTickers: {FMP_NEWS_SYMBOLS}")
    print(f"Count: {len(FMP_NEWS_SYMBOLS)}")
    print()

    fmp = get_fmp_service()
    result = fmp.get_stock_news(limit=50)

    print(f"Status: {result.get('status')}")
    print(f"Total news fetched: {result.get('news_count', 0)}")
    print()

    # Group news by symbol
    news_by_symbol = {}
    for news in result.get("news", []):
        symbol = news.get("symbol", "N/A")
        if symbol not in news_by_symbol:
            news_by_symbol[symbol] = []
        news_by_symbol[symbol].append(news)

    print("-" * 70)
    print("News by Ticker")
    print("-" * 70)

    for symbol in FMP_NEWS_SYMBOLS:
        articles = news_by_symbol.get(symbol, [])
        print(f"\n[{symbol}] - {len(articles)} articles")
        for i, article in enumerate(articles[:3], 1):  # Show top 3 per ticker
            title = article.get("title", "")[:60]
            source = article.get("source", "")[:15]
            date = article.get("publishedDate", "")[:16]
            print(f"  {i}. {title}...")
            print(f"     Source: {source} | Date: {date}")

    # Show any news from other symbols
    other_symbols = set(news_by_symbol.keys()) - set(FMP_NEWS_SYMBOLS)
    if other_symbols:
        print(f"\n[Other symbols]: {other_symbols}")

    print()
    print("-" * 70)
    print("All News (sorted by date, top 20)")
    print("-" * 70)

    all_news = result.get("news", [])
    all_news.sort(key=lambda x: x.get("publishedDate", ""), reverse=True)

    for i, article in enumerate(all_news[:20], 1):
        symbol = article.get("symbol", "N/A")
        title = article.get("title", "")[:50]
        source = article.get("source", "")[:12]
        date = article.get("publishedDate", "")[:16]
        print(f"{i:2}. [{symbol:5}] {title}...")
        print(f"    Source: {source} | {date}")

    if len(all_news) > 20:
        print(f"\n... and {len(all_news) - 20} more articles")


def test_market_news():
    """Test market news fetching via get_combined_market_news"""

    print("\n")
    print("=" * 70)
    print("Market News Test (FMP Only)")
    print("=" * 70)

    from app.shared.data_tools.news import get_combined_market_news

    result = get_combined_market_news(days=1)

    print(f"\nStatus: {result.get('status')}")
    print(f"Total: {result.get('news_count', 0)}")
    print(f"Source: {result.get('source', 'fmp')}")
    print()

    print("-" * 70)
    print("Top 15 News")
    print("-" * 70)

    for i, article in enumerate(result.get("news", [])[:15], 1):
        symbol = article.get("symbol", "N/A")
        title = article.get("title", "")[:50]
        pub_source = article.get("source", "")[:12]
        date = article.get("publishedDate", "")[:16]
        print(f"{i:2}. [{symbol:5}] {title}...")
        print(f"    Source: {pub_source} | {date}")


if __name__ == "__main__":
    print("\n" + "#" * 70)
    print("# FMP News Test Suite")
    print("#" * 70)

    test_fmp_news()
    test_market_news()

    print("\n" + "#" * 70)
    print("# Test Complete")
    print("#" * 70)
