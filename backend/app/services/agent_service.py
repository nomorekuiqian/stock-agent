import os
import asyncio
from dotenv import load_dotenv
from google import genai
from google.genai import types
from app.services.stock_service import StockDataService
from app.models.request_models import FundamentalData, TechnicalData, SentimentData, EarningsData, RiskData, MacroData
from app.services.fmp_service import FMPService

load_dotenv()

class AgentService:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable not set")
        self.client = genai.Client(api_key=api_key)
        self.fmp_service = FMPService()

    async def _generate_analysis(self, ticker: str, prompt: str, schema_class):
        try:
            # Get schema info to guide the prompt
            schema = schema_class.model_json_schema()
            properties = schema.get('properties', {})
            
            # Build detailed JSON structure description
            json_structure = "{\n"
            for field_name, field_info in properties.items():
                field_type = field_info.get('type', 'string')
                description = field_info.get('description', '')
                json_structure += f'  "{field_name}": <{field_type}> // {description}\n'
            json_structure += "}"
            
            # Construct a comprehensive prompt with JSON output requirement
            full_prompt = f"""Analyze the stock ticker: {ticker}

{prompt}

IMPORTANT: You MUST use Google Search to find the latest, real-time information about this stock.

Search for:
- Current stock price and market data
- Recent financial reports and earnings
- Technical indicators (RSI, MACD, moving averages)
- Analyst ratings and price targets
- Recent news and sentiment
- Risk metrics and volatility data

Return your analysis in the following JSON format (no markdown, just pure JSON):
{json_structure}

Return ONLY the JSON object, no explanations or markdown formatting."""
            
            # Enable both Search and Code Execution (gemini-2.5-pro supports both simultaneously)
            tools = [
                types.Tool(google_search=types.GoogleSearch()),
                types.Tool(code_execution=types.ToolCodeExecution())
            ]

            response = await self.client.aio.models.generate_content(
                model="gemini-2.5-pro",
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    tools=tools,
                    temperature=0.1
                )
            )
            
            # Extract text and parse JSON
            response_text = response.text.strip()
            
            # Clean up potential markdown formatting
            if response_text.startswith('```'):
                lines = response_text.split('\n')
                response_text = '\n'.join(lines[1:-1]) if len(lines) > 2 else response_text
                response_text = response_text.replace('```json', '').replace('```', '').strip()
            
            # Parse JSON
            import json
            data = json.loads(response_text)
            
            # Clean up data to match expected schema
            # Convert details objects to strings if needed
            if 'details' in data and isinstance(data['details'], list):
                cleaned_details = []
                for item in data['details']:
                    if isinstance(item, dict):
                        # Convert dict to readable string
                        if 'metric' in item and 'value' in item:
                            cleaned_details.append(f"{item['metric']}: {item['value']}")
                        else:
                            cleaned_details.append(str(item))
                    else:
                        cleaned_details.append(str(item))
                data['details'] = cleaned_details
            
            # Convert news_summary objects to strings if needed
            if 'news_summary' in data and isinstance(data['news_summary'], list):
                cleaned_news = []
                for item in data['news_summary']:
                    if isinstance(item, dict):
                        # Extract headline or title
                        news_text = item.get('headline') or item.get('title') or item.get('summary') or str(item)
                        cleaned_news.append(news_text)
                    else:
                        cleaned_news.append(str(item))
                data['news_summary'] = cleaned_news
            
            # Validate with Pydantic
            return schema_class(**data)
            
        except Exception as e:
            print(f"Error generating analysis for {ticker}: {e}")
            print(f"Error type: {type(e).__name__}")
            # 打印详细错误信息以便调试
            import traceback
            traceback.print_exc()
            return None

    async def _analyze_macro(self):
        return await self._generate_analysis(
            "MARKET_MACRO",
            """You are a Macro Economic Analyst.
            
            OBJECTIVE: Analyze the current global market environment to determine if it is Risk-on, Risk-off, or Neutral.
            
            INPUTS TO ANALYZE (Search for these):
            - US 10-Year Treasury Yield (Trend & Level)
            - US Dollar Index (DXY)
            - VIX (Volatility Index)
            - Major Indices (S&P 500, Nasdaq) performance today
            - Key Economic Events (Fed meetings, CPI/PPI data, Jobs reports)
            
            OUTPUT REQUIREMENTS:
            - market_status: "Risk-on", "Risk-off", or "Neutral"
            - key_factors: Top 3 drivers of today's market action
            - context_param: A concise JSON summary to be passed to stock-specific agents. Example: {"sentiment": "bearish", "focus": "inflation", "yield_impact": "negative"}
            """,
            MacroData
        )

    async def _synthesize_report(self, ticker: str, macro_data: MacroData, fund: FundamentalData, tech: TechnicalData, sent: SentimentData, earn: EarningsData, risk: RiskData):
        prompt = f"""You are the Chief Investment Officer (CIO) and Orchestrator of an AI Stock Analysis System.
        
        OBJECTIVE: Synthesize the reports from multiple specialized agents into a cohesive, professional summary for the user.
        
        INPUTS:
        1. MACRO CONTEXT: {macro_data.market_status} - {macro_data.context_param}
        2. FUNDAMENTAL: Valuation={fund.valuation_score}, Growth={fund.growth_score}. {fund.summary}
        3. TECHNICAL: Trend={tech.trend}. {tech.summary}
        4. SENTIMENT: Score={sent.score} ({sent.label}).
        5. EARNINGS: {earn.summary}
        6. RISK: {risk.key_risks}

        RULES:
        1. **Conflict Resolution**: If News is positive but Technical is negative, explicitly point out the divergence.
        2. **Macro Dominance**: If Macro is "Risk-off" or negative, start the summary by warning about the headwinds.
        3. **Tone**: Professional, objective, data-driven. NO financial advice.
        4. **Length**: 2-3 concise paragraphs.
        
        OUTPUT: A single string containing the synthesized analysis.
        """
        
        response = await self.client.aio.models.generate_content(
            model="gemini-2.5-pro",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2
            )
        )
        return response.text.strip()

    async def analyze_multidimensional(self, ticker: str):
        # 0. Macro Analysis (First Step)
        macro_data = await self._analyze_macro()
        if not macro_data:
            macro_data = MacroData(market_status="Neutral", key_factors=["Data Unavailable"], context_param="{}")

        macro_context_str = f"MACRO CONTEXT: Market is {macro_data.market_status}. Key Factors: {macro_data.key_factors}. Context: {macro_data.context_param}"

        # 1. Fundamental Analysis
        fund_task = self._generate_analysis(
            ticker,
            f"""You are a Senior Equity Research Analyst conducting fundamental analysis.
            
            {macro_context_str}
            
            FRAMEWORK - Apply the following systematic approach:
            1. **Business Quality Assessment**
               - Core business model and competitive advantages (moat analysis)
               - Revenue streams diversification and sustainability
               - Management quality and capital allocation track record
            
            2. **Financial Health Evaluation**
               - Profitability metrics: Gross margin, Operating margin, Net margin, ROE, ROIC
               - Valuation multiples: P/E (trailing & forward), PEG, P/S, P/B, EV/EBITDA
               - Growth metrics: Revenue growth (YoY, QoQ), EPS growth, Free cash flow growth
               - Balance sheet strength: Debt-to-Equity, Current ratio, Cash position
            
            3. **Forward-Looking Analysis**
               - Latest quarterly earnings results and guidance
               - Analyst consensus estimates and any recent upgrades/downgrades
               - Upcoming catalysts (product launches, regulatory decisions, etc.)
            
            SEARCH REQUIREMENTS:
            - Use Google Search to find the latest quarterly earnings report
            - Search for recent analyst reports and price targets
            - Look up current financial ratios from major financial sites (Yahoo Finance, Bloomberg, MarketWatch)
            
            SCORING METHODOLOGY:
            - **Valuation Score (0-10)**: Compare P/E to sector average, historical P/E range, and PEG ratio. Score 8-10 if undervalued, 5-7 if fairly valued, 0-4 if overvalued.
            - **Growth Score (0-10)**: Based on revenue/earnings CAGR. Score 8-10 for >20% growth, 5-7 for 10-20%, 0-4 for <10%.
            
            OUTPUT: Return a detailed yet concise analysis.""",
            FundamentalData
        )

        # 2. Technical Analysis
        tech_task = self._generate_analysis(
            ticker,
            f"""You are a Chartered Market Technician (CMT) conducting technical analysis.
            
            {macro_context_str}
            
            FRAMEWORK - Multi-timeframe price action analysis:
            1. **Trend Identification**
               - Primary trend: Analyze major moving averages (50-day, 200-day)
               - Current price position relative to key MAs
               - Support/Resistance levels (historical pivot points, volume nodes)
            
            2. **Momentum & Strength**
               - RSI (Relative Strength Index) - overbought/oversold conditions
               - MACD signal and histogram
               - Volume analysis: Recent volume vs average, unusual volume spikes
            
            3. **Pattern Recognition**
               - Chart patterns: Head & Shoulders, Double Top/Bottom, Triangles, Channels
               - Candlestick patterns from recent sessions
               - Breakout or breakdown scenarios
            
            4. **Key Technical Levels**
               - Immediate support levels (with price points)
               - Immediate resistance levels (with price points)
               - Critical price zones that could trigger institutional trading
            
            SEARCH REQUIREMENTS:
            - Search for the latest stock chart and technical analysis from TradingView, StockCharts, or Finviz
            - Look up current price, 52-week high/low, and recent price action
            - Find any technical analyst commentaries or breakout alerts
            - Get specific values for RSI, MACD, moving averages
            
            REQUIRED DATA POINTS - Be VERY SPECIFIC with numbers:
            - current_price: "Current price is $XXX.XX"
            - ma_50: "50-day MA is $XXX.XX (price is X% above/below)"
            - ma_200: "200-day MA is $XXX.XX (price is X% above/below)"
            - rsi: "RSI is XX (overbought/neutral/oversold)"
            - macd: "MACD is bullish/bearish, histogram is positive/negative"
            - volume_analysis: "Volume is X% above/below average, recent unusual activity: [yes/no]"
            - support: "$XXX.XX (recent low / Fibonacci level / previous resistance)"
            - resistance: "$XXX.XX (recent high / psychological level / previous resistance)"
            - key_levels: List 2-3 additional critical price levels with context
            
            CLASSIFICATION:
            - **Bullish**: Price above key MAs, RSI 45-70, recent higher highs/higher lows
            - **Bearish**: Price below key MAs, RSI 30-55, recent lower highs/lower lows
            - **Neutral**: Consolidating, mixed signals, trading in a range
            
            OUTPUT: Provide actionable technical insights with SPECIFIC NUMBERS for every indicator.""",
            TechnicalData
        )

        # 3. Sentiment/News Analysis
        sent_task = self._generate_analysis(
            ticker,
            f"""You are a Market Sentiment Analyst specializing in behavioral finance and news impact assessment.
            
            {macro_context_str}
            
            FRAMEWORK - Holistic sentiment evaluation:
            1. **News Sentiment Analysis**
               - Find the 5-10 most recent and impactful news stories (within last 7-14 days)
               - Categorize each: Earnings, Product/Service, Legal/Regulatory, M&A, Macroeconomic
               - Assess tone: Positive, Neutral, or Negative
               - Evaluate market impact: High, Medium, Low
            
            2. **Market Positioning & Flows**
               - Institutional buying/selling patterns (if available)
               - Options market activity (unusual call/put volume, put/call ratio)
               - Short interest level and recent changes
               - Social media buzz and retail investor sentiment
            
            3. **Fear & Greed Assessment**
               - Aggregate the sentiment signals into a quantitative score
               - 0-30: Extreme Fear (panic selling, capitulation)
               - 31-45: Fear (pessimism, risk-off)
               - 46-55: Neutral (balanced, waiting for catalyst)
               - 56-70: Greed (optimism, FOMO building)
               - 71-100: Extreme Greed (euphoria, potential top)
            
            SEARCH REQUIREMENTS:
            - Search Google News for ALL the latest stories about this stock (last 7-14 days)
            - Look for recent press releases and earnings call transcripts
            - Search for social sentiment data (StockTwits, Reddit mentions if relevant)
            - Find any recent analyst upgrades/downgrades
            - Check for any major institutional moves or insider trading
            
            SENTIMENT LABEL:
            - Score 0-30: Label = "Fear"
            - Score 31-55: Label = "Neutral"
            - Score 56-100: Label = "Greed"
            
            NEWS SUMMARY: Provide 5-10 news items, each formatted as: "[Date] - [Headline/Summary]" (under 120 characters each).
            Include a mix of:
            - Recent earnings or financial results
            - Product announcements or updates
            - Analyst ratings changes
            - Industry trends or competitive news
            - Any material events (lawsuits, partnerships, etc.)
            
            OUTPUT: Comprehensive sentiment picture with ALL recent news.""",
            SentimentData
        )

        # 4. Risk Management Analysis
        risk_task = self._generate_analysis(
            ticker,
            f"""You are a Professional Risk Manager specializing in quantitative risk assessment and portfolio management.
            
            {macro_context_str}
            
            FRAMEWORK - Quantitative Risk Analysis:
            
            1. **Volatility & Market Risk**
               - Calculate or find historical volatility (30-day, 90-day)
               - Beta coefficient relative to S&P 500
               - Correlation with market indices
               - Standard deviation of returns
            
            2. **Downside Risk Assessment**
               - Maximum historical drawdown (peak to trough)
               - Value at Risk (VaR) at 95% confidence level
               - Expected shortfall / Conditional VaR
               - Tail risk indicators
            
            3. **Position Sizing & Capital Allocation**
               - Kelly Criterion or similar position sizing method
               - Recommend position size as % of total portfolio
               - Consider volatility-adjusted sizing
               - Account concentration limits
            
            4. **Stop Loss & Risk Management**
               - Technical stop loss level (support-based)
               - Percentage-based stop loss (-X%)
               - ATR-based stop loss
               - Maximum acceptable loss in dollars
            
            5. **Risk/Reward Analysis**
               - Calculate Risk/Reward ratio
               - Win rate required for profitability
               - Expected value calculation
               - Asymmetric risk profile
            
            SEARCH & COMPUTE REQUIREMENTS:
            - Use Google Search to find current price, historical volatility, beta
            - Use Code Execution to calculate:
              * VaR from historical price data
              * Sharpe ratio
              * Maximum drawdown
              * Optimal position size
              * Stop loss levels
            
            QUANTIFICATION - Be SPECIFIC with numbers:
            - volatility: "Historical volatility (30d): X% annualized"
            - beta: "Beta vs S&P 500: X.XX (higher/lower volatility than market)"
            - max_drawdown: "Max drawdown in past 12 months: -X% (from $Y to $Z)"
            - var_95: "95% VaR (1-month): -X% (you could lose up to $Y on a $10,000 position)"
            - stop_loss: "$XXX (-X% from entry) - Place stop below key support at $XXX"
            - position_size: "Recommended: X% of portfolio (max $Y for $10k portfolio) due to X% volatility"
            - risk_reward_ratio: "R/R = 1:X (Risk X%, Target Y%)"
            - key_risks: List 2-3 risks with QUANTIFIED impact:
              * "If market drops 10%, this stock likely drops X% (Beta=X.X)"
              * "Liquidity risk: Average daily volume $XM, may be hard to exit large positions"
              * "Earnings in X days: volatility typically spikes X%"
            
            PROFESSIONAL GUIDELINES:
            - A good R/R ratio is at least 1:2 (preferably 1:3)
            - Position size should be inversely proportional to volatility
            - Never risk more than 1-2% of total portfolio on a single trade
            - VaR should account for realistic market conditions
            
            OUTPUT: Provide actionable, quantified risk metrics for portfolio construction.""",
            RiskData
        )

        # 5. Earnings Report Analysis (using Google Search)
        earnings_task = self._generate_analysis(
            ticker,
            f"""You are a Professional Earnings Report Analyst specialized in analyzing quarterly and annual financial reports.
            
            {macro_context_str}
            
            FRAMEWORK - Comprehensive Earnings Analysis:
            
            1. **Revenue Performance**
               - Find the latest quarterly revenue (Q4 2024 or most recent)
               - Calculate YoY (Year-over-Year) growth percentage
               - Analyze revenue trend over the last 3-4 quarters
               - Compare actual revenue vs analyst estimates (beat/meet/miss)
            
            2. **Earnings Per Share (EPS)**
               - Latest EPS (GAAP and/or adjusted)
               - EPS vs analyst consensus estimates
               - Beat/Meet/Miss by how much? (in dollars and percentage)
               - EPS trend over recent quarters
            
            3. **Profitability Metrics**
               - Net income and profit margin
               - Operating margin trends
               - Gross margin analysis
               - Compare margins to previous quarters and competitors
            
            4. **Forward Guidance**
               - Management's guidance for next quarter/fiscal year
               - Revenue guidance range
               - EPS guidance
               - Compare guidance to Wall Street consensus
               - Assess if guidance is conservative or aggressive
            
            5. **Key Highlights & Concerns**
               - Identify 2-3 POSITIVE highlights from the earnings:
                 * Strong segment growth (e.g., cloud revenue +30%)
                 * Market share gains
                 * New product success
                 * Margin expansion
               - Identify 2-3 CONCERNS or red flags:
                 * Slowing growth in key segments
                 * Margin compression
                 * Weak guidance
                 * Rising costs
                 * Inventory issues
            
            SEARCH REQUIREMENTS:
            - Search: "{ticker} latest earnings report Q4 2024"
            - Search: "{ticker} quarterly results revenue EPS"
            - Search: "{ticker} earnings beat miss estimates"
            - Search: "{ticker} management guidance forecast"
            - Search: "{ticker} earnings call highlights"
            - Look for: SEC 8-K filings, press releases, analyst reactions
            
            DATA REQUIREMENTS - Be SPECIFIC with numbers:
            - revenue: "Q4 2024 revenue: $XX.X B (YoY +X.X% / -X.X%)"
            - revenue_trend: "Revenue grew X consecutive quarters, CAGR X%"
            - eps: "EPS $X.XX (GAAP) / $X.XX (adjusted), beat estimates by $X.XX (X%)"
            - net_income: "Net income $X.X B (margin X.X%), vs $X.X B prior year"
            - guidance: "Q1 2025 revenue guidance $XX-XX B (consensus: $XX B), EPS $X.XX-X.XX"
            - beat_or_miss: "Beat" / "Meet" / "Miss"
            - highlights: List 2-3 specific positive datapoints with numbers
            - concerns: List 2-3 specific concerns with impact quantification
            
            SUMMARY: One concise sentence capturing the earnings quality and investor reaction.
            
            OUTPUT: Provide actionable insights based on the ACTUAL latest earnings data.""",
            EarningsData
        )

        results = await asyncio.gather(fund_task, tech_task, sent_task, earnings_task, risk_task)
        
        fund_data = results[0]
        tech_data = results[1]
        sent_data = results[2]
        earnings_data = results[3]
        risk_data = results[4]

        # Fallback if any failed
        if not fund_data: 
            fund_data = FundamentalData(valuation_score=5, growth_score=5, summary="Error fetching data", details=[])
        if not tech_data: 
            tech_data = TechnicalData(trend="Neutral", current_price="N/A", ma_50="N/A", ma_200="N/A", rsi="N/A", macd="N/A", volume_analysis="N/A", support="N/A", resistance="N/A", key_levels=[], summary="Error fetching data")
        if not sent_data: 
            sent_data = SentimentData(score=50, label="Neutral", news_summary=[])
        if not earnings_data:
            earnings_data = EarningsData(revenue="N/A", revenue_trend="N/A", eps="N/A", net_income="N/A", guidance="N/A", beat_or_miss="N/A", highlights=[], concerns=[], summary="Error fetching earnings data")
        if not risk_data: 
            risk_data = RiskData(volatility="N/A", beta="N/A", max_drawdown="N/A", var_95="N/A", stop_loss="N/A", position_size="N/A", risk_reward_ratio="N/A", key_risks=[])

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

        # Synthesize results
        synthesis_text = await self._synthesize_report(ticker, macro_data, fund_data, tech_data, sent_data, earnings_data, risk_data)

        return {
            "ticker": ticker,
            "current_price": price,
            "overall_score": overall_score,
            "signal": signal,
            "synthesis": synthesis_text,
            "macro_context": macro_data.model_dump(),
            "fundamental": fund_data.model_dump(),
            "technical": tech_data.model_dump(),
            "sentiment": sent_data.model_dump(),
            "earnings": earnings_data.model_dump(),
            "risk": risk_data.model_dump()
        }
