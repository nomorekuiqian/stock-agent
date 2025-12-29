from pydantic import BaseModel, Field
from typing import Dict, Optional, Any, List
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


# =============================================================================
# Personalized Digest Models
# =============================================================================


class WatchlistRequest(BaseModel):
    """Request model for saving user watchlist"""
    symbols: list[str] = Field(..., description="List of stock ticker symbols")

    class Config:
        json_schema_extra = {
            "example": {
                "symbols": ["AAPL", "MSFT", "NVDA", "TSLA"]
            }
        }


class WatchlistResponse(BaseModel):
    """Response model for watchlist operations"""
    user_id: str = Field(..., description="User identifier")
    symbols: list[str] = Field(default=[], description="List of stock ticker symbols")
    updated_at: Optional[str] = Field(None, description="Last update timestamp")


class DigestRequest(BaseModel):
    """Request model for generating personalized digest"""
    symbols: list[str] = Field(default=[], description="User watchlist symbols to analyze")

    # User ID for saving the digest (optional - if not provided, digest won't be saved)
    user_id: Optional[str] = Field(
        default=None,
        description="User UUID for saving the digest to database"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "symbols": ["AAPL", "MSFT", "NVDA", "TSLA"],
                "user_id": "12345678-1234-5678-90ab-cdef12345678"
            }
        }


class StockAnalysis(BaseModel):
    """Individual stock summary in the digest"""
    symbol: str = Field(..., description="Stock ticker symbol")
    name: str = Field(..., description="Company name in Chinese")
    price: float = Field(..., description="Current stock price")
    daily_change: str = Field(..., description="Daily change with percentage")
    week_change: str = Field(..., description="Weekly change with percentage")
    status: str = Field(..., description="Brief status in Chinese")
    quick_take: str = Field(..., description="1-2 sentence analysis in Chinese")


class DigestHeadlineNews(BaseModel):
    """Important news with deep analysis"""
    title: str = Field(..., description="News title in Chinese")
    related_symbols: list[str] = Field(default=[], description="Which watchlist stocks this affects")
    fact_summary: str = Field(..., description="One sentence factual summary")
    deep_analysis: str = Field(..., description="5-6 sentence deep analysis")
    url: str = Field(default="", description="Original article URL")


class DigestBriefNews(BaseModel):
    """Other notable news with brief analysis"""
    title: str = Field(..., description="News title in Chinese")
    related_symbols: list[str] = Field(default=[], description="Which watchlist stocks this affects")
    summary: str = Field(..., description="One sentence summary")
    analysis: str = Field(..., description="2-3 sentence analysis")
    url: str = Field(default="", description="Original article URL")


class DigestNewsSection(BaseModel):
    """News section with headlines and briefs"""
    headlines: list[DigestHeadlineNews] = Field(default=[], description="3-4 important news with deep analysis")
    briefs: list[DigestBriefNews] = Field(default=[], description="8-10 other news with brief analysis")


class DigestEvent(BaseModel):
    """Upcoming event relevant to user's watchlist"""
    date: str = Field(..., description="Event date in YYYY-MM-DD format")
    event: str = Field(..., description="Event name in Chinese")
    related_symbols: list[str] = Field(default=[], description="Which watchlist stocks this affects")
    why_important: str = Field(..., description="Why this matters for user's holdings")


class DigestSummary(BaseModel):
    """Comprehensive summary in 3 paragraphs"""
    content: str = Field(default="", description="Three paragraphs: portfolio recap, movement drivers, outlook")


class DigestResponse(BaseModel):
    """Response model for personalized digest (PersonalDigest output)"""
    success: bool = Field(default=True, description="Whether generation was successful")
    timestamp: str = Field(..., description="Generation timestamp")
    symbols_used: list[str] = Field(default=[], description="Symbols used for analysis")

    # Header
    greeting: str = Field(default="", description="Personalized greeting with date")
    one_line_summary: str = Field(default="", description="One sentence portfolio summary")

    # Section 1: Portfolio Overview
    stocks: list[StockAnalysis] = Field(default=[], description="Summary for each stock")

    # Section 2: News (Headlines + Briefs)
    news: DigestNewsSection = Field(default_factory=DigestNewsSection, description="News with headlines and briefs")

    # Section 3: Upcoming Events
    events: list[DigestEvent] = Field(default=[], description="Upcoming events within 7 days")

    # Section 4: Summary (replaces macro_impact + bottom_line)
    summary: DigestSummary = Field(default_factory=DigestSummary, description="Comprehensive summary")

    # Error handling
    error: Optional[str] = Field(None, description="Error message if generation failed")


# =============================================================================
# Subscription Management Models
# =============================================================================


class SubscribeRequest(BaseModel):
    """Request model for subscribing to a channel"""
    email: str = Field(..., description="Subscriber email address")
    first_name: Optional[str] = Field(None, description="Subscriber first name")
    # Channel-specific fields (for personal_digest)
    user_id: Optional[str] = Field(None, description="User ID for personal digest")
    symbols: Optional[List[str]] = Field(None, description="Watchlist symbols for personal digest")

    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "email": "user@example.com",
                    "first_name": "John"
                },
                {
                    "email": "user@example.com",
                    "first_name": "John",
                    "user_id": "12345678-1234-5678-90ab-cdef12345678",
                    "symbols": ["AAPL", "MSFT", "NVDA"]
                }
            ]
        }


class UnsubscribeRequest(BaseModel):
    """Request model for unsubscribing from a channel"""
    email: str = Field(..., description="Email address to unsubscribe")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com"
            }
        }


class SubscriptionUpdateRequest(BaseModel):
    """Request model for updating subscription metadata"""
    email: str = Field(..., description="Subscriber email address")
    first_name: Optional[str] = Field(None, description="Updated first name")
    symbols: Optional[List[str]] = Field(None, description="Updated watchlist symbols")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "symbols": ["AAPL", "GOOGL", "AMZN"]
            }
        }


class SubscriptionStatusRequest(BaseModel):
    """Request model for checking subscription status"""
    email: str = Field(..., description="Email address to check")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com"
            }
        }


class SubscriptionStatusResponse(BaseModel):
    """Response model for subscription status"""
    success: bool = Field(..., description="Whether the request succeeded")
    channel: str = Field(..., description="Subscription channel")
    subscribed: bool = Field(default=False, description="Whether email is subscribed")
    email: str = Field(..., description="Email address")
    metadata: Dict[str, Any] = Field(default={}, description="Subscription metadata")
    error: Optional[str] = Field(None, description="Error message if failed")


class SubscriptionResponse(BaseModel):
    """Response model for subscribe/unsubscribe operations"""
    success: bool = Field(..., description="Whether the operation succeeded")
    channel: str = Field(..., description="Subscription channel")
    email: str = Field(..., description="Email address")
    contact_id: Optional[str] = Field(None, description="Resend contact ID")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Subscription metadata")
    error: Optional[str] = Field(None, description="Error message if failed")


class BroadcastResponse(BaseModel):
    """Response model for broadcast operations"""
    success: bool = Field(..., description="Whether the broadcast succeeded")
    channel: str = Field(..., description="Broadcast channel")
    total: int = Field(default=0, description="Total subscribers")
    sent: int = Field(default=0, description="Successfully sent count")
    failed: int = Field(default=0, description="Failed count")
    errors: List[Dict[str, Any]] = Field(default=[], description="Error details")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "channel": "personal_digest",
                "total": 10,
                "sent": 9,
                "failed": 1,
                "errors": [{"email": "failed@example.com", "error": "Invalid email"}]
            }
        }


class SubscriberInfo(BaseModel):
    """Subscriber information for listing"""
    email: str = Field(..., description="Subscriber email")
    metadata: Dict[str, Any] = Field(default={}, description="Subscriber metadata")


class SubscribersListResponse(BaseModel):
    """Response model for listing subscribers"""
    success: bool = Field(..., description="Whether the request succeeded")
    channel: str = Field(..., description="Subscription channel")
    subscribers: List[SubscriberInfo] = Field(default=[], description="List of subscribers")
    count: int = Field(default=0, description="Total subscriber count")
    error: Optional[str] = Field(None, description="Error message if failed")


class SyncUserRequest(BaseModel):
    """Request model for syncing website user with Resend subscriptions"""
    user_id: str = Field(..., description="Website user ID from Insforge auth")
    email: str = Field(..., description="User email address")
    first_name: Optional[str] = Field(None, description="User first name")

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "b530a7a8-25f5-45ee-95f1-79acddb048e5",
                "email": "user@example.com",
                "first_name": "John"
            }
        }


class SyncedChannelInfo(BaseModel):
    """Information about a synced channel"""
    channel: str = Field(..., description="Channel name")
    subscribed: bool = Field(..., description="Whether user is subscribed")
    metadata: Dict[str, Any] = Field(default={}, description="Channel metadata")


class SyncUserResponse(BaseModel):
    """Response model for user sync operation"""
    success: bool = Field(..., description="Whether the sync succeeded")
    email: str = Field(..., description="User email")
    user_id: str = Field(..., description="User ID")
    synced_channels: List[SyncedChannelInfo] = Field(default=[], description="Channels that were synced")
    errors: List[str] = Field(default=[], description="Any errors encountered")
