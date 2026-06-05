"""Forward valuation helpers with explicit fiscal-year scope.

The agent-facing ``forward_pe`` value should not come from an opaque vendor
field without a year attached. This module computes annual forward P/E from
current FMP quote price and FMP annual analyst EPS estimates so the LLM sees
the exact fiscal year, EPS, analyst count, and price used in the calculation.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from app.core.logging import get_logger
from app.utils.timezone import now_pacific

logger = get_logger(__name__)


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        result = float(value)
    except (TypeError, ValueError):
        return None
    if result <= 0:
        return None
    return result


def _safe_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _iso_from_epoch(value: Any) -> str | None:
    try:
        ts = int(value)
    except (TypeError, ValueError):
        return None
    if ts <= 0:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _parse_period_date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def _extract_quote(result: dict[str, Any], symbol: str) -> dict[str, Any]:
    symbol = symbol.upper()
    for quote in result.get("quotes") or []:
        if (quote.get("symbol") or "").upper() == symbol:
            return quote
    return {}


def _estimate_row(price: float, item: dict[str, Any]) -> dict[str, Any] | None:
    date = item.get("date")
    if not isinstance(date, str) or len(date) < 4:
        return None
    fiscal_year = _safe_int(date[:4])
    if fiscal_year is None:
        return None

    eps_avg = _safe_float(item.get("epsAvg"))
    eps_low = _safe_float(item.get("epsLow"))
    eps_high = _safe_float(item.get("epsHigh"))

    forward_pe = round(price / eps_avg, 2) if eps_avg else None
    forward_pe_low = round(price / eps_high, 2) if eps_high else None
    forward_pe_high = round(price / eps_low, 2) if eps_low else None

    return {
        "fiscal_year": fiscal_year,
        "period_ending": date,
        "eps_avg": round(eps_avg, 4) if eps_avg else None,
        "eps_low": round(eps_low, 4) if eps_low else None,
        "eps_high": round(eps_high, 4) if eps_high else None,
        "forward_pe": forward_pe,
        "forward_pe_low": forward_pe_low,
        "forward_pe_high": forward_pe_high,
        "num_analysts_eps": _safe_int(item.get("numAnalystsEps")),
        "revenue_avg": item.get("revenueAvg"),
        "num_analysts_revenue": _safe_int(item.get("numAnalystsRevenue")),
        "source": "fmp_annual_analyst_estimates",
    }


def get_forward_valuation(symbol: str, years: int = 4, use_cache: bool = True) -> dict[str, Any]:
    """Return annual forward P/E with fiscal-year labels.

    The primary values are computed as ``FMP current price / FMP annual EPS
    estimate``. ``current_year`` means the first annual estimate whose
    ``period_ending`` has not passed yet, not an opaque rolling NTM vendor
    field.
    """
    symbol = (symbol or "").strip().upper()
    if not symbol:
        return {"status": "error", "error": "No symbol provided", "symbol": symbol}

    years = max(1, min(int(years or 4), 8))
    logger.info("get_forward_valuation(symbol=%s, years=%d)", symbol, years)

    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()
    quote_result = fmp.get_stock_quotes([symbol], use_cache=use_cache)
    quote = _extract_quote(quote_result, symbol)
    price = _safe_float(quote.get("price"))
    if price is None:
        return {
            "status": "error",
            "symbol": symbol,
            "source": "fmp_quote+fmp_annual_analyst_estimates",
            "error": "No valid current quote price",
        }

    estimates_raw = fmp._request(
        "/stable/analyst-estimates",
        {"symbol": symbol, "period": "annual", "limit": years + 4},
    )
    if not isinstance(estimates_raw, list) or not estimates_raw:
        return {
            "status": "error",
            "symbol": symbol,
            "price": round(price, 2),
            "source": "fmp_quote+fmp_annual_analyst_estimates",
            "error": "No annual analyst estimates returned",
        }

    rows = [
        row
        for item in estimates_raw
        if isinstance(item, dict)
        and (row := _estimate_row(price, item)) is not None
    ]
    reference_date = now_pacific().date()
    forward_rows = [
        row
        for row in rows
        if (period_date := _parse_period_date(row.get("period_ending"))) is not None
        and period_date >= reference_date
    ]
    forward_rows.sort(key=lambda row: row["period_ending"])
    forward_rows = forward_rows[:years]

    if not forward_rows:
        return {
            "status": "error",
            "symbol": symbol,
            "price": round(price, 2),
            "source": "fmp_quote+fmp_annual_analyst_estimates",
            "error": "No forward annual EPS estimates available",
        }

    current_year = forward_rows[0]
    next_year = forward_rows[1] if len(forward_rows) > 1 else None

    return {
        "status": "success",
        "symbol": symbol,
        "price": round(price, 2),
        "price_source": "fmp_quote",
        "price_as_of": _iso_from_epoch(quote.get("timestamp")),
        "reference_date": reference_date.isoformat(),
        "current_fiscal_year": current_year["fiscal_year"],
        "current_year": current_year,
        "next_year": next_year,
        "annual_estimates": forward_rows,
        "source": "fmp_quote+fmp_annual_analyst_estimates",
        "notes": [
            "forward_pe = current FMP quote price divided by annual EPS estimate",
            "current_year is the first annual estimate with period_ending on or after reference_date",
            "Do not mix these annual values with yfinance/yahoo rolling forwardPE",
        ],
    }
