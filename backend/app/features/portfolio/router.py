"""
Portfolio router - HTTP endpoints for portfolio + profile.

All user endpoints authenticate via Depends(verify_user_token); the user_id
is taken from the token, never from the request body or query string.
"""

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.features.payment.entitlements import has_entitlement
from app.features.portfolio import db as portfolio_db
from app.features.portfolio.models import (
    BulkPortfolioRequest,
    HoldingInput,
    PortfolioListResponse,
    ProfileInput,
    ProfileView,
    TouchResponse,
)
from app.features.portfolio.service import auto_fill_shares, compute_effective_weights, enrich_market_values

logger = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["portfolio"])

_PORTFOLIO_FEATURE = "portfolio_management"


async def _require_portfolio_entitlement(user_id: str) -> None:
    if not await has_entitlement(user_id, _PORTFOLIO_FEATURE):
        raise HTTPException(status_code=403, detail="Portfolio management requires Max plan")


# =============================================================================
# Portfolio endpoints
# =============================================================================


@router.get("/portfolio", response_model=PortfolioListResponse)
async def get_portfolio(user_id: str = Depends(verify_user_token)):
    from app.shared.data_tools.quotes import get_batch_quotes

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


@router.put("/portfolio/bulk", response_model=PortfolioListResponse)
async def bulk_save_portfolio(
    payload: BulkPortfolioRequest,
    user_id: str = Depends(verify_user_token),
):
    await _require_portfolio_entitlement(user_id)

    from app.shared.data_tools.quotes import get_batch_quotes

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

    filled_rows = auto_fill_shares(payload.rows, prices)

    try:
        rows = await portfolio_db.bulk_replace_portfolio(user_id, filled_rows)
    except RuntimeError as e:
        logger.error("bulk_save_portfolio failed for user %s: %s", user_id, e)
        raise HTTPException(status_code=502, detail="Failed to save portfolio") from e

    holdings = compute_effective_weights(rows, prices_map=prices)
    enrich_market_values(holdings, prices)
    total = sum(h.effective_weight_pct for h in holdings)
    return PortfolioListResponse(holdings=holdings, total_weight_pct=round(total, 4))


@router.patch("/portfolio/touch", response_model=TouchResponse)
async def touch_portfolio_endpoint(user_id: str = Depends(verify_user_token)):
    """R-2 持仓保鲜戳：仅刷新 portfolio_confirmed_at，不改持仓数据。"""
    await _require_portfolio_entitlement(user_id)
    try:
        confirmed_at = await portfolio_db.touch_portfolio(user_id)
    except RuntimeError as e:
        logger.error("touch failed for user %s: %s", user_id, e)
        raise HTTPException(status_code=502, detail="Failed to touch portfolio") from e
    return TouchResponse(confirmed_at=confirmed_at)


@router.patch("/portfolio/{symbol}")
async def patch_holding_endpoint(
    symbol: str,
    payload: Dict[str, Any],
    user_id: str = Depends(verify_user_token),
):
    """Single-row upsert. Body accepts any of: weight_pct/shares/cost_basis/thesis/target/stop_loss/conviction."""
    await _require_portfolio_entitlement(user_id)
    holding = HoldingInput(symbol=symbol, **payload)
    fields = holding.model_dump(exclude={"symbol"}, exclude_unset=True)
    try:
        row = await portfolio_db.patch_holding(user_id, holding.symbol, fields)
    except RuntimeError as e:
        logger.error("patch_holding failed user=%s symbol=%s: %s", user_id, symbol, e)
        raise HTTPException(status_code=502, detail="Failed to patch holding") from e
    if not row:
        raise HTTPException(status_code=500, detail="Patch returned no row")
    return row


@router.delete("/portfolio/{symbol}")
async def delete_holding_endpoint(
    symbol: str,
    user_id: str = Depends(verify_user_token),
):
    await _require_portfolio_entitlement(user_id)
    ok = await portfolio_db.delete_holding(user_id, symbol.upper())
    if not ok:
        raise HTTPException(status_code=502, detail="Failed to delete holding")
    return {"deleted": True, "symbol": symbol.upper()}


# =============================================================================
# Profile endpoints
# =============================================================================


@router.get("/profile", response_model=ProfileView)
async def get_profile_endpoint(user_id: str = Depends(verify_user_token)):
    return await portfolio_db.get_profile(user_id)


@router.put("/profile", response_model=ProfileView)
async def upsert_profile_endpoint(
    payload: ProfileInput,
    user_id: str = Depends(verify_user_token),
):
    try:
        return await portfolio_db.upsert_profile(user_id, payload)
    except RuntimeError as e:
        logger.error("upsert_profile failed user=%s: %s", user_id, e)
        raise HTTPException(status_code=502, detail="Failed to save profile") from e
