"""
Screener filter strategies - pure Python operations on cached universe data.

All filter functions take a list of stock dicts (from cache) and return
a filtered/sorted subset. No API calls, no database access.
"""

from app.core.logging import get_logger

logger = get_logger(__name__)


def _num(stock: dict, key: str, default: float = 0.0) -> float:
    """Safely get a numeric value from stock dict, treating None as default."""
    val = stock.get(key)
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _sort_and_limit(stocks: list[dict], sort_key: str, limit: int,
                    reverse: bool = True) -> list[dict]:
    """Sort stocks by key (handling None) and limit results."""
    valid = [s for s in stocks if s.get(sort_key) is not None]
    valid.sort(key=lambda s: s[sort_key], reverse=reverse)
    return valid[:limit]


def filter_hot_sectors(universe: list[dict], sector_stats: list[dict],
                       top_n: int = 3, per_sector: int = 10) -> list[dict]:
    """
    Hot sectors: top N sectors by average daily change,
    then top stocks within each sector by daily change.
    Returns ~top_n * per_sector candidates.
    """
    if not sector_stats:
        return []

    # Top N sectors by avg daily change
    top_sectors = [
        s["sector"] for s in sector_stats[:top_n]
        if s.get("sector") and s.get("avg_daily_change") is not None
    ]

    if not top_sectors:
        return []

    candidates = []
    for sector in top_sectors:
        sector_stocks = [
            s for s in universe
            if s.get("sector") == sector and s.get("daily_change") is not None
        ]
        sector_stocks.sort(key=lambda s: s["daily_change"], reverse=True)
        candidates.extend(sector_stocks[:per_sector])

    return candidates


def filter_volume_surge(universe: list[dict],
                        ratio_threshold: float = 2.0,
                        limit: int = 30) -> list[dict]:
    """
    Volume surge: stocks with relative_volume >= threshold AND positive daily change.
    Sorted by relative_volume descending.
    """
    candidates = [
        s for s in universe
        if (_num(s, "relative_volume") >= ratio_threshold
            and _num(s, "daily_change") > 0
            and _num(s, "avg_volume_30d") >= 100_000)
    ]

    candidates.sort(key=lambda s: s.get("relative_volume", 0), reverse=True)
    return candidates[:limit]


def filter_value_discovery(universe: list[dict],
                           limit: int = 30) -> list[dict]:
    """
    Value discovery: low PE relative to industry + near 52w low + decent ROE.
    Composite score: PE discount + 52w position + ROE.
    """
    # Compute industry median PE
    industry_pe: dict[str, list[float]] = {}
    for s in universe:
        ind = s.get("industry")
        pe = s.get("pe_ttm")
        if ind and pe is not None and 0 < pe < 200:
            industry_pe.setdefault(ind, []).append(pe)

    industry_median: dict[str, float] = {}
    for ind, values in industry_pe.items():
        values.sort()
        mid = len(values) // 2
        industry_median[ind] = values[mid]

    candidates = []
    for s in universe:
        pe = s.get("pe_ttm")
        roe = s.get("roe")
        pos_52w = s.get("position_52w")
        ind = s.get("industry")

        if pe is None or roe is None or pos_52w is None:
            continue
        if pe <= 0 or pe > 200:
            continue
        if roe < 10:
            continue

        # PE discount vs industry median
        if not ind:
            continue
        median_pe = industry_median.get(ind)
        if median_pe is None or median_pe <= 0:
            continue
        pe_discount = (median_pe - pe) / median_pe  # positive = cheaper

        if pe_discount < 0.1:  # at least 10% cheaper than industry
            continue

        # Score: weighted combo (higher = better)
        score = (
            pe_discount * 40
            + (1 - pos_52w) * 30   # lower in 52w range = more value
            + min(roe / 30, 1) * 30  # ROE contribution capped
        )

        stock = dict(s)
        stock["_score"] = round(score, 2)
        candidates.append(stock)

    candidates.sort(key=lambda s: s["_score"], reverse=True)
    # Remove internal score field
    for c in candidates[:limit]:
        c.pop("_score", None)
    return candidates[:limit]


def filter_high_dividend(universe: list[dict],
                         min_yield: float = 2.0,
                         limit: int = 30) -> list[dict]:
    """
    High dividend: yield > threshold + continuous payout + payout ratio < 80%.
    Sorted by dividend yield descending.
    """
    candidates = [
        s for s in universe
        if (_num(s, "dividend_yield") >= min_yield
            and _num(s, "payout_ratio", 100) < 80
            and _num(s, "dividend_payout_years") >= 3)
    ]

    candidates.sort(key=lambda s: s.get("dividend_yield", 0), reverse=True)
    return candidates[:limit]


def filter_momentum(universe: list[dict],
                    limit: int = 30) -> list[dict]:
    """
    Momentum: 3-month gainers + RSI in sweet spot (50-70) + above SMA50.
    Sorted by 3-month performance descending.
    """
    candidates = [
        s for s in universe
        if (_num(s, "change_3m") > 0
            and 50 <= _num(s, "rsi") <= 70
            and s.get("above_sma50") is True
            and _num(s, "avg_volume_30d") >= 200_000)
    ]

    candidates.sort(key=lambda s: s.get("change_3m", 0), reverse=True)
    return candidates[:limit]


def filter_oversold_quality(universe: list[dict],
                            limit: int = 30) -> list[dict]:
    """
    Oversold quality: RSI < 35 + ROE > 15% + analyst rating < 2.5 (buy/strong buy).
    Sorted by RSI ascending (most oversold first).
    """
    candidates = [
        s for s in universe
        if (_num(s, "rsi", 100) < 35
            and _num(s, "roe") > 15
            and _num(s, "analyst_rating", 5) < 2.5
            and _num(s, "market_cap") >= 1e9)
    ]

    candidates.sort(key=lambda s: s.get("rsi", 100))
    return candidates[:limit]


def filter_by_sector(universe: list[dict], sector: str,
                     sort_by: str = "daily_change",
                     limit: int = 30) -> list[dict]:
    """
    Sector filter: all stocks in a given sector, sorted by specified field.
    """
    sector_lower = sector.lower()
    sector_stocks = [
        s for s in universe
        if s.get("sector", "").lower() == sector_lower
    ]

    return _sort_and_limit(sector_stocks, sort_by, limit)


def filter_custom(universe: list[dict], criteria: dict) -> tuple[list[dict], int]:
    """
    Custom filter: apply arbitrary field-based criteria.

    criteria format:
    {
        "filters": [
            {"field": "pe_ttm", "op": "lt", "value": 15},
            {"field": "roe", "op": "gt", "value": 10},
            {"field": "sector", "op": "eq", "value": "Technology"},
        ],
        "sort_by": "market_cap",
        "sort_order": "desc",
        "limit": 30,
    }
    """
    if not criteria or "filters" not in criteria:
        return [], 0

    ops = {
        "gt": lambda a, b: a is not None and a > b,
        "gte": lambda a, b: a is not None and a >= b,
        "lt": lambda a, b: a is not None and a < b,
        "lte": lambda a, b: a is not None and a <= b,
        "eq": lambda a, b: a is not None and a == b,
        "neq": lambda a, b: a is not None and a != b,
        "in": lambda a, b: a is not None and a in b,
    }

    filtered = list(universe)
    for f in criteria.get("filters", []):
        field = f.get("field")
        op = f.get("op")
        value = f.get("value")

        # Special handling: filter by ticker list (thematic groups)
        if field == "tickers" and op == "in" and isinstance(value, list):
            ticker_set = {t.upper().strip() for t in value if isinstance(t, str)}
            filtered = [
                s for s in filtered
                if s.get("symbol", "").split(":")[-1].upper() in ticker_set
            ]
            continue

        if not field or not op or op not in ops:
            continue
        filtered = [s for s in filtered if ops[op](s.get(field), value)]

    sort_by = criteria.get("sort_by", "market_cap")
    sort_order = criteria.get("sort_order", "desc")
    limit = criteria.get("limit", 30)

    total_matches = len(filtered)
    limited = _sort_and_limit(filtered, sort_by, limit, reverse=(sort_order == "desc"))
    return limited, total_matches


# Strategy dispatch map
STRATEGIES = {
    "hot_sectors": "filter_hot_sectors",
    "volume_surge": "filter_volume_surge",
    "value_discovery": "filter_value_discovery",
    "high_dividend": "filter_high_dividend",
    "momentum": "filter_momentum",
    "oversold_quality": "filter_oversold_quality",
    "by_sector": "filter_by_sector",
    "custom": "filter_custom",
}
