"""
Macro Agent - Simplified Architecture

Architecture:
    Python (fetch data) -> Analyst Agent (analyze)

No more data_news_fetcher_agent - data is fetched directly in Python
and passed to the analyst agent for analysis.
"""

import json
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

# Import data fetching tools
from agents.tools import get_all_market_data
from agents.tools.news import get_combined_market_news
from agents.tools.calendar import get_economic_calendar
from agents.tools.earnings import get_earnings_calendar


# =============================================================================
# Analyst Agent Definition
# =============================================================================

ANALYST_INSTRUCTION = """
0) 你的角色

你是一位面向大众的财经内容创作者：把复杂市场讲得清楚、好读、可转发。

语气：专业但不端着；直白有观点；不喊单。

目标：仅基于输入 JSON 的数据与新闻，产出一篇当日市场日报，让读者快速理解：今天发生了什么、市场为何这样反应、接下来该关注什么。

1) 输入

你会收到一份 JSON（字段可能缺失），通常包含：

市场数据（指数/ETF、波动率、利率/利差、信用、商品、汇率、板块等，以实际给到为准）

news[]（title/text/source/url）

economic_calendar[]

earnings_calendar[]

2) 输出骨架（唯一固定结构）

全文必须使用 Markdown，并且必须按以下 6 个一级标题（##）输出：

## 1. 市场一句话

## 2. 今天市场在交易什么

## 3. 关键指标与信号

## 4. 资产/板块：你认为最重要的几件事

## 5. 新闻：你认为最值得读的几条

## 6. 未来 1–2 周：观察清单

除以上骨架外，所有写法与选材由你决定。

3) 全局规则（写什么与怎么写）

3.1 选材规则（给你决策权，但不散）

从所有可用输入里优先挑选：

冲击最大：当日变化显著、出现拐点、或对情绪/定价最敏感的项目

解释力最强：最能回答“为什么涨/跌、为什么轮动、为什么分歧”的少数信号

可验证：能给出接下来可观察的验证点（数据/事件/财报/政策表态等）

若跨资产出现互相矛盾（例如股市走强但信用走弱），必须点名“分歧”，并给出可能原因。

3.2 口径与可核对性（必须执行）

你在引用任何价格/利率/点位/涨跌幅时，必须同时给出：

标的名称/代码（以输入为准）

单位/口径（美元/点/收益率%；ETF/期货/指数；收盘/盘中/盘后）

写法示例（仅示例，数值必须来自输入）：

“USO（原油 ETF，收盘）69.25（-1.83%）”

“10Y 美债收益率（收盘，%）4.14%”

3.3 硬约束（不可违反）

不编造任何数据、新闻事实或来源；缺失就写“未提供/暂无数据”。

不提供买卖指令：不写买入/卖出/加仓/减仓/仓位；只做解读与情景推演（“如果…那么…”）。

观点要可核对：关键判断必须引用输入里的证据（数字/事件/新闻点）。

术语首次出现必须解释：用 1 句大白话或比喻。

3.4 排版与可读性

段落短，适合手机阅读。

关键数字加粗（例如 +1.2%）。

emoji 可用可不用；若用，全篇不超过 3 个。

4) 分板块写作要求（便于你日后单独修改）

## 1. 市场一句话

目标：读者 3 秒内明白今天整体是的市场情况

## 2. 今天市场在交易什么

目标：给出当日“定价主线”，用最少信号解释最大变化。

必须包含：

你判断的主线（可以 1 条，也可以 2 条，但不要更多）

支撑主线的证据（引用输入里的数字/新闻/事件）

必须处理：

若存在错位/矛盾（跨资产、风格、板块），要明确写出“分歧”与可能原因

## 3. 宏观指标流动与性

目标：用数据来解释当前的宏观指标和流动性如何，比较短期内的趋势

你自行选择*：从输入里挑你认为最有解释力的若干信号（数量不设限，但宁可少而精）。*

每个信号必须回答（写法自由，可一段话也可要点）：

这是什么（大白话/比喻）

今天怎么变了（给可核对数值/方向，且写清标的与口径）

通常会影响什么（方向性，不喊单）

## 4. 资产/板块：你认为最重要的几件事

目标：把它写成读者可执行的“观察框架”，而不是泛泛点评。

你自行选择：讲你认为当日最重要的若干资产/板块（指数、ETF、商品、汇率、行业都可以）。

对每个资产/板块必须回答（写法自由）：

发生了什么：给 1–2 个可核对证据（数字/事件/新闻点；含口径）

为什么重要：它与主线/风险偏好/流动性/增长预期的关系

影响路径：它可能影响哪些风格/资产/行业（方向性，不喊单）

验证点：接下来观察什么能证明/证伪你的解读（具体到数据/事件/财报/政策表态）

## 5. 新闻：你认为最值得读的几条

目标：新闻要“多、准、可点击”，让读者能验证与深挖。

默认输出数量：尽量输出 10–15 条（以输入 news[] 信息密度为准）。

硬要求：

每条新闻必须包含可用 url，并以 [阅读原文](url) 提供；无链接不输出。

必须按你判断的“市场影响力/定价相关性”排序；避免纯八卦/营销稿。

必须得是真的事件新闻而不是第三方分析师点评公司

## 6. 未来 1–2 周：观察清单

目标：降低焦虑，让读者知道“盯哪些节点、什么结果算信息”。

你自行选择：从 economic_calendar[] 与 earnings_calendar[] 中挑关键节点（数量不设限，但宁可少而关键）。

必须包含：

一份“关键节点清单”（事件/财报皆可）

用日期排序返回
"""

analyst_agent = Agent(
    name="market_analyst",
    model="gemini-3-pro-preview",
    description="Analyzes market data and news, provides insights in Chinese",
    instruction=ANALYST_INSTRUCTION,
    output_key="analysis",
)

# =============================================================================
# Refinement Agent Definition
# =============================================================================

REFINEMENT_INSTRUCTION = """
0) 你的角色

你是一位资深财经内容编辑和质量控制专家。你的任务是评估并优化 Analyst Agent 产出的市场日报。

你会收到：
1. 用户输入中的原始数据 JSON（包含市场数据、新闻、日历等）
2. 前一个 Agent (market_analyst) 生成的初稿，存储在 state["analysis"] 中

你的目标：
- 从 6 个维度严格评估初稿质量
- 指出具体问题并给出修改建议
- 输出优化后的终稿

1) 评估维度与评分标准

你必须从以下 6 个维度进行评估，每个维度满分 10 分：

### 维度 1：事实准确性 (Factual Accuracy) - 权重 25%

检查项：
- 数据一致性：报告中引用的数字是否与输入 JSON 完全一致
- 标的/口径匹配：价格、收益率、涨跌幅是否标注了正确的标的代码和口径（ETF/期货/指数、收盘/盘中）
- 无编造内容：是否存在输入数据中没有的"事实"
- 新闻链接有效性：每条新闻是否都有有效 URL

评分标准：
- 10分：所有数据100%准确，无任何编造
- 7-9分：有1-2处小数点/四舍五入差异，但无实质错误
- 4-6分：有3-5处数据不一致或口径不清
- 1-3分：存在明显编造或多处严重错误
- 0分：大量数据错误，完全不可信

### 维度 2：结构完整性 (Structural Completeness) - 权重 15%

检查项：
- 6 章节完整：是否包含全部 6 个必需章节
- 章节顺序正确：是否按 1-6 的顺序排列
- 必填字段覆盖：每个章节的"必须包含"项是否齐全
- Markdown 格式：标题层级、加粗、链接格式是否正确

必需章节：
1. 市场一句话
2. 今天市场在交易什么
3. 关键指标与信号
4. 资产/板块：你认为最重要的几件事
5. 新闻：你认为最值得读的几条
6. 未来 1-2 周：观察清单

评分标准：
- 10分：6个章节完整、顺序正确、格式规范
- 7-9分：章节完整但有轻微格式问题
- 4-6分：缺少1个章节或顺序错误
- 1-3分：缺少2个以上章节
- 0分：结构混乱，无法辨识章节

### 维度 3：逻辑一致性 (Logical Coherence) - 权重 20%

检查项：
- 主线贯穿：第 2 节的"定价主线"是否在后续章节得到支撑
- 证据链完整：观点 - 证据 - 影响路径 是否形成闭环
- 矛盾处理：跨资产分歧是否被识别并解释
- 因果关系："为什么"的解释是否合理

评分标准：
- 10分：主线清晰、证据充分、矛盾处理得当
- 7-9分：主线明确但个别证据链不完整
- 4-6分：主线模糊或存在未解释的矛盾
- 1-3分：观点与证据脱节
- 0分：逻辑混乱，自相矛盾

### 维度 4：可读性 (Readability) - 权重 15%

检查项：
- 段落长度：是否适合手机阅读（单段 <150 字）
- 术语解释：专业术语首次出现是否有大白话解释
- 信息密度：是否有冗余/重复内容
- 数字加粗：关键数字是否使用加粗
- Emoji 克制：全篇 emoji 不超过 3 个

评分标准：
- 10分：段落简洁、术语解释到位、排版清晰
- 7-9分：整体可读但有个别长段落或术语未解释
- 4-6分：多处段落过长或术语堆砌
- 1-3分：大段文字墙，可读性差
- 0分：完全无法阅读

### 维度 5：合规性 (Compliance) - 权重 15%

检查项：
- 无投资建议：是否避免了买/卖/加仓/减仓等指令性语言
- 情景推演：观点是否以"如果...那么..."的形式呈现
- 风险提示：是否有必要的不确定性表述

违规词汇黑名单：买入、卖出、加仓、减仓、建仓、清仓、做多、做空、抄底、逃顶、仓位、持仓

评分标准：
- 10分：完全合规，无任何投资建议
- 7-9分：措辞谨慎，偶有边界表述但可接受
- 4-6分：有1-2处接近投资建议的表述
- 1-3分：存在明显投资建议
- 0分：多处直接投资指令

### 维度 6：信息价值 (Information Value) - 权重 10%

检查项：
- 选材优先级：是否优先选择了冲击最大、解释力最强的信号
- 可验证性：是否提供了未来可观察的验证点
- 新闻数量：第 5 节是否达到 10-15 条（有链接）
- 日历筛选：第 6 节是否按日期排序、聚焦关键节点

评分标准：
- 10分：选材精准、验证点明确、新闻充足
- 7-9分：选材合理但验证点不够具体
- 4-6分：选材平庸或新闻数量不足
- 1-3分：选材随意，缺乏重点
- 0分：无信息价值

2) 输出格式

你必须按以下格式输出，使用 Markdown：

---

## 评估报告

### 总分：XX/100

### 各维度评分

| 维度 | 得分 | 权重 | 加权分 |
|------|------|------|--------|
| 事实准确性 | X/10 | 25% | X.X |
| 结构完整性 | X/10 | 15% | X.X |
| 逻辑一致性 | X/10 | 20% | X.X |
| 可读性 | X/10 | 15% | X.X |
| 合规性 | X/10 | 15% | X.X |
| 信息价值 | X/10 | 10% | X.X |

### 问题清单

#### 严重问题（必须修复）
1. [维度] 问题描述 | 位置 | 修改建议

#### 一般问题（建议修复）
1. [维度] 问题描述 | 位置 | 修改建议

#### 轻微问题（可选修复）
1. [维度] 问题描述 | 位置 | 修改建议

---

## 优化后的终稿

（在此输出修复所有严重问题和一般问题后的完整日报，保持原有 6 章节结构）

---

3) 工作流程

1. 仔细阅读原始数据 JSON，建立事实基准
2. 逐段审查初稿，与原始数据交叉验证
3. 按 6 个维度逐一评分，记录具体问题
4. 生成问题清单，按严重程度分类
5. 基于问题清单，输出优化后的终稿

4) 硬约束

- 你只能基于原始数据 JSON 中的信息进行修改，不可引入新数据
- 优化后的终稿必须保持原有 6 章节结构
- 如果初稿已经很好（总分 >= 85），仍需输出评估报告，终稿可与初稿相同
- 评分必须严格，不可"放水"
"""

refinement_agent = Agent(
    name="report_refiner",
    model="gemini-3-pro-preview",
    description="Evaluates and refines market analysis reports with 6-dimension scoring",
    instruction=REFINEMENT_INSTRUCTION,
    output_key="refinement",
)

# =============================================================================
# Sequential Agent: Analyst -> Refinement Pipeline
# =============================================================================

market_report_agent = SequentialAgent(
    name="market_report_pipeline",
    description="Complete market report pipeline: analyst generates draft, refiner evaluates and improves",
    sub_agents=[analyst_agent, refinement_agent],
)

# ADK web UI needs root_agent variable
root_agent = market_report_agent


# =============================================================================
# MacroAgent Wrapper Class
# =============================================================================


class MacroAgent:
    """Wrapper class to fetch data and run the sequential agent pipeline."""

    def __init__(self, client=None):
        self.runner = InMemoryRunner(agent=market_report_agent, app_name="stock_agent")

    async def analyze(self) -> dict:
        """Fetch all data and run the sequential agent pipeline."""
        try:
            print("[MacroAgent] Fetching market data...")

            # Step 1: Fetch all data directly (no LLM needed)
            market_data = get_all_market_data()
            news_result = get_combined_market_news(days=1)
            calendar_result = get_economic_calendar(days=14)
            earnings_result = get_earnings_calendar(days=7)

            print(
                f"[MacroAgent] Data fetched. News: {news_result.get('news_count', 0)}, "
                f"Calendar: {calendar_result.get('events_count', 0)}, "
                f"Earnings: {earnings_result.get('earnings_count', 0)}"
            )

            # Step 2: Prepare data for the pipeline
            report_date = datetime.now().strftime("%Y-%m-%d %A")

            data_for_analyst = {
                "report_date": report_date,
                "market_data": market_data,
                "news": news_result.get("news", [])[:50],  # Top 50 news
                "economic_calendar": calendar_result.get("events", []),
                "earnings_calendar": earnings_result.get("earnings", []),
            }

            # Step 3: Create session and run the sequential pipeline
            print("[MacroAgent] Running sequential pipeline (analyst -> refiner)...")

            session = await self.runner.session_service.create_session(
                app_name="stock_agent", user_id="pipeline"
            )

            # Send data to the pipeline
            message = Content(
                parts=[
                    Part(
                        text=f"Please analyze the following market data and provide a comprehensive report:\n\n{json.dumps(data_for_analyst, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            # Collect outputs from both agents
            draft_text = ""
            refinement_text = ""

            async for event in self.runner.run_async(
                user_id="pipeline", session_id=session.id, new_message=message
            ):
                if hasattr(event, "content") and event.content:
                    if hasattr(event.content, "parts"):
                        for part in event.content.parts:
                            if hasattr(part, "text") and part.text:
                                text = part.text.strip()
                                if text and len(text) > 50:
                                    # Check if this is from analyst or refiner based on content
                                    if (
                                        "## 评估报告" in text
                                        or "## 优化后的终稿" in text
                                    ):
                                        refinement_text = text
                                        print(
                                            f"[MacroAgent] Refinement output received. Length: {len(text)}"
                                        )
                                    elif (
                                        "## 1. 市场一句话" in text
                                        and not refinement_text
                                    ):
                                        draft_text = text
                                        print(
                                            f"[MacroAgent] Analyst draft received. Length: {len(text)}"
                                        )

            # Step 4: Parse results
            evaluation_report, final_analysis = self._parse_refinement(refinement_text)

            # Use final_analysis from refinement if available, otherwise use draft
            analysis_to_parse = final_analysis if final_analysis else draft_text
            short_analysis, in_depth_analysis = self._parse_analysis(analysis_to_parse)

            print("[MacroAgent] Pipeline complete.")

            return {
                "market_data": market_data,
                "news_data": {
                    "count": news_result.get("news_count", 0),
                    "articles": news_result.get("news", [])[:10],
                    "filters": news_result.get("filters", {}),
                },
                "economic_calendar": {
                    "count": calendar_result.get("events_count", 0),
                    "events": calendar_result.get("events", []),
                    "date_range": calendar_result.get("date_range", {}),
                },
                "earnings_calendar": {
                    "count": earnings_result.get("earnings_count", 0),
                    "earnings": earnings_result.get("earnings", []),
                    "date_range": earnings_result.get("date_range", {}),
                },
                "timestamp": datetime.now().isoformat(),
                "short_analysis": short_analysis,
                "in_depth_analysis": in_depth_analysis,
                "evaluation_report": evaluation_report,
                "draft_analysis": draft_text,
            }

        except Exception as e:
            print(f"Error in macro analysis: {e}")
            import traceback

            traceback.print_exc()

            # Fallback - return data without analysis
            market_data = get_all_market_data()
            return {
                "market_data": market_data,
                "news_data": {"count": 0, "articles": [], "filters": {}},
                "economic_calendar": {"count": 0, "events": [], "date_range": {}},
                "earnings_calendar": {"count": 0, "earnings": [], "date_range": {}},
                "timestamp": datetime.now().isoformat(),
                "short_analysis": f"Data fetched (analysis error: {str(e)[:100]})",
                "in_depth_analysis": "",
            }

    def _parse_refinement(self, text: str) -> tuple[str, str]:
        """Parse the refinement agent response into evaluation report and final analysis."""
        if not text:
            return "", ""

        text = text.strip()

        # Look for the "## 优化后的终稿" section
        final_markers = ["## 优化后的终稿", "## 优化后终稿", "# 优化后的终稿"]
        evaluation_markers = ["## 评估报告", "# 评估报告"]

        evaluation_report = ""
        final_analysis = ""

        # Find evaluation report section
        eval_start = -1
        for marker in evaluation_markers:
            idx = text.find(marker)
            if idx != -1:
                eval_start = idx
                break

        # Find final analysis section
        final_start = -1
        for marker in final_markers:
            idx = text.find(marker)
            if idx != -1:
                final_start = idx
                break

        if eval_start != -1 and final_start != -1:
            # Both sections found
            if eval_start < final_start:
                evaluation_report = text[eval_start:final_start].strip()
                final_analysis = text[final_start:].strip()
                # Remove the header from final analysis
                for marker in final_markers:
                    final_analysis = final_analysis.replace(marker, "").strip()
            else:
                evaluation_report = text[eval_start:].strip()
                final_analysis = text[:eval_start].strip()
        elif final_start != -1:
            # Only final analysis found
            final_analysis = text[final_start:].strip()
            for marker in final_markers:
                final_analysis = final_analysis.replace(marker, "").strip()
        elif eval_start != -1:
            # Only evaluation found, use the whole text
            evaluation_report = text

        # Clean up the divider lines
        if final_analysis.startswith("---"):
            final_analysis = final_analysis[3:].strip()
        if evaluation_report.endswith("---"):
            evaluation_report = evaluation_report[:-3].strip()

        return evaluation_report, final_analysis

    def _parse_analysis(self, text: str) -> tuple[str, str]:
        """Parse the agent response into short and in-depth analysis"""
        if not text:
            return "No analysis available.", ""

        text = text.strip()

        # Try to find market overview section as short analysis
        overview_markers = ["## 一、市场总览", "## 市场总览", "# 市场总览"]
        section_two_markers = ["## 二、", "## 宏观流动性"]

        short_analysis = ""
        in_depth_analysis = text

        for marker in overview_markers:
            idx = text.find(marker)
            if idx != -1:
                # Find where section two starts
                end_idx = len(text)
                for end_marker in section_two_markers:
                    section_two_idx = text.find(end_marker)
                    if section_two_idx != -1 and section_two_idx > idx:
                        end_idx = section_two_idx
                        break

                short_analysis = text[idx:end_idx].strip()
                # Remove the header from short analysis
                short_analysis = short_analysis.replace(marker, "").strip()
                break

        # If no marker found, use first paragraph
        if not short_analysis:
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            if paragraphs:
                short_analysis = paragraphs[0][:500]

        return short_analysis, in_depth_analysis
