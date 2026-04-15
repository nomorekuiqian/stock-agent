"""
Unified stock quote interface.
All quotes go through FMP for single cache layer and data consistency.
"""

from app.core.logging import get_logger

logger = get_logger(__name__)


def get_batch_quotes(symbols: list[str], use_cache: bool = True) -> dict:
    """
    Get real-time quotes for multiple symbols.

    Delegates to fmp_service.get_stock_quotes() which has:
    - /stable/batch-quote API
    - 10-minute thread-safe cache with request coalescing

    Returns same format as fmp_service.get_stock_quotes():
    {
        "quotes": [{"symbol": "AAPL", "name": "Apple", "price": 150.0, ...}, ...],
        "count": 5,
        "cached": bool,
        "source": "fmp"
    }
    """
    from app.shared.fmp_service import get_fmp_service

    if not symbols:
        return {"quotes": [], "count": 0, "cached": False, "source": "fmp"}

    fmp = get_fmp_service()
    return fmp.get_stock_quotes(symbols, use_cache=use_cache)


_realtime_cache: dict[str, tuple[dict, float]] = {}
_REALTIME_TTL = 600  # 10 minutes, same as batch quotes


def get_realtime_quote(symbol: str) -> dict:
    """
    Get full real-time quote for a single stock (10-minute cache).

    Uses FMP /stable/quote which returns complete data including:
    price, change, change_percent, market_cap, volume, week_52_high/low, pe, eps.

    Replaces openbb.get_realtime_quote(). Field names match OpenBB output.
    """
    import time

    key = symbol.upper()
    if key in _realtime_cache:
        cached, ts = _realtime_cache[key]
        if time.time() - ts < _REALTIME_TTL:
            return cached

    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()
    data = fmp._request("/stable/quote", {"symbol": key})

    if not data or not isinstance(data, list) or len(data) == 0:
        return {}

    item = data[0]
    sf = fmp._safe_float
    result = {
        "price": sf(item.get("price")),
        "open": sf(item.get("open")),
        "high": sf(item.get("dayHigh")),
        "low": sf(item.get("dayLow")),
        "close": sf(item.get("previousClose")),
        "change": sf(item.get("change")),
        "change_percent": sf(item.get("changePercentage")),
        "market_cap": sf(item.get("marketCap")),
        "volume": sf(item.get("volume")),
        "avg_volume": sf(item.get("avgVolume")),
        "pe_ratio": sf(item.get("pe")),
        "eps": sf(item.get("eps")),
        "week_52_high": sf(item.get("yearHigh")),
        "week_52_low": sf(item.get("yearLow")),
    }
    _realtime_cache[key] = (result, time.time())
    return result
