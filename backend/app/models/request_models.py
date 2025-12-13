from pydantic import BaseModel, Field
from typing import Dict, Optional, Any
from datetime import datetime


class AssetData(BaseModel):
    """Single asset data with price and changes"""
    value: float = Field(..., description="Current value/price")
    daily_change: float = Field(..., description="Daily change percent")
    week_change: float = Field(..., description="1-week change percent")
    month_change: float = Field(..., description="1-month change percent")


class YieldCurveEntry(BaseModel):
    """Single yield curve entry"""
    rate: float = Field(..., description="Current yield rate")
    daily_change: float = Field(..., description="Daily change in rate")


class SpreadsData(BaseModel):
    """Yield curve spread data"""
    ten_y_3m: Optional[float] = Field(None, alias="10y_3m", description="10Y-3M spread")
    ten_y_5y: Optional[float] = Field(None, alias="10y_5y", description="10Y-5Y spread")
    thirty_y_10y: Optional[float] = Field(None, alias="30y_10y", description="30Y-10Y spread")

    class Config:
        populate_by_name = True


class RatesData(BaseModel):
    """Interest rates data"""
    yield_curve: Dict[str, YieldCurveEntry] = Field(default={}, description="Yield curve by maturity")
    spreads: SpreadsData = Field(default_factory=SpreadsData, description="Yield curve spreads")


class CreditData(BaseModel):
    """Credit market data"""
    HYG: Optional[AssetData] = Field(None, description="High Yield Bond ETF")
    LQD: Optional[AssetData] = Field(None, description="Investment Grade Bond ETF")
    hyg_lqd_spread: Optional[float] = Field(None, description="HYG-LQD performance spread")


class FinancialsData(BaseModel):
    """Financial sector data"""
    XLF: Optional[AssetData] = Field(None, description="Financial Sector ETF")
    KRE: Optional[AssetData] = Field(None, description="Regional Banking ETF")


class MarketData(BaseModel):
    """Complete market data structure"""
    equities: Dict[str, AssetData] = Field(default={}, description="Equity indices")
    volatility: Dict[str, AssetData] = Field(default={}, description="Volatility indices")
    rates: RatesData = Field(default_factory=RatesData, description="Interest rate data")
    credit: Dict[str, Any] = Field(default={}, description="Credit market data")
    financials: Dict[str, Any] = Field(default={}, description="Financial sector data")
    commodities: Dict[str, AssetData] = Field(default={}, description="Commodities")
    currencies: Dict[str, AssetData] = Field(default={}, description="Currency data")
    status: str = Field(default="success", description="Data fetch status")


class MarketAnalysisData(BaseModel):
    """Market analysis response with market data and analysis"""
    market_data: MarketData = Field(..., description="Complete market data")
    timestamp: datetime = Field(default_factory=datetime.now, description="Data timestamp")
    short_analysis: str = Field(default="", description="Short summary analysis")
    in_depth_analysis: str = Field(default="", description="Detailed trend analysis")


