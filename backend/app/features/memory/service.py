"""
Memory aggregation — builds a <=1050 token memory block for agent injection.

Sections:
- Theses: user's stated investment reasons (<=800 token)
- Suggestion tracking: pending + recent outcomes (<=100 token)
"""

from app.core.logging import get_logger
from app.features.memory import db as memory_db
from app.features.portfolio import db as portfolio_db

logger = get_logger(__name__)

MAX_THESIS_CHARS = 1600   # ~800 tokens
MAX_TRACKING_CHARS = 200  # ~100 tokens


async def get_user_memory(user_id: str) -> str:
    """Return memory markdown block (<=1050 tokens) or '' if nothing."""
    try:
        theses = await _get_theses(user_id)
        tracking = await memory_db.get_pending_and_recent(user_id, days=14)
    except Exception:
        logger.warning("get_user_memory failed user=%s", user_id[:8])
        return ""

    if not (theses or tracking):
        return ""

    sections: list[str] = []
    if theses:
        sections.append(_render_theses(theses))
    if tracking:
        rendered = _render_tracking(tracking)
        if rendered:
            sections.append(rendered)

    if not sections:
        return ""

    return "## 用户记忆\n" + "\n\n".join(sections)


async def _get_theses(user_id: str) -> list[dict]:
    """Get holdings with non-empty thesis, sorted by weight."""
    try:
        rows = await portfolio_db.list_portfolio(user_id)
        return [
            {"symbol": r.symbol, "thesis": r.thesis, "weight": 0}
            for r in rows
            if r.thesis
        ]
    except Exception:
        return []


def _render_theses(theses: list[dict]) -> str:
    lines = [
        "- %s: %s" % (t["symbol"], t["thesis"][:60]) for t in theses[:15]
    ]
    block = "【持仓 thesis】\n" + "\n".join(lines)
    return block[:MAX_THESIS_CHARS]


def _render_tracking(tracking_rows) -> str:
    """Render pending and recent suggestion outcomes."""
    lines: list[str] = []
    for r in tracking_rows[:3]:
        if r.outcome:
            direction = r.outcome.get("direction_correct")
            if direction is True:
                lines.append("- 建议「%s」方向正确" % r.suggestion_text[:20])
            elif direction is False:
                lines.append("- 建议「%s」方向偏差" % r.suggestion_text[:20])
            else:
                lines.append("- 建议「%s」已评估" % r.suggestion_text[:20])
        else:
            lines.append("- 建议「%s」观察中" % r.suggestion_text[:20])

    if not lines:
        return ""
    return "【建议追踪】\n" + "\n".join(lines)
