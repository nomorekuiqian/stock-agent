"""
Macro Risk Dashboard - Pydantic Models
"""

from pydantic import BaseModel


class RiskIndicator(BaseModel):
    series_id: str
    name: str
    value: float | None = None
    date: str | None = None
    units: str = ""
    change: float | None = None
    previous_value: float | None = None
    source: str = "fred"


class CategoryRiskScore(BaseModel):
    category_id: int
    category_name: str
    risk_score: float  # 0-10
    risk_level: str  # "low" | "medium" | "high"
    headline: str
    indicators: list[RiskIndicator]


class AIStockInfo(BaseModel):
    symbol: str
    price: float | None = None
    daily_change: float | None = None
    name: str = ""


class MacroRiskDashboard(BaseModel):
    timestamp: str
    composite_score: float
    composite_level: str
    categories: list[CategoryRiskScore]
    ai_stocks: list[AIStockInfo] = []
    liquidity_summary: dict | None = None


class SubDimension(BaseModel):
    name: str  # "growth" / "employment" / "credit"
    name_zh: str  # Chinese label
    score: float  # 0-10
    risk_level: str  # "low" / "medium" / "high"
    weight: float  # 0.40 / 0.35 / 0.25
    headline: str
    indicators: list[RiskIndicator]


class EconomicFundamentals(BaseModel):
    timestamp: str
    overall_score: float  # 0-10 weighted total
    overall_level: str  # "low" / "medium" / "high"
    overall_headline: str
    sub_dimensions: list[SubDimension]
