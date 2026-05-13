"""
Company fundamentals: profile, financial statements, valuation metrics.
Replaces OpenBB service calls with direct FMP API + yfinance for snapshots.
"""

from app.core.logging import get_logger

logger = get_logger(__name__)


def get_company_profile(symbol: str) -> dict:
    """
    Company profile: name, sector, industry, CEO, employees, etc.
    Replaces openbb.get_company_profile().
    Returns same dict structure as OpenBB output.

    `$CASH` (virtual cash position from U0-A) returns a stable virtual
    profile without hitting FMP. See `app.shared.data_tools._cash_guard`.
    """
    from app.shared.data_tools._cash_guard import cash_profile, is_cash

    if is_cash(symbol):
        return cash_profile()

    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()
    return fmp.get_company_profile_detail(symbol)


def get_income_statements(symbol: str, limit: int = 8, period: str = "quarter") -> list[dict]:
    """
    Quarterly/annual income statements.
    Replaces openbb.get_income_statements().
    Returns list of dicts with fields: date, fiscal_year, fiscal_period,
    revenue, gross_profit, operating_income, net_income, eps, eps_diluted, ebitda, etc.
    """
    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()
    return fmp.get_income_statement(symbol, period=period, limit=limit)


def get_balance_sheets(symbol: str, limit: int = 8, period: str = "quarter") -> list[dict]:
    """
    Quarterly/annual balance sheets.
    Replaces openbb.get_balance_sheets().
    Returns list of dicts with fields: date, total_assets, total_liabilities,
    total_equity, cash_and_equivalents, total_debt, shares_outstanding, etc.
    """
    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()
    return fmp.get_balance_sheet(symbol, period=period, limit=limit)


def get_cash_flows(symbol: str, limit: int = 8, period: str = "quarter") -> list[dict]:
    """
    Quarterly/annual cash flow statements.
    Replaces openbb.get_cash_flows().
    Returns list of dicts with fields: date, operating_cash_flow, capital_expenditure,
    free_cash_flow, dividends_paid, etc.
    """
    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()
    return fmp.get_cash_flow_statement(symbol, period=period, limit=limit)


_metrics_cache: dict[str, tuple[dict, float]] = {}
_METRICS_TTL = 600  # 10 minutes


def get_key_metrics_ttm(symbol: str) -> dict:
    """
    TTM valuation metrics: PE, PB, PS, PEG, EV/EBITDA, ROE, ROA, margins.
    10-minute cache to avoid N+1 in peer comparison (1 company + 5 peers = 6 calls).
    Returns: {"status": "success", "metrics": {...}, "source": "fmp"}
    """
    import time

    key = symbol.upper()
    if key in _metrics_cache:
        cached, ts = _metrics_cache[key]
        if time.time() - ts < _METRICS_TTL:
            return cached

    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()
    result = fmp.get_key_metrics_ttm(symbol)
    _metrics_cache[key] = (result, time.time())
    return result


def get_historical_metrics(symbol: str, period: str = "annual", limit: int = 20) -> dict:
    """
    Historical valuation metrics for trend analysis.
    Delegates to existing fmp_service.get_historical_key_metrics().
    Returns: {"status": "success", "metrics": [...], "source": "fmp"}
    """
    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()
    return fmp.get_historical_key_metrics(symbol, period=period, limit=limit)


def get_ticker_snapshot(symbol: str) -> dict:
    """
    Comprehensive fundamental snapshot: TTM financials, valuation, analyst targets.
    Delegates to yfinance_service.get_ticker_metrics().
    Returns nested dict with keys: ttm, valuation, forward, profitability,
    growth, balance_sheet, market_data, analyst_targets.
    """
    from app.shared.yfinance_service import get_yfinance_service

    yf = get_yfinance_service()
    return yf.get_ticker_metrics(symbol)
