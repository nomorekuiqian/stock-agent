"""
Stock Research Data Models - Pydantic models for individual stock research.

Used for:
- API request/response validation
- Database data structuring
- Type safety across services
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


# =============================================================================
# Basic Stock Data Models
# =============================================================================


class StockQuote(BaseModel):
    """Real-time stock quote data."""
    price: Optional[float] = Field(None, description="Current stock price")
    open: Optional[float] = Field(None, description="Opening price")
    high: Optional[float] = Field(None, description="Day high")
    low: Optional[float] = Field(None, description="Day low")
    close: Optional[float] = Field(None, description="Previous close")
    change: Optional[float] = Field(None, description="Price change")
    change_percent: Optional[float] = Field(None, description="Percentage change")
    market_cap: Optional[float] = Field(None, description="Market capitalization")
    volume: Optional[int] = Field(None, description="Trading volume")
    avg_volume: Optional[int] = Field(None, description="Average volume")
    pe_ratio: Optional[float] = Field(None, description="P/E ratio")
    eps: Optional[float] = Field(None, description="Earnings per share")
    week_52_high: Optional[float] = Field(None, description="52-week high")
    week_52_low: Optional[float] = Field(None, description="52-week low")


class StockProfile(BaseModel):
    """Company profile information."""
    symbol: str = Field(..., description="Stock ticker symbol")
    company_name: str = Field(..., description="Company name")
    company_name_zh: Optional[str] = Field(None, description="Chinese company name")
    exchange: Optional[str] = Field(None, description="Stock exchange")
    classification: Optional[Dict[str, Any]] = Field(
        None, description="Sector/industry classification"
    )
    description: Optional[Dict[str, Any]] = Field(
        None, description="Company description in multiple languages"
    )
    company_details: Optional[Dict[str, Any]] = Field(
        None, description="CEO, employees, website, etc."
    )


# =============================================================================
# Financial Statement Models
# =============================================================================


class IncomeStatementData(BaseModel):
    """Income statement data for a single period."""
    date: str = Field(..., description="Period end date")
    fiscal_year: Optional[int] = Field(None, description="Fiscal year")
    fiscal_period: Optional[str] = Field(None, description="Fiscal period (Q1, Q2, etc.)")
    revenue: Optional[float] = Field(None, description="Total revenue")
    cost_of_revenue: Optional[float] = Field(None, description="Cost of revenue")
    gross_profit: Optional[float] = Field(None, description="Gross profit")
    gross_profit_margin: Optional[float] = Field(None, description="Gross profit margin")
    operating_expenses: Optional[float] = Field(None, description="Operating expenses")
    operating_income: Optional[float] = Field(None, description="Operating income")
    operating_income_margin: Optional[float] = Field(None, description="Operating margin")
    net_income: Optional[float] = Field(None, description="Net income")
    net_income_margin: Optional[float] = Field(None, description="Net profit margin")
    eps: Optional[float] = Field(None, description="Basic EPS")
    eps_diluted: Optional[float] = Field(None, description="Diluted EPS")
    ebitda: Optional[float] = Field(None, description="EBITDA")
    research_and_development: Optional[float] = Field(None, description="R&D expenses")


class BalanceSheetData(BaseModel):
    """Balance sheet data for a single period."""
    date: str = Field(..., description="Period end date")
    fiscal_year: Optional[int] = Field(None, description="Fiscal year")
    fiscal_period: Optional[str] = Field(None, description="Fiscal period")
    total_assets: Optional[float] = Field(None, description="Total assets")
    total_liabilities: Optional[float] = Field(None, description="Total liabilities")
    total_equity: Optional[float] = Field(None, description="Total stockholders equity")
    cash_and_equivalents: Optional[float] = Field(None, description="Cash and equivalents")
    short_term_investments: Optional[float] = Field(None, description="Short-term investments")
    total_current_assets: Optional[float] = Field(None, description="Total current assets")
    total_current_liabilities: Optional[float] = Field(None, description="Total current liabilities")
    long_term_debt: Optional[float] = Field(None, description="Long-term debt")
    total_debt: Optional[float] = Field(None, description="Total debt")
    retained_earnings: Optional[float] = Field(None, description="Retained earnings")
    shares_outstanding: Optional[float] = Field(None, description="Shares outstanding")


class CashFlowData(BaseModel):
    """Cash flow statement data for a single period."""
    date: str = Field(..., description="Period end date")
    fiscal_year: Optional[int] = Field(None, description="Fiscal year")
    fiscal_period: Optional[str] = Field(None, description="Fiscal period")
    operating_cash_flow: Optional[float] = Field(None, description="Operating cash flow")
    capital_expenditure: Optional[float] = Field(None, description="Capital expenditure")
    free_cash_flow: Optional[float] = Field(None, description="Free cash flow")
    dividends_paid: Optional[float] = Field(None, description="Dividends paid")
    stock_repurchase: Optional[float] = Field(None, description="Stock buybacks")
    net_cash_from_investing: Optional[float] = Field(None, description="Investing activities")
    net_cash_from_financing: Optional[float] = Field(None, description="Financing activities")
    depreciation: Optional[float] = Field(None, description="Depreciation & amortization")


class FinancialRatios(BaseModel):
    """Key financial ratios for a single period."""
    date: str = Field(..., description="Period end date")
    fiscal_year: Optional[int] = Field(None, description="Fiscal year")
    fiscal_period: Optional[str] = Field(None, description="Fiscal period")
    # Valuation
    pe_ratio: Optional[float] = Field(None, description="Price to earnings ratio")
    pb_ratio: Optional[float] = Field(None, description="Price to book ratio")
    ps_ratio: Optional[float] = Field(None, description="Price to sales ratio")
    peg_ratio: Optional[float] = Field(None, description="PEG ratio")
    ev_to_ebitda: Optional[float] = Field(None, description="EV/EBITDA")
    # Profitability
    roe: Optional[float] = Field(None, description="Return on equity")
    roa: Optional[float] = Field(None, description="Return on assets")
    roic: Optional[float] = Field(None, description="Return on invested capital")
    gross_margin: Optional[float] = Field(None, description="Gross profit margin")
    operating_margin: Optional[float] = Field(None, description="Operating margin")
    net_margin: Optional[float] = Field(None, description="Net profit margin")
    # Liquidity
    current_ratio: Optional[float] = Field(None, description="Current ratio")
    quick_ratio: Optional[float] = Field(None, description="Quick ratio")
    # Leverage
    debt_to_equity: Optional[float] = Field(None, description="Debt to equity ratio")
    debt_to_assets: Optional[float] = Field(None, description="Debt to assets ratio")
    # Efficiency
    asset_turnover: Optional[float] = Field(None, description="Asset turnover")
    inventory_turnover: Optional[float] = Field(None, description="Inventory turnover")


# =============================================================================
# Aggregated Financial Models
# =============================================================================


class QuarterlyFinancial(BaseModel):
    """Complete financial data for a single quarter."""
    period: str = Field(..., description="Period end date (YYYY-MM-DD)")
    period_end_date: str = Field(..., description="Period end date")
    fiscal_year: Optional[int] = Field(None, description="Fiscal year")
    fiscal_quarter: Optional[str] = Field(None, description="Fiscal quarter (Q1, Q2, etc.)")
    income_statement: Dict[str, Any] = Field(default={}, description="Income statement data")
    balance_sheet: Dict[str, Any] = Field(default={}, description="Balance sheet data")
    cash_flow: Dict[str, Any] = Field(default={}, description="Cash flow data")


class TTMMetrics(BaseModel):
    """Trailing Twelve Months aggregated metrics."""
    revenue: Optional[float] = Field(None, description="TTM revenue")
    net_income: Optional[float] = Field(None, description="TTM net income")
    eps: Optional[float] = Field(None, description="TTM earnings per share")
    ebitda: Optional[float] = Field(None, description="TTM EBITDA")
    operating_cash_flow: Optional[float] = Field(None, description="TTM operating cash flow")
    free_cash_flow: Optional[float] = Field(None, description="TTM free cash flow")


class GrowthMetrics(BaseModel):
    """Year-over-year growth metrics."""
    revenue_yoy: Optional[float] = Field(None, description="Revenue YoY growth")
    net_income_yoy: Optional[float] = Field(None, description="Net income YoY growth")
    eps_yoy: Optional[float] = Field(None, description="EPS YoY growth")
    revenue_qoq: Optional[float] = Field(None, description="Revenue QoQ growth")


class ProfitabilityMetrics(BaseModel):
    """Profitability metrics for the latest period."""
    gross_margin: Optional[float] = Field(None, description="Gross profit margin")
    operating_margin: Optional[float] = Field(None, description="Operating margin")
    net_margin: Optional[float] = Field(None, description="Net profit margin")
    roe: Optional[float] = Field(None, description="Return on equity")
    roa: Optional[float] = Field(None, description="Return on assets")


class ValuationMetrics(BaseModel):
    """Current valuation metrics."""
    pe: Optional[float] = Field(None, description="P/E ratio (TTM)")
    pe_forward: Optional[float] = Field(None, description="Forward P/E ratio")
    pb: Optional[float] = Field(None, description="Price to book ratio")
    ps: Optional[float] = Field(None, description="Price to sales ratio")
    ev_to_ebitda: Optional[float] = Field(None, description="EV/EBITDA")
    peg: Optional[float] = Field(None, description="PEG ratio")


class StockFundamentals(BaseModel):
    """Aggregated fundamental analysis data."""
    ttm: TTMMetrics = Field(default_factory=lambda: TTMMetrics(), description="TTM metrics")
    growth: GrowthMetrics = Field(default_factory=lambda: GrowthMetrics(), description="Growth metrics")
    profitability: ProfitabilityMetrics = Field(
        default_factory=lambda: ProfitabilityMetrics(), description="Profitability metrics"
    )
    valuation: ValuationMetrics = Field(
        default_factory=lambda: ValuationMetrics(), description="Valuation metrics"
    )


class StockFinancials(BaseModel):
    """Historical financial statements."""
    latest_quarter: Optional[str] = Field(None, description="Latest quarter period")
    quarters: List[Dict[str, Any]] = Field(
        default=[], description="Recent quarterly financials"
    )


# =============================================================================
# API Response Models
# =============================================================================


class StockDataResponse(BaseModel):
    """GET /api/stock/{symbol} response model."""
    profile: Dict[str, Any] = Field(default={}, description="Company profile")
    quote: Dict[str, Any] = Field(default={}, description="Real-time quote")
    fundamentals: Dict[str, Any] = Field(default={}, description="Fundamental analysis")
    financials: Dict[str, Any] = Field(default={}, description="Historical financials")
    analyses: Optional[Dict[str, Any]] = Field(None, description="AI analyses (if available)")
    meta: Dict[str, Any] = Field(default={}, description="Metadata")

    class Config:
        json_schema_extra = {
            "example": {
                "profile": {
                    "company_name": "NVIDIA Corporation",
                    "exchange": "NASDAQ",
                    "classification": {"sector": "Technology", "industry": "Semiconductors"},
                },
                "quote": {
                    "price": 138.50,
                    "change": 2.35,
                    "change_percent": 1.73,
                    "market_cap": 3400000000000,
                },
                "fundamentals": {
                    "ttm": {"revenue": 130000000000, "eps": 2.95},
                    "valuation": {"pe": 46.9, "pb": 52.3},
                    "growth": {"revenue_yoy": 0.122},
                    "profitability": {"gross_margin": 0.758, "net_margin": 0.553},
                },
                "financials": {
                    "latest_quarter": "2024-10-31",
                    "quarters": [],
                },
                "meta": {
                    "quote_fetched_at": "2024-01-19T10:30:00Z",
                    "from_cache": False,
                },
            }
        }


class StockDataRequest(BaseModel):
    """Request model for stock data (optional parameters)."""
    include_financials: bool = Field(
        default=True, description="Include historical financial statements"
    )
    include_analysis: bool = Field(
        default=False, description="Include AI-generated analysis"
    )
    quarters: int = Field(
        default=4, ge=1, le=20, description="Number of quarters to include"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "include_financials": True,
                "include_analysis": False,
                "quarters": 4,
            }
        }


# =============================================================================
# Database Models (for Insforge)
# =============================================================================


class StockProfileDB(BaseModel):
    """Database model for stock_profiles table."""
    symbol: str
    company_name: str
    company_name_zh: Optional[str] = None
    exchange: Optional[str] = None
    classification: Optional[Dict[str, Any]] = None
    description: Optional[Dict[str, Any]] = None
    company_details: Optional[Dict[str, Any]] = None
    data_source: str = "openbb_fmp"
    updated_at: Optional[str] = None


class StockFinancialDB(BaseModel):
    """Database model for stock_financials table."""
    symbol: str
    fiscal_year: int
    fiscal_quarter: Optional[str] = None
    period_type: str = "quarterly"
    period_end_date: str
    income_statement: Optional[Dict[str, Any]] = None
    balance_sheet: Optional[Dict[str, Any]] = None
    cash_flow: Optional[Dict[str, Any]] = None
    derived_metrics: Optional[Dict[str, Any]] = None
    currency: str = "USD"
    data_source: str = "openbb_fmp"
    filing_date: Optional[str] = None


class StockAnalysisDB(BaseModel):
    """Database model for stock_analyses table."""
    symbol: str
    analysis_type: str  # "overview", "earnings", "valuation", etc.
    content: str  # AI-generated analysis text
    data_snapshot: Optional[Dict[str, Any]] = None
    model: str = "gemini-3.1-flash-lite-preview"
    generated_at: Optional[str] = None
    expires_at: Optional[str] = None
