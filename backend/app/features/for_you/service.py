"""
Action Bar service — build_action_bar() is the heart of U0-B.

Pure aggregation: reads digest, portfolio, profile data and applies
a deterministic rules engine to produce a three-state ActionBar
(green/yellow/red) with headline text and action chips.

V1: template-only headlines (no LLM). The `source` field already
supports "llm" and "llm_fallback" for V1.1.
"""

from datetime import datetime, timezone
from typing import Optional

from app.core.feature_pause import is_paused
from app.core.logging import get_logger
from app.features.for_you import templates
from app.features.for_you.models import ActionBar, ActionChip, DragResult, Signal
from app.features.portfolio.models import HoldingView, ProfileView

logger = get_logger(__name__)

SEVERITY_ORDER = {"green": 0, "yellow": 1, "red": 2}
OVERALL_THRESHOLDS = {"high": -5.0, "moderate": -4.0, "low": -3.0}
SINGLE_DRAG_THRESHOLD = -1.5


def compute_max_drag(
    holdings: list[HoldingView],
    daily_changes: dict[str, float],
) -> DragResult:
    """Compute portfolio-wide drag and worst single-stock drag."""
    overall = sum(
        (h.effective_weight_pct / 100.0) * daily_changes.get(h.symbol, 0.0)
        for h in holdings
    )
    worst_single = 0.0
    culprit = None
    for h in holdings:
        w = h.effective_weight_pct / 100.0
        if w < 0.10:
            continue
        daily = daily_changes.get(h.symbol, 0.0)
        if daily > -10.0:
            continue
        drag = daily * w
        if drag < worst_single:
            worst_single, culprit = drag, h.symbol
    return DragResult(
        overall=round(overall, 2),
        worst_single=round(worst_single, 2),
        culprit=culprit,
        value=round(min(overall, worst_single), 2),
    )


def _max_severity(signals: list[Signal]) -> str:
    if not signals:
        return "green"
    return max(signals, key=lambda s: SEVERITY_ORDER.get(s.severity, 0)).severity


def _build_chip(signal: Signal, label: str | None = None) -> ActionChip:
    LINK_MAP = {
        "drawdown": "/for-you",
        "health": "/for-you/health",
        "event": None,  # from signal data
        "staleness": "/for-you/portfolio",
        "stable": "/for-you",
    }
    link = LINK_MAP.get(signal.kind, "/for-you")
    if signal.kind == "event":
        link = signal.data.get("link", "/for-you")

    if not label:
        LABEL_MAP = {
            "drawdown": "查看持仓",
            "health": "持仓体检",
            "staleness": "去更新",
            "stable": "查看日报",
        }
        if signal.kind == "event":
            sym = signal.data.get("symbol")
            label = f"查看 {sym}" if sym else "查看事件"
        else:
            label = LABEL_MAP.get(signal.kind, "查看")

    return ActionChip(
        label=label,
        link=link,
        kind=signal.kind if signal.kind != "staleness" else "research",
    )


async def build_action_bar(
    user_id: str,
    *,
    digest_data: dict | None = None,
    holdings: list[HoldingView] | None = None,
    profile: ProfileView | None = None,
    top_event: dict | None = None,
    health_latest: dict | None = None,
) -> ActionBar:
    """Build the action bar from the digest agent's action_items.

    Visibility rules:
    - Agent emitted no valid items AND portfolio_summary empty → hidden
    - Otherwise → visible; headline = portfolio_summary (may be ""); chips = validated items
    """
    from app.features.brew import db as brew_db
    from app.features.brew.models import ActionItem
    from app.features.for_you.action_items import validate_and_resolve
    from app.features.portfolio import db as portfolio_db
    from app.features.portfolio.service import compute_effective_weights
    from app.shared.data_tools.quotes import get_batch_quotes

    # Load profile (retained for future use + legacy callers)
    if profile is None:
        try:
            profile = await portfolio_db.get_profile(user_id)
        except Exception:
            profile = ProfileView(user_id=user_id)
            logger.warning("action_bar: profile load failed user=%s", user_id[:8])

    # Load holdings if not provided
    if holdings is None:
        try:
            rows = await portfolio_db.list_portfolio(user_id)
            if rows:
                symbols = [r.symbol for r in rows]
                quotes_result = get_batch_quotes(symbols)
                prices = {q["symbol"]: q.get("price", 0) for q in quotes_result.get("quotes", [])}
                holdings = compute_effective_weights(rows, prices)
            else:
                holdings = []
        except Exception:
            holdings = []
            logger.warning("action_bar: holdings load failed user=%s", user_id[:8])

    # Load today's digest if not provided
    if digest_data is None:
        try:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            raw_digest = await brew_db.get_user_digest(user_id, today)
            if raw_digest:
                digest_data = raw_digest.get("digest_data", {})
        except Exception:
            digest_data = None
            logger.warning("action_bar: digest load failed user=%s", user_id[:8])

    raw_items = (digest_data or {}).get("action_items", []) or []
    # LLM sometimes hallucinates action_items as a single dict instead of a
    # list. Iterating a dict yields keys (strings), which then fail
    # model_validate one-by-one and silently drop every chip. Normalize
    # single-dict to list; log+drop any other non-list shape.
    if isinstance(raw_items, dict):
        raw_items = [raw_items]
    elif not isinstance(raw_items, list):
        logger.warning(
            "action_bar: action_items has unexpected type %s, ignoring",
            type(raw_items).__name__,
        )
        raw_items = []

    portfolio_summary_raw = (digest_data or {}).get("portfolio_summary", "")
    portfolio_summary = portfolio_summary_raw if isinstance(portfolio_summary_raw, str) else ""

    # Parse raw items into ActionItem (tolerate both dict and model forms)
    parsed: list[ActionItem] = []
    for raw in raw_items:
        try:
            parsed.append(ActionItem.model_validate(raw) if not isinstance(raw, ActionItem) else raw)
        except Exception as e:
            logger.warning("action_bar: drop malformed action_item: %s", e)

    # Build context for validator
    watchlist_symbols: set[str] = set()
    try:
        wl = await brew_db.get_user_watchlist(user_id)
        if wl and isinstance(wl, dict):
            watchlist_symbols = set(wl.get("symbols") or [])
    except Exception:
        pass
    portfolio_symbols = {h.symbol for h in (holdings or []) if h.symbol != "$CASH"}
    user_symbols = portfolio_symbols | watchlist_symbols
    # Match the agent-side check in build_action_context (agent.py): a
    # thesis of "" or "   " (whitespace only) counts as missing. Without
    # .strip() the service rejects thesis:<SYM> actions that the agent
    # legitimately emitted for whitespace theses.
    missing_thesis = {
        h.symbol for h in (holdings or [])
        if h.symbol != "$CASH" and not (getattr(h, "thesis", None) or "").strip()
    }
    # Build the authoritative date whitelist AND a memoized row cache in one
    # fetch. Previously this branched on whether digest_data carried
    # `previous_digest_dates`, but that field is never persisted — so the
    # branch was always falsy. Making the fetch unconditional prevents
    # accidental N+1 regression if someone later adds that field to save_data.
    cached_recent: list[dict] = []
    try:
        cached_recent = await brew_db.list_user_digests(user_id, limit=30)
    except Exception:
        logger.warning("action_bar: list_user_digests failed user=%s", user_id[:8])
    previous_digest_dates = {
        (d.get("digest_date") or "")[:10]
        for d in cached_recent
        if d.get("digest_date")
    }

    async def _resolve(date: str) -> str | None:
        """Two-tier lookup:
          1. Scan in-memory `cached_recent` for a row with matching date AND
             a usable id (digest_id or id key).
          2. If the loop exits without returning, fall through to a deeper
             DB query (which may use a larger limit or a direct WHERE query).
        The previous implementation returned None inside the loop when it
        found a date match but the row lacked an id, instead of trying the
        DB. This is the fallthrough fix.
        """
        target = date[:10]
        for d in cached_recent:
            if (d.get("digest_date") or "")[:10] != target:
                continue
            found = d.get("digest_id") or d.get("id")
            if found:
                return found
            # Date matches but id missing — don't give up yet; the DB may have
            # a more complete record. Break (we know only one row per date).
            break
        # Fallthrough: date not in cached_recent, OR cached row had no id.
        try:
            return await brew_db.resolve_digest_id_by_date(user_id, date)
        except Exception:
            return None

    validated = await validate_and_resolve(
        parsed,
        user_symbols=user_symbols,
        missing_thesis=missing_thesis,
        previous_digest_dates=previous_digest_dates,
        resolve_digest_id=_resolve,
    )

    # Map ActionItem → ActionChip
    chips = [_action_item_to_chip(item) for item in validated
             if not (is_paused("portfolio_health") and item.target == "health")]

    headline = portfolio_summary.strip()
    if not chips and not headline:
        return ActionBar(
            severity="green",
            headline="",
            chips=[],
            source="agent",
            visibility="hidden",
            generated_at=datetime.now(timezone.utc),
        )

    return ActionBar(
        severity="green",  # severity no longer drives anything visible; kept for schema
        headline=headline,
        chips=chips,
        source="agent",
        visibility="visible",
        generated_at=datetime.now(timezone.utc),
    )


def _action_item_to_chip(item: "ActionItem") -> ActionChip:
    """Convert a validated ActionItem into an ActionChip.

    The `target` field is the source of truth for routing. `link` is populated
    as a best-effort URL (or anchor) for legacy frontend paths; new frontend
    reads `target` via routeChipTarget.
    """
    target = item.target
    prefix, payload = (target.split(":", 1) + [""])[:2]

    link_map = {
        "portfolio": "/for-you/portfolio",
        "health": "/for-you/health",
        "watchlist": "/for-you/watchlist",
    }
    kind_map = {
        "thesis": "thesis",
        "stock": "research",
        "digest": "recap",
        "section": "section",
        "portfolio": "research",
        "health": "health",
        "watchlist": "research",
    }

    if prefix in ("portfolio", "health", "watchlist"):
        link = link_map[prefix]
    elif prefix == "thesis":
        link = f"#stock-{payload}"
    elif prefix == "stock":
        link = f"/stock/{payload}"
    elif prefix == "digest":
        link = f"/for-you/{payload}"  # payload is uuid after resolution
    elif prefix == "section":
        link = f"#section-{payload}"
    else:
        link = ""

    return ActionChip(
        label=item.label,
        target=target,
        link=link,
        kind=kind_map.get(prefix, "research"),
    )
