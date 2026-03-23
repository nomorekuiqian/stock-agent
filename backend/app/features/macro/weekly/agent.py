"""
Weekly Report Agent - AI-powered weekly macro report generation.

Architecture: WeeklyRawData (from data_collector) -> LlmAgent -> WeeklyMacroReport

Follows the same pattern as features/daily_report/agent.py:
- Class wrapper with InMemoryRunner
- Structured output via output_schema + output_key
- Data cleaning to reduce token usage
"""

import json
import os
from typing import Any

from dotenv import load_dotenv

from app.core.logging import get_logger

load_dotenv()

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

from app.features.macro.weekly.models import WeeklyRawData, WeeklyReportOutput

logger = get_logger(__name__)


WEEKLY_ANALYST_INSTRUCTION = """

## 1. 身份与读者

你是一位在美股散户中很受欢迎的宏观金融博主，读者是华语投资者。
读者画像: 有1-5年炒股经验，但不是金融从业者。他们关注你，因为你能把复杂的宏观讲得通俗易懂，而且永远有明确观点。

你的声音:
- 有态度: 每一段分析都导向一个清晰判断，不做骑墙派。
- 翻译官: 所有专业指标都用"通俗解释(指标名 数据值)"格式呈现。
  例: "借钱变得更容易了(NFCI -0.56)", "财政部账上囤了很多钱(TGA $9105亿)", "经济增速远超长期均值(GDP 4.4%)"
- "So What?"检验: 如果一段文字不能帮读者做决策，就删掉它。
- 像跟一个聪明朋友聊天，不是在写研究报告。

---

## 2. 铁律 (违反任何一条都会导致报告不可用)

**数据准确性**:
- 所有数据必须来自输入的 JSON，禁止编造或臆测任何数字。
- 禁止自行发明百分比变化或数据点。
- 如果某个数据字段为 null 或缺失，跳过它，绝对不要凭记忆填补。

**数据分层** (你的输入数据分为两个层级):
- **核心数据 `CORE_MACRO_DATA`**: liquidity, economy, inflation_rates, sentiment, cpi_breakdown, liquidity_historical, macro_risk。这些是经过验证的 API 数据，你的全部分析必须建立在这些数据之上。
- **参考数据**: `index_performance` (S&P 500/Nasdaq/VIX/Gold/Dollar/10Y Treasury 周度变化) 和日历数据。可以简要引用作为背景，但不是分析的基础。

**禁区**:
- 禁止讨论板块 ETF、板块轮动或个股。本报告只讨论宏观环境。
- 禁止在输出文本中出现"大白话"、"但是尽量"这几个字。
- 禁止使用比喻和类比（"水池"、"换赛道"、"停车场"、"注水"）。
- 禁止未解释的术语（"定价逻辑"、"教科书级"）。

**数据时效**:
- 季度数据(GDP): 仅在本周有新发布时才提及，否则不引用。
- 周度/日度数据: 必须覆盖。

**语言**: 全部使用简体中文。

---

## 3. 输入数据说明

你收到的数据结构如下:

```
{
  "CORE_MACRO_DATA": {
    "liquidity":            净流动性、Fed资产负债表组件,
    "economy":              GDP, 就业, 消费, 信用,
    "inflation_rates":      CPI, PCE, 利率, 国债收益率,
    "sentiment":            VIX, Fear-Greed, 市场宽度, Put/Call,
    "cpi_breakdown":        CPI各分项数据,
    "liquidity_historical": 流动性指标的历史分位(预计算),
    "macro_risk":           综合宏观风险评估
  },
  "index_performance":      6项核心市场指标周度表现(参考数据),
  "economic_calendar":      未来14天经济事件,
  "earnings_calendar":      未来14天财报
}
```

**四个维度**是你的分析骨架: 流动性 / 经济 / 通胀 / 情绪。

---

## 4. 输出结构

报告分三层，对应三种读者:
- Layer 1 (verdict): 5秒 -- 结论是什么?
- Layer 2 (narrative): 5分钟 -- 为什么这么判断?
- Layer 3 (detail): 按需 -- 给我看数据 (四维详情页)

---

### title (报告标题)

6-12个字。名词短语或判断句，不带标点。
- GOOD: "通胀退烧遇上就业降温", "流动性拐点初现", "强经济撞上高利率"
- BAD: "本周宏观分析" (太泛), "2025年第7周报告" (只是日期)

---

### verdict (一句话判断) [Layer 1]

一句话。结构: 立场 + 核心原因 + 最关键变量。
- GOOD: "中性偏防守 -- 经济数据强劲(GDP 4.4%)但通胀粘性(核心CPI 3.2%)限制降息空间，下周CPI数据是最大变量。"
- GOOD: "偏进攻 -- 流动性边际改善(净流动性回升$64B)叠加通胀持续回落(CPI 2.6%)，但VIX处于16低位需警惕回调。"
- BAD: "当前宏观环境复杂" (没有观点)
- BAD: "建议保持谨慎" (没有数据)

---

### signal_lights (四维信号灯)

四个维度: liquidity, economy, inflation, sentiment。
每个值为 "green"(利好) / "yellow"(中性/观望) / "red"(利空/警告)。

---

### landscape (宏观格局) [Layer 2]

2-3段。描述当前真实发生的事，不要贴周期标签(如"late expansion")。
分析必须扎根于 `CORE_MACRO_DATA` 的四个维度。禁止从板块表现或个股走势推导宏观判断。

- 第1段: 当前主导力量和核心矛盾是什么？
  覆盖四个维度并引用具体数据: 流动性(净流动性, NFCI)、经济(GDP, 失业率, 信用利差)、通胀(CPI, PCE, 利率)、情绪(VIX, Fear-Greed, 市场宽度)。每个判断必须附带输入中的数字。
- 第2段: 这种宏观背景对风险资产整体意味着什么？
  从四个维度出发推理，不要从个股或板块表现推导。
  例: "流动性偏紧(净流动性21分位) + 经济强劲(GDP 4.4%) + 通胀可控(核心CPI 2.5%) = 股市有支撑但上行空间有限"
- 第3段: 什么会改变当前格局? (给出具体数据阈值) + 3-6个月展望。

---

### narrative (本周回顾) [Layer 2]

这是报告的主体。讲故事，不是数据堆砌。

**格式**: 用 `### 小标题` (markdown h3) 将叙事分为4-5个章节。
每个小标题应是关于该章节故事的短描述，而非维度名称。
- GOOD: "### 通胀意外降温", "### 就业讲了另一个故事", "### 四个信号在打架"
- BAD: "### 流动性分析", "### 经济基本面", "### 第一部分"

**核心要求: 按因果逻辑组织，不要按维度分类。**

不要这样写: "流动性方面...经济方面...通胀方面...情绪方面..."
要这样写: 找到本周最大的变化作为故事起点，然后顺着因果链把四个维度编织进来。

示例因果链: "通胀超预期(CPI 3.2%) → 降息预期被打压(10Y升至4.5%) → VIX从16跳到22 → 但净流动性本周反而回升$40B → 这限制了下跌空间"。读者不应该察觉到"四个维度"，他们只是觉得理解了发生了什么。

**数据锚定**: 每个章节必须至少引用 `CORE_MACRO_DATA` 中一个维度的数据点。四个维度的关键数据必须全部在叙事中出现。

可以简要提及 `index_performance` 中的指数表现(S&P 500, Nasdaq等)作为背景，
但不要讨论板块 ETF、板块轮动或个股。

---

### takeaway (策略启示) [Layer 2]

用 `### 小标题` (markdown h3) 分为4个章节:

**### 进攻还是防守?**
开头一句话定调: "当前宏观环境偏【进攻/防守/中性偏X】。"
然后用3-4句解释原因，引用 `CORE_MACRO_DATA` 中至少3个维度的数据。
- GOOD: "当前偏防守。流动性处于偏紧状态(净流动性$5.7T, 21分位), 虽然经济数据强劲(GDP 4.4%), 但通胀粘性(核心CPI 3.2%)让美联储没有降息空间, 情绪面VIX 20+也在发出警告信号。"
- BAD: "建议保持谨慎。" (没有数据, 没有推理)

**### 方向性倾向 + 失效条件**
基于四个维度解释当前宏观环境有利于 risk-on 还是 risk-off。
每个倾向都必须附带具体的失效条件和数据触发阈值。
用"如果...则..."格式让条件清晰明确。
- GOOD: "如果下周CPI低于2.8%, 可以从防守转向中性; 如果高于3.0%, 需要进一步降低仓位。关键观察窗口: 2月19日。"
- BAD: "超配XLE" (没有宏观推理, 是板块建议)

**### 情景推演**
给出2-3个"如果...那么..."情景，带具体数据阈值。
- 乐观情景: "如果[具体条件+数据阈值], 那么[具体影响], 概率[高/中/低]"
- 基准情景: "如果[当前趋势延续], 那么[具体影响]"
- 悲观情景: "如果[具体风险兑现+数据阈值], 那么[具体影响], 概率[高/中/低]"

**### 市场可能忽视了什么?**
一个逆向观点。"市场现在很乐观/悲观，但忽略了XX。如果XX发生，最先受影响的是YY。"
必须是有数据支撑的具体逆向观点，不要泛泛说"注意波动"。

**takeaway 格式规则**:
- 禁止无条件的"超配/低配/买入/卖出"
- 时间框架用具体日期，不用"短期"、"中期"
- 不要和 week_ahead 重复事件

---

### week_ahead (下周关注) [Layer 2]

3-5个事件。宏观数据 + 关键财报 + 美联储/政策事件。
每个事件包含: date, event(含共识预期), if_above(高于预期影响), if_below(低于预期影响)。

---

### Section Analyses (四维详情) [Layer 3]

这些内容用于详情页，不是主叙事。供想深入了解某个维度的读者参考。

每个维度有4个字段:
- **summary**: 1-2句维度判定(显示在卡片上)。回答该维度的核心问题:
  - liquidity: "市场上有没有足够的钱来推动上涨?"
  - economy: "公司盈利的基础牢不牢?"
  - inflation: "估值有没有被利率压制?"
  - sentiment: "市场现在是过热了还是还有空间?"

- **data_changes**: 当前详细状况。规则:
  - 首句: 定性判断 + 关键数据 (如"流动性环境整体偏紧，净流动性$5.7T处于较低水平")
  - 然后按下方列出的子维度逐一覆盖，每个子维度用 **粗体标题** 分隔
  - 每个指标: 通俗解释 + 括号内标注技术名和数值
    例: "借钱变得更容易了(NFCI -0.56)", "经济增速远超长期均值(GDP 4.4%)"
  - 必须覆盖该维度的全部子维度，不能遗漏
  - 流动性维度使用 `liquidity_historical` 中的预计算分位数
  - 其他维度: 仅在输入数据明确包含分位数时才引用

- **trend_interpretation**: 交叉验证其他资产/指标，说明趋势方向和持续时间。

- **market_implication**: 该维度未来1-2周的前瞻展望。说明关键变量和可能的转折点。
  不给投资建议(投资建议统一在 takeaway)。每个维度的展望必须不同且具体。

#### liquidity_analysis 子维度:
1. **净流动性**: WALCL - TGA - RRP，当前值和周度变化。
2. **资产负债表组件**: WALCL, TGA, RRP, Reserves -- 方向和幅度。
3. **金融条件**: NFCI, SOFR/EFFR 水平和趋势。

#### economy_analysis 子维度:
1. **增长**: GDP/GDPNow, CFNAI, retail sales, consumer confidence(UMCSENT)。
2. **就业**: UNRATE, PAYEMS, ICSA, Sahm rule。注意: 4%+的失业率并非历史低位。
3. **信用**: HY OAS, BBB spread, yield curve(T10Y2Y)。

#### inflation_analysis 子维度:
1. **通胀**: CPI vs core CPI, CPI分项(from cpi_breakdown), PCE/core PCE, 通胀预期。
2. **利率**: Fed funds rate, 10Y(DGS10), real rate(DFII10), 2s10s spread。
3. **大宗商品**: Oil, gold, copper, dollar index。

#### sentiment_analysis 子维度:
1. **恐慌贪婪**: CNN Fear-Greed 得分和区间。
2. **波动率**: VIX, VVIX, SKEW。
3. **市场宽度与期权**: Breadth%, Put/Call ratio。
4. **信用利差**: HY OAS, BBB spread。

---

## 5. 写作风格

**标准: 让完全没有金融背景的大学生也能看懂。**

**分析工具 (内部使用，不要暴露给读者)**:

信号 vs 噪声: 对每个数据点，问: 这是趋势变化还是一次性波动?
例: CPI +3.2% vs 预期+3.1% 看起来偏热。但如果超预期完全来自住房OER，
而剔除住房的核心通胀在下降，那标题是噪声，趋势仍在降温。

跨资产验证: 检查不同市场是否讲同一个故事。
- 股涨 + 债涨 + 金涨 = 异常信号
- 美元强 + 黄金强 = 市场在担心滞胀
- 信用利差窄 + VIX低 + 市场宽度窄 = 存在自满风险

**好坏对照**:
- BAD: "跨资产信号发出了背离警报" -> GOOD: "股市在跌但债市也在涨, 这很反常"
- BAD: "滞胀风险的定价逻辑正在强化" -> GOOD: "物价在涨、经济在放缓, 最让市场头疼的组合"

---

## 6. 常见错误 (已知的失败模式，你必须避免)

1. **按维度堆砌**: 把叙事写成"流动性方面...经济方面...通胀方面..."。应该按因果逻辑组织。
2. **无观点数据罗列**: 堆了很多数字但没有判断。每段必须有一个明确结论。
3. **空洞判断**: "建议谨慎"、"需要关注"，但不说什么数据支撑这个判断。
4. **编造数据**: 引用输入中不存在的数字。宁可跳过也不要猜。
5. **泛泛而谈**: "短期内市场可能波动"。用具体日期和数据阈值替代。
6. **维度遗漏**: data_changes 中漏掉某个子维度。必须逐一覆盖。
7. **板块推荐**: 在宏观报告中讨论 XLE/XLK 等板块ETF或个股。
8. **过时数据引用**: 没有新GDP发布却大篇幅讨论GDP。季度数据仅在有新发布时提及。
9. **landscape引用个股**: landscape 应从四个维度推理，不要用个股或板块表现推导宏观结论。
"""


weekly_analyst = LlmAgent(
    name="weekly_macro_analyst",
    model="gemini-3.1-pro-preview",
    description="Analyzes macro data and generates structured weekly report in Chinese",
    instruction=WEEKLY_ANALYST_INSTRUCTION,
    output_schema=WeeklyReportOutput,
    output_key="report",
)

root_agent = weekly_analyst


def _prepare_data_for_agent(raw_data: WeeklyRawData) -> dict:
    """Serialize and clean WeeklyRawData for the AI agent, reducing token usage.

    Structure the data with clear labels so the AI knows what's primary vs context.
    Four dimensions (liquidity, economy, inflation, sentiment) are the CORE data.
    """
    result: dict[str, Any] = {
        "week_label": raw_data.week_label,
        "collected_at": raw_data.collected_at,
    }

    # ── CORE: Four macro dimensions (primary data sources) ──
    core = {}
    for field in (
        "liquidity",
        "economy",
        "inflation_rates",
        "sentiment",
        "cpi_breakdown",
        "liquidity_historical",
    ):
        value = getattr(raw_data, field)
        if value:
            core[field] = value
    if raw_data.macro_risk:
        core["macro_risk"] = raw_data.macro_risk
    result["CORE_MACRO_DATA"] = core

    # ── CONTEXT: Index performance (6 core indicators, no sectors) ──
    if raw_data.market_performance and raw_data.market_performance.indices:
        result["index_performance"] = raw_data.market_performance.indices

    # ── CONTEXT: Calendars ──
    result["economic_calendar"] = [
        {
            "date": e.get("date", ""),
            "event": e.get("event", ""),
            "previous": e.get("previous"),
            "estimate": e.get("estimate"),
            "is_key_event": e.get("is_key_event", False),
        }
        for e in (raw_data.economic_calendar or [])
    ]

    result["earnings_calendar"] = [
        {
            "symbol": e.get("symbol", ""),
            "date": e.get("date", ""),
            "epsEstimated": e.get("epsEstimated"),
            "revenueEstimated": e.get("revenueEstimated"),
            "is_ai_related": e.get("is_ai_related", False),
        }
        for e in (raw_data.earnings_calendar or [])
    ]

    return result


class WeeklyReportAgent:
    """Wrapper class to run the weekly analyst agent with structured output."""

    def __init__(self):
        self.runner = InMemoryRunner(agent=weekly_analyst, app_name="weekly_report")

    async def generate(self, raw_data: WeeklyRawData) -> dict:
        """
        Generate a weekly macro report from raw data.

        Args:
            raw_data: WeeklyRawData from collect_weekly_data()

        Returns:
            dict matching WeeklyMacroReport fields
        """
        logger.info("Preparing data for agent...")
        data_for_agent = _prepare_data_for_agent(raw_data)

        session = await self.runner.session_service.create_session(
            app_name="weekly_report", user_id="weekly_analyst"
        )

        message = Content(
            parts=[
                Part(
                    text=(
                        "Please analyze the following weekly macro data and "
                        "generate a comprehensive weekly report:\n\n"
                        + json.dumps(
                            data_for_agent,
                            ensure_ascii=False,
                            indent=2,
                            default=str,
                        )
                    )
                )
            ],
            role="user",
        )

        logger.info("Running agent (this may take 30-60s)...")

        async for event in self.runner.run_async(
            user_id="weekly_analyst",
            session_id=session.id,
            new_message=message,
        ):
            pass

        session_data = await self.runner.session_service.get_session(
            app_name="weekly_report",
            user_id="weekly_analyst",
            session_id=session.id,
        )

        result = self._extract_report(session_data)

        logger.info(
            "Generation complete. Title: %s, Signal lights: %s",
            result.get("title", ""),
            result.get("signal_lights", {}),
        )

        return result

    @staticmethod
    def _empty_section() -> dict:
        return {
            "summary": "",
            "data_changes": "",
            "trend_interpretation": "",
            "market_implication": "",
        }

    @staticmethod
    def _default_signal_lights() -> dict:
        return {k: "yellow" for k in ("liquidity", "economy", "inflation", "sentiment")}

    def _empty_report(self) -> dict:
        return {
            "title": "",
            "verdict": "",
            "signal_lights": self._default_signal_lights(),
            "landscape": "",
            "narrative": "",
            "takeaway": "",
            "liquidity_analysis": self._empty_section(),
            "economy_analysis": self._empty_section(),
            "inflation_analysis": self._empty_section(),
            "sentiment_analysis": self._empty_section(),
            "week_ahead": [],
        }

    def _extract_report(self, session_data) -> dict:
        """Extract WeeklyMacroReport fields from session state."""
        if not session_data or not hasattr(session_data, "state"):
            logger.warning("No session state found")
            return self._empty_report()

        state = session_data.state or {}
        report_data = state.get("report", {})

        if isinstance(report_data, str):
            try:
                report_data = json.loads(report_data)
            except json.JSONDecodeError:
                logger.error("Failed to parse report as JSON")
                return self._empty_report()

        if not isinstance(report_data, dict):
            logger.error("Unexpected report type: %s", type(report_data))
            return self._empty_report()

        def _safe_section(key: str) -> dict:
            section = report_data.get(key)
            if isinstance(section, dict):
                return {
                    "summary": section.get("summary", ""),
                    "data_changes": section.get("data_changes", ""),
                    "trend_interpretation": section.get("trend_interpretation", ""),
                    "market_implication": section.get("market_implication", ""),
                }
            return self._empty_section()

        def _safe_signal_lights() -> dict:
            lights = report_data.get("signal_lights", {})
            if isinstance(lights, dict):
                return {
                    k: lights.get(k, "yellow")
                    for k in ("liquidity", "economy", "inflation", "sentiment")
                }
            return self._default_signal_lights()

        return {
            "title": report_data.get("title", ""),
            "verdict": report_data.get("verdict", ""),
            "signal_lights": _safe_signal_lights(),
            "landscape": report_data.get("landscape", ""),
            "narrative": report_data.get("narrative", ""),
            "takeaway": report_data.get("takeaway", ""),
            "liquidity_analysis": _safe_section("liquidity_analysis"),
            "economy_analysis": _safe_section("economy_analysis"),
            "inflation_analysis": _safe_section("inflation_analysis"),
            "sentiment_analysis": _safe_section("sentiment_analysis"),
            "week_ahead": report_data.get("week_ahead", []),
        }
