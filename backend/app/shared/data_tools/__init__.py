"""
Shared data tools module - market data, news, calendar, earnings fetching.
Used by multiple agent modules (market, digest, stock, sector).
"""

from app.shared.data_tools.market_data import (
    get_all_market_data,
    get_stock_quotes,
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


def get_technical_data(*args, **kwargs):
    from app.shared.data_tools.technical import get_technical_data as _fn
    return _fn(*args, **kwargs)


def get_technical_snapshot(*args, **kwargs):
    from app.shared.data_tools.technical import get_technical_snapshot as _fn
    return _fn(*args, **kwargs)


def get_technical_trends(*args, **kwargs):
    from app.shared.data_tools.technical import get_technical_trends as _fn
    return _fn(*args, **kwargs)


__all__ = [
    "get_all_market_data",
    "get_stock_quotes",
    "safe_float",
    "EQUITY_TICKERS",
    "VOLATILITY_TICKERS",
    "YIELD_TICKERS",
    "CREDIT_TICKERS",
    "FINANCIAL_TICKERS",
    "COMMODITY_TICKERS",
    "CURRENCY_TICKERS",
    "ALL_TICKERS",
    "get_combined_market_news",
    "get_technical_data",
    "get_technical_snapshot",
    "get_technical_trends",
]
