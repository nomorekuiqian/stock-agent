"""
Fallback headline + chip templates used when LLM rendering fails or is skipped.

The previous rule-engine helpers (green/staleness) were removed in round2; the
active rendering path consumes agent `action_items` in `service.build_action_bar`.
`fallback_headline` / `fallback_chip_labels` are retained as legacy fallbacks
in case an LLM rendering path is reintroduced.
"""

from app.features.for_you.models import Signal


def fallback_headline(signals: list[Signal], profile_style: str) -> str:
    """Template-based fallback when LLM fails or times out."""
    parts = []
    for s in signals[:2]:
        if s.kind == "drawdown":
            cause = s.data.get("cause", "portfolio_wide")
            if cause == "single_drag":
                culprit = s.data.get("culprit_symbol", "?")
                drag = s.data.get("drag_pct", 0)
                parts.append(f"{culprit} 拖累组合 {abs(drag):.1f}%")
            else:
                overall = s.data.get("overall_pct", 0)
                parts.append(f"组合今日 {overall:+.1f}%")
        elif s.kind == "event":
            title = s.data.get("title", "事件")
            days = s.data.get("days_until", 0)
            parts.append(f"T-{days} {title}")
        elif s.kind == "health":
            score = s.data.get("health_score", "?")
            parts.append(f"健康分 {score}")
    return " · ".join(parts) if parts else "有需要关注的事项"


def fallback_chip_labels(signals: list[Signal]) -> list[str]:
    labels = []
    for s in signals[:3]:
        if s.kind == "drawdown":
            labels.append("查看持仓")
        elif s.kind == "event":
            sym = s.data.get("symbol")
            labels.append(f"查看 {sym}" if sym else "查看事件")
        elif s.kind == "health":
            labels.append("持仓体检")
        else:
            labels.append("查看详情")
    return labels
