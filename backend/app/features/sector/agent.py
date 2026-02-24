"""
SectorDigest - Daily Digest for Sector Tracking

Architecture:
    Python (fetch sector stock + news data) -> SectorDigest Agent (gemini-3-flash-preview) -> Structured output
"""

import json
import os
from dotenv import load_dotenv

from app.core.logging import get_logger

load_dotenv()

_google_api_key = os.getenv("GOOGLE_API_KEY")
if _google_api_key and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = _google_api_key

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

from app.utils.timezone import now_iso, format_report_date
from app.features.sector.models import (
    SectorDigestOutput,
    get_sector_by_id,
    get_enabled_sectors,
)
from app.shared.data_tools.market_data import get_stock_quotes, get_all_market_data
from app.shared.data_tools.news import get_combined_market_news
from app.shared.data_tools.calendar import get_economic_calendar
from app.shared.data_tools.earnings import get_earnings_calendar

logger = get_logger(__name__)


# =============================================================================
# SectorDigest Agent Prompt
# =============================================================================

SECTOR_DIGEST_INSTRUCTION = """
你是一位专业的行业分析师，专注于特定板块的深度分析。你的任务是为用户生成一份关于特定板块的每日分析报告。

这不是泛泛的市场日报，而是针对特定行业/板块的深度洞察。

## 核心原则
- 围绕板块整体表现和趋势组织内容
- 解释因果链: 板块发生了什么 → 为什么重要 → 对板块未来意味着什么
- 数据来自输入JSON，价格和涨跌幅必须准确，不编造
- 语言专业但易懂，像资深分析师给投资者写的报告
- 所有内容使用中文

## 你的思考过程

分析数据时，问自己:
1. 今天板块整体表现如何？与大盘对比如何？
2. 板块内哪些股票异动？为什么？
3. 有什么新闻会影响整个板块的走势？
4. 板块的中期趋势是什么？有什么关键催化剂？

---

## 输出字段指南

### greeting（开场）
日期 + 板块名 + 一句有温度的引子。
格式: "YYYY年MM月DD日 [板块名]日报 | [引子]"
示例: "2024年12月18日 芯片股日报 | AI需求持续火热，半导体板块领涨大盘"
示例: "2024年12月19日 中概股日报 | 政策暖风频吹，中概迎来反弹窗口"

### intro（板块趋势概述）
2-3句话概述板块今天的整体表现，包括:
- 板块整体涨跌幅（如果能计算）
- 与大盘（SPY/QQQ）的对比
- 今日主要驱动因素
示例: "芯片板块今日整体上涨2.3%，跑赢标普500(+0.8%)和纳指(+1.2%)。上涨主要受NVDA财报超预期带动，AI芯片需求强劲的叙事进一步强化。"

### stocks（重点个股分析）
分析板块内的重要股票，按今日波动/重要性排序。每只股票包含:
- symbol: 股票代码
- name: 中文公司名
- change_percent: 日涨跌幅
- analysis: 3-4句深度分析:
  1) 今天发生了什么
  2) 为什么会这样
  3) 这意味着什么

优先分析:
1. 今日涨跌幅最大的股票
2. 有重要新闻的股票
3. 板块龙头股

### news（板块重要新闻）
从输入新闻中精选与板块相关的重要新闻，通常5-8条。
每条新闻包含:
- title: 中文新闻标题
- summary: 2-3句总结，包括新闻内容和对板块的影响
- url: 原文链接（从输入数据复制）

筛选标准:
- 与板块直接相关的公司公告
- 影响整个板块的行业/政策新闻
- 可能改变板块投资逻辑的事件

### events（未来关注事件）
从经济日历和财报日历中筛选与板块相关的事件，通常3-6个。
每个事件包含:
- date: 日期（YYYY-MM-DD格式）
- title: 中文事件名
- description: 1-2句说明为什么板块投资者需要关注

优先:
- 板块内公司的财报日期
- 影响板块的宏观数据（如芯片板块关注半导体销售数据）
- 行业会议/产品发布

### summary（深度洞察）
这是最重要的部分，要有深度和洞见。写成3-4段，不要加小标题。

第一段: 今日复盘
板块今天的表现，哪些股票领涨/领跌，驱动因素是什么。

第二段: 行业逻辑
从产业链/行业周期角度分析当前位置。当前的主要叙事是什么？有哪些结构性趋势？

第三段: 风险与机会
板块面临的主要风险是什么？有哪些潜在的催化剂？哪些信号值得关注？

第四段: 展望
未来1-2周的预期走势，关键事件，投资建议的方向性思考。
"""


sector_digest_agent = LlmAgent(
    name="sector_digest",
    model="gemini-3-flash-preview",
    description="Generates sector-focused daily digest",
    instruction=SECTOR_DIGEST_INSTRUCTION,
    output_schema=SectorDigestOutput,
    output_key="digest",
)


# =============================================================================
# SectorDigest Wrapper Class
# =============================================================================


class SectorDigest:
    """Wrapper class to fetch sector data and run the digest agent."""

    DEFAULT_MACRO_SYMBOLS = ["SPY", "QQQ", "^VIX"]

    def __init__(self):
        self._runner = InMemoryRunner(
            agent=sector_digest_agent, app_name="sector_digest"
        )

    async def generate(self, sector_id: str) -> dict:
        """
        Generate sector digest for a specific sector.

        Args:
            sector_id: Sector identifier (e.g., "chips", "china")

        Returns:
            Structured sector digest report
        """
        try:
            # Get sector config
            sector = get_sector_by_id(sector_id)
            if not sector:
                return {"success": False, "error": f"Sector '{sector_id}' not found"}

            if not sector.enabled:
                return {"success": False, "error": f"Sector '{sector_id}' is disabled"}

            symbols = sector.symbols
            logger.info("Generating digest for sector: %s (%s)", sector.name_zh, sector_id)
            logger.info("Symbols: %s", symbols)

            # Step 1: Fetch sector stock data
            logger.info("Fetching stock quotes...")
            stock_data = get_stock_quotes(symbols)

            # Step 2: Fetch news filtered by sector symbols + macro
            logger.info("Fetching news...")
            news_symbols = symbols + self.DEFAULT_MACRO_SYMBOLS
            news_result = get_combined_market_news(days=1, symbols=news_symbols)

            # Step 3: Fetch calendars
            logger.info("Fetching calendars...")
            calendar_result = get_economic_calendar(days=7)
            earnings_result = get_earnings_calendar(days=7)

            # Step 4: Get macro context
            logger.info("Fetching macro context...")
            market_data = get_all_market_data()
            macro_summary = self._extract_macro_summary(market_data)

            # Step 5: Prepare data for agent
            report_date = format_report_date()

            data_for_agent = {
                "report_date": report_date,
                "sector_id": sector_id,
                "sector_name_en": sector.name_en,
                "sector_name_zh": sector.name_zh,
                "sector_description": sector.description,
                "sector_symbols": symbols,
                "stocks": stock_data.get("stocks", {}),
                "news": self._clean_news(news_result.get("news", [])[:30]),
                "economic_calendar": calendar_result.get("events", [])[:15],
                "earnings_calendar": self._filter_earnings(
                    earnings_result.get("earnings", []), symbols
                ),
                "macro_summary": macro_summary,
            }

            # Step 6: Run agent
            logger.info("Running agent...")

            session = await self._runner.session_service.create_session(
                app_name="sector_digest", user_id="sector"
            )

            message = Content(
                parts=[
                    Part(
                        text=f"Generate sector digest for {sector.name_zh}:\n\n{json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            async for _ in self._runner.run_async(
                user_id="sector", session_id=session.id, new_message=message
            ):
                pass

            # Get output from session state
            session_data = await self._runner.session_service.get_session(
                app_name="sector_digest", user_id="sector", session_id=session.id
            )

            digest_output = {}
            if session_data and hasattr(session_data, "state"):
                state = session_data.state or {}
                digest_output = state.get("digest", {})
                if isinstance(digest_output, str):
                    try:
                        digest_output = json.loads(digest_output)
                    except json.JSONDecodeError:
                        digest_output = {}

            logger.info(
                "Generation complete. Stocks: %d, News: %d, Events: %d",
                len(digest_output.get('stocks', [])),
                len(digest_output.get('news', [])),
                len(digest_output.get('events', [])),
            )

            return {
                "success": True,
                "timestamp": now_iso(),
                "sector_id": sector_id,
                "sector_name": sector.name_zh,
                **digest_output,
            }

        except Exception as e:
            logger.exception("Error generating sector digest")
            return {
                "success": False,
                "error": str(e),
                "timestamp": now_iso(),
            }

    def _extract_macro_summary(self, market_data: dict) -> dict:
        """Extract key macro indicators for context."""
        return {
            "sp500": market_data.get("equities", {}).get("S&P 500", {}),
            "nasdaq": market_data.get("equities", {}).get("Nasdaq", {}),
            "vix": market_data.get("volatility", {}).get("VIX", {}),
            "yield_10y": market_data.get("rates", {})
            .get("yield_curve", {})
            .get("10Y", {}),
            "dollar": market_data.get("currencies", {}).get("US Dollar", {}),
        }

    def _clean_news(self, news: list) -> list:
        """Clean news for token efficiency."""
        return [
            {
                "title": n.get("title", ""),
                "text": n.get("text", "")[:500],
                "url": n.get("url", ""),
                "publishedDate": n.get("publishedDate", ""),
                "symbol": n.get("symbol", ""),
            }
            for n in news
            if n.get("title")
        ]

    def _filter_earnings(self, earnings: list, sector_symbols: list) -> list:
        """Filter earnings to sector symbols + major companies."""
        sector_set = set(s.upper() for s in sector_symbols)
        # Always include major tech earnings as reference
        always_show = {"NVDA", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "TSLA", "AMD"}
        relevant = always_show.union(sector_set)

        filtered = [e for e in earnings if e.get("symbol", "").upper() in relevant]
        return filtered[:15]

    @staticmethod
    def get_available_sectors() -> list[dict]:
        """Get list of available sectors for subscription."""
        sectors = get_enabled_sectors()
        return [
            {
                "id": s.id,
                "name_en": s.name_en,
                "name_zh": s.name_zh,
                "description": s.description,
                "symbols": s.symbols,
                "symbol_count": len(s.symbols),
            }
            for s in sectors
        ]


# =============================================================================
# Singleton Instance
# =============================================================================

_sector_digest_instance = None


def get_sector_digest() -> SectorDigest:
    """Get singleton SectorDigest instance."""
    global _sector_digest_instance
    if _sector_digest_instance is None:
        _sector_digest_instance = SectorDigest()
    return _sector_digest_instance
