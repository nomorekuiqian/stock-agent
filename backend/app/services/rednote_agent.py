"""
RedNote Agent - Generate Xiaohongshu content from market reports.

Transforms daily market reports into structured content for Xiaohongshu posts.
6-page structure optimized for Canva templates:
  1. Cover - title + subtitle
  2. Market Summary - 2 paragraphs overview
  3. News Highlights - 4-6 quick news items
  4. Hot Topics - 2 deep analysis items
  5. Future Events - upcoming calendar
  6. CTA - engagement question

Persona: "MarketBrew" - Professional but approachable market analyst
"""

import os
from typing import Optional, Dict, Any, List

from dotenv import load_dotenv

load_dotenv()

# Set GOOGLE_GENAI_API_KEY for google-genai library if GOOGLE_API_KEY is set
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import BaseModel, Field
import json


# =============================================================================
# Pydantic Output Schema - 5-Page Xiaohongshu Content
# =============================================================================


class HotTopic(BaseModel):
    """A single hot topic with analysis."""

    emoji: str = Field(description="Topic emoji, e.g. 'fire', 'chart_increasing', 'warning'")
    title: str = Field(description="Topic title, 5-8 Chinese chars, punchy")
    what: str = Field(description="What happened, 1 sentence, 15-25 Chinese chars")
    so_what: str = Field(
        description="IMPORTANT: Must be 50-80 Chinese chars (2-3 sentences, NOT shorter). Explain: 1) First sentence: direct impact on market/sectors, 2) Second sentence: what retail investors should do or watch. Be specific and actionable, not generic."
    )


class FutureEvent(BaseModel):
    """An upcoming event with analysis."""

    date: str = Field(description="Event date, format: 'MM/DD weekday', e.g. '12/25 Wed'")
    event: str = Field(description="Event name in Chinese, 5-15 chars")
    impact: str = Field(description="Potential market impact, 15-30 Chinese chars")


class RedNoteOutput(BaseModel):
    """6-page Xiaohongshu content structure."""

    # === Page 1: Cover ===
    cover_title: str = Field(
        description="Cover title, MUST be under 10 Chinese chars, punchy and attention-grabbing. Examples: 'AI狂欢继续', '美股大反攻', '科技股遭重锤'"
    )
    cover_subtitle: str = Field(
        description="Cover subtitle with key data point, 10-15 chars. Examples: '纳指+2.3% 标普新高', 'VIX飙升 市场恐慌'"
    )
    date: str = Field(description="Date format: '12.20 Fri' (MM.DD weekday)")

    # === Page 2: Market Summary (2 paragraphs) ===
    market_summary_p1: str = Field(
        description="First paragraph (80-120 chars): Market performance and drivers. Include: 1) 三大指数涨跌 '标普涨X%,纳指涨Y%,道指涨Z%', 2) 今日主要驱动力/主题, 3) VIX/市场情绪. 口语化表达."
    )
    market_summary_p2: str = Field(
        description="Second paragraph (80-120 chars): Key data points and outlook. Include: 1) 1-2个具体新闻数据点如'博通AI订单730亿''GDP增速4.3%', 2) 板块表现亮点, 3) 风险提示或展望. 口语化表达."
    )
    index_data: str = Field(
        description="Key indices in one line: 'SPY +0.52% | QQQ -1.23% | VIX 18.5'"
    )

    # === Page 3: News Highlights (4-6 news items) ===
    news_highlights: List[str] = Field(
        description="4-6 key news items, each 20-40 Chinese chars. Format: 'emoji + brief title + key fact'. Examples: 'fire 博通Q4营收超预期,AI订单730亿', 'chart_increasing 标普创历史新高,年内第57次', 'warning 10Y国债收益率升至4.5%'. Cover different sectors/themes.",
        min_length=4,
        max_length=6,
    )

    # === Page 4: Hot Topics (2 topics with deep analysis) ===
    hot_topics: List[HotTopic] = Field(
        description="2 most important hot topics with 'so what' analysis",
        min_length=2,
        max_length=2,
    )

    # === Page 5: Future Events ===
    future_events: List[FutureEvent] = Field(
        description="3-5 key upcoming events this week with impact analysis",
        min_length=3,
        max_length=5,
    )
    outlook_summary: str = Field(
        description="Two sentences outlook for the week, 40-70 Chinese chars. First sentence: key theme or risk to watch. Second sentence: specific dates or events that matter."
    )

    # === Page 5: CTA ===
    cta_question: str = Field(
        description="Engaging question for comments, 15-25 Chinese chars. Examples: '你最看好哪个板块?', '你怎么看AI行情?'"
    )
    cta_options: str = Field(
        description="2-3 poll-style options, format: 'A. option1 / B. option2 / C. option3'"
    )

    # === Post Body (for Xiaohongshu text content) ===
    body: str = Field(
        description="Post body text, 250-350 Chinese chars, conversational tone. Structure: 1) Hook opening, 2) Today's key points, 3) What to watch, 4) Closing with CTA. Use line breaks for readability."
    )
    tags: str = Field(
        description="Hashtags for discovery, 5-8 tags. Must include: #美股 #投资理财"
    )


# =============================================================================
# Agent Definition
# =============================================================================

REDNOTE_INSTRUCTION = """
你是MarketBrew的小红书内容创作者,负责将每日美股分析转化为易读的图文内容。

## 内容风格
- 专业但不枯燥,像朋友聊天一样解释复杂概念
- 用数据说话,但不堆砌数字
- 每个信息都回答"所以呢?" - 对普通投资者有什么意义
- 不贩卖焦虑,不喊单,不预测具体点位

## 6页内容结构

### 第1页: 封面
- cover_title: 10个字以内的冲击力标题,概括今日核心
  - 好的例子: "AI狂欢继续", "科技股反攻", "市场观望中"
  - 避免: 过长标题, "震惊"等低质词汇
- cover_subtitle: 10-15字,包含关键数据点
- date: 日期格式 "12.20 Fri"

### 第2页: 今日总结 (两段式)
- market_summary_p1: 第一段 (80-120字)
  1. 三大指数涨跌: "标普涨0.46%创新高,纳指涨0.57%,道指涨0.3%"
  2. 今天的主要驱动因素/主题
  3. VIX/市场情绪信号
- market_summary_p2: 第二段 (80-120字)
  1. 1-2个具体新闻数据点: 如"博通AI订单730亿""GDP增速4.3%"
  2. 板块表现亮点
  3. 风险提示或展望
- index_data: 一行关键数据 "SPY +0.52% | QQQ -1.23% | VIX 18.5"

### 第3页: 新闻速递
- news_highlights: 4-6条新闻快讯
  - 每条20-40字,格式: "emoji + 标题 + 关键事实"
  - 例如: "fire 博通Q4营收超预期,AI订单730亿"
  - 覆盖不同板块/主题: 科技、宏观、个股、政策等

### 第4页: 热点解读
- 选择2个最重要的热点事件
- 每个热点包含:
  - emoji: 表情符号
  - title: 5-8字标题
  - what: 发生了什么 (15-25字)
  - so_what: 对散户意味着什么 (50-80字,2-3句话) - 这是最重要的!
    - 第一句: 对市场/板块的直接影响
    - 第二句: 投资者应该关注什么或怎么应对

### 第5页: 未来事件
- 列出3-5个本周重要事件
- 每个事件包含:
  - date: 日期 (MM/DD weekday)
  - event: 事件名称
  - impact: 潜在影响
- outlook_summary: 两句话本周展望
  - 第一句: 本周的主要主题或风险
  - 第二句: 具体需要关注的日期或事件

### 第6页: 互动CTA
- cta_question: 引导评论的问题
- cta_options: 2-3个投票选项,让用户选择

### 帖子正文 (body)
- 250-350字,口语化,适合小红书正文
- 结构:
  1. 开头钩子 (问句或惊讶句)
  2. 今天发生了什么 (2-3个要点)
  3. 值得关注什么
  4. 结尾CTA
- 用换行分段,提高可读性
- tags: 标签,必须包含 #美股 #投资理财

## 示例输出

cover_title: "AI股狂欢"
cover_subtitle: "英伟达+5% 带飞科技"
date: "12.20 Fri"

market_summary_p1: "美股今天继续AI狂欢模式！标普涨0.3%,纳指大涨1.2%创历史新高,道琼斯微涨0.15%。今日行情由AI芯片板块领涨,VIX恐慌指数跌至14创年内新低,市场情绪极度乐观。"

market_summary_p2: "英伟达Q3营收超预期35%直接带飞整个科技板块,博通AI订单达730亿美元引爆算力需求话题。科技板块全线飘红,半导体ETF涨超3%。不过临近年末流动性可能收紧,注意控制仓位别追高。"

index_data: "SPY +0.32% | QQQ +1.18% | VIX 14.2"

news_highlights: [
  "fire 英伟达Q3营收超预期35%,股价创新高",
  "rocket 博通AI订单储备达730亿美元",
  "chart_increasing 标普创历史新高,年内第57次",
  "bank 美联储官员暗示明年可能降息3次",
  "warning 10Y国债收益率升至4.5%,创近期新高"
]

hot_topics: [
  {
    "emoji": "fire",
    "title": "英伟达再创新高",
    "what": "Q3营收超预期35%,AI需求持续爆发",
    "so_what": "科技股短期有望继续强势,芯片和AI板块是主战场。但估值已经很高了,追高需谨慎,可以考虑逢低布局或持有观望。"
  },
  {
    "emoji": "bank",
    "title": "美联储放鸽信号",
    "what": "多位官员暗示明年可能降息3次",
    "so_what": "降息预期利好成长股和科技股,尤其是高估值的纳斯达克。但12月会议才是关键,建议等会议结果出来再做决定。"
  }
]

future_events: [
  {"date": "12/25 Wed", "event": "圣诞节休市", "impact": "流动性降低,波动可能加大"},
  {"date": "12/27 Fri", "event": "初请失业金", "impact": "就业数据影响降息预期"},
  {"date": "01/03 Fri", "event": "12月非农", "impact": "重磅数据,可能引发大波动"}
]

outlook_summary: "下周圣诞假期交易清淡,市场可能维持震荡格局。重点关注12/30的美联储会议纪要和1/3的非农数据。"

cta_question: "2024你最看好哪个板块?"
cta_options: "A. AI科技 / B. 医疗健康 / C. 新能源"

body: "昨晚美股又整活了!

纳指涨1.2%创新高,标普小涨0.3%。英伟达财报后续涨5%,直接带飞整个芯片板块。

今天的重点:
1. AI热度不减,英伟达Q3营收超预期35%
2. 美联储官员放鸽,暗示明年可能降息3次
3. VIX低位但有抬头迹象,需要注意

下周重点关注:
- 12/25 圣诞休市,流动性会降低
- 1/3 非农数据,可能引发大波动

你怎么看这波AI行情?评论区聊聊!"

tags: "#美股 #投资理财 #美股日报 #AI #英伟达 #美联储"

## 绝对禁止
- 推荐具体买卖点位
- 预测明天涨跌
- 使用"震惊""惊呆"等低质标题党词汇
- 贩卖焦虑或制造恐慌
"""

rednote_agent = LlmAgent(
    name="rednote_creator",
    model="gemini-2.0-flash",
    description="Creates 6-page Xiaohongshu content from market reports",
    instruction=REDNOTE_INSTRUCTION,
    output_schema=RedNoteOutput,
    output_key="rednote",
)


# =============================================================================
# RedNoteAgent Wrapper Class
# =============================================================================


class RedNoteAgent:
    """Wrapper class to generate Xiaohongshu content from market reports."""

    def __init__(self):
        self.runner = InMemoryRunner(agent=rednote_agent, app_name="rednote_agent")

    def _extract_index_data(self, indices: list, name_pattern: str) -> Dict[str, Any]:
        """Extract data for a specific index by name pattern."""
        for idx in indices:
            if isinstance(idx, dict) and name_pattern.lower() in idx.get("name", "").lower():
                return idx
        return {}

    def _format_change(self, change: Optional[float]) -> str:
        """Format change percent with + sign for positive."""
        if change is None:
            return "N/A"
        sign = "+" if change >= 0 else ""
        return f"{sign}{change:.2f}%"

    def _format_report_for_agent(self, report: Dict[str, Any]) -> str:
        """Format market report data for the agent."""
        # Extract key information from report
        title = report.get("title", "")
        summary = report.get("summary", "")
        quick_take = report.get("quick_take", "")
        market_narrative = report.get("market_narrative", "")
        conclusion = report.get("conclusion", "")
        in_depth_analysis = report.get("in_depth_analysis", "")

        # Get indices data (key market metrics)
        indices = report.get("indices", [])
        if not isinstance(indices, list):
            indices = []

        # Extract key market data
        spy = self._extract_index_data(indices, "S&P 500")
        nasdaq = self._extract_index_data(indices, "Nasdaq")
        dow = self._extract_index_data(indices, "Dow")
        vix = self._extract_index_data(indices, "VIX")
        us10y = self._extract_index_data(indices, "10Y Treasury")

        # Get macro data
        macro = report.get("macro", {})
        macro_summary = macro.get("summary", "") if isinstance(macro, dict) else ""

        # Get news data
        news = report.get("news", {})
        headlines = news.get("headlines", []) if isinstance(news, dict) else []
        briefs = news.get("briefs", []) if isinstance(news, dict) else []

        # Get calendar events
        calendar = report.get("calendar", [])

        # Get report date
        report_date = report.get("report_date", "")

        # Format for agent
        formatted = f"""
## 日报日期
{report_date}

## 核心市场数据

### 三大指数
- 标普500 (SPY): {spy.get('value', 'N/A')} ({self._format_change(spy.get('change_percent', 0))})
- 纳斯达克 (QQQ): {nasdaq.get('value', 'N/A')} ({self._format_change(nasdaq.get('change_percent', 0))})
- 道琼斯 (DIA): {dow.get('value', 'N/A')} ({self._format_change(dow.get('change_percent', 0))})

### 关键指标
- VIX恐慌指数: {vix.get('value', 'N/A')} ({self._format_change(vix.get('change_percent', 0))})
- 10年期国债收益率: {us10y.get('value', 'N/A')}%

## 日报标题
{title}

## 摘要
{summary}

## 3秒速读
{quick_take}

## 主要市场叙事
{market_narrative}

## 宏观环境
{macro_summary}

## 深度分析 (提取关键信息用于热点解读)
{in_depth_analysis[:1500] if in_depth_analysis else '无'}

## 重要新闻 (从中挑选4-6条做新闻速递,2条做热点深度分析)

### 头条新闻 (适合做热点解读)
"""
        for h in headlines[:5]:
            if isinstance(h, dict):
                formatted += f"- **{h.get('title', '')}**\n"
                formatted += f"  事实: {h.get('fact_summary', '')}\n"
                formatted += f"  影响: {h.get('deep_analysis', '')[:300]}\n\n"

        formatted += "### 快讯 (适合做新闻速递)\n"
        for b in briefs[:8]:
            if isinstance(b, dict):
                formatted += f"- {b.get('title', '')}: {b.get('summary', '')}\n"

        formatted += "\n## 未来事件 (挑选3-5个最重要的)\n"
        for event in calendar[:10]:
            if isinstance(event, dict):
                formatted += f"- {event.get('date', '')}: {event.get('event', '')} - {event.get('analysis', '')}\n"

        formatted += f"\n## 总结\n{conclusion[:500] if conclusion else ''}"

        return formatted

    async def generate(self, report: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate Xiaohongshu content from a market report.

        Args:
            report: Market report data from Insforge

        Returns:
            dict with RedNoteOutput fields and metadata
        """
        try:
            print("[RedNoteAgent] Generating Xiaohongshu content...")

            # Format report for agent
            formatted_report = self._format_report_for_agent(report)

            # Create session and run agent
            session = await self.runner.session_service.create_session(
                app_name="rednote_agent", user_id="rednote"
            )

            message = Content(
                parts=[
                    Part(
                        text=f"请根据以下市场日报生成小红书5页图文内容:\n\n{formatted_report}"
                    )
                ],
                role="user",
            )

            # Run agent
            async for _ in self.runner.run_async(
                user_id="rednote", session_id=session.id, new_message=message
            ):
                pass

            # Get output from session state
            session_data = await self.runner.session_service.get_session(
                app_name="rednote_agent", user_id="rednote", session_id=session.id
            )

            result = {}
            if session_data and hasattr(session_data, "state"):
                state = session_data.state or {}
                rednote_data = state.get("rednote", {})

                if isinstance(rednote_data, str):
                    try:
                        rednote_data = json.loads(rednote_data)
                    except json.JSONDecodeError:
                        rednote_data = {}

                if isinstance(rednote_data, dict):
                    result = rednote_data

            print(
                f"[RedNoteAgent] Generated content. Cover: {result.get('cover_title', '')}"
            )

            return {
                "success": True,
                "content": result,
                "report_id": report.get("id"),
                "report_date": report.get("report_date"),
            }

        except Exception as e:
            print(f"[RedNoteAgent] Error generating content: {e}")
            import traceback

            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
            }


# Singleton instance
_rednote_agent: Optional[RedNoteAgent] = None


def get_rednote_agent() -> RedNoteAgent:
    """Get or create the RedNote agent singleton."""
    global _rednote_agent
    if _rednote_agent is None:
        _rednote_agent = RedNoteAgent()
    return _rednote_agent
