"""Portfolio health check router -- HTTP endpoints for health scoring + diagnosis."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.payment.entitlements import has_entitlement
from app.features.portfolio import db as portfolio_db
from app.features.portfolio.service import compute_effective_weights
from app.features.portfolio_health.models import HealthLatestResponse, HealthResponse
from app.features.portfolio_health.service import generate_health_check, get_latest
from app.shared.data_tools.quotes import get_batch_quotes

logger = get_logger(__name__)

router = APIRouter(prefix="/api/portfolio-health", tags=["portfolio-health"])
_PORTFOLIO_HEALTH_FEATURE = "portfolio_management"


async def _require_portfolio_health_entitlement(user_id: str) -> None:
    if not await has_entitlement(user_id, _PORTFOLIO_HEALTH_FEATURE):
        raise HTTPException(status_code=403, detail="Portfolio health requires Max plan")


@router.post("", response_model=HealthResponse)
@limiter.limit("10/minute")
async def post_health_check(
    request: Request,
    force: bool = Query(False, description="Force regeneration (ignores cache)"),
    user_id: str = Depends(verify_user_token),
):
    """Generate or return cached portfolio health check."""
    await _require_portfolio_health_entitlement(user_id)
    # Load portfolio
    rows = await portfolio_db.list_portfolio(user_id)
    if not rows:
        raise HTTPException(status_code=400, detail="请先添加持仓")

    # Compute weights
    symbols = [r.symbol for r in rows]
    quotes_result = get_batch_quotes(symbols)
    prices = {
        q["symbol"]: q.get("price", 0) for q in quotes_result.get("quotes", [])
    }
    holdings = compute_effective_weights(rows, prices)

    # Load profile
    profile = await portfolio_db.get_profile(user_id)

    try:
        return await generate_health_check(
            user_id, holdings, profile, force=force
        )
    except Exception:
        logger.exception("health check failed user=%s", user_id[:8])
        raise HTTPException(
            status_code=500, detail="体检生成失败，请稍后重试"
        )


@router.get("/latest", response_model=HealthLatestResponse)
async def get_health_latest(
    user_id: str = Depends(verify_user_token),
):
    """Get latest health insights (lightweight, for ActionBar)."""
    await _require_portfolio_health_entitlement(user_id)
    try:
        return await get_latest(user_id)
    except Exception:
        logger.exception("health latest failed user=%s", user_id[:8])
        return HealthLatestResponse()
