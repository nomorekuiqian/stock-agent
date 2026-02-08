"""
Weekly Macro Report - Data Models

Defines the Pydantic schemas for weekly report data collection (input)
and AI-generated report content (output/storage).
"""

from typing import Optional
from pydantic import BaseModel, Field


# =============================================================================
# AI Output Models (stored in DB, displayed on frontend)
# =============================================================================


class SectionAnalysis(BaseModel):
    """Analysis for a single macro section (liquidity, economy, inflation, sentiment)."""

    data_changes: str = Field(
        description="本周数据变化（客观陈述）：列出 2-3 个有显著变化的关键指标及其数值"
    )
    trend_interpretation: str = Field(
        description="趋势解读（分析）：1-2 句话解释数据变化的含义和趋势方向"
    )
    market_implication: str = Field(
        description="对股市的含义（判断）：明确说明这对股市/投资意味着什么"
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
        description="本周宏观定调：2-3 段话的综合判断，必须给出明确的环境定性和对股市的关联"
    )
    signal_lights: SignalLights = Field(
        description="四维度信号灯，基于数据给出 green/yellow/red 判断"
    )
    market_recap: str = Field(
        description="本周市场回顾：3-4 句话的 high-level 总结，只讲指数周度表现和风格/板块趋势"
    )

    liquidity_analysis: SectionAnalysis = Field(description="流动性环境分析")
    economy_analysis: SectionAnalysis = Field(description="经济基本面分析")
    inflation_analysis: SectionAnalysis = Field(description="通胀与利率分析")
    sentiment_analysis: SectionAnalysis = Field(description="市场情绪分析")

    investment_implications: str = Field(
        description="对股市的启示：风格倾向 + 板块偏好 + 风险提示，这是最有态度的部分"
    )
    week_ahead: list[WeekAheadEvent] = Field(
        description="下周关注：3-5 个关键经济事件及其 if-then 预判"
    )


class WeeklyMacroReport(BaseModel):
    """Complete weekly macro report - stored in DB, includes metadata."""

    week_label: str = Field(description="周标签，如 '2025.W06'")
    generated_at: str = Field(description="生成时间 ISO 8601")

    executive_summary: str = Field(
        description="本周宏观定调：2-3 段话的综合判断，必须给出明确的环境定性和对股市的关联"
    )
    signal_lights: SignalLights = Field(
        description="四维度信号灯"
    )
    market_recap: str = Field(
        description="本周市场回顾：3-4 句话的 high-level 总结，只讲指数周度表现和风格/板块趋势"
    )

    liquidity_analysis: SectionAnalysis = Field(description="流动性环境分析")
    economy_analysis: SectionAnalysis = Field(description="经济基本面分析")
    inflation_analysis: SectionAnalysis = Field(description="通胀与利率分析")
    sentiment_analysis: SectionAnalysis = Field(description="市场情绪分析")

    investment_implications: str = Field(
        description="对股市的启示：风格倾向 + 板块偏好 + 风险提示，这是最有态度的部分"
    )
    week_ahead: list[WeekAheadEvent] = Field(
        description="下周关注：3-5 个关键经济事件及其 if-then 预判"
    )


# =============================================================================
# Data Collection Models (input to AI Agent)
# =============================================================================


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
