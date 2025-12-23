"""
RedNote Agent - Generate Xiaohongshu content from market reports.

Transforms daily market reports into structured content for Xiaohongshu posts.
Outputs flat schema for easy copy-paste to Canva templates.

Persona: "美股早起鸟" - 亲切老股民朋友,自嘲式幽默,接地气
Color: 涨绿跌红 (美股习惯)
"""

import os
from typing import Optional, Dict, Any, Literal

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
# Pydantic Output Schema - Optimized for viral Xiaohongshu content
# =============================================================================


class RedNoteOutput(BaseModel):
    """Optimized schema for viral Xiaohongshu content with emotional resonance."""

    # === Market Mood (drives tone of entire post) ===
    market_mood: Literal["bullish", "bearish", "neutral", "volatile"] = Field(
        description="Market sentiment: bullish(>1%), bearish(<-1%), neutral, volatile(VIX>25)"
    )
    mood_emoji: str = Field(
        description="Mood emoji for cover: bullish=rocket, bearish=chart_down, neutral=thinking, volatile=warning"
    )

    # === Cover (Canva Page 1) - Data-driven ===
    date: str = Field(
        description="Date format: '12.20 Friday' (MM.DD weekday in Chinese)"
    )
    title: str = Field(
        description="Viral title with specific numbers, 15-25 chars. Must include index change % or key data point"
    )
    index_oneliner: str = Field(
        description="Three indices in one line: 'SPY +0.52% | QQQ -1.23% | DIA +0.31%'"
    )

    # === Data Page (Canva Page 2) - Key metrics ===
    spy_change: str = Field(description="S&P 500 change with direction: +0.52% or -1.23%")
    qqq_change: str = Field(description="Nasdaq 100 change: +0.52% or -1.23%")
    vix_status: str = Field(
        description="VIX interpretation: '18.5 calm' or '28.3 fear rising'"
    )
    us10y_status: str = Field(
        description="10Y Treasury yield status: '4.25% stable' or '4.50% rising pressure'"
    )
    dollar_status: str = Field(
        description="Dollar index status: '104.2 strong' or '102.1 weakening'"
    )
    star_stock: str = Field(
        description="Today's spotlight stock: 'NVDA +5.2% new high' or 'TSLA -8% earnings miss'"
    )

    # === Hot Topics (Canva Page 3) - With "So What" analysis ===
    hot1_emoji: str = Field(description="Hot topic 1 emoji")
    hot1_title: str = Field(description="Hot topic 1 title, 5-10 chars, punchy")
    hot1_what: str = Field(description="What happened, 1 sentence, 15-25 chars")
    hot1_so_what: str = Field(
        description="What it means for retail investors, 1 sentence, 15-30 chars"
    )

    hot2_emoji: str = Field(description="Hot topic 2 emoji")
    hot2_title: str = Field(description="Hot topic 2 title, 5-10 chars")
    hot2_what: str = Field(description="What happened, 1 sentence")
    hot2_so_what: str = Field(description="What it means for retail investors")

    # === Calendar Page (Canva Page 4) ===
    events: str = Field(
        description="This week's events with importance markers, format: 'MM/DD event_name importance_level', 3-5 events"
    )
    next_focus: str = Field(
        description="Next key focus point: 'Friday: Non-farm payroll, affects rate cut expectations'"
    )

    # === Post Body - Structured with hook ===
    hook: str = Field(
        description="Opening hook: question or surprising statement, under 25 chars, must grab attention"
    )
    body: str = Field(
        description="Body 300-400 chars, conversational, with subheadings, explain 'so what' for retail investors"
    )
    cta: str = Field(
        description="Call to action: 'What do you think? Share in comments' or poll question"
    )

    # === Tags - Optimized for discovery ===
    tags: str = Field(
        description="Hashtags: #USStocks #InvestmentTips + topic-specific tags, 5-8 total"
    )


# =============================================================================
# Agent Definition
# =============================================================================

REDNOTE_INSTRUCTION = """
你是"美股早起鸟",每天早上帮股友们解读昨晚美股的老朋友。

## 你的人设
- 炒美股8年的老股民,不是专家,是朋友
- 语气亲切接地气,偶尔自嘲("这波我也没想到")
- 从不装专家,从不贩卖焦虑,从不喊单
- 口头禅: "早安股友们"、"别慌听我说"、"记得点赞收藏明天见"

## 情绪匹配规则 (根据市场涨跌调整语气)
- 大涨(>2%): mood=bullish, emoji="rocket"
  语气: 庆祝但提醒风险 "恭喜持仓的朋友!不过高位要注意..."
- 小涨(0.5%-2%): mood=bullish, emoji="chart_increasing"
  语气: 积极稳健 "稳步向上,继续持有问题不大"
- 震荡(-0.5%~0.5%): mood=neutral, emoji="thinking"
  语气: 观望分析 "又是纠结的一天,主力在想什么呢"
- 小跌(-2%~-0.5%): mood=bearish, emoji="chart_decreasing"
  语气: 安抚解释 "小幅调整,不用太慌"
- 大跌(<-2%): mood=bearish, emoji="warning"
  语气: 冷静分析 "别慌别慌,我们来看看发生了什么"
- 高波动(VIX>25): mood=volatile, emoji="rotating_light"
  语气: 谨慎提醒 "市场情绪不稳,观望为主"

## 爆款标题公式 (必须包含具体数字!)
1. 数字冲击型: "纳指暴跌3.2%!你的账户还好吗"
2. 时效紧迫型: "昨晚美股发生了3件大事"
3. 情绪共鸣型: "又被套了?别慌,看完再决定"
4. 内幕揭秘型: "华尔街不会告诉你的3个信号"
5. 对比反差型: "利好出尽是利空?这次不一样"

## "So What" 原则 (每个信息都要回答: 和散户有什么关系?)
- 错误示范: "CPI数据公布 3.4%"
- 正确示范: "CPI超预期 -> 降息预期降温 -> 成长股短期承压"

## 输出要求

### 封面 (Canva第1页)
- date: 格式 "12.20 周五"
- title: 爆款标题,必须包含具体涨跌数字,15-25字
- index_oneliner: 三大指数一行 "标普+0.5% | 纳指-1.2% | 道指+0.3%"

### 数据页 (Canva第2页)
- spy_change, qqq_change: 带正负号的百分比
- vix_status: VIX数值+简单解读 (如"18.5 市场平静")
- us10y_status: 10年期国债收益率+影响 (如"4.25% 稳定")
- dollar_status: 美元指数+趋势 (如"104.2 走强")
- star_stock: 今日最亮眼个股 (如"NVDA +5.2% 创新高")

### 热点页 (Canva第3页)
- 提取2个最重要的热点事件
- 每个热点包含: emoji + 标题 + 发生了什么 + 对散户意味着什么
- "so_what"字段很重要,要用大白话解释影响

### 日历页 (Canva第4页)
- events: 本周重要事件,带重要性标记
- next_focus: 下一个重点关注 (如"周五非农,影响降息预期")

### 正文
- hook: 开头钩子,用问句或惊讶句抓注意力,不超过25字
- body: 300-400字,口语化,分小段落
  - 解读今天发生了什么
  - 用"所以呢"连接影响
  - 给出简单的思考框架
- cta: 互动引导 (如"你怎么看?评论区聊聊")

### 标签
- 固定标签: #美股 #投资理财 #美股日报
- 动态标签: 根据内容添加,如 #美联储 #纳斯达克 等
- 总共5-8个标签

## 绝对禁止
- 推荐具体个股买卖点位
- 预测明天涨跌
- 使用"震惊""惊呆"等低质标题党词汇
- 贩卖焦虑或制造恐慌
- 专业术语不解释
"""

rednote_agent = LlmAgent(
    name="rednote_creator",
    model="gemini-3-flash-preview",
    description="Creates viral Xiaohongshu content from market reports",
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

    def _determine_market_mood(self, indices: list) -> tuple:
        """Determine market mood based on index performance and VIX."""
        # Get S&P 500 change
        spy = self._extract_index_data(indices, "S&P 500")
        spy_change = spy.get("change_percent", 0) or 0

        # Get VIX
        vix = self._extract_index_data(indices, "VIX")
        vix_value = vix.get("value", 20) or 20

        # Determine mood
        if vix_value > 25:
            return "volatile", "rotating_light"
        elif spy_change > 2:
            return "bullish", "rocket"
        elif spy_change > 0.5:
            return "bullish", "chart_increasing"
        elif spy_change < -2:
            return "bearish", "warning"
        elif spy_change < -0.5:
            return "bearish", "chart_decreasing"
        else:
            return "neutral", "thinking"

    def _format_report_for_agent(self, report: Dict[str, Any]) -> str:
        """Format market report data for the agent with enhanced market data."""
        # Extract key information from report
        title = report.get("title", "")
        summary = report.get("summary", "")
        quick_take = report.get("quick_take", "")
        market_narrative = report.get("market_narrative", "")
        conclusion = report.get("conclusion", "")

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
        dollar = self._extract_index_data(indices, "US Dollar")
        gold = self._extract_index_data(indices, "Gold")

        # Determine market mood
        mood, mood_emoji = self._determine_market_mood(indices)

        # Find star stock (biggest mover in equities)
        star_stock = ""
        max_abs_change = 0
        for idx in indices:
            if isinstance(idx, dict):
                change = abs(idx.get("change_percent", 0) or 0)
                if change > max_abs_change and idx.get("name") not in ["VIX", "US Dollar"]:
                    max_abs_change = change
                    star_stock = f"{idx.get('name')} {self._format_change(idx.get('change_percent', 0))}"

        # Get macro data
        macro = report.get("macro", {})
        macro_summary = macro.get("summary", "") if isinstance(macro, dict) else ""
        macro_signals = macro.get("signals", []) if isinstance(macro, dict) else []

        # Get news data
        news = report.get("news", {})
        headlines = news.get("headlines", []) if isinstance(news, dict) else []
        briefs = news.get("briefs", []) if isinstance(news, dict) else []

        # Get calendar events
        calendar = report.get("calendar", [])

        # Get report date
        report_date = report.get("report_date", "")

        # Format for agent with enhanced market data
        formatted = f"""
## 日报日期
{report_date}

## 市场情绪判断
- mood: {mood}
- mood_emoji: {mood_emoji}
- 说明: 根据标普涨跌和VIX水平自动判断

## 核心市场数据 (必须在输出中使用这些具体数字!)

### 三大指数
- 标普500 (SPY): {spy.get('value', 'N/A')} ({self._format_change(spy.get('change_percent', 0))})
- 纳斯达克 (QQQ): {nasdaq.get('value', 'N/A')} ({self._format_change(nasdaq.get('change_percent', 0))})
- 道琼斯 (DIA): {dow.get('value', 'N/A')} ({self._format_change(dow.get('change_percent', 0))})

### 关键指标
- VIX恐慌指数: {vix.get('value', 'N/A')} ({self._format_change(vix.get('change_percent', 0))})
- 10年期国债收益率: {us10y.get('value', 'N/A')}% ({self._format_change(us10y.get('change_percent', 0))})
- 美元指数: {dollar.get('value', 'N/A')} ({self._format_change(dollar.get('change_percent', 0))})
- 黄金: {gold.get('value', 'N/A')} ({self._format_change(gold.get('change_percent', 0))})

### 今日之星
{star_stock if star_stock else "无明显异动"}

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

### 核心信号
"""
        for signal in macro_signals[:3]:
            if isinstance(signal, dict):
                formatted += f"- {signal.get('name', '')}: {signal.get('current_value', '')} ({signal.get('change', '')})\n"
                formatted += f"  分析: {signal.get('analysis', '')}\n"

        formatted += "\n## 重要新闻 (挑选2个最重要的作为热点)\n### 头条\n"
        for h in headlines[:3]:
            if isinstance(h, dict):
                formatted += f"- {h.get('title', '')}\n"
                formatted += f"  事实: {h.get('fact_summary', '')}\n"
                formatted += f"  影响: {h.get('deep_analysis', '')[:200]}...\n\n"

        formatted += "### 其他快讯\n"
        for b in briefs[:5]:
            if isinstance(b, dict):
                formatted += f"- {b.get('title', '')}: {b.get('summary', '')}\n"

        formatted += "\n## 未来事件 (挑选3-5个最重要的)\n"
        for event in calendar[:10]:
            if isinstance(event, dict):
                formatted += f"- {event.get('date', '')}: {event.get('event', '')}\n"

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
                        text=f"请根据以下市场日报生成小红书图文内容:\n\n{formatted_report}"
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
                f"[RedNoteAgent] Generated content. Title: {result.get('title', '')[:30]}"
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
