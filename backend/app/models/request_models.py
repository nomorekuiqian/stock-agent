from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class MarketIndex(BaseModel):
    """Single market index data"""
    name: str = Field(..., description="Index name, e.g., 'S&P 500', 'VIX'")
    value: float = Field(..., description="Current value")
    previous_value: Optional[float] = Field(None, description="Previous value")
    change_percent: Optional[float] = Field(None, description="Percent change")


class MarketTrend(BaseModel):
    """Trend data for an index"""
    name: str = Field(..., description="Index name")
    current: float = Field(..., description="Current value")
    week_change: float = Field(..., description="1-week change percent")
    month_change: float = Field(..., description="1-month change percent")
    trend: str = Field(..., description="Trend direction: Strongly Bullish/Bullish/Bearish/Strongly Bearish")


class YieldCurveData(BaseModel):
    """Treasury yield curve data"""
    rates: dict = Field(default={}, description="Yield rates by maturity (3M, 5Y, 10Y, 30Y)")
    changes: dict = Field(default={}, description="Daily changes in rates")


class SpreadsData(BaseModel):
    """Yield curve spread data"""
    ten_y_3m: Optional[float] = Field(None, alias="10y_3m", description="10Y-3M spread (primary recession indicator)")
    ten_y_5y: Optional[float] = Field(None, alias="10y_5y", description="10Y-5Y spread")
    inversion_warning: bool = Field(default=False, description="True if yield curve is inverted")


class LiquidityData(BaseModel):
    """Liquidity and rate data"""
    yield_curve: YieldCurveData = Field(default_factory=YieldCurveData, description="Treasury yield curve")
    spreads: SpreadsData = Field(default_factory=SpreadsData, description="Yield curve spreads")


class MacroData(BaseModel):
    """Macro data with indices, trends, liquidity, and analysis"""
    indices: List[MarketIndex] = Field(..., description="List of market indices")
    trends: List[MarketTrend] = Field(default=[], description="Trend data for each index")
    liquidity: Optional[LiquidityData] = Field(default=None, description="Liquidity and rate data")
    timestamp: datetime = Field(default_factory=datetime.now, description="Data timestamp")
    short_analysis: str = Field(default="", description="Short 2-3 sentence analysis")
    in_depth_analysis: str = Field(default="", description="Detailed trend analysis")
