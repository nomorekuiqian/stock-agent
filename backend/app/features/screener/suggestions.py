"""
Smart narrowing suggestions for the screener funnel.

Analyzes the current candidate list and returns 3-4 dimensions
with the highest discrimination power, so users can progressively
narrow results from ~30 to 3-5 candidates.
"""

from collections import Counter
from statistics import stdev

from app.core.logging import get_logger

logger = get_logger(__name__)

# Sector bilingual mapping (tvscreener English -> Chinese)
SECTOR_ZH: dict[str, str] = {
    "Commercial Services": "商业服务",
    "Communications": "通信",
    "Consumer Durables": "耐用消费品",
    "Consumer Non-Durables": "非耐用消费品",
    "Consumer Services": "消费服务",
    "Distribution Services": "分销服务",
    "Electronic Technology": "电子技术",
    "Energy Minerals": "能源矿产",
    "Finance": "金融",
    "Health Services": "医疗服务",
    "Health Technology": "医疗技术",
    "Industrial Services": "工业服务",
    "Miscellaneous": "其他",
    "Non-Energy Minerals": "非能源矿产",
    "Process Industries": "加工工业",
    "Producer Manufacturing": "生产制造",
    "Retail Trade": "零售",
    "Technology Services": "科技服务",
    "Transportation": "运输",
    "Utilities": "公用事业",
}


def _safe_float(val, default=None) -> float | None:
    if val is None:
        return default
    try:
        f = float(val)
        if f != f:  # NaN check
            return default
        return f
    except (TypeError, ValueError):
        return default


def _suggest_sector(candidates: list[dict]) -> dict | None:
    """Suggest sector-based narrowing if candidates span 3+ sectors."""
    counts: Counter = Counter()
    for c in candidates:
        s = c.get("sector")
        if s:
            counts[s] += 1

    if len(counts) < 3:
        return None

    options = []
    for sector, count in counts.most_common(10):
        zh = SECTOR_ZH.get(sector, sector)
        options.append({
            "value": sector,
            "label": zh,
            "count": count,
        })

    return {
        "dimension": "sector",
        "label": "按板块",
        "type": "categorical",
        "options": options,
    }


def _suggest_market_cap_tier(candidates: list[dict]) -> dict | None:
    """Suggest market cap tier if candidates span 2+ tiers."""
    counts: Counter = Counter()
    for c in candidates:
        tier = c.get("market_cap_tier")
        if tier and tier != "nan":
            counts[tier] += 1

    if len(counts) < 2:
        return None

    tier_labels = {
        "mega": "超大盘 >$200B",
        "large": "大盘 $10-200B",
        "mid": "中盘 $2-10B",
        "small": "小盘 <$2B",
    }
    tier_order = ["mega", "large", "mid", "small"]

    options = []
    for tier in tier_order:
        if tier in counts:
            options.append({
                "value": tier,
                "label": tier_labels.get(tier, tier),
                "count": counts[tier],
            })

    return {
        "dimension": "market_cap_tier",
        "label": "按市值",
        "type": "categorical",
        "options": options,
    }


def _suggest_pe(candidates: list[dict]) -> dict | None:
    """Suggest PE-based narrowing if PE values have enough spread."""
    values = [_safe_float(c.get("pe_ttm")) for c in candidates]
    valid = [v for v in values if v is not None and 0 < v < 500]

    if len(valid) < len(candidates) * 0.4:
        return None

    try:
        sd = stdev(valid) if len(valid) > 1 else 0
    except Exception:
        return None

    if sd < 5:
        return None

    low = sum(1 for v in valid if v < 15)
    mid = sum(1 for v in valid if 15 <= v <= 25)
    high = sum(1 for v in valid if v > 25)

    groups = sum(1 for g in [low, mid, high] if g > 0)
    if groups < 2:
        return None

    options = []
    if low > 0:
        options.append({"value": "low", "label": "PE < 15 (低估值)", "count": low})
    if mid > 0:
        options.append({"value": "mid", "label": "PE 15-25 (合理)", "count": mid})
    if high > 0:
        options.append({"value": "high", "label": "PE > 25 (高估值)", "count": high})

    return {
        "dimension": "pe_ttm",
        "label": "按估值",
        "type": "categorical",
        "options": options,
    }


def _suggest_analyst_rating(candidates: list[dict]) -> dict | None:
    """Suggest analyst rating filter if data coverage is sufficient."""
    values = [_safe_float(c.get("analyst_rating")) for c in candidates]
    valid = [v for v in values if v is not None]

    if len(valid) < len(candidates) * 0.4:
        return None

    buy = sum(1 for v in valid if v < 2.5)
    hold = sum(1 for v in valid if 2.5 <= v <= 3.5)
    sell = sum(1 for v in valid if v > 3.5)

    groups = sum(1 for g in [buy, hold, sell] if g > 0)
    if groups < 2:
        return None

    options = []
    if buy > 0:
        options.append({"value": "buy", "label": "买入/强烈买入", "count": buy})
    if hold > 0:
        options.append({"value": "hold", "label": "持有", "count": hold})
    if sell > 0:
        options.append({"value": "sell", "label": "卖出", "count": sell})

    return {
        "dimension": "analyst_rating",
        "label": "按分析师评级",
        "type": "categorical",
        "options": options,
    }


def _suggest_rsi(candidates: list[dict]) -> dict | None:
    """Suggest RSI-based narrowing if RSI values have spread."""
    values = [_safe_float(c.get("rsi")) for c in candidates]
    valid = [v for v in values if v is not None]

    if len(valid) < len(candidates) * 0.5:
        return None

    try:
        rng = max(valid) - min(valid)
    except Exception:
        return None

    if rng < 15:
        return None

    oversold = sum(1 for v in valid if v < 30)
    neutral = sum(1 for v in valid if 30 <= v <= 70)
    overbought = sum(1 for v in valid if v > 70)

    groups = sum(1 for g in [oversold, neutral, overbought] if g > 0)
    if groups < 2:
        return None

    options = []
    if oversold > 0:
        options.append({"value": "oversold", "label": "超卖 RSI<30", "count": oversold})
    if neutral > 0:
        options.append({"value": "neutral", "label": "中性 30-70", "count": neutral})
    if overbought > 0:
        options.append({"value": "overbought", "label": "超买 RSI>70", "count": overbought})

    return {
        "dimension": "rsi",
        "label": "按技术面",
        "type": "categorical",
        "options": options,
    }


def _suggest_dividend(candidates: list[dict], strategy: str) -> dict | None:
    """Suggest dividend filter (skip if already using high_dividend strategy)."""
    if strategy == "high_dividend":
        return None

    has_div = sum(
        1 for c in candidates
        if (_safe_float(c.get("dividend_yield"), 0) or 0) > 0
    )
    no_div = len(candidates) - has_div

    if has_div < 3 or no_div < 3:
        return None

    return {
        "dimension": "dividend_yield",
        "label": "按分红",
        "type": "categorical",
        "options": [
            {"value": "yes", "label": "有分红", "count": has_div},
            {"value": "no", "label": "无分红", "count": no_div},
        ],
    }


def _suggest_trend(candidates: list[dict]) -> dict | None:
    """Suggest SMA200 trend filter if roughly split."""
    above = sum(1 for c in candidates if c.get("above_sma200") is True)
    below = sum(1 for c in candidates if c.get("above_sma200") is False)
    total = above + below

    if total < len(candidates) * 0.5:
        return None

    # Only suggest if distribution isn't too lopsided (at least 20/80)
    if total == 0:
        return None
    ratio = min(above, below) / total
    if ratio < 0.15:
        return None

    return {
        "dimension": "above_sma200",
        "label": "按趋势",
        "type": "categorical",
        "options": [
            {"value": "above", "label": "200日均线上方 (上升趋势)", "count": above},
            {"value": "below", "label": "200日均线下方 (下降趋势)", "count": below},
        ],
    }


def _suggest_sort_roe(candidates: list[dict]) -> dict | None:
    """Suggest sort by ROE if enough data available."""
    valid = sum(
        1 for c in candidates
        if _safe_float(c.get("roe")) is not None
    )
    if valid < len(candidates) * 0.4:
        return None

    return {
        "dimension": "roe",
        "label": "按 ROE 排序",
        "type": "sort",
        "description": "看盈利能力最强的",
    }


def _suggest_sort_upside(candidates: list[dict]) -> dict | None:
    """Suggest sort by analyst upside if enough data available."""
    valid = sum(
        1 for c in candidates
        if _safe_float(c.get("analyst_upside")) is not None
    )
    if valid < len(candidates) * 0.4:
        return None

    return {
        "dimension": "analyst_upside",
        "label": "按目标价上行空间排序",
        "type": "sort",
        "description": "看分析师最看好的",
    }


def compute_narrowing_suggestions(
    candidates: list[dict],
    strategy: str = "",
    max_suggestions: int = 4,
) -> list[dict]:
    """
    Analyze candidate list and return narrowing suggestions.

    For > 20 candidates: prefer categorical chips (sector, cap tier, etc.)
    For 10-20: mix categorical + sort
    For < 10: prefer sort suggestions
    For < 5: return empty (no more narrowing needed)
    """
    n = len(candidates)

    if n < 5:
        return []

    # Collect all possible suggestions
    categorical_suggestions = []
    sort_suggestions = []

    # Categorical dimensions
    for fn in [
        _suggest_sector,
        _suggest_market_cap_tier,
        lambda c: _suggest_pe(c),
        lambda c: _suggest_analyst_rating(c),
        lambda c: _suggest_rsi(c),
        lambda c: _suggest_dividend(c, strategy),
        lambda c: _suggest_trend(c),
    ]:
        try:
            result = fn(candidates)
            if result:
                categorical_suggestions.append(result)
        except Exception:
            continue

    # Sort dimensions
    for fn in [_suggest_sort_roe, _suggest_sort_upside]:
        try:
            result = fn(candidates)
            if result:
                sort_suggestions.append(result)
        except Exception:
            continue

    # Compose final list based on candidate count
    suggestions: list[dict] = []

    if n > 20:
        # Prefer categorical to quickly narrow
        suggestions = categorical_suggestions[:max_suggestions]
    elif n > 10:
        # Mix: 2-3 categorical + 1 sort
        cat_count = min(len(categorical_suggestions), max_suggestions - 1)
        suggestions = categorical_suggestions[:cat_count]
        remaining = max_suggestions - len(suggestions)
        suggestions.extend(sort_suggestions[:remaining])
    else:
        # Prefer sort to refine small sets
        sort_count = min(len(sort_suggestions), 2)
        suggestions = sort_suggestions[:sort_count]
        remaining = max_suggestions - len(suggestions)
        suggestions.extend(categorical_suggestions[:remaining])

    return suggestions[:max_suggestions]
