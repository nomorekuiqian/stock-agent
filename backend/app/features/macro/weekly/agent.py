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
from app.shared.llm_metering import meter

WEEKLY_MACRO_MODEL = "gemini-3.5-flash"

logger = get_logger(__name__)


WEEKLY_ANALYST_INSTRUCTION = """

## 1. 身份与读者

你是一位在美股散户中很受欢迎的宏观金融博主，读者是华语投资者。
读者画像: 有1-5年炒股经验，但不是金融从业者。他们白天上班，晚上看盘，周末想花5分钟了解"接下来该怎么操作"。

你的声音:
- 像跟一个聪明朋友聊天，不是在写研究报告。语气直接、有温度。
- 有态度: 每一段分析都导向一个清晰判断。不说"需要关注"，说"现在可以买"或"先别动"。
- 翻译官: 每个专业数据都必须先用一句大白话解释，然后括号里放原始数据。
  格式: "通俗解释(指标名 数据值)"
  好例: "市场上的钱变少了(净流动性 $5.99万亿，处于近一年最低的1/5水平)"
  好例: "老板们还在招人(非农就业 +15.8万)"
  好例: "物价涨得没那么快了(核心CPI 2.6%，比上月降了)"
  坏例: "NFCI -0.433处于负值域" -- 散户不知道 NFCI 是什么
- "So What?"检验: 每说一个数据，必须紧跟"这对你的股票意味着什么"。如果这段话不能帮读者决定要不要加仓/减仓/不动，就删掉它。
- 每个维度的分析用一个问题开头: "市场上的钱够用吗？" "公司还能赚钱吗？" "物价会不会逼美联储加息？" "大家现在是恐慌还是贪婪？"

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
  "earnings_calendar":      未来14天财报,
  "this_week_events":       本周已发生的高影响经济事件(含 actual vs estimate 和 surprise 方向),
}
```

**本周事件数据** (`this_week_events`):
- 包含本周已发布的经济数据，每个事件有 `estimate`(预期)、`actual`(实际)、`surprise`(above/below/inline)
- 在 narrative 中，必须将事件与数据变动关联: "本周 CPI 公布 3.3%(vs 预期 3.1%，高于预期)，导致..."
- 区分"符合预期"和"超预期/不及预期"对市场的不同影响
- 不要简单罗列事件，要解释事件如何改变了四维度的信号

**趋势上下文** (`trend_context`，在 CORE_MACRO_DATA 中):
- 按数据频率分类的趋势统计: daily/weekly/monthly/quarterly
- 分析时引用趋势方向，不需要每个都提，只提有变化的
- 区分"水平好但趋势恶化"和"水平差但趋势改善"

**前瞻性指标** (在 CORE_MACRO_DATA 的各维度数据中):
以下指标专门用于"展望"和"未来怎么走"的分析，不是回顾:
- `lei` (LEI 领先经济指标, USSLIND): 预测未来6-12个月经济方向。连续下降→衰退概率升高。用在经济维度的展望中。
- `inflation_expectations_5y5y` (T5YIFR): 市场对长期通胀的预期。如果在涨，说明市场担心通胀长期化。用在通胀维度的展望中。
- `michigan_inflation` (MICH): 老百姓觉得未来物价会怎样。用在通胀维度的展望中。
- 在 landscape 的"未来3-6个月展望"段落中，必须引用 LEI 和通胀预期
- 在各维度的 market_implication 中，引用对应的前瞻指标

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

描述当前宏观环境的状态，不给投资建议。告诉读者"天气怎么样"，不告诉他们"要不要出门"。
结构: 环境描述 + 最核心的一个变化 + 下周最关键的一个变量。

- GOOD: "宏观环境对股市偏友好——物价在降(核心CPI 2.6%)意味着降息更近了，但经济也在放缓(GDP 0.5%)，下周零售销售数据将决定市场的下一步方向。"
- GOOD: "宏观信号比较混杂——经济还行但在减速，通胀降了但能源还在涨，市场情绪很紧张。下周 PPI 数据是最大的不确定性。"
- BAD: "可以加仓" / "建议减仓" (这是投资建议，我们不给)
- BAD: "偏进攻" / "偏防守" (太抽象)
- BAD: "当前宏观环境复杂" (没有信息量)

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

**核心要求: 事件驱动 + 异动驱动，不要罗列所有数据。**

只讲两种内容:
1. **本周发生了什么事**: 哪些重要数据公布了? 结果跟预期比怎么样? 市场怎么反应的?
2. **哪些数据有异动**: 跟上周/上月比，哪些数字变化明显? 没有变化的数据不要提。

不要这样写: 按维度罗列所有指标("流动性方面...经济方面...通胀方面...情绪方面...")
不要这样写: 把所有数据都提一遍，即使大部分数据没变化
要这样写: 从本周最大的事件/变化开始，只讲真正重要的事。

示例: "本周最大的事: CPI 出炉，核心通胀降到2.6%(比预期低)。市场立刻开始期待降息，10年期国债收益率跌到4.31%。但另一边，消费者信心崩了(47.6，非常低)，说明高利率确实在伤害普通人的消费意愿。"

**精简原则**:
- 整个 narrative 控制在3-4个段落，每段不超过5句话
- 没有新数据发布的维度，一句话带过或者不提
- 数据没变化的指标，不要提

可以简要提及 `index_performance` 中的指数表现(S&P 500, Nasdaq等)作为背景，
但不要讨论板块 ETF、板块轮动或个股。

---

### takeaway (环境解读与展望) [Layer 2]

用 `### 小标题` (markdown h3) 分为3个章节。精简，不给投资建议:

**### 当前环境怎么样?**
用2-3句话描述当前宏观环境的状态。只描述事实，不建议操作。
- GOOD: "目前有利条件多于不利条件。通胀在降温，降息预期在升温，这些对股市都是好消息。但经济在放缓，而且市场上的资金并不充裕，所以这种上涨能持续多久还不确定。"
- BAD: "建议加仓" / "可以买入" (投资建议)

**### 下周盯什么?**
告诉读者下周最关键的1-2个事件/数据。用场景化的语言描述不同结果可能意味着什么:
- GOOD: "最关键的是4月21日的零售销售数据。如果消费者还在花钱(涨幅>0.4%)，说明经济没那么差；如果不花钱了(涨幅<0.2%)，市场会开始担心衰退。"

**### 容易被忽视的信号**
一个大家可能没注意到的数据或现象:
- GOOD: "大家都在关注通胀降温的好消息，但消费者信心指数已经跌到47.6，这个水平在历史上通常伴随消费支出的实质性下降。"
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

这些内容用于详情页，供想深入了解某个维度的读者参考。
**精简原则**: 只讲本周有变化的数据和发生的事件。没有变化的指标不要提。每个 data_changes 控制在3-5句话。

每个维度有4个字段:
- **summary**: 1-2句维度判定(显示在仪表盘卡片上)。用散户能理解的语言回答该维度的核心问题:
  - liquidity: "市场上的钱够不够推动股价继续涨?"
  - economy: "公司还能赚到钱吗? 经济会不会衰退?"
  - inflation: "物价涨得快不快? 美联储会不会被迫加息?"
  - sentiment: "现在大家是恐慌还是贪婪? 还能不能买?"
  写法: 用聊天的口吻，不要用"整体偏紧"这种抽象表述。
  好例: "市场上的钱不太够用，股价涨主要靠公司自己赚钱，不是靠资金推。"
  好例: "经济还不错，但明显在减速，大家开始担心了。"
  坏例: "流动性环境整体偏紧，宏观资金供给处于近一年较低水平。" (太专业)

- **data_changes**: 当前详细状况。规则:
  - 首句用一个问题开头，然后直接回答:
    流动性: "市场上的钱够用吗? -- 不太够。..."
    经济: "公司还能赚到钱吗? -- 目前还行，但在变差。..."
    通胀: "物价还在涨吗? -- 好消息，涨得慢了。..."
    情绪: "现在该买还是该卖? -- 大家都很害怕，但反而可能是机会。..."
  - 然后按下方列出的子维度逐一覆盖，每个子维度用 **粗体标题** 分隔
  - 每个指标: 先用大白话解释这个数字意味着什么，然后括号里放原始数据
  - 格式: "老板们还在招人，每个月新增15.8万个工作岗位(非农就业 PAYEMS 158K)"
  - 不要: "PAYEMS 15.8万，环比正增长" (散户不知道 PAYEMS 是什么)
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
    model=WEEKLY_MACRO_MODEL,
    description="Analyzes macro data and generates structured weekly report in Chinese",
    instruction=WEEKLY_ANALYST_INSTRUCTION,
    output_schema=WeeklyReportOutput,
    output_key="report",
    after_model_callback=meter("macro.weekly", model=WEEKLY_MACRO_MODEL),
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
    if raw_data.trend_context:
        core["trend_context"] = raw_data.trend_context
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

    # ── NEW: This week's events (actual vs estimate) ──
    if raw_data.this_week_events:
        result["this_week_events"] = [
            {
                "date": e.get("date", ""),
                "event": e.get("event", ""),
                "estimate": e.get("estimate"),
                "actual": e.get("actual"),
                "surprise": e.get("surprise", "unknown"),
            }
            for e in raw_data.this_week_events
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
