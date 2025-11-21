from pydantic import BaseModel

class AnalyzeRequest(BaseModel):
    query: str  # Kept for backward compatibility, but we'll mainly use ticker from it or add a ticker field
    ticker: str

from pydantic import BaseModel, Field
from typing import List, Optional

class AnalyzeRequest(BaseModel):
    query: str
    ticker: str

class FundamentalData(BaseModel):
    valuation_score: int = Field(..., description="0-10 score for valuation")
    growth_score: int = Field(..., description="0-10 score for growth")
    summary: str = Field(..., description="One sentence summary of fundamentals")
    details: List[str] = Field(..., description="Key fundamental data points")

class TechnicalData(BaseModel):
    trend: str = Field(..., description="Bullish, Bearish, or Neutral")
    support: str = Field(..., description="Nearest support level")
    resistance: str = Field(..., description="Nearest resistance level")
    summary: str = Field(..., description="One sentence technical summary")

class SentimentData(BaseModel):
    score: int = Field(..., description="0-100 sentiment score (0=Fear, 100=Greed)")
    label: str = Field(..., description="Fear, Neutral, or Greed")
    news_summary: List[str] = Field(..., description="Top 3 news headlines/summaries")

class SkepticData(BaseModel):
    bear_case: str = Field(..., description="The strongest argument against buying")
    risks: List[str] = Field(..., description="List of 2-3 major risks")

class AnalyzeResponse(BaseModel):
    ticker: str
    current_price: float
    overall_score: int = Field(..., description="0-10 overall AI score")
    signal: str = Field(..., description="Bullish, Bearish, or Neutral")
    fundamental: FundamentalData
    technical: TechnicalData
    sentiment: SentimentData
    skeptic: SkepticData
