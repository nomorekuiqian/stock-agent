"""
Compute T+7 outcome for suggestion tracking — pure function.

Compares suggestion's target sectors/symbols performance against SPY
over the follow-up period.
"""

from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)

_DEFENSIVE = {"Utilities", "Consumer Staples", "Healthcare"}


def compute_outcome(
    suggestion_text: str,
    spy_return_7d: float,
    sector_returns_7d: dict[str, float],
    portfolio_change_7d: Optional[float] = None,
) -> dict:
    """Compute outcome for a suggestion. Returns outcome dict for DB storage."""
    sector_vs_spy = {
        s: r - spy_return_7d for s, r in sector_returns_7d.items()
    }

    direction_correct = _judge_direction(
        suggestion_text, sector_vs_spy, spy_return_7d
    )

    narrative = _narrate(
        suggestion_text, direction_correct, spy_return_7d, sector_vs_spy
    )

    return {
        "portfolio_change_7d": portfolio_change_7d,
        "spy_return_7d": spy_return_7d,
        "sector_vs_spy": sector_vs_spy,
        "direction_correct": direction_correct,
        "narrative": narrative,
    }


def _judge_direction(
    text: str,
    sector_vs_spy: dict[str, float],
    spy_return: float,
) -> Optional[bool]:
    """Rule-based direction judgment. Returns True/False/None (unknown)."""
    text_lower = text.lower()

    # Cash/hold suggestions
    for kw in ["现金", "持币", "cash", "保留现金", "观望"]:
        if kw in text_lower:
            return spy_return < 0  # cash correct if market fell

    # Defensive suggestions
    for kw in ["防御", "降低风险", "避险"]:
        if kw in text_lower:
            return any(sector_vs_spy.get(s, 0) > 0 for s in _DEFENSIVE)

    # Tech concentration warnings
    for kw in ["科技集中", "科技占比", "减少科技"]:
        if kw in text_lower:
            tech_vs_spy = sector_vs_spy.get("Technology", 0)
            return tech_vs_spy < 0  # correct if tech underperformed

    return None  # no rule matched


def _narrate(
    text: str,
    direction_correct: Optional[bool],
    spy_return: float,
    sector_vs_spy: dict[str, float],
) -> str:
    """Generate a factual narrative (template, not LLM)."""
    spy_str = "SPY 7 天 %+.1f%%" % (spy_return * 100)

    if direction_correct is True:
        return "方向正确。%s，建议的调整方向与市场走势一致。" % spy_str
    elif direction_correct is False:
        return "方向偏差。%s，市场走势与建议的方向相反。" % spy_str
    else:
        return "无法判断。%s。" % spy_str
