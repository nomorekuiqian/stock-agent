"""API routes for the AI watchlist monitor."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.core.deps import verify_cron_secret, verify_user_token
from app.core.logging import get_logger
from app.features.watchlist_monitor.models import (
    GeneratePaidUniverseRequest,
    GeneratePaidUniverseResponse,
    GenerateRequest,
    GenerateResponse,
    GenerateTestUniverseRequest,
    GenerateTestUniverseResponse,
    StartPaidUniverseResponse,
    WatchlistMonitorResponse,
)
from app.features.watchlist_monitor.service import (
    compose_monitor_for_user,
    generate_for_symbols,
    generate_paid_user_universe,
    generate_test_user_universe,
    resolve_symbols_for_generation,
)
from app.shared.entitlements import has_feature_entitlement

logger = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["watchlist-monitor"])
_MONITOR_FEATURE = "for_you_website"


async def _run_paid_universe_background(request: GeneratePaidUniverseRequest) -> None:
    """Run the long paid-universe job after the cron request has returned."""
    try:
        result = await generate_paid_user_universe(
            user_limit=request.user_limit,
            limit_per_user=request.limit_per_user,
            force=request.force,
            dry_run=False,
        )
        if result.success:
            logger.info(
                "watchlist monitor paid universe background job completed: symbols=%s generated=%s failed=%s",
                result.symbol_count,
                result.generated_count,
                result.failed_count,
            )
        else:
            logger.warning(
                "watchlist monitor paid universe background job completed with failures: symbols=%s generated=%s failed=%s failed_users=%s",
                result.symbol_count,
                result.generated_count,
                result.failed_count,
                result.failed_user_count,
            )
    except Exception:
        logger.exception("watchlist monitor paid universe background job failed")


async def _require_monitor_entitlement(user_id: str) -> None:
    if not await has_feature_entitlement(user_id, _MONITOR_FEATURE):
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


@router.post(
    "/admin/watchlist-monitor/generate-test-universe",
    response_model=GenerateTestUniverseResponse,
    dependencies=[Depends(verify_cron_secret)],
)
async def generate_test_universe(body: GenerateTestUniverseRequest | None = None):
    """Generate ticker briefs for the limited Voya + owner dry-run universe."""
    request = body or GenerateTestUniverseRequest()
    return await generate_test_user_universe(
        user_ids=request.user_ids,
        limit_per_user=request.limit_per_user,
        max_symbols=request.max_symbols,
        force=request.force,
        dry_run=request.dry_run,
    )


@router.post(
    "/admin/watchlist-monitor/generate-paid-universe",
    response_model=GeneratePaidUniverseResponse,
    dependencies=[Depends(verify_cron_secret)],
)
async def generate_paid_universe(body: GeneratePaidUniverseRequest | None = None):
    """Generate ticker briefs for all users entitled to the paid monitor page."""
    request = body or GeneratePaidUniverseRequest()
    return await generate_paid_user_universe(
        user_limit=request.user_limit,
        limit_per_user=request.limit_per_user,
        force=request.force,
        dry_run=request.dry_run,
    )


@router.post(
    "/admin/watchlist-monitor/start-paid-universe",
    response_model=StartPaidUniverseResponse,
    dependencies=[Depends(verify_cron_secret)],
)
async def start_paid_universe(
    background_tasks: BackgroundTasks,
    body: GeneratePaidUniverseRequest | None = None,
):
    """Start the long paid-universe generation job without holding the cron HTTP request open."""
    request = body or GeneratePaidUniverseRequest()
    if request.dry_run:
        dry_run_result = await generate_paid_user_universe(
            user_limit=request.user_limit,
            limit_per_user=request.limit_per_user,
            force=request.force,
            dry_run=True,
        )
        return StartPaidUniverseResponse(
            success=dry_run_result.success,
            accepted=False,
            message="dry_run completed for %s symbols" % dry_run_result.symbol_count,
        )

    background_tasks.add_task(_run_paid_universe_background, request)
    return StartPaidUniverseResponse(
        success=True,
        accepted=True,
        message="paid universe generation started",
    )
