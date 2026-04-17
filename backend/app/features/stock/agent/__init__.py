"""
Stock Analysis Agents Package.

Five specialized AI agents for individual stock analysis:
- fundamental: Deep equity research (valuation, financials, company overview)
- technical: Chart pattern and indicator analysis
- news: Recent news and catalyst analysis
- macro: Macro environment and sector positioning
- earnings: Quarterly earnings deep-dive and trend analysis

All public symbols are re-exported here for backward compatibility.
Import from `app.features.stock.agent` continues to work.
"""

# --- Fundamental ---
from .fundamental import (
    ANALYSIS_FIELDS,
    StockAnalysisAgent,
    StockAnalysisOutput,
    _compute_target_price_inputs,
    _empty_analysis,
    _prepare_stock_data_for_analyst,
    get_stock_analysis_agent,
)

# --- Technical ---
from .technical import (
    TECHNICAL_FIELDS,
    TechnicalAnalysisAgent,
    TechnicalAnalysisOutput,
    _empty_technical_analysis,
    _prepare_technical_data_for_agent,
    _strip_none,
    get_technical_analysis_agent,
)

# --- News ---
from .news import (
    NEWS_CONTEXT_FIELDS,
    NewsContextAgent,
    NewsContextOutput,
    _empty_news_analysis,
    _prepare_news_context,
    get_news_context_agent,
)

# --- Macro ---
from .macro import (
    MACRO_SECTOR_FIELDS,
    MacroSectorAgent,
    MacroSectorOutput,
    _empty_macro_analysis,
    _prepare_macro_sector_context,
    get_macro_sector_agent,
)

# --- Earnings ---
from .earnings import (
    EARNINGS_ANALYSIS_FIELDS,
    EarningsAgent,
    EarningsAnalysisOutput,
    _empty_earnings_analysis,
    _prepare_earnings_data_for_agent,
    get_earnings_agent,
)

# --- Market Overview ---
from .market_overview import (
    MARKET_OVERVIEW_FIELDS,
    MarketOverviewAgent,
    MarketOverviewOutput,
    _empty_market_overview,
    _prepare_market_overview_context,
    get_market_overview_agent,
)

# --- Shared ---
from ._base import run_agent_session

# Backward compatibility alias
_run_agent_session = run_agent_session

__all__ = [
    # Fundamental
    "ANALYSIS_FIELDS",
    "StockAnalysisAgent",
    "StockAnalysisOutput",
    "_compute_target_price_inputs",
    "_empty_analysis",
    "_prepare_stock_data_for_analyst",
    "get_stock_analysis_agent",
    # Technical
    "TECHNICAL_FIELDS",
    "TechnicalAnalysisAgent",
    "TechnicalAnalysisOutput",
    "_empty_technical_analysis",
    "_prepare_technical_data_for_agent",
    "_strip_none",
    "get_technical_analysis_agent",
    # News
    "NEWS_CONTEXT_FIELDS",
    "NewsContextAgent",
    "NewsContextOutput",
    "_empty_news_analysis",
    "_prepare_news_context",
    "get_news_context_agent",
    # Macro
    "MACRO_SECTOR_FIELDS",
    "MacroSectorAgent",
    "MacroSectorOutput",
    "_empty_macro_analysis",
    "_prepare_macro_sector_context",
    "get_macro_sector_agent",
    # Earnings
    "EARNINGS_ANALYSIS_FIELDS",
    "EarningsAgent",
    "EarningsAnalysisOutput",
    "_empty_earnings_analysis",
    "_prepare_earnings_data_for_agent",
    "get_earnings_agent",
    # Market Overview
    "MARKET_OVERVIEW_FIELDS",
    "MarketOverviewAgent",
    "MarketOverviewOutput",
    "_empty_market_overview",
    "_prepare_market_overview_context",
    "get_market_overview_agent",
    # Shared
    "run_agent_session",
    "_run_agent_session",
]
