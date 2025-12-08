#!/usr/bin/env python3
"""
Test script for News Fetcher Agent
Run from backend directory: python test_news_agent.py
"""

import asyncio
import json
import os
from datetime import datetime

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Set GOOGLE_GENAI_API_KEY for google-genai library
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")


def test_yfinance_news():
    """Test Yahoo Finance News API directly"""
    print("\n" + "=" * 60)
    print("🧪 Testing Yahoo Finance News API directly")
    print("=" * 60)

    import yfinance as yf

    try:
        # Test with SPY
        print("\n📰 Fetching SPY news...")
        ticker = yf.Ticker("SPY")
        news = ticker.news

        if news:
            print(f"✅ Got {len(news)} SPY news articles")
            for i, item in enumerate(news[:3], 1):
                content = item.get("content", {})
                title = content.get("title", "N/A") if content else "N/A"
                print(f"   {i}. {title[:60]}...")
        else:
            print("⚠️ No news returned")

        return bool(news)

    except Exception as e:
        print(f"❌ Yahoo Finance Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_news_tool():
    """Test the get_market_news tool"""
    print("\n" + "=" * 60)
    print("🧪 Testing get_market_news() tool")
    print("=" * 60)

    from agents.tools.news import get_market_news

    try:
        result = get_market_news()

        print(f"\n📊 Status: {result['status']}")
        print(f"📰 Total news fetched: {result['news_count']}")
        print(f"🔧 Source: {result.get('source', 'unknown')}")
        print(f"📈 Tickers scanned: {result.get('tickers_scanned', [])}")

        if result['status'] == 'success' and result['news']:
            print("\n📋 Sample news articles:")
            for i, news in enumerate(result['news'][:5], 1):
                print(f"\n   {i}. {news['title']}")
                print(f"      Source: {news['source']}")
                print(f"      Date: {news['publishedDate']}")
                print(f"      Symbol: {news.get('symbol', 'N/A')}")

        return result['status'] == 'success' and result['news_count'] > 0

    except Exception as e:
        print(f"❌ Tool Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_ticker_news():
    """Test the get_ticker_news tool"""
    print("\n" + "=" * 60)
    print("🧪 Testing get_ticker_news() tool")
    print("=" * 60)

    from agents.tools.news import get_ticker_news

    try:
        result = get_ticker_news("AAPL")

        print(f"\n📊 Status: {result['status']}")
        print(f"📈 Symbol: {result['symbol']}")
        print(f"📰 News count: {result['news_count']}")

        if result['status'] == 'success' and result['news']:
            print("\n📋 AAPL news articles:")
            for i, news in enumerate(result['news'][:3], 1):
                print(f"\n   {i}. {news['title']}")
                print(f"      Source: {news['source']}")

        return result['status'] == 'success'

    except Exception as e:
        print(f"❌ Tool Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_news_agent():
    """Test the full news fetcher agent"""
    print("\n" + "=" * 60)
    print("🧪 Testing News Fetcher Agent")
    print("=" * 60)

    from google.adk.runners import InMemoryRunner
    from google.genai.types import Content, Part
    from agents.agent import news_fetcher_agent

    try:
        runner = InMemoryRunner(agent=news_fetcher_agent, app_name="news_test")

        # Create session
        session = await runner.session_service.create_session(
            app_name="news_test", user_id="tester"
        )

        # Run the agent
        message = Content(
            parts=[Part(text="Fetch and analyze the latest market news. Return the 3-5 most important articles.")],
            role="user",
        )

        print("\n⏳ Running news fetcher agent...")
        response_text = ""

        async for event in runner.run_async(
            user_id="tester", session_id=session.id, new_message=message
        ):
            if hasattr(event, "content") and event.content:
                if hasattr(event.content, "parts"):
                    for part in event.content.parts:
                        if hasattr(part, "text") and part.text:
                            text = part.text.strip()
                            if text and len(text) > 50:
                                response_text = text

        print("\n✅ Agent Response:")
        print("-" * 40)

        # Try to parse as JSON
        try:
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            if json_start != -1 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                parsed = json.loads(json_str)
                print(json.dumps(parsed, indent=2, ensure_ascii=False))

                # Validate output
                selected = parsed.get("selected_news", [])
                print(f"\n📊 Curated {len(selected)} important news articles")
                print(f"📈 Market sentiment: {parsed.get('market_sentiment', 'N/A')}")
                print(f"🏷️ Key themes: {parsed.get('key_themes', [])}")

                return 3 <= len(selected) <= 5
            else:
                print(response_text[:2000])
                return False
        except json.JSONDecodeError:
            print(response_text[:2000])
            return False

    except Exception as e:
        print(f"❌ Agent Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "=" * 60)
    print("🚀 News Agent Test Suite (Yahoo Finance)")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    results = {}

    # Test 1: Yahoo Finance API
    results['yfinance_api'] = test_yfinance_news()

    # Test 2: Market News Tool
    results['market_news_tool'] = test_news_tool()

    # Test 3: Ticker News Tool
    results['ticker_news_tool'] = test_ticker_news()

    # Test 4: Full Agent (async)
    print("\n" + "=" * 60)
    print("🤖 Testing Full Agent Pipeline")
    print("=" * 60)
    results['news_agent'] = asyncio.run(test_news_agent())

    # Summary
    print("\n" + "=" * 60)
    print("📊 Test Summary")
    print("=" * 60)
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"   {test_name}: {status}")

    all_passed = all(results.values())
    print("\n" + ("🎉 All tests passed!" if all_passed else "⚠️ Some tests failed"))

    return 0 if all_passed else 1


if __name__ == "__main__":
    exit(main())
