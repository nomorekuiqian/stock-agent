"""
Macro Agent using Google ADK with SequentialAgent Pipeline

Architecture:
    ┌─────────────────────────┐
    │   DataNewsFetcher       │
    │  (market_data + news)   │
    └───────────┬─────────────┘
                │
                ▼
    ┌─────────────────────────┐
    │      Analyst            │
    │   (综合分析报告)         │
    └─────────────────────────┘
"""

import os
from datetime import datetime

# Load environment variables FIRST before any other imports
from dotenv import load_dotenv

load_dotenv()

# Set GOOGLE_GENAI_API_KEY for google-genai library if GOOGLE_API_KEY is set
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import Agent, SequentialAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

# Import tools
from agents.tools import get_all_market_data
from agents.tools.news import get_combined_market_news


# =============================================================================
# Agent Definitions
# =============================================================================

# Data + News Fetcher Agent - fetches both market data and news
data_news_fetcher_agent = Agent(
    name="data_news_fetcher",
    model="gemini-3-pro-preview",
    description="Fetches market data and news",
    instruction="""Fetch and return market data in simplified format:

1. Call get_all_market_data() - return the full result
2. Call get_combined_market_news() - for each news item, include:
   - title
   - text (summary)
   - source
   - symbol
   - url (important: include the news link)

Output as JSON:
{
  "market_data": <full market data from tool>,
  "news": [{"title": "...", "text": "...", "source": "...", "symbol": "...", "url": "..."}]
}""",
    tools=[get_all_market_data, get_combined_market_news],
    output_key="fetched_data",
)

# Analyst Agent - analyzes combined data and news
ANALYST_INSTRUCTION = """# 你的身份
你是一位在社交媒体上拥有百万粉丝的财经博主，以"让金融小白秒懂市场"著称。
你的内容风格：专业但不装、有趣但不浮夸、直白但有深度。

# 你的读者
- 零基础的普通投资者
- 刷手机时偶然看到你的内容
- 注意力有限，需要清晰的结构和有趣的表达

# 输入数据
{fetched_data}

**数据字段说明**：
- `report_date`: 报告日期和星期几（用于"短期前瞻"板块）
- `equities`: 股票指数数据（S&P 500, Nasdaq, Dow Jones, QQQ）
- `volatility.VIX`: 恐惧指数
- `rates.yield_curve`: 收益率曲线（各期限利率）
- `rates.spreads.10y_3m`: 10年-3个月利差（负数=倒挂）
- `credit.HYG/LQD`: 高收益债/投资级债 ETF
- `credit.hyg_lqd_spread`: 信用利差
- `financials.XLF/KRE`: 金融板块/区域银行 ETF
- `commodities.Gold/Oil`: 黄金/原油
- `currencies.US Dollar`: 美元指数
- `news`: 市场新闻列表

---

# 输出结构（严格按照以下5个板块输出）

## 一、市场总览

用一段吸引人的话概括今日市场全貌：
- 开头必须是一句能当社交媒体标题的金句（反直觉洞察/生活化比喻/数字冲击）
- 然后用2-3句话描述今日市场整体表现：股市、债市、商品、汇率的核心走势
- 点出今天最值得关注的一件事

**示例金句风格**：
- "华尔街恐惧指数创新低，但聪明钱正在悄悄撤退"
- "今天的市场像喝了两杯咖啡——表面亢奋，内心焦虑"
- "美债收益率倒挂持续中，上次这么久还是2007年"

## 二、宏观流动性指标检测与解读

分析以下核心流动性指标，并用通俗语言解读：

**必须覆盖的指标**：
- **收益率曲线**：10Y-3M利差是正是负？意味着什么？用比喻解释
- **VIX恐惧指数**：当前水平是高是低？与历史对比如何？
- **美元指数**：强势还是弱势？对全球资金流动的影响
- **信用利差**（如有数据）：HYG vs LQD，企业债市场健康度

**解读原则**：
- 每个指标先说"是什么"（用小学生能懂的话）
- 再说"现在怎么样"（跟历史比）
- 最后说"这意味着什么"（对普通人的影响）

## 三、自选板块数据+新闻解读

根据数据中涉及的板块（科技、金融、能源、黄金等），分析：

**每个板块包含**：
- 今日表现（涨跌幅）
- 相关新闻解读（如有）
- 板块走势背后的逻辑

**重点板块**：
- 金融板块（XLF/KRE）：银行股表现，反映对经济和利率的预期
- 商品（黄金GLD/原油USO）：避险情绪和通胀预期
- 科技/成长股（如有数据）

## 四、重要新闻速递

从提供的50条新闻中，精选**10条最重要的**，每条包含：
- **新闻标题**（简洁有力，用中文翻译）
- **一句话解读**：这条新闻在说什么（大白话翻译）
- **市场影响**：可能如何影响市场/普通投资者
- **原文链接**：提供新闻的 url 链接，格式为 [阅读原文](url)

**筛选标准（按优先级排序）**：
1. 美联储货币政策、利率决议相关
2. 重大经济数据发布（CPI、就业、GDP等）
3. AI 和科技巨头的重大动态（NVDA、MSFT、GOOGL、META等）
4. 地缘政治和贸易政策影响
5. 市场异常波动或重大交易
6. 与普通投资者利益直接相关的新闻
- 避免纯粹的公司八卦和营销软文

**输出格式示例**：
### 1. NVIDIA发布新一代AI芯片
**解读**：老黄又放大招了，新芯片性能提升3倍，价格却没涨多少
**影响**：AI算力成本有望下降，利好整个AI应用生态
[阅读原文](https://example.com/news/123)

## 五、短期未来前瞻

展望未来1-2周市场可能的走向：

**包含内容**：
- **即将发生的重要事件**：美联储会议、重要经济数据发布、财报季等
- **需要关注的信号**：如果XX发生，可能意味着什么
- **风险提示**：当前市场潜在的风险点

**语气要求**：
- 不预测涨跌，但可以指出"如果...那么..."的情景
- 帮助读者知道接下来该关注什么
- 降低焦虑，强调长期投资者大多数时候不需要做什么

---

# 写作原则

1. **开头3秒定生死**：市场总览的金句必须能引发好奇心
2. **比喻大于术语**：VIX不是"波动率指数"，是"市场的恐惧温度计"
3. **数字要有参照**：不说"VIX是18"，说"VIX是18，正常范围是12-20，现在算'体温正常'"
4. **讲故事优于罗列**：把数据串成有因果的叙事
5. **敢于表达观点**：可以说"这个信号值得警惕"，但不说"你应该卖出"
6. **结构清晰**：严格按照5个板块输出，每个板块用##标题

# 格式要求
- 使用 Markdown，标题用 ##
- 段落短小，适合手机阅读
- 可以适当使用 emoji 增加活泼感，但不要过度
- 重要数字加粗

# 禁止事项
- 不给任何具体的买卖建议
- 不编造数据
- 不使用"投资有风险"等套话
- 不使用未解释的专业术语
"""

analyst_agent = Agent(
    name="market_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes market data and news, provides insights in Chinese",
    instruction=ANALYST_INSTRUCTION,
    output_key="analysis",
)

# Sequential Pipeline: DataNewsFetcher -> Analyst
macro_pipeline_agent = SequentialAgent(
    name="macro_analysis_pipeline",
    description="Fetches data and news, then analyzes",
    sub_agents=[data_news_fetcher_agent, analyst_agent],
)

# ADK web UI 需要 root_agent 变量
root_agent = macro_pipeline_agent


# =============================================================================
# MacroAgent Wrapper Class
# =============================================================================


class MacroAgent:
    """Wrapper class to run the ADK macro pipeline with parallel fetching."""

    def __init__(self, client=None):
        self.runner = InMemoryRunner(agent=macro_pipeline_agent, app_name="stock_agent")

    async def analyze(self) -> dict:
        """Run macro analysis pipeline with parallel data and news fetching."""
        try:
            print(
                "[MacroAgent] Starting pipeline: DataNewsFetcher -> Analyst"
            )

            # Create session
            session = await self.runner.session_service.create_session(
                app_name="stock_agent", user_id="analyst"
            )

            # Run the pipeline
            message = Content(
                parts=[
                    Part(
                        text="Fetch market data and news, then provide comprehensive analysis."
                    )
                ],
                role="user",
            )

            response_text = ""

            async for event in self.runner.run_async(
                user_id="analyst", session_id=session.id, new_message=message
            ):
                # Collect outputs from agents
                if hasattr(event, "content") and event.content:
                    if hasattr(event.content, "parts"):
                        for part in event.content.parts:
                            if hasattr(part, "text") and part.text:
                                text = part.text.strip()
                                if text and len(text) > 50:
                                    response_text = text

            # Fetch fresh data directly for the response
            # (The agents already fetched this, but we want it in the response)
            market_data = get_all_market_data()
            news_result = get_combined_market_news(days=1)

            # Parse the analysis response
            short_analysis, in_depth_analysis = self._parse_analysis(response_text)

            print(
                "[MacroAgent] Pipeline complete. News count: "
                + str(news_result.get("news_count", 0))
            )

            return {
                "market_data": market_data,
                "news_data": {
                    "count": news_result.get("news_count", 0),
                    "articles": news_result.get("news", [])[:10],
                    "filters": news_result.get("filters", {}),
                    "sources": news_result.get("sources", ["yahoo_finance"]),
                    "source_counts": news_result.get("source_counts", {}),
                },
                "timestamp": datetime.now().isoformat(),
                "short_analysis": short_analysis,
                "in_depth_analysis": in_depth_analysis,
            }

        except Exception as e:
            print(f"Error in macro analysis: {e}")
            import traceback

            traceback.print_exc()

            # Fallback
            market_data = get_all_market_data()
            return {
                "market_data": market_data,
                "news_data": {"count": 0, "articles": [], "filters": {}},
                "timestamp": datetime.now().isoformat(),
                "short_analysis": f"Data fetched (analysis error: {str(e)[:100]})",
                "in_depth_analysis": "",
            }

    def _parse_analysis(self, text: str) -> tuple[str, str]:
        """Parse the agent response into short and in-depth analysis"""
        if not text:
            return "No analysis available.", ""

        text = text.strip()

        short_markers = ["简要分析", "**简要分析**", "## 简要分析"]
        depth_markers = ["深度分析", "**深度分析**", "## 深度分析"]

        short_start = -1
        depth_start = -1

        for marker in short_markers:
            idx = text.find(marker)
            if idx != -1:
                short_start = idx + len(marker)
                break

        for marker in depth_markers:
            idx = text.find(marker)
            if idx != -1:
                depth_start = idx + len(marker)
                break

        if short_start != -1 and depth_start != -1:
            short_analysis = text[short_start : text.find(depth_markers[0])].strip()
            in_depth_analysis = text[depth_start:].strip()
        elif depth_start != -1:
            short_analysis = text[: text.find(depth_markers[0])].strip()
            in_depth_analysis = text[depth_start:].strip()
        else:
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            if len(paragraphs) >= 2:
                short_analysis = paragraphs[0]
                in_depth_analysis = "\n\n".join(paragraphs[1:])
            else:
                short_analysis = text[:500] if len(text) > 500 else text
                in_depth_analysis = text[500:] if len(text) > 500 else ""

        for marker in short_markers + depth_markers:
            short_analysis = short_analysis.replace(marker, "")
            in_depth_analysis = in_depth_analysis.replace(marker, "")

        return short_analysis.strip(": \n"), in_depth_analysis.strip(": \n")
