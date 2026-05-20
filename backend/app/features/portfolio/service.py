"""
Portfolio service - pure functions on holdings.

Key: compute_effective_weights() is **pure** (no I/O), so What-If (P2)
and tests can call it without touching the database.

LLD: docs/plans/for-you/p0-foundation.md §LLD U0-A · F0.1.
"""

from typing import Dict, Iterable, List, Optional

from app.features.portfolio.models import HoldingInput, HoldingRow, HoldingView


# Public so downstream code (cash guard, exposure parser) can share the constant.
CASH_SYMBOL = "$CASH"


def _fix_rounding_gap(results: List[HoldingView]) -> None:
    """Assign rounding gap to the largest-weight item (not last) to minimize relative error."""
    if not results:
        return
    gap = round(100.0 - sum(rv.effective_weight_pct for rv in results), 4)
    if gap == 0:
        return
    max_idx = max(range(len(results)), key=lambda i: results[i].effective_weight_pct)
    results[max_idx].effective_weight_pct = round(results[max_idx].effective_weight_pct + gap, 4)


def _row_to_holding_input(row: HoldingRow) -> HoldingInput:
    """Bridge HoldingRow → HoldingInput so compute_effective_weights() can take either."""
    return HoldingInput(
        symbol=row.symbol,
        weight_pct=row.weight_pct,
        shares=row.shares,
        cost_basis=row.cost_basis,
        entry_price=row.entry_price,
        thesis=row.thesis,
        target=row.target,
        stop_loss=row.stop_loss,
        conviction=row.conviction,
    )


def _is_active(r: HoldingInput) -> bool:
    """A row is 'active' (a real position) iff it has any quantitative field.
    Thesis-only rows (created via PATCH /portfolio/{symbol} for watchlist symbols
    where the user just answered the thesis prompt) are 'ghost' rows that should
    not influence weight computation and should receive 0% effective weight.
    """
    return (
        r.shares is not None
        or (r.cost_basis is not None and r.cost_basis > 0)
        or (r.weight_pct is not None and r.weight_pct > 0)
    )


def _view_zero(r: HoldingInput) -> HoldingView:
    """Build a 0%-weight HoldingView for a ghost row. Preserves thesis/target/etc.
    so the row can still surface as 'your view' in the watchlist detail panel."""
    return HoldingView(
        symbol=r.symbol,
        weight_pct=r.weight_pct,
        shares=r.shares,
        cost_basis=r.cost_basis,
        thesis=r.thesis,
        target=r.target,
        stop_loss=r.stop_loss,
        conviction=r.conviction,
        entry_price=r.entry_price,
        effective_weight_pct=0.0,
        weight_source="ghost",
    )


def _resolve_modes(
    inputs: List[HoldingInput],
    prices: Dict[str, float],
) -> List[HoldingView]:
    """Three-tier weight resolution on a list of *active* HoldingInputs.

    Preconditions (caller's responsibility):
      - All inputs satisfy _is_active(r) is True.
      - prices already has CASH_SYMBOL defaulted to 1.0.
      - inputs are HoldingInput (HoldingRow already bridged upstream).

    Resolution priority (per-portfolio, not per-row):
      1. shares × price        (Mode 1)
      1.5 cost_basis as amount (Mode 1.5)
      2. weight_pct normalized (Mode 2)
      3. equal weight 1/n      (Mode 3 — final fallback)

    Returns one HoldingView per input, in the same order.
    """
    n = len(inputs)
    if n == 0:
        return []

    # ---- Mode 1: shares × price ------------------------------------------
    shares_mode_eligible = any(r.shares is not None for r in inputs)
    if shares_mode_eligible:
        notional: List[Optional[float]] = []
        ok = True
        for r in inputs:
            if r.shares is None:
                ok = False
                break
            price = prices.get(r.symbol)
            if price is None:
                ok = False
                break
            notional.append(r.shares * price)
        if ok and notional:
            total = sum(notional) or 0.0
            if total > 0:
                return [
                    HoldingView(
                        symbol=r.symbol,
                        weight_pct=r.weight_pct,
                        shares=r.shares,
                        cost_basis=r.cost_basis,
                        thesis=r.thesis, target=r.target,
                        stop_loss=r.stop_loss, conviction=r.conviction,
                        entry_price=r.entry_price,
                        effective_weight_pct=round(notional[i] / total * 100.0, 4),
                        weight_source="shares_x_price",
                    )
                    for i, r in enumerate(inputs)
                ]
            # All zero notional → fall through to mode 1.5.

    # ---- Mode 1.5: cost_basis as amount ------------------------------------
    cost_mode_eligible = any(r.cost_basis is not None and r.cost_basis > 0 for r in inputs)
    if cost_mode_eligible:
        costs = [(r.cost_basis or 0.0) for r in inputs]
        total_cost = sum(costs)
        if total_cost > 0:
            results = [
                HoldingView(
                    symbol=r.symbol,
                    weight_pct=r.weight_pct,
                    shares=r.shares,
                    cost_basis=r.cost_basis,
                    thesis=r.thesis, target=r.target,
                    stop_loss=r.stop_loss, conviction=r.conviction,
                    entry_price=r.entry_price,
                    effective_weight_pct=round(c / total_cost * 100.0, 4),
                    weight_source="cost_basis",
                )
                for r, c in zip(inputs, costs)
            ]
            _fix_rounding_gap(results)
            return results

    # ---- Mode 2: weight_pct normalized -----------------------------------
    weight_total = sum((r.weight_pct or 0.0) for r in inputs)
    if weight_total > 0:
        results = [
            HoldingView(
                symbol=r.symbol,
                weight_pct=r.weight_pct,
                shares=r.shares,
                cost_basis=r.cost_basis,
                thesis=r.thesis, target=r.target,
                stop_loss=r.stop_loss, conviction=r.conviction,
                entry_price=r.entry_price,
                effective_weight_pct=round((r.weight_pct or 0.0) / weight_total * 100.0, 4),
                weight_source="weight_pct",
            )
            for r in inputs
        ]
        _fix_rounding_gap(results)
        return results

    # ---- Mode 3: equal weight --------------------------------------------
    eq = round(100.0 / n, 4)
    results = [
        HoldingView(
            symbol=r.symbol,
            weight_pct=r.weight_pct,
            shares=r.shares,
            cost_basis=r.cost_basis,
            thesis=r.thesis, target=r.target,
            stop_loss=r.stop_loss, conviction=r.conviction,
            entry_price=r.entry_price,
            effective_weight_pct=eq,
            weight_source="equal",
        )
        for r in inputs
    ]
    _fix_rounding_gap(results)
    return results


def compute_effective_weights(
    rows: Iterable[HoldingInput | HoldingRow],
    prices_map: Optional[Dict[str, float]] = None,
) -> List[HoldingView]:
    """
    Three-tier weight resolution (LLD §设计) — see _resolve_modes for the
    detailed mode chain. This entry point handles:

      1. Bridge HoldingRow → HoldingInput.
      2. Normalize prices (default $CASH=1.0 if missing).
      3. Split rows into 'active' (real positions) vs 'ghost' (thesis-only,
         no quantitative data — produced when a user answers a thesis prompt
         on a watchlist symbol via PATCH /portfolio/{symbol}).
      4. Run mode resolution on active rows only — ghost rows must not
         influence which mode is picked, otherwise a single thesis-only row
         would silently downgrade everyone else to equal-weight.
      5. Merge: ghost rows attach at 0% with weight_source="ghost",
         original input order preserved.

    `prices_map`: {symbol: price}. Pass {} or None when no prices available;
    we fall back to weight_pct or equal. `$CASH` is treated as price 1.0
    if absent (downstream cash_guard injects this, but be defensive here).

    Output is `List[HoldingView]` in the same order as input.

    Pure function: no I/O, no logging at info level (warnings only).
    """
    inputs: List[HoldingInput] = []
    for r in rows:
        if isinstance(r, HoldingRow):
            inputs.append(_row_to_holding_input(r))
        elif isinstance(r, HoldingInput):
            inputs.append(r)
        else:
            raise TypeError(f"Unsupported row type: {type(r).__name__}")

    n = len(inputs)
    if n == 0:
        return []

    prices = dict(prices_map or {})
    # Defensive: $CASH always priced at 1.0 if missing.
    prices.setdefault(CASH_SYMBOL, 1.0)

    active = [r for r in inputs if _is_active(r)]

    if not active:
        # No row has any quantitative data. This is the legacy "equal-weight
        # onboarding" path (user listed symbols only, no amounts) — fall back
        # to mode resolution on the full input list so Mode 3 hands out 1/n.
        # Ghost-row treatment ONLY kicks in when there's at least one real
        # position to contrast against.
        return _resolve_modes(inputs, prices)

    ghost = [r for r in inputs if not _is_active(r)]
    active_views = _resolve_modes(active, prices)

    # Merge active + ghost back into original input order.
    by_symbol: Dict[str, HoldingView] = {v.symbol: v for v in active_views}
    by_symbol.update({r.symbol: _view_zero(r) for r in ghost})
    return [by_symbol[r.symbol] for r in inputs]


def enrich_market_values(
    holdings: List[HoldingView],
    prices_map: Dict[str, float],
) -> List[HoldingView]:
    """Compute market_value and unrealized_pnl in-place from live prices.

    - $CASH: market_value = shares (if set) or cost_basis; no pnl.
    - Stocks: market_value = shares * price; pnl = market_value - cost_basis.
    """
    for h in holdings:
        if h.symbol == CASH_SYMBOL:
            val = h.shares if h.shares is not None else h.cost_basis
            if val is not None and val > 0:
                h.market_value = round(float(val), 2)
            continue
        price = prices_map.get(h.symbol)
        if price and price > 0:
            # Expose the live price even when shares is null so the UI can
            # render watchlist-only rows with a current quote.
            h.price = round(float(price), 4)
            if h.shares is not None and h.shares > 0:
                h.market_value = round(h.shares * price, 2)
                if h.cost_basis and h.cost_basis > 0:
                    h.unrealized_pnl = round(h.market_value - h.cost_basis, 2)
    return holdings


def auto_fill_shares(
    rows: List[HoldingInput],
    prices_map: Dict[str, float],
) -> List[HoldingInput]:
    """Auto-convert cost_basis to shares using current prices.
    Only converts rows where: has cost_basis, no shares yet, not $CASH,
    and price is available and > 0.
    """
    result = []
    for r in rows:
        if (
            r.symbol != CASH_SYMBOL
            and r.cost_basis is not None
            and r.cost_basis > 0
            and r.shares is None
        ):
            price = prices_map.get(r.symbol)
            if price and price > 0:
                computed_shares = round(r.cost_basis / price, 6)
                result.append(r.model_copy(update={
                    "shares": computed_shares,
                    "entry_price": price,
                }))
                continue
        result.append(r)
    return result
