"""
Macro Agent using Google ADK SequentialAgent
Two-agent system: DataFetcher -> Analyst
"""

import os
import json
import math
import yfinance as yf
import pandas as pd
from datetime import datetime

# Set GOOGLE_GENAI_API_KEY for google-genai library if GOOGLE_API_KEY is set
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import Agent, SequentialAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part


TICKERS = {
    "S&P 500": "^GSPC",
    "Nasdaq": "^IXIC",
    "Dow Jones": "^DJI",
    "VIX": "^VIX",
    "10Y Treasury": "^TNX",
    "US Dollar": "DX-Y.NYB",
    "Gold": "GLD",
    "Oil": "USO",
}


def safe_float(value, default=0.0):
    """Convert to float, handling NaN and None"""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return default
    try:
        result = float(value)
        return default if math.isnan(result) else result
    except (ValueError, TypeError):
        return default


# =============================================================================
# Tool Functions for DataFetcherAgent
# =============================================================================


def get_market_indices() -> dict:
    """
    Fetch current market index data with daily changes.

    Returns:
        dict: Market index data with current values and daily changes
    """
    print("🔧 [TOOL CALLED] get_market_indices()")

    try:
        data = yf.download(list(TICKERS.values()), period="5d", progress=False)

        results = []
        for name, symbol in TICKERS.items():
            try:
                if isinstance(data.columns, pd.MultiIndex):
                    if symbol not in data["Close"].columns:
                        continue
                    series = data["Close"][symbol]
                else:
                    series = data["Close"]

                if not series.empty and len(series) > 0:
                    value = safe_float(series.iloc[-1])
                    prev = safe_float(series.iloc[-2]) if len(series) > 1 else value
                    change = ((value - prev) / prev) * 100 if prev != 0 else 0.0

                    if value > 0:  # Only add valid data
                        results.append(
                            {
                                "name": name,
                                "value": round(value, 2),
                                "previous_value": round(prev, 2),
                                "change_percent": round(change, 2),
                            }
                        )
            except Exception as e:
                print(f"Error fetching {name}: {e}")

        return {"status": "success", "indices": results}
    except Exception as e:
        return {"status": "error", "error": str(e), "indices": []}


def get_market_trends() -> dict:
    """
    Fetch 1-month trend data for each index to analyze longer-term patterns.

    Returns:
        dict: Trend data including 1-week and 1-month performance
    """
    print("🔧 [TOOL CALLED] get_market_trends()")

    try:
        data = yf.download(list(TICKERS.values()), period="1mo", progress=False)

        trends = []
        for name, symbol in TICKERS.items():
            try:
                if isinstance(data.columns, pd.MultiIndex):
                    if symbol not in data["Close"].columns:
                        continue
                    series = data["Close"][symbol].dropna()
                else:
                    series = data["Close"].dropna()

                if len(series) >= 5:
                    current = safe_float(series.iloc[-1])
                    week_ago = (
                        safe_float(series.iloc[-5]) if len(series) >= 5 else current
                    )
                    month_ago = safe_float(series.iloc[0])

                    week_change = (
                        ((current - week_ago) / week_ago) * 100 if week_ago != 0 else 0
                    )
                    month_change = (
                        ((current - month_ago) / month_ago) * 100
                        if month_ago != 0
                        else 0
                    )

                    # Determine trend direction
                    if month_change > 3:
                        trend = "Strongly Bullish"
                    elif month_change > 0:
                        trend = "Bullish"
                    elif month_change > -3:
                        trend = "Bearish"
                    else:
                        trend = "Strongly Bearish"

                    if current > 0:
                        trends.append(
                            {
                                "name": name,
                                "current": round(current, 2),
                                "week_change": round(week_change, 2),
                                "month_change": round(month_change, 2),
                                "trend": trend,
                            }
                        )
            except Exception as e:
                print(f"Error fetching trend for {name}: {e}")

        return {"status": "success", "trends": trends}
    except Exception as e:
        return {"status": "error", "error": str(e), "trends": []}


def get_liquidity_rates() -> dict:
    """
    Fetch liquidity and interest rate related data:
    - Treasury yield curve (3M, 2Y, 5Y, 10Y, 30Y)
    - Yield curve spreads and inversion detection
    - DXY (US Dollar Index) - already in main indices

    Returns:
        dict: Yield curve data with spreads and inversion warning
    """
    print("🔧 [TOOL CALLED] get_liquidity_rates()")

    yield_tickers = {
        "3M": "^IRX",   # 3-Month Treasury Bill
        "5Y": "^FVX",   # 5-Year Treasury
        "10Y": "^TNX",  # 10-Year Treasury
        "30Y": "^TYX",  # 30-Year Treasury
        # Note: 2Y Treasury (^TWO) removed - ticker not working in yfinance
        # Using 10Y-3M spread as primary inversion indicator (more reliable)
    }

    try:
        data = yf.download(
            list(yield_tickers.values()), period="5d", progress=False
        )

        rates = {}
        rate_changes = {}

        for name, symbol in yield_tickers.items():
            try:
                if isinstance(data.columns, pd.MultiIndex):
                    if symbol not in data["Close"].columns:
                        continue
                    series = data["Close"][symbol]
                else:
                    series = data["Close"]

                if not series.empty and len(series) > 0:
                    current = safe_float(series.iloc[-1])
                    prev = safe_float(series.iloc[-2]) if len(series) > 1 else current

                    if current > 0:
                        rates[name] = round(current, 3)
                        rate_changes[name] = round(current - prev, 3)
            except Exception as e:
                print(f"Error fetching {name} yield: {e}")

        # Calculate spreads (using 10Y-3M as primary indicator)
        spread_10y_3m = None
        spread_10y_5y = None
        inversion_warning = False

        if "10Y" in rates and "3M" in rates:
            spread_10y_3m = round(rates["10Y"] - rates["3M"], 3)
        if "10Y" in rates and "5Y" in rates:
            spread_10y_5y = round(rates["10Y"] - rates["5Y"], 3)

        # Check for inversion (10Y-3M is the primary recession indicator)
        if spread_10y_3m is not None and spread_10y_3m < 0:
            inversion_warning = True

        return {
            "status": "success",
            "yield_curve": {
                "rates": rates,
                "changes": rate_changes,
            },
            "spreads": {
                "10y_3m": spread_10y_3m,
                "10y_5y": spread_10y_5y,
                "inversion_warning": inversion_warning,
            },
        }

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "yield_curve": {"rates": {}, "changes": {}},
            "spreads": {"10y_3m": None, "10y_5y": None, "inversion_warning": False},
        }


# =============================================================================
# Agent 1: Data Fetcher Agent
# Fetches market data using tools and outputs structured JSON
# =============================================================================

data_fetcher_agent = Agent(
    name="data_fetcher",
    model="gemini-3-pro-preview",
    description="Fetches current market indices, trends, and liquidity data",
    instruction="""You are a data fetcher agent. Your job is to:

1. Call get_market_indices() to get current market data
2. Call get_market_trends() to get trend analysis data
3. Call get_liquidity_rates() to get yield curve and liquidity data
4. Return the combined data as a structured JSON object

IMPORTANT: You must call ALL THREE tools and return a JSON object with this exact structure:
{
    "indices": [...],       // from get_market_indices
    "trends": [...],        // from get_market_trends
    "liquidity": {...}      // from get_liquidity_rates (yield_curve, spreads)
}

Do not add any commentary. Just return the JSON data.""",
    tools=[get_market_indices, get_market_trends, get_liquidity_rates],
    output_key="market_data",
)


# =============================================================================
# Agent 2: Analyst Agent
# Reads market_data and generates Chinese analysis
# =============================================================================

analyst_agent = Agent(
    name="market_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes market data and provides insights in Chinese",
    instruction="""你是一位资深的财经科普作者，擅长把复杂的市场信息用通俗易懂的语言解释给普通投资者。
你的目标是帮助读者**理解**市场正在发生什么，以及背后的逻辑，而不是告诉他们该买什么卖什么。

市场数据: {market_data}

请撰写一份市场解读报告，让没有金融背景的读者也能看懂。

---

## 简要分析
(用3-4句最简单的话概括今天的市场)

用一个比喻描述今天市场的"情绪"，例如：
- "今天市场像是打了鸡血，投资者抢着买入"
- "今天市场比较纠结，涨涨跌跌拿不定主意"
- "今天市场有点慌，大家都在观望"

然后回答：
- 最值得关注的一个变化是什么？（用一句话说清楚）
- 整体来看，现在是乐观期、平稳期、还是谨慎期？

---

## 深度分析

### 一、今天市场发生了什么？

**股市表现一览：**
- 用最直白的语言描述三大指数（S&P 500、纳斯达克、道琼斯）今天和最近一周的表现
- 谁涨得最好？谁相对落后？这说明什么？
  - 纳斯达克领涨 → 科技股受追捧，通常意味着投资者对未来比较乐观
  - 道琼斯领涨 → 传统蓝筹更受青睐，可能意味着资金在寻求稳定
- 把周涨跌幅和月涨跌幅对比，判断：是在反弹？还是在回调？还是趋势延续？

**恐慌指数VIX——市场的"情绪温度计"：**
（先解释）VIX指数衡量的是市场的紧张程度，数字越高说明投资者越担心后市会大跌。
- VIX < 15：市场非常乐观，甚至可能有点"太嗨了"
- VIX 15-20：正常水平，市场比较平静
- VIX 20-30：有点紧张，投资者开始担心
- VIX > 30：恐慌模式，市场剧烈波动

现在VIX是多少？处于什么区间？最近是在上升还是下降？这告诉我们什么？

**各类资产之间的关系——读懂市场的"潜台词"：**
今天股票、债券、美元、黄金、石油是同涨同跌，还是有分化？
- 如果股票涨+黄金跌+美元稳 → 典型的"风险偏好"模式，投资者敢于冒险
- 如果股票涨+黄金也涨 → 比较少见，可能是美元走弱推动的，或者有特殊原因
- 如果股票跌+黄金涨 → 典型的"避险"模式，投资者在躲风险

用数据解释今天属于哪种模式，以及为什么。

### 二、利率环境——经济的"体温表"

**什么是收益率曲线？为什么要关注？**
（用比喻解释）收益率曲线就像银行存款，正常情况下存3个月拿的利息应该比存10年少，因为时间越长风险越大。
- **正常曲线**（短期利率 < 长期利率）：经济健康，一切正常
- **平坦曲线**（短期≈长期）：经济可能在放缓，需要警惕
- **倒挂曲线**（短期 > 长期）：这是历史上预测经济衰退最准的指标之一

当前的收益率曲线是什么形态？
- 3个月期国债利率是多少？
- 10年期国债利率是多少？
- 两者之差（利差）是正还是负？数值是多少？
- inversion_warning 是 true 还是 false？如果是 true，要特别强调这个警示信号。

**这对普通人意味着什么？**
- 利率上升 → 房贷更贵、企业借钱成本更高、存款收益也更高
- 利率下降 → 房贷变便宜、企业更愿意扩张、但存款收益也变少

### 三、美元和大宗商品——全球经济的"晴雨表"

**美元指数（DXY）——全球资金的风向标：**
（解释）美元指数衡量美元相对于其他主要货币的强弱。
- 美元走强 → 通常意味着全球资金流向美国，可能压制其他市场
- 美元走弱 → 资金可能流向新兴市场和大宗商品

现在美元指数是多少？100是一个心理关口，在上方还是下方？最近的趋势是走强还是走弱？

**黄金——避风港还是抗通胀工具？**
黄金通常在两种情况下上涨：1）市场恐慌时作为避险资产；2）担心货币贬值/通胀时作为保值工具。
根据今天的数据，黄金是在涨还是跌？结合VIX和美元的走势，判断黄金上涨是因为避险还是其他原因。

**石油——经济活动的温度计：**
油价通常反映经济活力——经济好→需求多→油价涨；经济差→需求少→油价跌。
但也可能受到供给因素影响（如产油国减产）。
当前油价走势如何？月度趋势是涨是跌？这暗示了什么？

### 四、接下来可能会怎样？

**市场可能的几种走向：**
（注意：这是分析可能性，不是预测，更不是投资建议）

根据当前的数据，分析：
- **最可能的情况**：延续当前趋势还是出现转折？为什么？
- **需要关注的变化**：什么信号出现会改变当前的格局？
  - 例如：VIX如果突然上升意味着什么
  - 例如：10年期利率如果突破某个水平意味着什么
  - 例如：美元如果继续走弱/走强意味着什么

**未来一周值得关注的事情：**
- 列出2-3个可能影响市场的关键观察点（可以是技术指标的关键位置，也可以是宏观事件）
- 解释为什么这些点值得关注

### 五、总结：用一段话说清楚

用最通俗的语言，像给朋友解释一样，总结今天市场的核心状态：
- 市场现在是什么"心情"？
- 最重要的一两个看点是什么？
- 当前环境对普通投资者来说，是应该更积极还是更谨慎的时期？（注意：只说环境判断，不给具体操作建议）

---

**写作原则：**
1. 分析必须完全基于提供的数据，不编造数字
2. 每个专业术语第一次出现时都要用通俗语言解释
3. 多用比喻和类比帮助理解（如"温度计"、"晴雨表"等）
4. 重点是帮助读者**理解**市场，而不是告诉他们**怎么做**
5. 不要给出任何具体的买卖建议、仓位建议、或具体操作建议
6. 语气要专业但亲和，像一个懂行的朋友在解释市场
7. 可以给出明确的环境判断（如"现在是谨慎期"），但不要说"你应该..."
8. 关键英文术语保留，但要配中文解释""",
    output_key="analysis",
)


# =============================================================================
# Sequential Agent: Orchestrates DataFetcher -> Analyst
# =============================================================================

macro_pipeline_agent = SequentialAgent(
    name="macro_analysis_pipeline",
    description="A sequential pipeline that fetches market data then analyzes it",
    sub_agents=[data_fetcher_agent, analyst_agent],
)


# =============================================================================
# MacroAgent Wrapper Class
# =============================================================================


class MacroAgent:
    """Wrapper class to run the ADK macro pipeline agent"""

    def __init__(self, client=None):
        self.runner = InMemoryRunner(agent=macro_pipeline_agent, app_name="stock_agent")

    async def analyze(self) -> dict:
        """Run macro analysis pipeline and return data with analysis."""
        try:
            # Create session
            session = await self.runner.session_service.create_session(
                app_name="stock_agent", user_id="analyst"
            )

            # Run the sequential pipeline
            message = Content(
                parts=[
                    Part(
                        text="Fetch current market data and provide a comprehensive analysis."
                    )
                ],
                role="user",
            )

            response_text = ""

            async for event in self.runner.run_async(
                user_id="analyst", session_id=session.id, new_message=message
            ):
                # Collect text output from events - the last meaningful text
                # will be from the analyst_agent
                if hasattr(event, "content") and event.content:
                    if hasattr(event.content, "parts"):
                        for part in event.content.parts:
                            if hasattr(part, "text") and part.text:
                                # Keep the latest substantial text (analysis)
                                text = part.text.strip()
                                if text and len(text) > 50:  # Skip short responses
                                    response_text = text

            # Always fetch fresh data for the response to ensure consistency
            market_data = get_market_indices()
            trend_data = get_market_trends()
            liquidity_data = get_liquidity_rates()

            indices = market_data.get("indices", [])
            trends = trend_data.get("trends", [])

            # Parse the response to extract short and in-depth analysis
            short_analysis, in_depth_analysis = self._parse_analysis(response_text)

            return {
                "indices": indices,
                "trends": trends,
                "liquidity": {
                    "yield_curve": liquidity_data.get("yield_curve", {}),
                    "spreads": liquidity_data.get("spreads", {}),
                },
                "timestamp": datetime.now().isoformat(),
                "short_analysis": short_analysis,
                "in_depth_analysis": in_depth_analysis,
            }

        except Exception as e:
            print(f"Error in macro analysis: {e}")
            import traceback

            traceback.print_exc()

            # Fallback: return just the raw data
            market_data = get_market_indices()
            trend_data = get_market_trends()
            liquidity_data = get_liquidity_rates()
            return {
                "indices": market_data.get("indices", []),
                "trends": trend_data.get("trends", []),
                "liquidity": {
                    "yield_curve": liquidity_data.get("yield_curve", {}),
                    "spreads": liquidity_data.get("spreads", {}),
                },
                "timestamp": datetime.now().isoformat(),
                "short_analysis": f"Data fetched (pipeline error: {str(e)[:100]})",
                "in_depth_analysis": "",
            }

    def _parse_analysis(self, text: str) -> tuple[str, str]:
        """Parse the agent response into short and in-depth analysis"""
        if not text:
            return "No analysis available.", ""

        text = text.strip()

        # Try to find section markers (Chinese and English)
        short_markers = [
            "简要分析",
            "**简要分析**",
            "## 简要分析",
            "SHORT ANALYSIS",
            "**SHORT ANALYSIS**",
        ]
        depth_markers = [
            "深度分析",
            "**深度分析**",
            "## 深度分析",
            "IN-DEPTH ANALYSIS",
            "**IN-DEPTH ANALYSIS**",
        ]

        short_start = -1
        depth_start = -1

        for marker in short_markers:
            idx = text.upper().find(marker.upper())
            if idx != -1:
                short_start = idx + len(marker)
                break

        for marker in depth_markers:
            idx = text.upper().find(marker.upper())
            if idx != -1:
                depth_start = idx + len(marker)
                break

        if short_start != -1 and depth_start != -1:
            short_analysis = text[
                short_start : text.upper().find(depth_markers[0].upper())
            ].strip()
            in_depth_analysis = text[depth_start:].strip()
        elif depth_start != -1:
            short_analysis = text[: text.upper().find(depth_markers[0].upper())].strip()
            in_depth_analysis = text[depth_start:].strip()
        else:
            # No markers found - split by paragraphs
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            if len(paragraphs) >= 2:
                short_analysis = paragraphs[0]
                in_depth_analysis = "\n\n".join(paragraphs[1:])
            else:
                short_analysis = text[:500] if len(text) > 500 else text
                in_depth_analysis = text[500:] if len(text) > 500 else ""

        # Clean up any remaining markers
        for marker in short_markers + depth_markers:
            short_analysis = short_analysis.replace(marker, "").replace(
                marker.upper(), ""
            )
            in_depth_analysis = in_depth_analysis.replace(marker, "").replace(
                marker.upper(), ""
            )

        return short_analysis.strip(": \n"), in_depth_analysis.strip(": \n")
