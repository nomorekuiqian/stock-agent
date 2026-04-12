"""
Shared data tools module - unified data layer for all financial data.
Used by agents, routers, and services. This is the ONLY entry point for
consuming financial data. Underlying services (fmp_service, yfinance_service)
should only be imported by modules within data_tools/.
"""

from app.shared.data_tools.market_data import (
    get_all_market_data,
    get_premarket_data,
    get_treasury_rates,
    get_commodity_quotes,
    safe_float,
    EQUITY_TICKERS,
    VOLATILITY_TICKERS,
    YIELD_TICKERS,
    CREDIT_TICKERS,
    FINANCIAL_TICKERS,
    COMMODITY_TICKERS,
    CURRENCY_TICKERS,
    ALL_TICKERS,
)

from app.shared.data_tools.news import get_combined_market_news
from app.shared.data_tools.quotes import get_batch_quotes
from app.shared.data_tools.search import search_stocks


# Lazy-loaded modules (heavy imports)
def get_technical_data(*args, **kwargs):
    from app.shared.data_tools.technical import get_technical_data as _fn
    return _fn(*args, **kwargs)


def get_technical_snapshot(*args, **kwargs):
    from app.shared.data_tools.technical import get_technical_snapshot as _fn
    return _fn(*args, **kwargs)


def get_technical_trends(*args, **kwargs):
    from app.shared.data_tools.technical import get_technical_trends as _fn
    return _fn(*args, **kwargs)


def get_company_profile(*args, **kwargs):
    from app.shared.data_tools.fundamentals import get_company_profile as _fn
    return _fn(*args, **kwargs)


def get_income_statements(*args, **kwargs):
    from app.shared.data_tools.fundamentals import get_income_statements as _fn
    return _fn(*args, **kwargs)


def get_balance_sheets(*args, **kwargs):
    from app.shared.data_tools.fundamentals import get_balance_sheets as _fn
    return _fn(*args, **kwargs)


def get_cash_flows(*args, **kwargs):
    from app.shared.data_tools.fundamentals import get_cash_flows as _fn
    return _fn(*args, **kwargs)


def get_key_metrics_ttm(*args, **kwargs):
    from app.shared.data_tools.fundamentals import get_key_metrics_ttm as _fn
    return _fn(*args, **kwargs)


def get_historical_metrics(*args, **kwargs):
    from app.shared.data_tools.fundamentals import get_historical_metrics as _fn
    return _fn(*args, **kwargs)


def get_ticker_snapshot(*args, **kwargs):
    from app.shared.data_tools.fundamentals import get_ticker_snapshot as _fn
    return _fn(*args, **kwargs)


def get_peer_companies(*args, **kwargs):
    from app.shared.data_tools.peers import get_peer_companies as _fn
    return _fn(*args, **kwargs)


def get_peer_valuation(*args, **kwargs):
    from app.shared.data_tools.peers import get_peer_valuation as _fn
    return _fn(*args, **kwargs)


def get_industry_valuation(*args, **kwargs):
    from app.shared.data_tools.peers import get_industry_valuation as _fn
    return _fn(*args, **kwargs)


__all__ = [
    # Market overview
    "get_all_market_data",
    "get_premarket_data",
    "get_treasury_rates",
    "get_commodity_quotes",
    "safe_float",
    # Ticker configs
    "EQUITY_TICKERS",
    "VOLATILITY_TICKERS",
    "YIELD_TICKERS",
    "CREDIT_TICKERS",
    "FINANCIAL_TICKERS",
    "COMMODITY_TICKERS",
    "CURRENCY_TICKERS",
    "ALL_TICKERS",
    # News
    "get_combined_market_news",
    # Quotes
    "get_batch_quotes",
    # Technical
    "get_technical_data",
    "get_technical_snapshot",
    "get_technical_trends",
    # Fundamentals
    "get_company_profile",
    "get_income_statements",
    "get_balance_sheets",
    "get_cash_flows",
    "get_key_metrics_ttm",
    "get_historical_metrics",
    "get_ticker_snapshot",
    # Peers
    "get_peer_companies",
    "get_peer_valuation",
    "get_industry_valuation",
    # Search
    "search_stocks",
]
