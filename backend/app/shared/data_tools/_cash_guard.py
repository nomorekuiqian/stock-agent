"""
$CASH symbol guard for the data network.

The portfolio feature (U0-A) allows users to record a virtual `$CASH` position.
That symbol is NOT a real ticker — sending it to FMP/yfinance/etc. is wasted
network and can return surprising errors. Worse, downstream consumers
(scoring, backtest, exposure parser) might silently accept those errors and
attribute them to the asset rather than to data-source mismatch.

This module provides a single, consistent firewall:

  * `split_cash(symbols)`   — pull `$CASH` out before calling external APIs
  * `inject_cash_*(...)`    — re-insert a stable virtual response after the call
  * `is_cash(symbol)`       — convenience predicate

Contract for downstream code:
  * **All batch fetchers** that hit FMP / yfinance / OpenBB and accept
    `list[str]` symbols MUST run their input through `split_cash()` and
    re-merge results with the appropriate `inject_cash_*()` helper.
  * **Single-symbol fetchers** MUST early-return a virtual response when
    `is_cash(symbol)` is true.

LLD: docs/plans/for-you/p0-foundation.md §LLD U0-A · Audit R-1 (Deep Audit Round 2 D-1).

This module is intentionally pure — no logging at info level, no I/O.
"""

from typing import Any, Dict, Iterable, List, Sequence, Tuple


CASH_SYMBOL = "$CASH"


def is_cash(symbol: str | None) -> bool:
    """True if the symbol is the virtual cash placeholder."""
    return symbol == CASH_SYMBOL


def split_cash(symbols: Sequence[str]) -> Tuple[List[str], bool]:
    """
    Strip `$CASH` from a list of symbols before issuing an external request.

    Returns (filtered_symbols, has_cash). Order of remaining symbols is preserved.
    """
    filtered: List[str] = []
    has_cash = False
    for s in symbols:
        if is_cash(s):
            has_cash = True
        else:
            filtered.append(s)
    return filtered, has_cash


# ---------------------------------------------------------------------------
# Stable virtual responses
# ---------------------------------------------------------------------------


def cash_quote() -> Dict[str, Any]:
    """A `get_batch_quotes`-shaped row for $CASH."""
    return {
        "symbol": CASH_SYMBOL,
        "name": "Cash position",
        "price": 1.0,
        "change": 0.0,
        "changes_percentage": 0.0,
        "day_high": 1.0,
        "day_low": 1.0,
        "year_high": 1.0,
        "year_low": 1.0,
        "market_cap": None,
        "volume": 0,
        "exchange": None,
        "is_virtual": True,
    }


def cash_profile() -> Dict[str, Any]:
    """A `get_company_profile`-shaped dict for $CASH. Sector is 'Cash'."""
    return {
        "symbol": CASH_SYMBOL,
        "company_name": "Cash position",
        "sector": "Cash",
        "industry": "Cash",
        "beta": 0.0,
        "market_cap": None,
        "is_virtual": True,
    }


def cash_price() -> float:
    """Virtual price (always 1.0)."""
    return 1.0


def cash_returns(n: int) -> List[float]:
    """Virtual return series (zero risk-free approximation)."""
    return [0.0] * max(0, n)


# ---------------------------------------------------------------------------
# Re-merging helpers
# ---------------------------------------------------------------------------


def inject_cash_quote(quotes: List[Dict[str, Any]], has_cash: bool) -> List[Dict[str, Any]]:
    """Append a $CASH row to a list of quotes when needed."""
    if has_cash:
        quotes.append(cash_quote())
    return quotes


def inject_cash_into_dict(d: Dict[str, Any], has_cash: bool, value: Any) -> Dict[str, Any]:
    """Generic: set d[$CASH] = value when has_cash, return same dict."""
    if has_cash:
        d[CASH_SYMBOL] = value
    return d


def inject_cash_prices(prices: Dict[str, float], has_cash: bool) -> Dict[str, float]:
    return inject_cash_into_dict(prices, has_cash, cash_price())


def inject_cash_returns_series(returns: Dict[str, List[float]], has_cash: bool, n: int) -> Dict[str, List[float]]:
    return inject_cash_into_dict(returns, has_cash, cash_returns(n))


def inject_cash_profile_dict(profiles: Dict[str, Dict[str, Any]], has_cash: bool) -> Dict[str, Dict[str, Any]]:
    return inject_cash_into_dict(profiles, has_cash, cash_profile())


# ---------------------------------------------------------------------------
# Iterable filter (convenience)
# ---------------------------------------------------------------------------


def without_cash(symbols: Iterable[str]) -> List[str]:
    """Same as `split_cash(symbols)[0]`, when the caller doesn't need has_cash flag."""
    return [s for s in symbols if not is_cash(s)]
