"""
Stock Analysis Agent - Individual stock AI analysis.

Python fetches data via StockService, then the Analyst Agent generates
structured analysis (V3 flat string fields).
"""

import json
import os
import traceback
from typing import Any, Dict, Optional

from dotenv import load_dotenv

load_dotenv()

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import BaseModel, Field

from app.utils.timezone import now_iso

ANALYSIS_FIELDS = (
    "title",
    "fundamentals_analysis",
    "financials_analysis",
    "company_overview",
    "opportunities",
    "risks",
    "investment_summary",
)


def _empty_analysis() -> Dict[str, str]:
    return {field: "" for field in ANALYSIS_FIELDS}


class StockAnalysisOutput(BaseModel):
    """V4 deep analysis structure: each field contains rich, structured Markdown content."""

    title: str = Field(
        description="Opinionated Chinese title, 15-40 chars, clear investment stance."
    )
    fundamentals_analysis: str = Field(
        description="Deep fundamentals analysis in Markdown, 600-1000 chars. "
        "Cover: valuation vs peers/history, growth quality, profitability, core judgment."
    )
    financials_analysis: str = Field(
        description="Deep financial statements analysis in Markdown, 600-1000 chars. "
        "Cover: revenue quality, earnings quality, balance sheet health, quarterly trends."
    )
    company_overview: str = Field(
        description="Company and competitive analysis in Markdown, 400-600 chars. "
        "Cover: business model, competitive moat, market positioning."
    )
    opportunities: str = Field(
        description="Investment opportunities in Markdown, 400-600 chars. "
        "Cover: near-term catalysts, medium-term drivers, long-term trends."
    )
    risks: str = Field(
        description="Risk factors in Markdown, 400-600 chars. "
        "Cover: business risks, financial risks, valuation risks."
    )
    investment_summary: str = Field(
        description="Investment summary in Markdown, 300-500 chars. "
        "Cover: core thesis in one sentence, bull/bear cases, key metrics to monitor."
    )


STOCK_ANALYST_INSTRUCTION = """
You are a senior equity research analyst at a top investment bank, writing insightful analysis for retail investors.

## Core Rules

1. **Data accuracy is absolute** - every number must match the provided data. Never fabricate. If data is missing, say so.
2. **Write in Chinese (Simplified)**, but keep financial terms in English (P/E, ROE, EPS, FCF, etc.).
3. **Analysis framework**: Data -> Context -> So What? Every point must explain WHY it matters.
4. **Be opinionated**: Give clear judgments (expensive/cheap, strong/weak, improving/deteriorating).
5. **Use Markdown formatting**: Use **bold** for emphasis, bullet points for lists. Keep formatting clean and readable.

## Output Field Guidelines

### title
One opinionated sentence, 15-40 Chinese characters. Must convey a clear investment stance.
Example: "英伟达：AI浪潮的最大赢家，但估值已透支未来三年增长"

### fundamentals_analysis (600-1000 chars, Markdown)
Write a deep fundamentals analysis covering these four dimensions:

**1. 估值解读** (重点使用 valuation_comparison 数据)
- 当前 P/E、P/S、P/B、EV/EBITDA、股息率等核心估值指标
- **纵向对比（历史）**：必须使用 valuation_comparison.historical_valuation 数据，明确指出当前估值处于历史什么水平（如"当前 P/E 25x vs 2023年 20x vs 2022年 18x"）
- **横向对比（同行）**：必须使用 valuation_comparison.peer_comparison 数据，与具体同行公司对比（如"相比 GOOGL 的 22x，META 目前溢价 15%"）
- **行业对比**：使用 valuation_comparison.industry_averages 数据，对比行业/板块平均估值

**2. 增长质量**
- 收入增速、EPS 增速的绝对水平和趋势
- 增长是否可持续？是一次性还是结构性的？
- 增长的驱动因素是什么？

**3. 盈利能力**
- 毛利率、净利率、ROE、ROA 等盈利指标
- 盈利能力是在改善还是恶化？
- 与同行相比处于什么水平？

**4. 核心判断**
- 综合以上三点，给出明确的基本面判断
- 估值是否合理？增长能否支撑当前估值？

### financials_analysis (600-1000 chars, Markdown)
Write a deep financial statements analysis covering these four dimensions:

**1. 收入质量**
- TTM 收入规模和同比变化
- 收入增长是否健康？是否依赖大客户或一次性订单？
- 季度收入趋势：加速、减速还是稳定？

**2. 盈利质量**
- 净利润与经营现金流的匹配度（现金流/净利润比率）
- 是否存在应收账款堆积、存货积压等问题？
- 盈利是否主要来自核心业务？

**3. 资产负债表健康度**
- 负债率水平和趋势
- 现金储备是否充足？
- 是否存在商誉减值、资产质量问题？

**4. 季度趋势解读**
- 最近 2-4 个季度的关键指标变化趋势
- 是否出现拐点？收入加速/减速、利润率扩张/收缩？
- 管理层指引与实际业绩的对比

### company_overview (400-600 chars, Markdown)
Write a company and competitive analysis covering:

**商业模式**
- 用通俗语言解释公司做什么、怎么赚钱
- 收入来源构成和利润驱动因素

**护城河分析**
- 公司的核心竞争优势是什么？（品牌、技术、网络效应、规模、转换成本等）
- 这些优势是否可持续？

**竞争格局**
- 主要竞争对手是谁？
- 公司在行业中的地位如何？市场份额趋势？

### opportunities (400-600 chars, Markdown)
Write an investment opportunity analysis covering three time horizons:

**短期催化剂（0-6个月）**
- 即将发布的财报、产品发布、政策变化等
- 可能触发股价重估的具体事件

**中期驱动（6-18个月）**
- 业务拓展、市场份额提升、新产品周期等
- 基本面改善的具体路径

**长期趋势（1-3年）**
- 行业结构性增长机会
- 公司战略布局和长期竞争力提升

### risks (400-600 chars, Markdown)
Write a risk analysis covering three categories:

**业务风险**
- 竞争加剧、客户流失、技术替代等
- 对核心业务的具体威胁

**财务风险**
- 现金流压力、债务到期、融资困难等
- 资产负债表的潜在隐患

**估值风险**
- 当前估值隐含了多高的增长预期？
- 如果增长不达预期，估值回调空间有多大？

### investment_summary (300-500 chars, Markdown)
Write a balanced investment summary covering:

**一句话核心逻辑**
- 用一句话概括投资这只股票的核心理由或核心担忧

**多头观点 vs 空头观点**
- 看多的主要理由（2-3点）
- 看空的主要理由（2-3点）

**关键监控指标**
- 投资者应该重点关注哪些指标来验证投资逻辑？
- 什么信号会改变投资观点？
"""

stock_analyst_agent = LlmAgent(
    name="stock_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes individual stock fundamentals, provides investment insights in Chinese",
    instruction=STOCK_ANALYST_INSTRUCTION,
    output_schema=StockAnalysisOutput,
    output_key="analysis",
)


def _prepare_stock_data_for_analyst(stock_data: Dict[str, Any]) -> Dict[str, Any]:
    """Clean and reduce stock data for optimal token usage."""
    profile = stock_data.get("profile", {})
    quote = stock_data.get("quote", {})
    fundamentals = stock_data.get("fundamentals", {})
    financials = stock_data.get("financials", {})
    valuation_comparison = stock_data.get("valuation_comparison", {})

    def clean_dict(d: Dict[str, Any]) -> Dict[str, Any]:
        return {k: v for k, v in d.items() if v is not None and v != 0}

    clean_profile = {
        "symbol": profile.get("symbol") or stock_data.get("meta", {}).get("symbol"),
        "company_name": profile.get("company_name"),
        "company_name_zh": profile.get("company_name_zh"),
        "sector": profile.get("classification", {}).get("sector"),
        "industry": profile.get("classification", {}).get("industry"),
        "description_en": profile.get("description", {}).get("en", "")[:500],
        "description_zh": profile.get("description", {}).get("zh", "")[:500],
        "employees": profile.get("company_details", {}).get("employees"),
        "ipo_date": profile.get("company_details", {}).get("ipo_date"),
    }

    clean_quote = {
        "price": quote.get("price"),
        "change_percent": quote.get("change_percent"),
        "market_cap": quote.get("market_cap"),
        "volume": quote.get("volume"),
        "week_52_high": quote.get("week_52_high"),
        "week_52_low": quote.get("week_52_low"),
    }

    clean_fundamentals = {
        "ttm": fundamentals.get("ttm", {}),
        "valuation": fundamentals.get("valuation", {}),
        "growth": fundamentals.get("growth", {}),
        "profitability": fundamentals.get("profitability", {}),
    }

    clean_quarters = []
    for q in financials.get("quarters", [])[:4]:
        income = q.get("income_statement", {})
        clean_quarters.append({
            "period": q.get("period"),
            "fiscal_quarter": q.get("fiscal_quarter"),
            "revenue": income.get("revenue"),
            "net_income": income.get("net_income"),
            "eps": income.get("eps"),
            "gross_margin": income.get("gross_profit_margin"),
            "operating_margin": income.get("operating_income_margin"),
        })

    clean_valuation_comparison = {}

    historical = valuation_comparison.get("historical_valuation", {})
    years_data = historical.get("years", [])
    if years_data:
        sorted_years = sorted(years_data, key=lambda y: y.get("year", ""), reverse=True)[:5]
        clean_years = [
            cleaned for y in sorted_years
            if (cleaned := clean_dict({
                "year": y.get("year"), "pe": y.get("pe"),
                "pb": y.get("pb"), "ps": y.get("ps"),
            })).get("year")
        ]
        if clean_years:
            clean_valuation_comparison["historical_valuation"] = clean_years

    peer_data = valuation_comparison.get("peer_comparison", {})
    peers = peer_data.get("peers", [])
    if peers:
        clean_peers = []
        for p in peers[:5]:
            metrics = p.get("metrics", {})
            peer_entry = clean_dict({
                "symbol": p.get("symbol"),
                "pe_ratio": metrics.get("pe_ratio"),
                "pb_ratio": metrics.get("pb_ratio"),
                "ps_ratio": metrics.get("ps_ratio"),
                "roe": metrics.get("roe"),
            })
            if peer_entry.get("symbol") and len(peer_entry) > 1:
                clean_peers.append(peer_entry)
        if clean_peers:
            clean_valuation_comparison["peer_comparison"] = clean_peers

    industry_val = valuation_comparison.get("industry_valuation", {})
    industry_pe = industry_val.get("industry_pe")
    sector_pe = industry_val.get("sector_pe")
    if industry_pe or sector_pe:
        industry_averages = {}
        if industry_pe:
            industry_averages["industry"] = industry_val.get("industry")
            industry_averages["industry_pe"] = industry_pe
        if sector_pe:
            industry_averages["sector"] = industry_val.get("sector")
            industry_averages["sector_pe"] = sector_pe
        clean_valuation_comparison["industry_averages"] = industry_averages

    result = {
        "profile": clean_profile,
        "quote": clean_quote,
        "fundamentals": clean_fundamentals,
        "financials": {
            "latest_quarter": financials.get("latest_quarter"),
            "quarters": clean_quarters,
        },
    }

    if clean_valuation_comparison:
        result["valuation_comparison"] = clean_valuation_comparison

    return result


async def _run_agent_session(
    runner: InMemoryRunner,
    app_name: str,
    prompt: str,
    output_key: str,
) -> Dict[str, Any]:
    """Run an ADK agent session and extract structured output from state.

    Creates a session, sends the prompt, extracts the output_key from
    session state, and cleans up the session. Returns the parsed dict
    (empty dict on failure).
    """
    session = await runner.session_service.create_session(
        app_name=app_name, user_id="analyst"
    )

    message = Content(
        parts=[Part(text=prompt)],
        role="user",
    )

    async for _ in runner.run_async(
        user_id="analyst", session_id=session.id, new_message=message
    ):
        pass

    session_data = await runner.session_service.get_session(
        app_name=app_name, user_id="analyst", session_id=session.id
    )

    result = {}
    if session_data and hasattr(session_data, "state"):
        state = session_data.state or {}
        result = state.get(output_key, {})
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except json.JSONDecodeError:
                result = {}

    try:
        await runner.session_service.delete_session(
            app_name=app_name, user_id="analyst", session_id=session.id
        )
    except Exception:
        pass

    return result


class StockAnalysisAgent:
    """Runs the stock analyst agent and returns structured analysis."""

    def __init__(self):
        self.runner = InMemoryRunner(agent=stock_analyst_agent, app_name="stock_analysis")

    async def analyze(self, stock_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI analysis for a stock. Returns dict with analysis and metadata."""
        symbol = stock_data.get("meta", {}).get("symbol", "UNKNOWN")

        try:
            print(f"[StockAnalysisAgent] Starting analysis for {symbol}")
            data_for_analyst = _prepare_stock_data_for_analyst(stock_data)

            prompt = (
                "Please analyze the following stock data and provide a comprehensive analysis:\n\n"
                f"{json.dumps(data_for_analyst, ensure_ascii=False, indent=2, default=str)}"
            )

            analysis_data = await _run_agent_session(
                self.runner, "stock_analysis", prompt, "analysis"
            )

            result = {field: analysis_data.get(field, "") for field in ANALYSIS_FIELDS}

            print(
                f"[StockAnalysisAgent] Analysis complete for {symbol}. "
                f"Title: {result['title'][:30] if result['title'] else 'N/A'}..."
            )

            return {
                "analysis": result,
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3-pro-preview",
                    "generated_at": now_iso(),
                },
            }

        except Exception as e:
            print(f"[StockAnalysisAgent] Error analyzing stock: {e}")
            traceback.print_exc()

            return {
                "analysis": _empty_analysis(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3-pro-preview",
                    "generated_at": now_iso(),
                    "error": str(e),
                },
            }


_stock_analysis_agent: Optional[StockAnalysisAgent] = None


def get_stock_analysis_agent() -> StockAnalysisAgent:
    global _stock_analysis_agent
    if _stock_analysis_agent is None:
        _stock_analysis_agent = StockAnalysisAgent()
    return _stock_analysis_agent


TECHNICAL_FIELDS = (
    "title",
    "trend_analysis",
    "entry_exit_signals",
    "pattern_analysis",
    "technical_summary",
)


def _empty_technical_analysis() -> Dict[str, str]:
    return {field: "" for field in TECHNICAL_FIELDS}


class TechnicalAnalysisOutput(BaseModel):
    """Technical analysis output: conclusion-first, plain language, actionable."""

    title: str = Field(
        description="Opinionated Chinese title, 15-40 chars. Direct stance, no metaphors. "
        "Example: 'META: 跌破所有均线，弱势震荡等待方向选择'"
    )
    trend_analysis: str = Field(
        description="Trend and momentum analysis in Markdown, 500-800 chars. "
        "Conclusion-first style. Explain what readings MEAN in context, not just what they ARE. "
        "Cover: MA alignment, trend strength, momentum direction, overall bias."
    )
    entry_exit_signals: str = Field(
        description="Key levels and actionable signals in Markdown, 400-600 chars. "
        "Cover: support/resistance with distance%, overbought/oversold, "
        "invalidation conditions, specific advice for holders vs watchers."
    )
    pattern_analysis: str = Field(
        description="Signal confluence and risk warning in Markdown, 400-600 chars. "
        "Cover: which signals agree/conflict and what that means, "
        "risk scenarios, what would prove current view wrong."
    )
    technical_summary: str = Field(
        description="2-3 sentence TLDR in Markdown, 100-200 chars. "
        "Current status + key level to watch + what to do. "
        "Do NOT repeat specific numbers from other fields."
    )


TECHNICAL_ANALYST_INSTRUCTION = """
你是一位经验丰富的技术分析师，为普通投资者解读盘面信号。

你的读者可能不太熟悉技术指标，但不要居高临下地教他们，也不要甩术语让他们自己猜。
你的工作是：**把指标读数翻译成"盘面正在告诉我们什么"**。

## 写作原则：结论先行，数据支撑，解释含义

1. **每段先说结论**，再用数据证明。不要用指标名+数字开头
2. **解释"这个数值意味着什么"**，而不是罗列指标读数
3. **数字放括号里作为佐证**，不要让数字做主语
4. **只讲最关键的 2-3 个信号**，不需要提到每一个指标
5. **术语首次出现时加简短说明**，如"均线（一段时间的平均价格）"、"ADX（衡量趋势强弱的指标）"
6. **给明确观点**：看涨/看跌/观望 + 信心度（强/中/弱）
7. **中文为主**，指标缩写保留英文（RSI, MACD, SMA, ADX, BB）
8. **Markdown 格式**：关键结论加粗，分条列出

## 禁止事项
- 不要用任何比喻和类比，包括但不限于：天气、温度计、油门刹车、地板天花板、跑步、温水煮青蛙、慢牛、阴跌
- 不要用"像...一样"、"就好比..."
- 不要在每段末尾加"对你意味着什么"这种固定栏目

## 术语处理
读者可能不太懂以下术语，首次使用时请加简短括号说明：
- 多头排列/空头排列 → 如"多头排列（短期均线在上、长期在下，说明各周期都在涨）"
- 金叉/死叉 → 如"MACD 金叉（短期动能线上穿长期线，通常是买入信号）"
- 超买/超卖 → 如"进入超卖区（短期跌得太多太快）"
- 钝化 → 避免使用这个词，改用"指标在极端区域停留较久"
- 套牢盘 → 如"套牢盘（之前高位买入、目前亏损的投资者）"
- 放量/缩量 → 如"放量（成交量明显高于平时）"
其他不常见术语同理，首次出现时加一句解释。第二次出现时不需要重复解释。

## 写法示范

差的写法（术语堆砌，数字开头）：
"ADX 指标为 30.33，且 -DI (33.64) 显著高于 +DI (19.41)，说明当前的下跌并非盘整，而是具备较强动能的单边趋势。"

好的写法（结论先行，解释含义）：
"这轮下跌不是横盘震荡，而是有方向的持续下跌——趋势强度指标 ADX 达到 30（超过 25 就算强趋势），卖方力量明显压过买方。"

差的写法（数字墙）：
"价格 (210.11) 位于 SMA20 (221.65)、SMA50 (228.52) 和 SMA200 (223.97) 下方。所有均线构成层层压制，呈现典型的空头排列。"

好的写法（先说意味着什么）：
"价格（210）已跌破所有重要均线（短期 222、中期 229、长期 224），无论从短期还是长期看，市场都在走弱。上方均线密集，意味着反弹的阻力很大。"

## 时间框架
根据收到的数据调整分析视角：
- **日线**：关注 1-2 周的短期信号和动能变化
- **周线**：关注 1-3 个月的中期趋势方向

## 输出要求

### title
一句话中文标题，15-40 字，直接表达观点和关键信息。

### trend_analysis (500-800 chars, Markdown)
先用一句话给出趋势判断（偏多/偏空/震荡 + 信心度），然后分析：
- **趋势状态**：价格和均线的关系说明什么？是在上涨通道、下跌通道还是横盘？
- **趋势强度**：趋势是强是弱？是有方向的趋势还是无序的震荡？
- **动能变化**：涨跌的力度在加强还是减弱？有没有边际变化？（比如"虽然还在跌，但跌速在放缓"）
- **量能配合**：成交量是否支持当前趋势？放量（成交量明显高于平时）说明市场认可这个方向，缩量说明参与度不足
- **结论**：一句话总结，建议进攻、防守还是观望

### entry_exit_signals (400-600 chars, Markdown)
围绕"该怎么做"来组织：
- **关键阻力位**：上方什么价格有压力？距离多远？突破意味着什么？
- **关键支撑位**：下方什么价格有支撑？跌破意味着什么？
- **短期信号**：有没有超买/超卖？有没有短期反弹/回调的迹象？
- **操作建议**：分别对持有者和观望者给出具体建议。突破或跌破关键位时，要关注成交量是否配合（放量突破更可信，缩量突破容易是假突破）

### pattern_analysis (400-600 chars, Markdown)
信号共振与风险提示：
- **一致性判断**：多数指标指向同一方向吗？一致性越高判断越可靠。成交量是否与价格方向一致？（量价齐升=健康上涨，价涨量缩=动力不足）
- **矛盾信号**：有没有和主趋势相悖的信号？这些矛盾信号可靠吗？为什么？
- **风险提示**：当前判断最大的风险是什么？什么情况会证明判断是错的？出现什么信号应该改变看法？

### technical_summary (100-200 chars, Markdown)
2-3 句话的核心总结：当前是什么状态 + 最该关注的一个关键价位或信号 + 建议怎么做。不要重复其他部分的具体数字。
"""

technical_analyst_agent = LlmAgent(
    name="technical_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes stock technical indicators and provides technical outlook in Chinese",
    instruction=TECHNICAL_ANALYST_INSTRUCTION,
    output_schema=TechnicalAnalysisOutput,
    output_key="technical_analysis",
)


def _strip_none(d: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of dict with None values removed."""
    return {k: v for k, v in d.items() if v is not None}


def _prepare_technical_data_for_agent(
    technical_data: Dict[str, Any],
    timeframe: str = "daily",
) -> Dict[str, Any]:
    """Clean and reduce technical data for optimal Agent token usage.

    Filters data by timeframe: daily keeps only daily indicators,
    weekly remaps weekly indicators to standard field names.
    """
    result: Dict[str, Any] = {"symbol": technical_data.get("symbol", "UNKNOWN")}

    ratings = technical_data.get("ratings", {})
    oscillators = technical_data.get("oscillators", {})
    trend = technical_data.get("trend", {})

    if timeframe == "weekly":
        if ratings:
            result["tv_ratings"] = {"weekly": ratings.get("weekly", {})}
        if oscillators:
            result["oscillators"] = _strip_none({
                "rsi_14": oscillators.get("rsi_14_weekly"),
                "macd_level": oscillators.get("macd_level_weekly"),
                "macd_signal": oscillators.get("macd_signal_weekly"),
                "macd_histogram": oscillators.get("macd_histogram_weekly"),
            })
        if trend:
            result["trend_indicators"] = _strip_none({
                "adx_14": trend.get("adx_14_weekly"),
            })
    else:
        if ratings:
            result["tv_ratings"] = {"daily": ratings.get("daily", {})}
        if oscillators:
            result["oscillators"] = {
                k: v for k, v in oscillators.items()
                if v is not None and not k.endswith("_weekly")
            }
        if trend:
            result["trend_indicators"] = {
                k: v for k, v in trend.items()
                if v is not None and not k.endswith("_weekly")
            }

    # Pass-through sections: filter None values from dicts, copy non-empty sections as-is
    for source_key, dest_key in [
        ("moving_averages", "moving_averages"),
        ("volatility", "volatility"),
        ("price_volume", "price_volume"),
    ]:
        section = technical_data.get(source_key, {})
        if section:
            result[dest_key] = _strip_none(section)

    for source_key, dest_key in [
        ("derived", "derived_signals"),
        ("trends", "indicator_trends"),
        ("support_resistance", "support_resistance"),
        ("pattern_signals", "pattern_signals"),
    ]:
        section = technical_data.get(source_key, {})
        if section:
            result[dest_key] = section

    return result


class TechnicalAnalysisAgent:
    """Runs the technical analyst agent and returns structured analysis."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=technical_analyst_agent, app_name="stock_technical"
        )

    async def analyze(
        self, symbol: str, technical_data: Dict[str, Any], timeframe: str = "daily"
    ) -> Dict[str, Any]:
        """Generate AI technical analysis. Returns dict with analysis and metadata."""
        try:
            timeframe_label = "日线" if timeframe == "daily" else "周线"
            print(f"[TechnicalAgent] Starting {timeframe} analysis for {symbol}")
            data_for_agent = _prepare_technical_data_for_agent(technical_data, timeframe=timeframe)

            prompt = (
                f"请分析以下 {symbol} 的{timeframe_label}技术指标数据，"
                f"并给出完整的技术分析：\n\n"
                f"{json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)}"
            )

            analysis_data = await _run_agent_session(
                self.runner, "stock_technical", prompt, "technical_analysis"
            )

            result = {field: analysis_data.get(field, "") for field in TECHNICAL_FIELDS}

            print(
                f"[TechnicalAgent] Analysis complete for {symbol}. "
                f"Title: {result['title'][:30] if result['title'] else 'N/A'}..."
            )

            return {
                "analysis": result,
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3-pro-preview",
                    "generated_at": now_iso(),
                },
            }

        except Exception as e:
            print(f"[TechnicalAgent] Error analyzing {symbol}: {e}")
            traceback.print_exc()

            return {
                "analysis": _empty_technical_analysis(),
                "meta": {
                    "symbol": symbol,
                    "model": "gemini-3-pro-preview",
                    "generated_at": now_iso(),
                    "error": str(e),
                },
            }


_technical_analysis_agent: Optional[TechnicalAnalysisAgent] = None


def get_technical_analysis_agent() -> TechnicalAnalysisAgent:
    global _technical_analysis_agent
    if _technical_analysis_agent is None:
        _technical_analysis_agent = TechnicalAnalysisAgent()
    return _technical_analysis_agent
