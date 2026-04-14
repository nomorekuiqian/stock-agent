"""
Weekly Macro Report - Data Models

Defines the Pydantic schemas for weekly report data collection (input)
and AI-generated report content (output/storage).
"""

from typing import Optional
from pydantic import BaseModel, Field


class SectionAnalysis(BaseModel):
    """Analysis for a single macro section (liquidity, economy, inflation, sentiment)."""

    summary: str = Field(
        description=(
            "1-2句维度总结: 判断 + 证据 + 对股市的含义。"
            "不是描述维度本身，而是回答这个维度对买股票意味着什么。"
        )
    )
    data_changes: str = Field(
        description=(
            "当前状况：首句为定性判断+关键数据(如'流动性环境整体偏紧，净流动性$5.7T处于较低水平')。"
            "然后按预定义的子维度逐一覆盖，每个子维度用**粗体标题**分隔。"
            "每个指标用通俗解释加括号标注的格式，如'借钱变得更容易了(NFCI -0.56)'、'经济增速远超长期均值(GDP 4.4%)'。"
            "禁止在输出中出现'大白话'或'但是尽量'这几个字。"
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
            "不要给出具体的投资建议或ETF推荐，投资建议统一在takeaway中给出。"
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

    title: str = Field(
        description=(
            "报告标题: 6-12个字，概括本周宏观核心主题。"
            "格式: 名词短语或判断句，不带标点。"
            "好例子: '通胀退烧遇上就业降温' / '流动性拐点初现' / '强经济撞上高利率'"
        )
    )
    verdict: str = Field(
        description="一句话判断: 立场(进攻/防守/中性偏X) + 核心原因 + 最需关注的变量。"
    )
    signal_lights: SignalLights = Field(
        description="四维度信号灯，基于数据给出 green/yellow/red 判断"
    )
    landscape: str = Field(
        description=(
            "宏观格局 -- 当前宏观环境的核心矛盾和主导力量。2-3段: "
            "第1段: 当前主导力量和核心矛盾; "
            "第2段: 这种环境历史上有利于什么方向; "
            "第3段: 什么会改变当前格局 + 3-6个月展望。"
        )
    )
    narrative: str = Field(
        description=(
            "本周回顾 -- 报告主体。把四个维度(流动性/经济/通胀/情绪)的变化"
            "编织成一个连贯故事，按因果逻辑而非维度分类组织。5-7段叙事。"
        )
    )
    takeaway: str = Field(
        description=(
            "策略启示 -- 策略判断。3段:\n"
            "1. 定调: 偏进攻/防守/中性，为什么\n"
            "2. 方向性倾向+失效条件\n"
            "3. 市场可能忽视了什么"
        )
    )
    week_ahead: list[WeekAheadEvent] = Field(
        description="下周关注: 3-5 个关键事件"
    )

    liquidity_analysis: SectionAnalysis = Field(description="流动性环境分析(详情页)")
    economy_analysis: SectionAnalysis = Field(description="经济基本面分析(详情页)")
    inflation_analysis: SectionAnalysis = Field(description="通胀与利率分析(详情页)")
    sentiment_analysis: SectionAnalysis = Field(description="市场情绪分析(详情页)")


class WeeklyMacroReport(BaseModel):
    """Complete weekly macro report - stored in DB, includes metadata."""

    week_label: str = Field(description="周标签，如 '2025.W06'")
    generated_at: str = Field(description="生成时间 ISO 8601")

    title: str = Field(description="报告标题")
    verdict: str = Field(description="一句话判断")
    signal_lights: SignalLights = Field(description="四维度信号灯")
    landscape: str = Field(description="宏观格局")
    narrative: str = Field(description="本周回顾")
    takeaway: str = Field(description="策略启示")
    week_ahead: list[WeekAheadEvent] = Field(description="下周关注")

    liquidity_analysis: SectionAnalysis = Field(description="流动性环境分析")
    economy_analysis: SectionAnalysis = Field(description="经济基本面分析")
    inflation_analysis: SectionAnalysis = Field(description="通胀与利率分析")
    sentiment_analysis: SectionAnalysis = Field(description="市场情绪分析")


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

    # 趋势上下文
    trend_context: Optional[dict] = Field(
        default=None,
        description=(
            "核心指标的趋势统计 (按频率分类): "
            "daily(week_change/month_direction), weekly(4w_direction/percentile_1y), "
            "monthly(consecutive_months/vs_6m_ago/vs_1y_ago), quarterly(prev_value/yoy_change)"
        ),
    )

    # 日历
    economic_calendar: list = Field(
        default_factory=list, description="未来 14 天经济事件日历"
    )
    earnings_calendar: list = Field(
        default_factory=list, description="未来 14 天财报日历"
    )
    this_week_events: list = Field(
        default_factory=list,
        description="本周已发生的高影响经济事件 (含 actual vs estimate, surprise direction)",
    )
