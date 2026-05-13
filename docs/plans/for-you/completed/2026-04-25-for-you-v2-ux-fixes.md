# 专属日报 V2 UX 改进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 7 UX improvements to the 专属日报 feature covering navigation, data display, and content quality.

**Architecture:** Backend-first for data model and API changes (entry_price, action bar, portfolio_summary), then frontend structural changes (nav dropdown, breadcrumb, stock overview split, thesis prompts). Each task is self-contained and testable.

**Tech Stack:** FastAPI + Pydantic (backend), Next.js App Router + React 19 + TanStack Query (frontend), Insforge Edge Functions (DB)

**Spec:** `docs/superpowers/specs/2026-04-25-for-you-v2-ux-fixes-design.md`

---

## Task 1: Backend — Add `entry_price` Column and Model Updates

Adds the `entry_price` field to the portfolio data model so we can track the price at which shares were auto-calculated.

**Files:**
- Create: `backend/migrations/u2a_entry_price.sql`
- Modify: `backend/app/features/portfolio/models.py:22-80`
- Modify: `backend/app/features/portfolio/db.py:86-96` (payload dict)
- Modify: `backend/app/edge_functions/portfolio.js:81-91` (bulk upsertRow)
- Modify: `backend/app/edge_functions/portfolio.js:137` (patch allowed list)
- Modify: `frontend/src/lib/api.ts:657-679` (HoldingInput + HoldingView TS types)
- Test: `backend/tests/test_portfolio_models.py` (new)

- [ ] **Step 1: Write the migration SQL**

```sql
-- u2a_entry_price.sql
-- Add entry_price column to user_portfolios for auto share conversion tracking.
ALTER TABLE user_portfolios
ADD COLUMN IF NOT EXISTS entry_price NUMERIC(18,6);
```

- [ ] **Step 2: Add `entry_price` to `HoldingInput`**

In `backend/app/features/portfolio/models.py`, add after the `cost_basis` field (line 28):

```python
    entry_price: Optional[float] = Field(None, ge=0)
```

- [ ] **Step 3: Add `entry_price`, `market_value`, `unrealized_pnl` to `HoldingView`**

In `backend/app/features/portfolio/models.py`, add after the `conviction` field (line 76):

```python
    entry_price: Optional[float] = None
    market_value: Optional[float] = None
    unrealized_pnl: Optional[float] = None
```

- [ ] **Step 4: Add `entry_price` to `HoldingRow`**

In `backend/app/features/portfolio/models.py`, add after `conviction` field (line 61):

```python
    entry_price: Optional[float] = None
```

- [ ] **Step 5: Update `_row_to_holding_input` in service.py**

In `backend/app/features/portfolio/service.py`, add `entry_price` to the bridge function (line 31-41):

```python
def _row_to_holding_input(row: HoldingRow) -> HoldingInput:
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
```

- [ ] **Step 5b: Pass `entry_price` through `compute_effective_weights`**

In `backend/app/features/portfolio/service.py`, all 4 `HoldingView(...)` instantiations inside `compute_effective_weights` must include `entry_price=r.entry_price`. Update each mode:

**Mode 1 (shares × price, around line 103-115):** Add `entry_price=r.entry_price,` after `conviction=r.conviction,`

**Mode 1.5 (cost_basis, around line 124-138):** Add `entry_price=r.entry_price,` after `conviction=r.conviction,`

**Mode 2 (weight_pct, around line 143-157):** Add `entry_price=r.entry_price,` after `conviction=r.conviction,`

**Mode 3 (equal weight, around line 161-175):** Add `entry_price=r.entry_price,` after `conviction=r.conviction,`

Each `HoldingView(...)` block currently looks like:
```python
                    thesis=r.thesis, target=r.target,
                    stop_loss=r.stop_loss, conviction=r.conviction,
```

Change each to:
```python
                    thesis=r.thesis, target=r.target,
                    stop_loss=r.stop_loss, conviction=r.conviction,
                    entry_price=r.entry_price,
```

- [ ] **Step 6: Add `entry_price` to db.py bulk payload**

In `backend/app/features/portfolio/db.py`, update the `bulk_replace_portfolio` payload dict (lines 86-96) to include `entry_price`:

```python
    payload_rows = [
        {
            "symbol": r.symbol,
            "weight_pct": r.weight_pct,
            "shares": r.shares,
            "cost_basis": r.cost_basis,
            "entry_price": r.entry_price,
            "thesis": r.thesis,
            "target": r.target,
            "stop_loss": r.stop_loss,
            "conviction": r.conviction,
        }
        for r in rows
    ]
```

- [ ] **Step 7: Add `entry_price` to Edge Function bulk upsertRow**

In `backend/app/edge_functions/portfolio.js`, update the bulk upsertRow (lines 81-91) to include `entry_price`:

```javascript
        const upsertRow = {
          user_id,
          symbol: r.symbol,
          weight_pct: r.weight_pct ?? null,
          shares: r.shares ?? null,
          cost_basis: r.cost_basis ?? null,
          entry_price: r.entry_price ?? null,
          thesis: r.thesis ?? null,
          target: r.target ?? null,
          stop_loss: r.stop_loss ?? null,
          conviction: r.conviction ?? null,
        };
```

- [ ] **Step 8: Add `entry_price` to Edge Function patch allowed list**

In `backend/app/edge_functions/portfolio.js`, update the patch handler's allowed list (line 137):

```javascript
      const allowed = ["weight_pct", "shares", "cost_basis", "entry_price", "thesis", "target", "stop_loss", "conviction"];
```

- [ ] **Step 8b: Update frontend TypeScript types in api.ts**

In `frontend/src/lib/api.ts`, add `entry_price` to `HoldingInput` (line 665, after `conviction`):

```typescript
export interface HoldingInput {
  symbol: string;
  weight_pct?: number | null;
  shares?: number | null;
  cost_basis?: number | null;
  entry_price?: number | null;
  thesis?: string | null;
  target?: number | null;
  stop_loss?: number | null;
  conviction?: number | null;
}
```

Add `entry_price`, `market_value`, `unrealized_pnl` to `HoldingView` (line 678, after `weight_source`):

```typescript
export interface HoldingView {
  symbol: string;
  weight_pct: number | null;
  shares: number | null;
  cost_basis: number | null;
  entry_price: number | null;
  thesis: string | null;
  target: number | null;
  stop_loss: number | null;
  conviction: number | null;
  effective_weight_pct: number;
  weight_source: 'shares_x_price' | 'cost_basis' | 'weight_pct' | 'equal';
  market_value: number | null;
  unrealized_pnl: number | null;
}
```

- [ ] **Step 9: Write test for model changes**

```python
# backend/tests/test_portfolio_models.py
from app.features.portfolio.models import HoldingInput, HoldingView

def test_holding_input_accepts_entry_price():
    h = HoldingInput(symbol="AAPL", cost_basis=10000, entry_price=142.50)
    assert h.entry_price == 142.50
    assert h.cost_basis == 10000

def test_holding_input_entry_price_optional():
    h = HoldingInput(symbol="AAPL", cost_basis=10000)
    assert h.entry_price is None

def test_holding_view_computed_fields():
    h = HoldingView(
        symbol="AAPL",
        shares=70.18,
        cost_basis=10000,
        entry_price=142.50,
        market_value=14036.0,
        unrealized_pnl=4036.0,
        effective_weight_pct=50.0,
        weight_source="shares_x_price",
    )
    assert h.market_value == 14036.0
    assert h.unrealized_pnl == 4036.0
```

- [ ] **Step 10: Run tests**

Run: `cd backend && python -m pytest tests/test_portfolio_models.py -v`
Expected: PASS

- [ ] **Step 11: Add `enrich_market_values` function to service.py**

This function computes `market_value` and `unrealized_pnl` on HoldingView objects using live prices. Add at the end of `backend/app/features/portfolio/service.py`:

```python
def enrich_market_values(
    holdings: List[HoldingView],
    prices_map: Dict[str, float],
) -> List[HoldingView]:
    """Compute market_value and unrealized_pnl on HoldingView objects.
    
    For regular stocks: market_value = shares × current_price
    For $CASH: market_value = shares (if set) or cost_basis (cash is always 1:1)
    unrealized_pnl = market_value - cost_basis (if cost_basis exists)
    
    Mutates holdings in place and returns them.
    """
    for h in holdings:
        if h.symbol == CASH_SYMBOL:
            val = h.shares if h.shares is not None else h.cost_basis
            if val is not None and val > 0:
                h.market_value = round(float(val), 2)
            continue
        if h.shares is not None and h.shares > 0:
            price = prices_map.get(h.symbol)
            if price and price > 0:
                h.market_value = round(h.shares * price, 2)
                if h.cost_basis and h.cost_basis > 0:
                    h.unrealized_pnl = round(h.market_value - h.cost_basis, 2)
    return holdings
```

- [ ] **Step 12: Wire `enrich_market_values` into GET /portfolio endpoint**

In `backend/app/features/portfolio/router.py`, update `get_portfolio` (lines 46-51) to fetch prices and enrich:

```python
@router.get("/portfolio", response_model=PortfolioListResponse)
async def get_portfolio(user_id: str = Depends(verify_user_token)):
    from app.shared.data_tools.quotes import get_batch_quotes
    from app.features.portfolio.service import enrich_market_values

    rows = await portfolio_db.list_portfolio(user_id)
    symbols = [r.symbol for r in rows if r.symbol != "$CASH"]
    prices: dict[str, float] = {}
    if symbols:
        try:
            quotes_result = get_batch_quotes(symbols)
            for q in quotes_result.get("quotes", []):
                prices[q["symbol"]] = q.get("price", 0)
        except Exception:
            logger.warning("get_portfolio: price fetch failed user=%s", user_id[:8])

    holdings = compute_effective_weights(rows, prices_map=prices)
    enrich_market_values(holdings, prices)
    total = sum(h.effective_weight_pct for h in holdings)
    return PortfolioListResponse(holdings=holdings, total_weight_pct=round(total, 4))
```

- [ ] **Step 13: Write test for enrich_market_values**

Add to `backend/tests/test_portfolio_models.py`:

```python
from app.features.portfolio.service import enrich_market_values

def test_enrich_market_values():
    h = HoldingView(
        symbol="AAPL", shares=70.0, cost_basis=10000,
        entry_price=142.50, effective_weight_pct=100.0, weight_source="shares_x_price",
    )
    enrich_market_values([h], {"AAPL": 200.0})
    assert h.market_value == 14000.0
    assert h.unrealized_pnl == 4000.0

def test_enrich_market_values_no_price():
    h = HoldingView(
        symbol="AAPL", shares=70.0, cost_basis=10000,
        effective_weight_pct=100.0, weight_source="shares_x_price",
    )
    enrich_market_values([h], {})
    assert h.market_value is None
    assert h.unrealized_pnl is None

def test_enrich_market_values_cash_with_shares():
    h = HoldingView(
        symbol="$CASH", shares=5000.0, cost_basis=5000,
        effective_weight_pct=100.0, weight_source="shares_x_price",
    )
    enrich_market_values([h], {})
    assert h.market_value == 5000.0

def test_enrich_market_values_cash_no_shares():
    """$CASH typically has no shares (auto_fill_shares skips it), only cost_basis."""
    h = HoldingView(
        symbol="$CASH", cost_basis=8000,
        effective_weight_pct=100.0, weight_source="cost_basis",
    )
    enrich_market_values([h], {})
    assert h.market_value == 8000.0
```

- [ ] **Step 14: Run all tests**

Run: `cd backend && python -m pytest tests/test_portfolio_models.py -v`
Expected: All PASS

- [ ] **Step 15: Commit**

```bash
git add backend/migrations/u2a_entry_price.sql backend/app/features/portfolio/models.py backend/app/features/portfolio/service.py backend/app/features/portfolio/router.py backend/app/features/portfolio/db.py backend/app/edge_functions/portfolio.js backend/tests/test_portfolio_models.py
git commit -m "feat(portfolio): add entry_price field + market_value/pnl computation + db/EF plumbing"
```

---

## Task 2: Backend — Auto Share Conversion in Bulk Save

When a user saves portfolio with `cost_basis` but no `shares`, automatically fetch the latest price and compute `shares = cost_basis / price`. Record `entry_price`.

**Files:**
- Modify: `backend/app/features/portfolio/router.py:54-68`
- Modify: `backend/app/features/portfolio/service.py` (add new function)
- Test: `backend/tests/test_auto_shares.py` (new)

- [ ] **Step 1: Write failing test for auto_fill_shares**

```python
# backend/tests/test_auto_shares.py
from app.features.portfolio.models import HoldingInput
from app.features.portfolio.service import auto_fill_shares

def test_auto_fill_shares_converts_cost_basis():
    rows = [HoldingInput(symbol="NVDA", cost_basis=10000)]
    prices = {"NVDA": 142.50}
    filled = auto_fill_shares(rows, prices)
    assert filled[0].shares is not None
    assert abs(filled[0].shares - 70.175438) < 0.01
    assert filled[0].entry_price == 142.50

def test_auto_fill_shares_skips_cash():
    rows = [HoldingInput(symbol="$CASH", cost_basis=5000)]
    prices = {}
    filled = auto_fill_shares(rows, prices)
    assert filled[0].shares is None
    assert filled[0].entry_price is None

def test_auto_fill_shares_skips_when_shares_already_set():
    rows = [HoldingInput(symbol="AAPL", cost_basis=10000, shares=50)]
    prices = {"AAPL": 200.0}
    filled = auto_fill_shares(rows, prices)
    assert filled[0].shares == 50
    assert filled[0].entry_price is None

def test_auto_fill_shares_skips_when_no_price():
    rows = [HoldingInput(symbol="AAPL", cost_basis=10000)]
    prices = {}
    filled = auto_fill_shares(rows, prices)
    assert filled[0].shares is None
    assert filled[0].entry_price is None

def test_auto_fill_shares_skips_zero_price():
    rows = [HoldingInput(symbol="AAPL", cost_basis=10000)]
    prices = {"AAPL": 0.0}
    filled = auto_fill_shares(rows, prices)
    assert filled[0].shares is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_auto_shares.py -v`
Expected: FAIL with `ImportError: cannot import name 'auto_fill_shares'`

- [ ] **Step 3: Implement `auto_fill_shares` in service.py**

Add at the end of `backend/app/features/portfolio/service.py`:

```python
def auto_fill_shares(
    rows: List[HoldingInput],
    prices_map: Dict[str, float],
) -> List[HoldingInput]:
    """Auto-convert cost_basis to shares using current prices.
    
    Only converts rows where: has cost_basis, no shares yet, not $CASH,
    and price is available and > 0.
    Returns new list of HoldingInput with shares/entry_price filled in.
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_auto_shares.py -v`
Expected: All 5 PASS

- [ ] **Step 5: Wire auto_fill_shares into bulk_save_portfolio endpoint**

In `backend/app/features/portfolio/router.py`, modify the `bulk_save_portfolio` function (lines 54-68):

```python
@router.put("/portfolio/bulk", response_model=PortfolioListResponse)
async def bulk_save_portfolio(
    payload: BulkPortfolioRequest,
    user_id: str = Depends(verify_user_token),
):
    await _require_portfolio_entitlement(user_id)

    from app.shared.data_tools.quotes import get_batch_quotes
    from app.features.portfolio.service import auto_fill_shares, enrich_market_values

    # Fetch prices for ALL non-cash symbols (needed for auto-fill AND weight calc)
    all_symbols = [r.symbol for r in payload.rows if r.symbol != "$CASH"]
    prices: dict[str, float] = {}
    if all_symbols:
        try:
            quotes_result = get_batch_quotes(all_symbols)
            for q in quotes_result.get("quotes", []):
                prices[q["symbol"]] = q.get("price", 0)
        except Exception:
            logger.warning("bulk_save: price fetch failed user=%s", user_id[:8])

    # Auto-fill shares from cost_basis where possible
    filled_rows = auto_fill_shares(payload.rows, prices)

    try:
        rows = await portfolio_db.bulk_replace_portfolio(user_id, filled_rows)
    except RuntimeError as e:
        logger.error("bulk_save_portfolio failed for user %s: %s", user_id, e)
        raise HTTPException(status_code=502, detail="Failed to save portfolio") from e

    # Use full prices for weight calc + market value enrichment
    holdings = compute_effective_weights(rows, prices_map=prices)
    enrich_market_values(holdings, prices)
    total = sum(h.effective_weight_pct for h in holdings)
    return PortfolioListResponse(holdings=holdings, total_weight_pct=round(total, 4))
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/features/portfolio/service.py backend/app/features/portfolio/router.py backend/tests/test_auto_shares.py
git commit -m "feat(portfolio): auto-convert cost_basis to shares on bulk save"
```

---

## Task 3: Backend — Action Bar Green State Improvement

Replace the static "今天没有需要特别关注的事" headline with portfolio-attribution text, and replace the useless "查看日报" chip with prioritized guidance chips.

**Files:**
- Modify: `backend/app/features/for_you/models.py:14`
- Modify: `backend/app/features/for_you/templates.py`
- Modify: `backend/app/features/for_you/service.py:236-265`
- Test: `backend/tests/test_action_bar.py` (modify existing)

- [ ] **Step 1: Add `"guide"` to ActionChip.kind literal**

In `backend/app/features/for_you/models.py`, line 22:

```python
class ActionChip(BaseModel):
    label: str
    link: str
    kind: Literal["event", "health", "drawdown", "stable", "research", "guide"]
```

- [ ] **Step 2: Rewrite `green_headline` and `stable_chip` in templates.py**

Replace the entire `green_headline` and `stable_chip` functions in `backend/app/features/for_you/templates.py`:

```python
def green_headline(data: dict, profile_style: str) -> str:
    change = data.get("portfolio_daily_change")
    top_contrib = data.get("top_contributor_symbol")
    top_contrib_chg = data.get("top_contributor_change")
    top_drag = data.get("top_dragger_symbol")
    top_drag_chg = data.get("top_dragger_change")

    if change is None:
        return "今天没有需要特别关注的事"

    direction = "涨" if change >= 0 else "跌"
    base = f"组合今日{direction} {abs(change):.1f}%"

    if change >= 0.3 and top_contrib:
        return f"{base}，{top_contrib} 领涨 (+{abs(top_contrib_chg):.1f}%)"

    if change <= -0.3 and top_drag:
        return f"{base}，{top_drag} 拖累最大 (-{abs(top_drag_chg):.1f}%)"

    if abs(change) < 0.3:
        return f"{base}，整体波动不大"

    return base


def green_chips(data: dict) -> list[ActionChip]:
    """Prioritized guidance chips for green (no-alert) state."""
    missing_thesis = data.get("missing_thesis_symbols", [])
    if missing_thesis:
        sym = missing_thesis[0]
        return [ActionChip(label="补充投资论点", link=f"#stock-{sym}", kind="guide")]

    days_since_health = data.get("days_since_health")
    if days_since_health is not None and days_since_health > 14:
        return [ActionChip(label="查看持仓体检", link="/for-you/health", kind="guide")]

    days_since_update = data.get("days_since_portfolio_update")
    if days_since_update is not None and days_since_update > 30:
        return [ActionChip(label="检查持仓", link="/for-you/portfolio", kind="guide")]

    return [ActionChip(label="查看历史日报", link="/for-you/archive", kind="guide")]
```

- [ ] **Step 3: Update stable signal data in service.py**

In `backend/app/features/for_you/service.py`, replace the Rule 4 stable fallback block (lines 236-258) and the green headline generation block (lines 263-266):

Replace Rule 4 (lines 236-258):
```python
    # --- Rule 4: Stable fallback ---
    if not signals:
        portfolio_change = (
            sum(
                (h.effective_weight_pct / 100.0) * daily_changes.get(h.symbol, 0.0)
                for h in holdings
            )
            if holdings and daily_changes
            else None
        )
        if portfolio_change is None and not health_latest:
            return ActionBar(
                severity="green",
                headline="",
                chips=[],
                source="template",
                generated_at=datetime.now(timezone.utc),
            )

        # Find top contributor (positive) and top dragger (negative)
        top_contrib_sym, top_contrib_chg, best_pos = None, None, 0.0
        top_drag_sym, top_drag_chg, worst_neg = None, None, 0.0
        if holdings and daily_changes:
            for h in holdings:
                if h.symbol == "$CASH":
                    continue
                chg = daily_changes.get(h.symbol, 0.0)
                weighted = (h.effective_weight_pct / 100.0) * chg
                if weighted > best_pos:
                    best_pos = weighted
                    top_contrib_sym = h.symbol
                    top_contrib_chg = chg
                if weighted < worst_neg:
                    worst_neg = weighted
                    top_drag_sym = h.symbol
                    top_drag_chg = chg

        # Find stocks missing thesis
        missing_thesis = [
            h.symbol for h in holdings
            if h.symbol != "$CASH" and not h.thesis
        ] if holdings else []

        # Days since last health check
        days_since_health = None
        if health_latest and health_latest.get("generated_at"):
            try:
                gen_at = health_latest["generated_at"]
                if isinstance(gen_at, str):
                    from datetime import datetime as dt
                    gen_at = dt.fromisoformat(gen_at.replace("Z", "+00:00"))
                days_since_health = (datetime.now(timezone.utc) - gen_at.replace(tzinfo=timezone.utc)).days
            except Exception:
                pass

        # Days since portfolio update
        days_since_update = None
        if profile.portfolio_confirmed_at:
            days_since_update = (
                datetime.now(timezone.utc)
                - profile.portfolio_confirmed_at.replace(tzinfo=timezone.utc)
            ).days

        signals.append(Signal(
            kind="stable",
            severity="green",
            data={
                "portfolio_daily_change": round(portfolio_change, 2) if portfolio_change is not None else None,
                "top_contributor_symbol": top_contrib_sym,
                "top_contributor_change": round(top_contrib_chg, 2) if top_contrib_chg is not None else None,
                "top_dragger_symbol": top_drag_sym,
                "top_dragger_change": round(top_drag_chg, 2) if top_drag_chg is not None else None,
                "missing_thesis_symbols": missing_thesis[:3],
                "days_since_health": days_since_health,
                "days_since_portfolio_update": days_since_update,
            },
        ))
```

Replace the green headline generation (lines 263-266):
```python
    if severity == "green":
        headline = templates.green_headline(signals[0].data, profile.style)
        chips = templates.green_chips(signals[0].data)
        source = "template"
```

- [ ] **Step 4: Write test for new green state behavior**

Add to `backend/tests/test_action_bar.py`:

```python
from app.features.for_you.templates import green_headline, green_chips

def test_green_headline_positive_with_contributor():
    data = {"portfolio_daily_change": 1.4, "top_contributor_symbol": "NVDA", "top_contributor_change": 3.2}
    result = green_headline(data, "passive")
    assert "1.4%" in result
    assert "NVDA" in result
    assert "领涨" in result

def test_green_headline_negative_with_dragger():
    data = {"portfolio_daily_change": -1.2, "top_dragger_symbol": "AAPL", "top_dragger_change": -5.0}
    result = green_headline(data, "passive")
    assert "1.2%" in result
    assert "AAPL" in result
    assert "拖累" in result

def test_green_headline_small_change():
    data = {"portfolio_daily_change": 0.1}
    result = green_headline(data, "passive")
    assert "波动不大" in result

def test_green_headline_no_data():
    result = green_headline({}, "passive")
    assert "没有需要特别关注" in result

def test_green_chips_missing_thesis_first():
    data = {"missing_thesis_symbols": ["AAPL", "NVDA"]}
    chips = green_chips(data)
    assert len(chips) == 1
    assert chips[0].label == "补充投资论点"
    assert "#stock-AAPL" in chips[0].link

def test_green_chips_health_stale():
    data = {"missing_thesis_symbols": [], "days_since_health": 20}
    chips = green_chips(data)
    assert chips[0].link == "/for-you/health"

def test_green_chips_portfolio_stale():
    data = {"missing_thesis_symbols": [], "days_since_health": 5, "days_since_portfolio_update": 35}
    chips = green_chips(data)
    assert chips[0].link == "/for-you/portfolio"

def test_green_chips_fallback():
    data = {"missing_thesis_symbols": [], "days_since_health": 5, "days_since_portfolio_update": 10}
    chips = green_chips(data)
    assert chips[0].link == "/for-you/archive"
```

- [ ] **Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_action_bar.py -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/features/for_you/models.py backend/app/features/for_you/templates.py backend/app/features/for_you/service.py backend/tests/test_action_bar.py
git commit -m "feat(action-bar): portfolio-attribution headline + prioritized guide chips"
```

---

## Task 4: Backend — Add `portfolio_summary` to Digest

Add an optional `portfolio_summary` field to the digest output for the "我的持仓" AI summary in the stock overview panel.

**Files:**
- Modify: `backend/app/features/brew/models.py:79-108`
- Modify: `backend/app/features/brew/agent.py` (instruction update)

- [ ] **Step 1: Add `portfolio_summary` to `DigestResponse`**

In `backend/app/features/brew/models.py`, add after `summary` field (line 99):

```python
    # Section 5: Portfolio-specific summary (optional, V2)
    portfolio_summary: Optional[str] = Field(None, description="One-line portfolio attribution summary from portfolio perspective")
```

- [ ] **Step 2: Add `portfolio_summary` to `PersonalDigestOutput`**

In `backend/app/features/brew/models.py`, add after the `summary` field (line 253):

```python
    # Portfolio attribution summary (组合视角)
    portfolio_summary: str = Field(
        default="",
        description="One sentence summarizing portfolio performance from the owner's perspective. "
        "Focus on: which stock contributed/dragged most by weight, alignment with investment thesis if known. "
        "Do NOT repeat market event narratives (that belongs in one_line_summary). "
        "Example: '科技持仓领涨，NVDA (+3.2%) 贡献最大，组合整体涨 1.4%'"
    )
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/features/brew/models.py
git commit -m "feat(brew): add portfolio_summary field to digest output"
```

---

## Task 5: Frontend — ForYouBreadcrumb Component

Create a shared breadcrumb component and apply it to all 专属 sub-pages, replacing the existing inconsistent back links.

**Files:**
- Create: `frontend/src/components/for-you/ForYouBreadcrumb.tsx`
- Modify: `frontend/src/app/for-you/portfolio/page.tsx` (replace back link)
- Modify: `frontend/src/app/for-you/health/page.tsx` (replace back link)
- Modify: `frontend/src/app/for-you/watchlist/page.tsx` (replace back link)
- Modify: `frontend/src/app/for-you/onboarding/page.tsx` (add breadcrumb)
- Modify: `frontend/src/app/for-you/archive/page.tsx` (add breadcrumb)
- Modify: `frontend/src/app/for-you/[id]/page.tsx` (replace back link)

- [ ] **Step 1: Create ForYouBreadcrumb component**

```tsx
// frontend/src/components/for-you/ForYouBreadcrumb.tsx
import Link from 'next/link';

interface ForYouBreadcrumbProps {
  current: string;
}

export function ForYouBreadcrumb({ current }: ForYouBreadcrumbProps) {
  return (
    <nav aria-label="面包屑导航" className="text-sm text-muted-foreground mb-4">
      <Link
        href="/for-you"
        className="text-primary hover:text-primary/80 transition-colors"
      >
        专属
      </Link>
      <span className="mx-2 text-muted-foreground/50">/</span>
      <span className="text-foreground">{current}</span>
    </nav>
  );
}
```

- [ ] **Step 2: Replace back link in portfolio/page.tsx**

In `frontend/src/app/for-you/portfolio/page.tsx`, replace the back link block (the `<Link href="/for-you">` that says "返回专属日报" with arrow SVG, around lines 256-264) with:

```tsx
<ForYouBreadcrumb current="模拟持仓" />
```

Add import at top:
```tsx
import { ForYouBreadcrumb } from '@/components/for-you/ForYouBreadcrumb';
```

Remove the old `<Link href="/for-you" ...>返回专属日报</Link>` block entirely.

- [ ] **Step 3: Replace back link in health/page.tsx**

In `frontend/src/app/for-you/health/page.tsx`, replace the back link (the `<Link href="/for-you">` with arrow SVG, around lines 161-165) with:

```tsx
<ForYouBreadcrumb current="持仓体检" />
```

Add import at top:
```tsx
import { ForYouBreadcrumb } from '@/components/for-you/ForYouBreadcrumb';
```

- [ ] **Step 4: Replace back link in watchlist/page.tsx**

In `frontend/src/app/for-you/watchlist/page.tsx`, replace the back link (around lines 278-286) with:

```tsx
<ForYouBreadcrumb current="关注列表" />
```

Add import at top:
```tsx
import { ForYouBreadcrumb } from '@/components/for-you/ForYouBreadcrumb';
```

- [ ] **Step 5: Add breadcrumb to onboarding/page.tsx**

In `frontend/src/app/for-you/onboarding/page.tsx`, add breadcrumb at the top of the page content (inside `OnboardingContent`, before the main card):

```tsx
<ForYouBreadcrumb current="投资画像" />
```

Add import at top:
```tsx
import { ForYouBreadcrumb } from '@/components/for-you/ForYouBreadcrumb';
```

- [ ] **Step 6: Add breadcrumb to archive/page.tsx**

In `frontend/src/app/for-you/archive/page.tsx`, add breadcrumb at the top of the page content:

```tsx
<ForYouBreadcrumb current="历史日报" />
```

Add import at top:
```tsx
import { ForYouBreadcrumb } from '@/components/for-you/ForYouBreadcrumb';
```

- [ ] **Step 7: Add breadcrumb to [id]/page.tsx**

In `frontend/src/app/for-you/[id]/page.tsx`, replace the existing back link ("返回专属日报") with:

```tsx
<ForYouBreadcrumb current="日报详情" />
```

Add import at top:
```tsx
import { ForYouBreadcrumb } from '@/components/for-you/ForYouBreadcrumb';
```

- [ ] **Step 8: Verify in browser**

Run: `cd frontend && npm run dev`

Check each page has breadcrumb:
- `/for-you/portfolio` → "专属 / 模拟持仓"
- `/for-you/health` → "专属 / 持仓体检"
- `/for-you/watchlist` → "专属 / 关注列表"
- `/for-you/onboarding` → "专属 / 投资画像"
- `/for-you/archive` → "专属 / 历史日报"
- `/for-you/{id}` → "专属 / 日报详情"

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/for-you/ForYouBreadcrumb.tsx frontend/src/app/for-you/portfolio/page.tsx frontend/src/app/for-you/health/page.tsx frontend/src/app/for-you/watchlist/page.tsx frontend/src/app/for-you/onboarding/page.tsx frontend/src/app/for-you/archive/page.tsx frontend/src/app/for-you/[id]/page.tsx
git commit -m "feat(for-you): add unified breadcrumb navigation to all sub-pages"
```

---

## Task 6: Frontend — Navbar Dropdown Restructure

Convert the "专属" nav item from a plain `NavLink` (V2 mode) to a `NavDropdown` with management sub-entries, gated by entitlements and feature flags.

**Files:**
- Modify: `frontend/src/components/Navbar.tsx:57-80, 148-286`
- Modify: `frontend/src/components/MobileMenu.tsx:121-137`
- Modify: `frontend/src/app/for-you/_components/ForYouContentV2.tsx:157-218`

- [ ] **Step 1: Extend `DropdownItem` interface to support lock icons**

In `frontend/src/components/Navbar.tsx`, update the `DropdownItem` interface (around line 148):

```tsx
interface DropdownItem {
  href: string;
  label: string;
  locked?: boolean;
}
```

Update the item rendering inside `NavDropdown` (around line 264-280) to show a lock icon when `locked` is true and redirect to `/pricing`:

```tsx
{items.map((item) => {
  const itemActive = pathname === item.href || pathname.startsWith(item.href + '/');
  return (
    <Link
      key={item.href}
      href={item.locked ? '/pricing' : item.href}
      role="menuitem"
      onClick={() => setOpen(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      className={`flex items-center justify-between px-4 py-2 text-sm transition-colors whitespace-nowrap ${
        itemActive
          ? 'text-foreground bg-muted/50'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
      }`}
    >
      {item.label}
      {item.locked && (
        <svg className="w-3 h-3 text-amber-500 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )}
    </Link>
  );
})}
```

- [ ] **Step 2: Update Navbar V2 branch to use NavDropdown with entitlement**

In `frontend/src/components/Navbar.tsx`, add `useEntitlements` import and update the V2 branch.

Add import:
```tsx
import { useEntitlements } from '@/contexts/EntitlementsContext';
```

Inside `Navbar()`, add:
```tsx
const { has: hasEntitlement } = useEntitlements();
```

Replace the V2 branch (lines 66-77):

Replace:
```tsx
            {hasFlag('for_you_v2') ? (
              <NavLink href="/for-you">专属</NavLink>
            ) : (
```

With:
```tsx
            {hasFlag('for_you_v2') ? (
              <NavDropdown
                label="专属"
                href="/for-you"
                items={[
                  { href: '/for-you', label: '专属日报' },
                  { href: '/for-you/onboarding', label: '投资画像' },
                  { href: '/for-you/watchlist', label: '关注列表' },
                  { href: '/for-you/portfolio', label: '模拟持仓', locked: !hasEntitlement('watchlist_extended') },
                  { href: '/for-you/health', label: '持仓体检', locked: !hasEntitlement('watchlist_extended') },
                ]}
              />
            ) : (
```

- [ ] **Step 3: Update MobileMenu V2 branch with entitlement checks**

In `frontend/src/components/MobileMenu.tsx`, add `useEntitlements` import.

Add import:
```tsx
import { useEntitlements } from '@/contexts/EntitlementsContext';
```

Inside `MobileMenu()`, add:
```tsx
const { has: hasEntitlement } = useEntitlements();
```

Replace the "专属" section (around lines 133-137):

Replace:
```tsx
{
  label: '专属',
  href: '/for-you',
  ...(!hasFlag('for_you_v2') && {
    children: [
      { href: '/for-you/watchlist', label: '我的自选股' },
    ],
  }),
}
```

With:
```tsx
{
  label: '专属',
  href: '/for-you',
  children: hasFlag('for_you_v2')
    ? [
        { href: '/for-you', label: '专属日报' },
        { href: '/for-you/onboarding', label: '投资画像' },
        { href: '/for-you/watchlist', label: '关注列表' },
        {
          href: hasEntitlement('watchlist_extended') ? '/for-you/portfolio' : '/pricing',
          label: hasEntitlement('watchlist_extended') ? '模拟持仓' : '模拟持仓 🔒',
        },
        {
          href: hasEntitlement('watchlist_extended') ? '/for-you/health' : '/pricing',
          label: hasEntitlement('watchlist_extended') ? '持仓体检' : '持仓体检 🔒',
        },
      ]
    : [
        { href: '/for-you/watchlist', label: '我的自选股' },
      ],
}
```

- [ ] **Step 3: Remove toolbar buttons from ForYouContentV2**

In `frontend/src/app/for-you/_components/ForYouContentV2.tsx`, remove the entire toolbar buttons section (lines 157-218 approximately — the block containing the Links to onboarding, watchlist, portfolio, health, and AiChatLink). Keep the `AiChatLink` if it's useful elsewhere, but remove the 4 management buttons.

The buttons to remove are:
- `<Link href="/for-you/onboarding">投资画像</Link>`
- `<Link href="/for-you/watchlist">关注列表</Link>`
- `<Link href="/for-you/portfolio">模拟持仓</Link>`
- `<Link href="/for-you/health">持仓体检</Link>`

- [ ] **Step 4: Verify in browser**

Run: `cd frontend && npm run dev`

Check:
- Hover "专属" in navbar → dropdown shows 5 items with "专属日报" at top
- Click "专属" directly → navigates to `/for-you`
- `/for-you` page no longer has the row of management buttons
- Mobile menu expands "专属" with the same 5 items

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Navbar.tsx frontend/src/components/MobileMenu.tsx frontend/src/app/for-you/_components/ForYouContentV2.tsx
git commit -m "feat(nav): move management buttons to global nav dropdown"
```

---

## Task 7: Frontend — Thesis Prompt Diversity + Quick-Select Tags

Create the thesis prompts constants file with 5 topics and quick-select tags, then update `QuickThesisInput` to use topic-aware prompts.

**Files:**
- Create: `frontend/src/lib/thesis-prompts.ts`
- Modify: `frontend/src/components/memory/QuickThesisInput.tsx`

- [ ] **Step 1: Create thesis-prompts.ts constants**

```tsx
// frontend/src/lib/thesis-prompts.ts

export type ThesisTopic = 'buy_reason' | 'sell_condition' | 'risk_awareness' | 'outlook' | 'event_driven';

export interface ThesisPromptVariant {
  question: string;
  tags: string[];
}

export interface ThesisTopicDef {
  topic: ThesisTopic;
  label: string;
  variants: ThesisPromptVariant[];
}

const SECTOR_TAGS: Record<string, string[]> = {
  tech: ['AI 算力需求持续增长', '数据中心业务护城河', '估值合理可长期持有', '跟随市场趋势'],
  consumer: ['品牌忠诚度高', '消费刚需稳健', '市场份额持续扩大', '看好消费复苏'],
  finance: ['利率环境有利', '资产质量稳健', '分红收益稳定', '估值低于历史均值'],
  default: ['看好长期增长', '行业龙头', '价值低估', '分红稳定'],
};

export const THESIS_TOPICS: ThesisTopicDef[] = [
  {
    topic: 'buy_reason',
    label: '买入理由',
    variants: [
      { question: '你看好 {sym} 的核心逻辑是？', tags: [] },
      { question: '一句话说说为什么持有 {sym}？', tags: [] },
      { question: '{sym} 最吸引你的是什么？', tags: [] },
    ],
  },
  {
    topic: 'sell_condition',
    label: '卖出条件',
    variants: [
      { question: '什么情况下你会考虑卖出 {sym}？', tags: ['基本面恶化', '估值过高', '有更好标的', '止损纪律'] },
      { question: '{sym} 跌到多少你会离场？', tags: ['跌破成本20%', '跌破关键位', '视情况而定', '不止损长期持有'] },
      { question: '持有 {sym} 的底线条件是什么？', tags: ['营收持续增长', '行业地位不变', '管理层稳定', '现金流健康'] },
    ],
  },
  {
    topic: 'risk_awareness',
    label: '风险认知',
    variants: [
      { question: '持有 {sym} 最大的风险是什么？', tags: ['估值过高', '竞争加剧', '政策风险', '宏观不确定性'] },
      { question: '{sym} 有什么因素让你担心？', tags: ['增速放缓', '利润率压力', '行业周期', '暂时不担心'] },
      { question: '如果 {sym} 暴跌 30%，你会怎么做？', tags: ['加仓', '持有不动', '减仓观望', '全部卖出'] },
    ],
  },
  {
    topic: 'outlook',
    label: '预期展望',
    variants: [
      { question: '你觉得 {sym} 一年后会怎样？', tags: ['大幅上涨', '稳健增长', '横盘震荡', '不确定'] },
      { question: '{sym} 的下一个催化剂是什么？', tags: ['财报超预期', '新产品发布', '行业政策利好', '市场情绪回暖'] },
      { question: '长期来看，{sym} 值得持有吗？', tags: ['核心持仓', '中期持有', '短线交易', '还在观察'] },
    ],
  },
  {
    topic: 'event_driven',
    label: '事件驱动',
    variants: [
      { question: '{sym} 即将发布财报，你怎么看？', tags: ['看好超预期', '谨慎观望', '考虑减仓避险', '不影响长期逻辑'] },
      { question: '近期消息面对 {sym} 有什么影响？', tags: ['利好确认', '短期噪音', '需要关注', '不确定'] },
      { question: '当前市场环境下，{sym} 的表现符合预期吗？', tags: ['超出预期', '符合预期', '不及预期', '还需观察'] },
    ],
  },
];

export function getSectorTags(sector?: string): string[] {
  if (!sector) return SECTOR_TAGS.default;
  const key = sector.toLowerCase();
  if (key.includes('tech') || key.includes('科技')) return SECTOR_TAGS.tech;
  if (key.includes('consumer') || key.includes('消费')) return SECTOR_TAGS.consumer;
  if (key.includes('financ') || key.includes('金融')) return SECTOR_TAGS.finance;
  return SECTOR_TAGS.default;
}

export function pickThesisPrompt(
  context: 'just_added' | 'detail_expand' | 'red_alert',
  symbol: string,
): { question: string; tags: string[] } {
  let topic: ThesisTopicDef;

  if (context === 'red_alert') {
    topic = THESIS_TOPICS.find(t => t.topic === 'risk_awareness')!;
  } else if (context === 'just_added') {
    topic = THESIS_TOPICS.find(t => t.topic === 'buy_reason')!;
  } else {
    const eligible = THESIS_TOPICS.filter(t => t.topic !== 'event_driven');
    topic = eligible[Math.floor(Math.random() * eligible.length)];
  }

  const variant = topic.variants[Math.floor(Math.random() * topic.variants.length)];
  const question = variant.question.replace('{sym}', symbol);
  const tags = variant.tags.length > 0 ? variant.tags : getSectorTags();

  return { question, tags };
}
```

- [ ] **Step 2: Update QuickThesisInput to use topic-aware prompts**

Replace the content of `frontend/src/components/memory/QuickThesisInput.tsx`:

```tsx
'use client';

import { useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { pickThesisPrompt } from '@/lib/thesis-prompts';

interface QuickThesisInputProps {
  symbol: string;
  onSave?: (thesis: string) => void;
  onSkip?: () => void;
  context?: 'just_added' | 'detail_expand' | 'red_alert';
}

export function QuickThesisInput({ symbol, onSave, onSkip, context = 'just_added' }: QuickThesisInputProps) {
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const prompt = useMemo(() => pickThesisPrompt(context, symbol), [context, symbol]);

  const handleSave = useCallback(async (thesis: string) => {
    if (!thesis.trim() || saving) return;
    setSaving(true);
    try {
      await api.portfolio.patch(symbol, { thesis: thesis.trim() });
      setSaved(true);
      onSave?.(thesis.trim());
    } catch {
      // Silent fail
    } finally {
      setSaving(false);
    }
  }, [symbol, saving, onSave]);

  if (saved) {
    return (
      <div className="text-xs text-primary animate-fade-in-up py-1">
        已记住 — 下次 AI 讨论 {symbol} 时会参考
      </div>
    );
  }

  return (
    <div className="space-y-2 py-2 animate-fade-in-up">
      <p className="text-xs text-muted-foreground">
        {prompt.question}
        {context !== 'red_alert' && <span className="text-muted-foreground/50 ml-1">(可跳过)</span>}
      </p>

      {mode === 'preset' ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {prompt.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleSave(tag)}
              disabled={saving}
              className="text-xs px-2.5 py-1 rounded-full border border-border/50 bg-card/80 text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all disabled:opacity-50"
            >
              {tag}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMode('custom')}
            className="text-xs px-2.5 py-1 rounded-full border border-border/50 bg-card/80 text-muted-foreground hover:border-primary/30 transition-all"
          >
            自己写
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors ml-1"
          >
            跳过
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 140))}
            placeholder="例如：看好 AI 基建长期增长"
            className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-border/50 bg-background text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none transition-colors"
            maxLength={140}
            autoFocus
          />
          <button
            type="button"
            onClick={() => handleSave(text)}
            disabled={!text.trim() || saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => setMode('preset')}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            返回
          </button>
          <span className="text-[10px] text-muted-foreground/50">{text.length}/140</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Run: `cd frontend && npm run dev`

Navigate to a stock detail panel that shows a thesis prompt. Verify:
- Question text varies (refresh to see different prompts)
- Tags are shown as pill buttons
- Clicking a tag saves it as thesis
- "自己写" still works

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/thesis-prompts.ts frontend/src/components/memory/QuickThesisInput.tsx
git commit -m "feat(thesis): multi-topic prompts with quick-select tags"
```

---

## Task 8: Frontend — StockOverviewPanel Split (Portfolio vs Watchlist)

Split the stock overview into two visual groups: "我的持仓" (green, with summary + totals) and "观察列表" (gray, compact).

**Files:**
- Modify: `frontend/src/components/for-you/StockOverviewPanel.tsx`
- Modify: `frontend/src/components/for-you/StockListItem.tsx` (add weight prop)
- Modify: `frontend/src/components/for-you/DigestInlineReport.tsx`

- [ ] **Step 1: Update StockOverviewPanel props**

In `frontend/src/components/for-you/StockOverviewPanel.tsx`, update the props interface (lines 11-16):

```tsx
interface StockOverviewPanelProps {
  stocks: StockAnalysis[];
  digestDate?: string;
  thesisMap?: Record<string, string>;
  onThesisSaved?: (symbol: string, thesis: string) => void;
  portfolioSymbols?: Set<string>;
  portfolioWeightMap?: Record<string, number>;
  portfolioSummary?: string;
  totalMarketValue?: number;
  totalDailyChange?: number;
  totalDailyChangePct?: number;
}
```

- [ ] **Step 2: Add PortfolioHeader sub-component**

Add before the main export in `StockOverviewPanel.tsx`:

```tsx
function PortfolioHeader({
  count,
  totalMarketValue,
  totalDailyChange,
  totalDailyChangePct,
  portfolioSummary,
}: {
  count: number;
  totalMarketValue?: number;
  totalDailyChange?: number;
  totalDailyChangePct?: number;
  portfolioSummary?: string;
}) {
  const isPositive = (totalDailyChangePct ?? 0) >= 0;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">我的持仓</span>
          <span className="text-[11px] px-2 py-0.5 bg-primary text-primary-foreground rounded-full">{count} 只</span>
        </div>
        {totalMarketValue != null && (
          <div className="text-right">
            <div className="text-lg font-semibold font-data text-foreground">${totalMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            {totalDailyChange != null && totalDailyChangePct != null && (
              <div className={`text-xs font-data ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}${totalDailyChange.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({isPositive ? '+' : ''}{totalDailyChangePct.toFixed(1)}%) 今日
              </div>
            )}
          </div>
        )}
      </div>
      {portfolioSummary && (
        <div className="px-3 py-2 bg-background rounded-lg border-l-2 border-primary text-xs text-muted-foreground leading-relaxed mb-3">
          {portfolioSummary}
        </div>
      )}
    </div>
  );
}

function PortfolioEmptyState() {
  return (
    <div className="text-center py-6 text-sm text-muted-foreground">
      <p>还没有模拟持仓，添加后可追踪组合表现</p>
      <a href="/for-you/portfolio" className="inline-block mt-2 text-xs text-primary hover:text-primary/80 transition-colors">
        添加持仓 →
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite main StockOverviewPanel to split groups**

Replace the main export function body:

```tsx
export default function StockOverviewPanel({
  stocks,
  digestDate,
  thesisMap,
  onThesisSaved,
  portfolioSymbols,
  portfolioWeightMap,
  portfolioSummary,
  totalMarketValue,
  totalDailyChange,
  totalDailyChangePct,
}: StockOverviewPanelProps) {
  const hasPortfolio = portfolioSymbols && portfolioSymbols.size > 0;

  const portfolioStocks = hasPortfolio
    ? sortByVolatility(stocks.filter(s => portfolioSymbols.has(s.symbol)))
    : [];
  const watchlistStocks = hasPortfolio
    ? sortByVolatility(stocks.filter(s => !portfolioSymbols.has(s.symbol)))
    : sortByVolatility(stocks);

  const [selectedSymbol, setSelectedSymbol] = useState(
    portfolioStocks[0]?.symbol ?? watchlistStocks[0]?.symbol ?? ''
  );
  const allStocks = [...portfolioStocks, ...watchlistStocks];
  const selectedStock = allStocks.find(s => s.symbol === selectedSymbol) || allStocks[0];

  if (allStocks.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Portfolio section: show when user has holdings OR when no holdings at all (empty state) */}
      {!hasPortfolio ? (
        /* User has no portfolio at all — show CTA to add holdings */
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <PortfolioEmptyState />
        </div>
      ) : (
        /* User has portfolio — show stocks or "no data today" message */
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <PortfolioHeader
            count={portfolioStocks.length}
            totalMarketValue={totalMarketValue}
            totalDailyChange={totalDailyChange}
            totalDailyChangePct={totalDailyChangePct}
            portfolioSummary={portfolioSummary}
          />
          {portfolioStocks.length > 0 ? (
            <StockGroup
              stocks={portfolioStocks}
              selectedSymbol={selectedSymbol}
              onSelect={setSelectedSymbol}
              digestDate={digestDate}
              thesisMap={thesisMap}
              onThesisSaved={onThesisSaved}
              selectedStock={portfolioStocks.find(s => s.symbol === selectedSymbol) ? selectedStock : undefined}
              weightMap={portfolioWeightMap}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              今日日报暂未包含您的持仓分析
            </p>
          )}
        </div>
      )}

      {/* Watchlist section */}
      {watchlistStocks.length > 0 && (
        <div className="rounded-xl border border-border/30 bg-muted/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-muted-foreground">观察列表</span>
            <span className="text-[11px] px-2 py-0.5 bg-muted text-muted-foreground rounded-full">{watchlistStocks.length} 只</span>
          </div>
          <StockGroup
            stocks={watchlistStocks}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
            digestDate={digestDate}
            thesisMap={thesisMap}
            onThesisSaved={onThesisSaved}
            selectedStock={watchlistStocks.find(s => s.symbol === selectedSymbol) ? selectedStock : undefined}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4a: Modify StockListItem (desktop) to accept optional weight**

In `frontend/src/components/for-you/StockListItem.tsx`, add `weightPct` to the props interface and render it:

```tsx
interface StockListItemProps {
  stock: StockAnalysis;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick: () => void;
  weightPct?: number;
}
```

In the component body, add weight display after the symbol span:

```tsx
{weightPct != null && (
  <span className="text-[11px] text-muted-foreground/70 font-data ml-1">
    {weightPct.toFixed(1)}%
  </span>
)}
```

- [ ] **Step 4b: Modify MobileStockItem (inline in StockOverviewPanel.tsx) to accept optional weight**

`MobileStockItem` is defined at the top of `frontend/src/components/for-you/StockOverviewPanel.tsx` (lines 22-147). Update its props:

```tsx
function MobileStockItem({
  stock,
  isOpen,
  isHighlighted,
  onToggle,
  digestDate,
  weightPct,
}: {
  stock: StockAnalysis;
  isOpen: boolean;
  isHighlighted: boolean;
  onToggle: () => void;
  digestDate?: string;
  weightPct?: number;
}) {
```

In the header row (around line 56-60), add weight display after the symbol:

```tsx
<span className="font-semibold font-data text-sm text-foreground">
  {stock.symbol}
</span>
{weightPct != null && (
  <span className="text-[11px] text-muted-foreground/70 font-data">
    {weightPct.toFixed(1)}%
  </span>
)}
<span className="text-xs text-muted-foreground truncate">
  {stock.name}
</span>
```

- [ ] **Step 5: Extract StockGroup helper component with weight map**

Add above the main export in `StockOverviewPanel.tsx`:

```tsx
function StockGroup({
  stocks,
  selectedSymbol,
  onSelect,
  digestDate,
  thesisMap,
  onThesisSaved,
  selectedStock,
  weightMap,
}: {
  stocks: StockAnalysis[];
  selectedSymbol: string;
  onSelect: (sym: string) => void;
  digestDate?: string;
  thesisMap?: Record<string, string>;
  onThesisSaved?: (symbol: string, thesis: string) => void;
  selectedStock?: StockAnalysis;
  weightMap?: Record<string, number>;
}) {
  return (
    <>
      {/* Desktop: dual-column */}
      <div className="hidden md:grid md:grid-cols-[260px_1fr] gap-4">
        <div className="divide-y divide-border/30 rounded-lg border border-border/30">
          {stocks.map((stock) => (
            <StockListItem
              key={stock.symbol}
              stock={stock}
              isSelected={stock.symbol === selectedSymbol}
              isHighlighted={isNotableMove(stock.daily_change)}
              onClick={() => onSelect(stock.symbol)}
              weightPct={weightMap?.[stock.symbol]}
            />
          ))}
        </div>
        <div className="md:sticky md:top-4 self-start pl-2">
          {selectedStock && (
            <StockDetailPanel
              stock={selectedStock}
              digestDate={digestDate}
              thesis={thesisMap?.[selectedStock.symbol]}
              onThesisSaved={onThesisSaved}
            />
          )}
        </div>
      </div>

      {/* Mobile: accordion */}
      <div className="md:hidden divide-y divide-border/30">
        {stocks.map((stock) => (
          <MobileStockItem
            key={stock.symbol}
            stock={stock}
            isOpen={stock.symbol === selectedSymbol}
            isHighlighted={isNotableMove(stock.daily_change)}
            onToggle={() => onSelect(stock.symbol === selectedSymbol ? '' : stock.symbol)}
            digestDate={digestDate}
            weightPct={weightMap?.[stock.symbol]}
          />
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Update DigestInlineReport to pass portfolio data**

In `frontend/src/components/for-you/DigestInlineReport.tsx`, update the props interface to add portfolio data:

```tsx
interface DigestInlineReportProps {
  digest: DigestResponse;
  thesisMap?: Record<string, string>;
  onThesisSaved?: (symbol: string, thesis: string) => void;
  portfolioSymbols?: Set<string>;
  portfolioWeightMap?: Record<string, number>;
  portfolioSummary?: string;
  totalMarketValue?: number;
  totalDailyChange?: number;
  totalDailyChangePct?: number;
}
```

Update the `StockOverviewPanel` call to pass through the new props:

```tsx
<StockOverviewPanel
  stocks={digest.stocks}
  digestDate={digest.timestamp.split('T')[0]}
  thesisMap={thesisMap}
  onThesisSaved={onThesisSaved}
  portfolioSymbols={portfolioSymbols}
  portfolioWeightMap={portfolioWeightMap}
  portfolioSummary={portfolioSummary ?? digest.portfolio_summary}
  totalMarketValue={totalMarketValue}
  totalDailyChange={totalDailyChange}
  totalDailyChangePct={totalDailyChangePct}
/>
```

- [ ] **Step 6: Pass portfolio data from ForYouContentV2**

In `frontend/src/app/for-you/_components/ForYouContentV2.tsx`, where `DigestInlineReport` is rendered, pass portfolio symbols:

```tsx
// Add this import at top of ForYouContentV2.tsx:
// import { parseChangePercent } from '@/lib/digest-utils';

const portfolioSymbolSet = useMemo(
  () => new Set((portfolioData?.holdings ?? []).map((h) => h.symbol)),
  [portfolioData?.holdings]
);

const portfolioWeightMap = useMemo(
  () => Object.fromEntries(
    (portfolioData?.holdings ?? []).map((h) => [h.symbol, h.effective_weight_pct])
  ),
  [portfolioData?.holdings]
);

// Compute portfolio totals for the "我的持仓" header
const portfolioTotals = useMemo(() => {
  const holdings = portfolioData?.holdings ?? [];
  if (holdings.length === 0) return { totalMV: undefined, dailyChg: undefined, dailyChgPct: undefined };

  // Sum market_value from all holdings (enriched by backend)
  const mvValues = holdings.map(h => h.market_value).filter((v): v is number => v != null);
  if (mvValues.length === 0) return { totalMV: undefined, dailyChg: undefined, dailyChgPct: undefined };
  const totalMV = mvValues.reduce((a, b) => a + b, 0);

  // Compute daily change using digest stock data + portfolio weights
  // parseChangePercent handles null/undefined safely (returns 0)
  const digestStocks = displayDigest?.stocks ?? [];
  const changeMap = new Map(digestStocks.map(s => [s.symbol, parseChangePercent(s.daily_change)]));

  let dailyChgPct = 0;
  for (const h of holdings) {
    if (h.symbol === '$CASH') continue;
    const pct = changeMap.get(h.symbol) ?? 0;
    dailyChgPct += (h.effective_weight_pct / 100) * pct;
  }
  const dailyChg = totalMV * (dailyChgPct / 100) / (1 + dailyChgPct / 100);

  return {
    totalMV: Math.round(totalMV),
    dailyChg: Math.round(dailyChg),
    dailyChgPct: Number(dailyChgPct.toFixed(1)),
  };
}, [portfolioData?.holdings, displayDigest?.stocks]);

// In the JSX where DigestInlineReport is rendered:
<DigestInlineReport
  digest={displayDigest}
  thesisMap={thesisMap}
  onThesisSaved={handleThesisSaved}
  portfolioSymbols={portfolioSymbolSet}
  portfolioWeightMap={portfolioWeightMap}
  totalMarketValue={portfolioTotals.totalMV}
  totalDailyChange={portfolioTotals.dailyChg}
  totalDailyChangePct={portfolioTotals.dailyChgPct}
/>
```

- [ ] **Step 7: Verify in browser**

Run: `cd frontend && npm run dev`

Check `/for-you` with a user that has both portfolio and watchlist stocks:
- "我的持仓" section appears first with green tint
- "观察列表" section below with gray tint
- Stocks are correctly grouped
- Portfolio stocks don't appear in watchlist section

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/for-you/StockOverviewPanel.tsx frontend/src/components/for-you/DigestInlineReport.tsx frontend/src/app/for-you/_components/ForYouContentV2.tsx
git commit -m "feat(for-you): split stock overview into portfolio and watchlist groups"
```

---

## Task 9: Frontend — Portfolio Page Auto-Conversion UI

Show share conversion results after save and add the cost correction field.

**Files:**
- Modify: `frontend/src/app/for-you/portfolio/page.tsx`

- [ ] **Step 1: Add conversion info display after save**

In `frontend/src/app/for-you/portfolio/page.tsx`, inside the `onSuccess` callback of `saveMutation` (around lines 186-227), after the `setThesisPromptSymbols` logic, add state for showing conversion info:

Add state near the top of the component:
```tsx
const [conversionInfo, setConversionInfo] = useState<Record<string, { shares: number; entry_price: number }>>({});
```

In the `onSuccess` handler, after setting thesis prompts:
```tsx
// Track auto-converted stocks
const conversions: Record<string, { shares: number; entry_price: number }> = {};
for (const h of serverHoldings) {
  if (h.entry_price && h.shares && newSyms.includes(h.symbol)) {
    conversions[h.symbol] = { shares: h.shares, entry_price: h.entry_price };
  }
}
if (Object.keys(conversions).length > 0) {
  setConversionInfo(conversions);
}
```

- [ ] **Step 2: Render conversion info banner**

Add after the save success area in the JSX (near the thesis prompt section):

```tsx
{Object.keys(conversionInfo).length > 0 && (
  <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 space-y-2 animate-fade-in-up">
    <p className="text-xs text-blue-700 dark:text-blue-300">
      股数按录入当日价格自动折算。如果实际买入价不同，可以在下方修正成本。
    </p>
    {Object.entries(conversionInfo).map(([sym, info]) => (
      <div key={sym} className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{sym}</span>
        <span className="text-muted-foreground">
          按 ${info.entry_price.toFixed(2)} 折算 → {info.shares.toFixed(2)} 股
        </span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Add entry_price edit field to each holding row**

In the holdings editing UI section of `portfolio/page.tsx`, where each holding row has input fields for cost_basis, add an `entry_price` (买入均价) field:

```tsx
{/* Entry price correction field — shown when holding has shares */}
{holding.shares != null && holding.shares > 0 && (
  <div className="flex items-center gap-2">
    <label className="text-[10px] text-muted-foreground whitespace-nowrap">买入均价</label>
    <input
      type="number"
      value={holding.entry_price ?? ''}
      onChange={(e) => {
        const newPrice = e.target.value ? parseFloat(e.target.value) : undefined;
        updateHolding(i, {
          entry_price: newPrice,
          shares: newPrice && holding.cost_basis ? Number((holding.cost_basis / newPrice).toFixed(6)) : holding.shares,
        });
      }}
      placeholder="自动"
      className="w-20 text-xs px-2 py-1 rounded border border-border/50 bg-background text-foreground"
      min={0}
      step={0.01}
    />
  </div>
)}
```

- [ ] **Step 4: Verify in browser**

Run: `cd frontend && npm run dev`

Test:
1. Add a new stock with cost_basis $10,000 → Save → See blue conversion banner
2. Entry price field appears for stocks with shares
3. Changing entry price recalculates shares in real-time

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/for-you/portfolio/page.tsx
git commit -m "feat(portfolio): show auto-conversion results and entry price correction"
```

---

## Task 10: Frontend — ActionBar Chip Link Handling

Update the ActionBar frontend to handle the new `#stock-{symbol}` anchor links for thesis guidance chips.

**Files:**
- Modify: `frontend/src/components/for-you/ActionBar.tsx`
- Modify: `frontend/src/components/for-you/StockOverviewPanel.tsx` (add id anchors to list items + hash listener)
- Modify: `frontend/src/components/for-you/StockListItem.tsx` (add id prop)

- [ ] **Step 1: Update ActionChipButton to handle anchor links**

In `frontend/src/components/for-you/ActionBar.tsx`, modify the `ActionChipButton` component to handle `#stock-` prefix links. After the existing `action://touch-portfolio` special case, add:

```tsx
// Handle anchor scroll — set hash, StockOverviewPanel listens for it
if (chip.link.startsWith('#stock-')) {
  window.location.hash = chip.link;
  return;
}
```

- [ ] **Step 2: Add id anchors to always-visible list items (NOT StockDetailPanel)**

StockDetailPanel is conditionally rendered (only for selected stock), so anchoring to it would fail for non-selected stocks. Instead, add anchors to the always-visible list items:

In `frontend/src/components/for-you/StockListItem.tsx`, add an `id` prop to the root element:

```tsx
// Add to the component's outermost div/button:
id={`stock-${stock.symbol}`}
```

In `MobileStockItem` (inside `StockOverviewPanel.tsx`), add the same id to the root div:

```tsx
<div id={`stock-${stock.symbol}`} className={bgClass}>
```

- [ ] **Step 3: Add hash listener to StockOverviewPanel to auto-select + scroll**

In `frontend/src/components/for-you/StockOverviewPanel.tsx`, add a `useEffect` to the main export component that watches for hash changes and auto-selects the stock:

```tsx
import { useState, useEffect, useCallback } from 'react';

// Inside the StockOverviewPanel component, after selectedSymbol state:
useEffect(() => {
  const handleHash = () => {
    const hash = window.location.hash;
    if (!hash.startsWith('#stock-')) return;
    const sym = hash.slice(7); // '#stock-'.length === 7
    const exists = allStocks.some(s => s.symbol === sym);
    if (!exists) return;

    setSelectedSymbol(sym);
    // Scroll to the list item after a tick (so accordion can open)
    requestAnimationFrame(() => {
      const el = document.getElementById(`stock-${sym}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 3000);
      }
    });
    // Clear hash to allow re-clicking same chip
    history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  window.addEventListener('hashchange', handleHash);
  // Also check on mount in case hash was set before render
  handleHash();
  return () => window.removeEventListener('hashchange', handleHash);
}, [allStocks]);
```

- [ ] **Step 4: Verify in browser**

Run: `cd frontend && npm run dev`

Test:
1. Action bar shows "补充投资论点" chip for e.g. AAPL
2. Click chip → page scrolls to AAPL row in the stock list
3. On desktop: AAPL becomes selected, detail panel shows with thesis input
4. On mobile: AAPL accordion opens, thesis input visible
5. Works even when AAPL was NOT the previously selected stock

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/for-you/ActionBar.tsx frontend/src/components/for-you/StockOverviewPanel.tsx frontend/src/components/for-you/StockListItem.tsx
git commit -m "feat(action-bar): hash-based anchor scroll with auto-select for thesis chips"
```

---

## Dependency Graph

```
Task 1 (models) → Task 2 (auto-conversion) → Task 9 (portfolio UI)
Task 3 (action bar backend) → Task 10 (action bar frontend)
Task 4 (brew models) → Task 8 (stock overview split)
Task 5 (breadcrumb) — independent
Task 6 (nav dropdown) — independent  
Task 7 (thesis prompts) — independent
```

Tasks 5, 6, 7 can run in parallel. Tasks 1→2→9 and 3→10 and 4→8 are sequential chains.
