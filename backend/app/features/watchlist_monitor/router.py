"""API routes for the AI watchlist monitor."""

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import verify_cron_secret, verify_user_token
from app.core.logging import get_logger
from app.features.payment.entitlements import has_entitlement
from app.features.watchlist_monitor.models import (
    GenerateRequest,
    GenerateResponse,
    WatchlistMonitorResponse,
)
from app.features.watchlist_monitor.service import (
    compose_monitor_for_user,
    generate_for_symbols,
    resolve_symbols_for_generation,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["watchlist-monitor"])
_MONITOR_FEATURE = "for_you_website"


async def _require_monitor_entitlement(user_id: str) -> None:
    if not await has_entitlement(user_id, _MONITOR_FEATURE):
        raise HTTPException(status_code=403, detail="AI monitor requires an active For You entitlement")


@router.get("/watchlist-monitor", response_model=WatchlistMonitorResponse)
async def get_watchlist_monitor(user_id: str = Depends(verify_user_token)):
    """Return the authenticated user's cached watchlist monitor."""
    await _require_monitor_entitlement(user_id)
    try:
        return await compose_monitor_for_user(user_id)
    except RuntimeError as exc:
        logger.warning("watchlist monitor read failed for user=%s: %s", user_id[:8], exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("watchlist monitor read exception for user=%s", user_id[:8])
        raise HTTPException(status_code=500, detail="Failed to load watchlist monitor") from exc


@router.post(
    "/admin/watchlist-monitor/generate-active-tickers",
    response_model=GenerateResponse,
    dependencies=[Depends(verify_cron_secret)],
)
async def generate_active_tickers(body: GenerateRequest):
    """Generate ticker briefs for explicit symbols or one user's watchlist."""
    try:
        symbols = await resolve_symbols_for_generation(
            symbols=body.symbols,
            user_id=body.user_id,
            limit=body.limit,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not symbols:
        return GenerateResponse(
            success=True,
            requested_symbols=[],
            generated=[],
            failed=[],
        )

    generated, failed = await generate_for_symbols(symbols, force=body.force)
    return GenerateResponse(
        success=len(failed) == 0,
        requested_symbols=symbols,
        generated=generated,
        failed=failed,
    )
