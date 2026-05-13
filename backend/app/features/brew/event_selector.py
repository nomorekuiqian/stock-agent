"""
Event selector - pick the single most urgent event for a user's portfolio.

Pure function: no I/O, no LLM calls. Receives pre-fetched data and returns
a TopEvent or None.

Score formula: (1 / (days_until + 1)) * (weight/100 + severity_bonus)
Threshold: MIN_SCORE = 0.15

Used by the digest router to populate DigestResponse.top_event, which the
frontend ActionBar consumes.
"""

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel

from app.features.brew.macro_map import MACRO_MAP, match_macro_key

SEVERITY_BONUS = {"urgent": 0.4, "watch": 0.2, "info": 0.0}
IMPACT_TO_SEVERITY: dict[str, Literal["info", "watch", "urgent"]] = {
    "critical": "urgent",
    "high": "watch",
    "mid": "info",
    "low": "info",
}
MIN_SCORE = 0.15


class TopEvent(BaseModel):
    """The single most urgent event for a user's portfolio."""

    type: Literal["earnings", "macro", "grade_change"]
    symbol: Optional[str] = None
    title: str
    days_until: int
    why_for_you: str
    severity: Literal["info", "watch", "urgent"]
    link: str
    source_id: str


def select_top_event(
    earnings: list[dict],
    macros: list[dict],
    holdings: dict[str, float],  # symbol -> effective_weight_pct
    today: date | None = None,
) -> TopEvent | None:
    """Select the single most urgent event for a user based on holdings.

    Args:
        earnings: List of earnings dicts with keys: symbol, date, epsEstimated, ...
        macros: List of economic calendar dicts with keys: date, event, ...
        holdings: {symbol: effective_weight_pct} mapping from portfolio.
        today: Override for testing; defaults to date.today().

    Returns:
        The highest-scoring TopEvent, or None if nothing exceeds MIN_SCORE.
    """
    today = today or date.today()
    candidates: list[tuple[float, TopEvent]] = []

    # --- Earnings candidates (T <= 7) ---
    for e in earnings:
        sym = (e.get("symbol") or "").upper()
        if not sym:
            continue
        w = holdings.get(sym, 0)
        if w < 1:
            continue  # < 1% weight is not "your" event

        edate = _parse_date(e.get("date", ""))
        if edate is None:
            continue
        days = (edate - today).days
        if days < 0 or days > 7:
            continue

        sev: Literal["info", "watch", "urgent"] = (
            "urgent" if days <= 2 else "watch" if days <= 5 else "info"
        )
        score = (1 / (days + 1)) * (w / 100 + SEVERITY_BONUS[sev])

        eps = e.get("epsEstimated")
        eps_str = f" | EPS 预期 ${eps:.2f}" if eps else ""

        candidates.append((
            score,
            TopEvent(
                type="earnings",
                symbol=sym,
                title=f"{sym} 财报",
                days_until=days,
                why_for_you=f"仓位 {w:.0f}%{eps_str}",
                severity=sev,
                link=f"/stock/{sym}?tab=earnings",
                source_id=f"earnings:{sym}:{edate.isoformat()}",
            ),
        ))

    # --- Macro candidates (T <= 5) ---
    for evt in macros:
        event_text = evt.get("event", "")
        edate = _parse_date(evt.get("date", ""))
        if edate is None:
            continue
        days = (edate - today).days
        if days < 0 or days > 5:
            continue

        macro_key = match_macro_key(event_text)
        if not macro_key:
            continue

        rule = MACRO_MAP.get(macro_key)
        if not rule:
            continue

        sev = IMPACT_TO_SEVERITY.get(rule.impact, "info")
        if sev == "info" and days > 3:
            continue  # low-impact + far away = skip

        affected_sectors = rule.sectors
        # "All" means everyone is affected => use full portfolio weight
        total_affected_weight = 100.0 if "All" in affected_sectors else 50.0

        score = (1 / (days + 1)) * (total_affected_weight / 100 + SEVERITY_BONUS[sev])

        candidates.append((
            score,
            TopEvent(
                type="macro",
                symbol=None,
                title=rule.title_zh,
                days_until=days,
                why_for_you=(
                    f"影响{'全市场' if 'All' in affected_sectors else '、'.join(affected_sectors[:2])}"
                ),
                severity=sev,
                link="/macro",
                source_id=f"macro:{macro_key}:{edate.isoformat()}",
            ),
        ))

    if not candidates:
        return None

    score, ev = max(candidates, key=lambda x: x[0])
    return ev if score >= MIN_SCORE else None


def _parse_date(value: object) -> date | None:
    """Parse a date from string (YYYY-MM-DD) or date object. Returns None on failure."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str) and value:
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            return None
    return None
