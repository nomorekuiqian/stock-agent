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
    """Return an empty analysis dict with all expected fields."""
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

**1. 估值解读**
- 当前 P/E、P/S、EV/EBITDA 等核心估值指标
- 与历史均值对比：当前估值处于历史什么分位？
- 与同行对比：相比行业平均是溢价还是折价？为什么？

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

    quarters = financials.get("quarters", [])[:4]
    clean_quarters = []
    for q in quarters:
        clean_q = {
            "period": q.get("period"),
            "fiscal_quarter": q.get("fiscal_quarter"),
            "revenue": q.get("income_statement", {}).get("revenue"),
            "net_income": q.get("income_statement", {}).get("net_income"),
            "eps": q.get("income_statement", {}).get("eps"),
            "gross_margin": q.get("income_statement", {}).get("gross_profit_margin"),
            "operating_margin": q.get("income_statement", {}).get("operating_income_margin"),
        }
        clean_quarters.append(clean_q)

    return {
        "profile": clean_profile,
        "quote": clean_quote,
        "fundamentals": clean_fundamentals,
        "financials": {
            "latest_quarter": financials.get("latest_quarter"),
            "quarters": clean_quarters,
        },
    }


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

            session = await self.runner.session_service.create_session(
                app_name="stock_analysis", user_id="analyst"
            )

            message = Content(
                parts=[
                    Part(
                        text=f"Please analyze the following stock data and provide a comprehensive analysis:\n\n{json.dumps(data_for_analyst, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            async for event in self.runner.run_async(
                user_id="analyst", session_id=session.id, new_message=message
            ):
                pass

            session_data = await self.runner.session_service.get_session(
                app_name="stock_analysis", user_id="analyst", session_id=session.id
            )

            analysis_data = {}
            if session_data and hasattr(session_data, "state"):
                state = session_data.state or {}
                analysis_data = state.get("analysis", {})
                if isinstance(analysis_data, str):
                    try:
                        analysis_data = json.loads(analysis_data)
                    except json.JSONDecodeError:
                        analysis_data = {}

            # Clean up session to prevent memory leak (InMemoryRunner stores all sessions)
            try:
                await self.runner.session_service.delete_session(
                    app_name="stock_analysis", user_id="analyst", session_id=session.id
                )
            except Exception:
                pass

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


# Singleton instance
_stock_analysis_agent: Optional[StockAnalysisAgent] = None


def get_stock_analysis_agent() -> StockAnalysisAgent:
    """Get or create the StockAnalysisAgent singleton."""
    global _stock_analysis_agent
    if _stock_analysis_agent is None:
        _stock_analysis_agent = StockAnalysisAgent()
    return _stock_analysis_agent
