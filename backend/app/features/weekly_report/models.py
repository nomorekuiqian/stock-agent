"""
Weekly Macro Report - Data Models

Defines the Pydantic schemas for weekly report data collection (input)
and AI-generated report content (output/storage).
"""

from typing import Optional
from pydantic import BaseModel, Field


class SectionAnalysis(BaseModel):
    """Analysis for a single macro section (liquidity, economy, inflation, sentiment)."""

    data_changes: str = Field(
        description=(
            "当前状况：首句为定性判断+关键数据(如'流动性环境整体偏紧，净流动性$5.7T处于较低水平')。"
            "然后按预定义的子维度逐一覆盖，每个子维度用**粗体标题**分隔。"
            "每个指标用'大白话翻译(专业名 数据值)'格式。"
            "只描述数据中实际存在的信息，不编造历史分位或历史定位。"
        )
    )
    trend_interpretation: str = Field(
        description=(
            "近期趋势：解释这些数据拼在一起意味着什么，"
            "必须引用其他资产或指标做交叉验证，并说清趋势方向和持续时间。"
            "直接说清楚发生了什么，不要用比喻或类比。"
        )
    )
    market_implication: str = Field(
        description=(
            "未来展望：基于当前数据和趋势，分析该维度在未来1-2周可能的走向。"
            "说明需要关注的关键变量和可能的转折点。"
            "不要给出具体的投资建议或ETF推荐，投资建议统一在investment_implications中给出。"
        )
    )


class SignalLights(BaseModel):
    """Four-dimension signal lights for weekly macro assessment."""

    liquidity: str = Field(description="流动性信号：green (利好) / yellow (中性) / red (利空)")
    economy: str = Field(description="经济信号：green (利好) / yellow (中性) / red (利空)")
    inflation: str = Field(description="通胀信号：green (利好) / yellow (中性) / red (利空)")
    sentiment: str = Field(description="情绪信号：green (利好) / yellow (中性) / red (利空)")


class WeekAheadEvent(BaseModel):
    """A key event to watch in the coming week."""

    date: str = Field(description="事件日期，如 '周三' 或 '2/12'")
    event: str = Field(description="事件名称，如 'CPI (预期 +0.2% MoM)'")
    if_above: str = Field(description="高于预期时的市场影响判断")
    if_below: str = Field(description="符合或低于预期时的市场影响判断")


class WeeklyReportOutput(BaseModel):
    """AI output schema - only fields the LLM generates (no week_label/generated_at)."""

    executive_summary: str = Field(
        description=(
            "宏观深度解读 -- 用连贯叙事解释本周市场为什么这样走。"
            "3-4 段, 直接说清楚发生了什么, 不要用比喻或类比。"
            "第1段: 本周最重要的1-2个宏观变化, 用大白话讲清楚。"
            "第2段: 不同市场(股/债/商品/汇率)在讲同一个故事吗? 用具体数据。"
            "第3段: 历史上出现过类似情况吗? 那次之后发生了什么? (自然融入叙事)"
            "第4段: 市场可能忽视了什么风险或机会?"
        )
    )
    signal_lights: SignalLights = Field(
        description="四维度信号灯，基于数据给出 green/yellow/red 判断"
    )
    market_recap: str = Field(
        description=(
            "本周市场速览 -- 用最直白的语言, 3-4句话讲清楚本周发生了什么。"
            "包含: 主要指数涨跌幅、板块领涨领跌、资金流向方向。"
        )
    )

    liquidity_analysis: SectionAnalysis = Field(description="流动性环境分析")
    economy_analysis: SectionAnalysis = Field(description="经济基本面分析")
    inflation_analysis: SectionAnalysis = Field(description="通胀与利率分析")
    sentiment_analysis: SectionAnalysis = Field(description="市场情绪分析")

    investment_implications: str = Field(
        description=(
            "宏观策略展望 -- 全篇最重要的部分，是前面分析的自然结论。3段:\n"
            "1. 定调: 综合四个维度，当前宏观环境偏进攻/防守/中性，并说明为什么\n"
            "2. 方向性倾向+失效条件: 风格和板块的方向性判断(用ETF ticker)，每个判断附带具体的失效条件\n"
            "3. 市场可能忽视了什么: 一个反共识观点，用大白话说清楚\n"
            "可以给方向性判断如'当前环境更有利于X'，但必须附带失效条件，禁止无条件的超配/低配/买入/卖出"
        )
    )
    week_ahead: list[WeekAheadEvent] = Field(
        description="下周关注: 4-5 个关键事件(宏观数据+重要财报+政策动向)"
    )


class WeeklyMacroReport(BaseModel):
    """Complete weekly macro report - stored in DB, includes metadata."""

    week_label: str = Field(description="周标签，如 '2025.W06'")
    generated_at: str = Field(description="生成时间 ISO 8601")

    executive_summary: str = Field(description="宏观深度解读")
    signal_lights: SignalLights = Field(description="四维度信号灯")
    market_recap: str = Field(description="本周市场回顾")

    liquidity_analysis: SectionAnalysis = Field(description="流动性环境分析")
    economy_analysis: SectionAnalysis = Field(description="经济基本面分析")
    inflation_analysis: SectionAnalysis = Field(description="通胀与利率分析")
    sentiment_analysis: SectionAnalysis = Field(description="市场情绪分析")

    investment_implications: str = Field(description="宏观策略展望")
    week_ahead: list[WeekAheadEvent] = Field(description="下周关注")


class MarketPerformance(BaseModel):
    """Weekly market performance summary."""

    indices: list[dict] = Field(
        default_factory=list,
        description="主要指数周度表现 (SPY/QQQ/DIA): [{symbol, name, weekly_change, last_close}]",
    )
    sectors: list[dict] = Field(
        default_factory=list,
        description="板块 ETF 周度表现: [{symbol, name, weekly_change, last_close}]",
    )
    style: list[dict] = Field(
        default_factory=list,
        description="风格对比 (IWF/IWD/IWM): [{symbol, name, weekly_change, last_close}]",
    )


class WeeklyRawData(BaseModel):
    """All raw data needed for weekly report generation."""

    week_label: str = Field(description="周标签，如 '2025.W06'")
    collected_at: str = Field(description="数据收集时间 ISO 8601")

    # 四板块数据（来自现有 service）
    macro_risk: Optional[dict] = Field(
        default=None, description="get_macro_risk_dashboard() 结果"
    )
    economy: Optional[dict] = Field(
        default=None, description="get_economic_fundamentals() 结果"
    )
    inflation_rates: Optional[dict] = Field(
        default=None, description="get_inflation_rates() 结果"
    )
    liquidity: Optional[dict] = Field(
        default=None, description="get_all_liquidity_metrics() 结果"
    )
    sentiment: Optional[dict] = Field(
        default=None, description="get_market_sentiment() 结果"
    )
    cpi_breakdown: Optional[dict] = Field(
        default=None, description="get_cpi_breakdown() CPI 分项数据"
    )
    liquidity_historical: Optional[dict] = Field(
        default=None,
        description=(
            "流动性历史摘要统计 (from 365-day history): "
            "各指标的 current/percentile_1y/52w_high/52w_low/1m_change/3m_change"
        ),
    )

    # 市场表现
    market_performance: Optional[MarketPerformance] = Field(
        default=None, description="指数 + 板块 ETF + 风格 周度表现"
    )

    # 日历
    economic_calendar: list = Field(
        default_factory=list, description="未来 14 天经济事件日历"
    )
    earnings_calendar: list = Field(
        default_factory=list, description="未来 14 天财报日历"
    )
