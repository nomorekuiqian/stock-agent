import os
import asyncio
from dotenv import load_dotenv
from google import genai
from google.genai import types
from app.services.stock_service import StockDataService
from app.models.request_models import FundamentalData, TechnicalData, SentimentData, SkepticData

load_dotenv()

class AgentService:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable not set")
        self.client = genai.Client(api_key=api_key)

    async def _generate_analysis(self, ticker: str, prompt: str, schema_class):
        try:
            # Construct a comprehensive prompt
            full_prompt = f"Analyze {ticker}. {prompt}"
            
            # Google Search tool config
            google_search_tool = types.Tool(
                google_search=types.GoogleSearch()
            )

            response = await self.client.aio.models.generate_content(
                model="gemini-3-pro-preview",
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    tools=[google_search_tool],
                    response_mime_type="application/json",
                    response_schema=schema_class,
                    temperature=0.1
                )
            )
            
            return response.parsed
        except Exception as e:
            print(f"Error generating analysis for {ticker}: {e}")
            return None

    async def analyze_multidimensional(self, ticker: str):
        # 1. Fundamental Analysis
        fund_task = self._generate_analysis(
            ticker,
            "Act as a Fundamental Analysis Expert. Focus on financial statements, earnings, P/E ratios, market cap, and business models. Use Google Search to find the latest data.",
            FundamentalData
        )

        # 2. Technical Analysis
        tech_task = self._generate_analysis(
            ticker,
            "Act as a Technical Analysis Expert. Focus on price action, trends, support/resistance levels. Use Google Search to find recent chart patterns and price data.",
            TechnicalData
        )

        # 3. Sentiment/News Analysis
        sent_task = self._generate_analysis(
            ticker,
            "Act as a News & Sentiment Analyst. Search for the latest news and determine the market sentiment (Fear vs Greed). Provide a score (0-100) and label.",
            SentimentData
        )

        # 4. Skeptic Analysis
        skep_task = self._generate_analysis(
            ticker,
            "Act as a Skeptic / Devil's Advocate. Find the biggest downside risks, bear cases, and reasons NOT to buy this stock.",
            SkepticData
        )

        results = await asyncio.gather(fund_task, tech_task, sent_task, skep_task)
        
        fund_data = results[0]
        tech_data = results[1]
        sent_data = results[2]
        skep_data = results[3]

        # Fallback if any failed
        if not fund_data: 
            fund_data = FundamentalData(valuation_score=5, growth_score=5, summary="Error fetching data", details=[])
        if not tech_data: 
            tech_data = TechnicalData(trend="Neutral", support="N/A", resistance="N/A", summary="Error fetching data")
        if not sent_data: 
            sent_data = SentimentData(score=50, label="Neutral", news_summary=[])
        if not skep_data: 
            skep_data = SkepticData(bear_case="Error fetching data", risks=[])

        # Calculate overall score
        overall_score = int((fund_data.valuation_score + fund_data.growth_score + (sent_data.score / 10)) / 3)
        
        # Determine signal
        if overall_score >= 7:
            signal = "Bullish"
        elif overall_score <= 3:
            signal = "Bearish"
        else:
            signal = "Neutral"

        # Get current price
        price = StockDataService.get_stock_price(ticker) or 0.0

        return {
            "ticker": ticker,
            "current_price": price,
            "overall_score": overall_score,
            "signal": signal,
            "fundamental": fund_data.model_dump(),
            "technical": tech_data.model_dump(),
            "sentiment": sent_data.model_dump(),
            "skeptic": skep_data.model_dump()
        }
