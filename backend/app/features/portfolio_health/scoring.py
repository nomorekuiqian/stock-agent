"""
Portfolio health scoring -- 4 pure functions, each returning 0-25.
Zero I/O, zero LLM. Fully deterministic and testable.
"""

import math

from app.features.portfolio.models import HoldingView
from app.features.portfolio.exposure_parser import get_true_exposure
from app.shared.data_tools._cash_guard import CASH_SYMBOL

# Reference volatility (annualized daily SPY vol, approximate)
SPY_VOL_ANNUAL = 0.16  # ~16% annual
SPY_VOL_DAILY = SPY_VOL_ANNUAL / math.sqrt(252)


def compute_dispersion(
    holdings: list[HoldingView],
    sector_lookup: dict[str, str] | None = None,
) -> int:
    """Sector diversification score (0-25). More sectors + lower concentration = better."""
    if not holdings:
        return 0

    exposure = get_true_exposure(holdings, sector_lookup)

    n_sectors = sum(1 for s, w in exposure.items() if w >= 5.0 and s != "Cash")
    max_share = max(
        (w for s, w in exposure.items() if s != "Cash"), default=0
    )

    # Base score: more sectors + lower concentration = better
    if n_sectors >= 7:
        base = 20
    elif n_sectors >= 5:
        base = 16
    elif n_sectors >= 3:
        base = 12
    elif n_sectors >= 2:
        base = 8
    else:
        base = 4

    # Concentration penalty
    if max_share > 60.0:
        base = min(base, 6)
    elif max_share > 40.0:
        base = min(base, 12)

    # Cash bonus (exposure values are 0-100 scale)
    cash_pct = exposure.get("Cash", 0)
    cash_bonus = min(5, int(cash_pct / 5.0))  # 25% cash -> +5

    return min(25, base + cash_bonus)


def compute_performance(
    holdings: list[HoldingView],
    returns_map: dict[str, list[float]] | None,
    spy_returns: list[float] | None,
) -> int:
    """Performance vs SPY score (0-25). Outperformance = higher score."""
    if not returns_map or not spy_returns or not holdings:
        return 12  # neutral default

    # Weighted portfolio return
    portfolio_return = 0.0
    total_weight = 0.0
    for h in holdings:
        w = h.effective_weight_pct / 100.0
        rets = returns_map.get(h.symbol)
        if rets and len(rets) > 0:
            portfolio_return += w * sum(rets)
            total_weight += w

    if total_weight < 0.5:  # less than half the portfolio has data
        return 12

    portfolio_return /= max(total_weight, 0.01)
    spy_total = sum(spy_returns)

    # Score based on relative performance
    excess = portfolio_return - spy_total
    if excess > 0.03:  # > 3% outperformance
        return 25
    elif excess > 0.01:  # > 1%
        return 20
    elif excess > -0.01:  # within +/-1%
        return 15
    elif excess > -0.03:  # -1% to -3%
        return 10
    else:  # > 3% underperformance
        return 5


def compute_macro_fit(
    holdings: list[HoldingView],
    macro_risk: dict | None,
    sector_lookup: dict[str, str] | None = None,
) -> int:
    """Macro alignment score (0-25). Portfolio positioning vs macro risk level."""
    if not macro_risk or not holdings:
        return 12

    exposure = get_true_exposure(holdings, sector_lookup)

    risk_level = macro_risk.get("risk_level", "moderate")

    # Sector classification (exposure values are 0-100 scale, convert to fraction)
    DEFENSIVE_SECTORS = {"Consumer Staples", "Consumer Defensive", "Healthcare", "Utilities", "Cash"}
    GROWTH_SECTORS = {"Technology", "Consumer Cyclical", "Consumer Discretionary", "Communication Services"}

    defensive_weight = sum(exposure.get(s, 0) for s in DEFENSIVE_SECTORS) / 100.0
    growth_weight = sum(exposure.get(s, 0) for s in GROWTH_SECTORS) / 100.0

    if risk_level in ("high", "extreme"):
        # High risk: reward defensive positioning
        score = int(defensive_weight * 30)  # max ~25 if fully defensive
        if growth_weight > 0.6:
            score = min(score, 8)  # heavy growth in risk-off = bad
    elif risk_level == "low":
        # Low risk: growth is fine
        score = 15 + int(growth_weight * 15)
    else:
        # Moderate: balanced is best
        balance = 1.0 - abs(growth_weight - defensive_weight)
        score = int(balance * 20) + 5

    return max(0, min(25, score))


def compute_stability(
    holdings: list[HoldingView],
    returns_map: dict[str, list[float]] | None,
) -> int:
    """Volatility score (0-25). Lower portfolio vol relative to SPY = higher score."""
    if not returns_map or not holdings:
        return 12

    # Weighted portfolio volatility
    weighted_vol = 0.0
    total_weight = 0.0
    for h in holdings:
        w = h.effective_weight_pct / 100.0
        if h.symbol == CASH_SYMBOL:
            total_weight += w
            continue  # vol = 0 for cash
        rets = returns_map.get(h.symbol)
        if rets and len(rets) >= 2:
            mean = sum(rets) / len(rets)
            var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
            vol = math.sqrt(var) if var > 0 else 0
            weighted_vol += w * vol
            total_weight += w

    if total_weight < 0.3:
        return 12

    # Normalize by SPY daily vol
    vol_ratio = weighted_vol / SPY_VOL_DAILY if SPY_VOL_DAILY > 0 else 1.0

    # Lower ratio = more stable = higher score
    if vol_ratio < 0.5:
        return 25
    elif vol_ratio < 0.8:
        return 20
    elif vol_ratio < 1.2:
        return 15
    elif vol_ratio < 1.8:
        return 10
    else:
        return 5


def compute_all(
    holdings: list[HoldingView],
    returns_map: dict[str, list[float]] | None = None,
    spy_returns: list[float] | None = None,
    macro_risk: dict | None = None,
    sector_lookup: dict[str, str] | None = None,
) -> "HealthScore":
    """Compute all 4 dimensions and return aggregate HealthScore."""
    from app.features.portfolio_health.models import HealthScore

    d = compute_dispersion(holdings, sector_lookup)
    p = compute_performance(holdings, returns_map, spy_returns)
    m = compute_macro_fit(holdings, macro_risk, sector_lookup)
    s = compute_stability(holdings, returns_map)
    return HealthScore(
        dispersion=d,
        performance=p,
        macro_fit=m,
        stability=s,
        total=d + p + m + s,
    )
