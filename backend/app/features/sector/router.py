"""
Sector Digest API Router - endpoints for sector digests and subscriptions.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.logging import get_logger
from app.features.sector.models import get_enabled_sectors, get_sector_by_id
from app.features.sector.agent import get_sector_digest
from app.features.sector import db
from app.core.deps import verify_cron_secret
from app.utils.timezone import today_str

logger = get_logger(__name__)

router = APIRouter(prefix="/api/sectors", tags=["sector"])


# =============================================================================
# Request Models
# =============================================================================


class SectorSubscribeRequest(BaseModel):
    user_id: str
    sector_id: str


class SectorUnsubscribeRequest(BaseModel):
    user_id: str
    sector_id: str


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/")
async def list_sectors():
    """
    List all available sectors for subscription.
    """
    try:
        sectors = get_enabled_sectors()
        return {
            "success": True,
            "sectors": [
                {
                    "id": s.id,
                    "name_en": s.name_en,
                    "name_zh": s.name_zh,
                    "description": s.description,
                    "symbols": s.symbols,
                    "symbol_count": len(s.symbols),
                }
                for s in sectors
            ],
        }
    except Exception as e:
        logger.exception("Failed to list sectors")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{sector_id}/digest")
async def generate_sector_digest(sector_id: str):
    """
    Generate a sector digest for a specific sector.

    Uses SectorDigest agent (gemini-3-flash-preview) to generate
    in-depth sector analysis.
    """
    try:
        sector = get_sector_by_id(sector_id)
        if not sector:
            raise HTTPException(status_code=404, detail=f"Sector '{sector_id}' not found")

        if not sector.enabled:
            raise HTTPException(status_code=400, detail=f"Sector '{sector_id}' is disabled")

        digest_agent = get_sector_digest()
        result = await digest_agent.generate(sector_id=sector_id)

        if not result.get("success"):
            error_msg = result.get("error", "Failed to generate sector digest")
            raise HTTPException(status_code=500, detail=error_msg)

        # Save to database
        try:
            save_result = await db.save_sector_digest(
                sector_id=sector_id,
                digest_date=today_str(),
                digest_data=result,
            )
            result["saved"] = save_result.get("success", False)
            result["digest_id"] = save_result.get("digest_id")
        except Exception as save_error:
            logger.warning("Failed to save sector digest: %s", save_error)
            result["saved"] = False

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to generate sector digest")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sector_id}/digest/latest")
async def get_latest_sector_digest(sector_id: str):
    """
    Get the latest sector digest from database.
    """
    try:
        sector = get_sector_by_id(sector_id)
        if not sector:
            raise HTTPException(status_code=404, detail=f"Sector '{sector_id}' not found")

        digest = await db.get_latest_sector_digest(sector_id)

        if not digest:
            return {
                "success": True,
                "digest": None,
                "sector_id": sector_id,
                "sector_name": sector.name_zh,
            }

        return {
            "success": True,
            "digest": digest.get("digest_data"),
            "digest_date": digest.get("digest_date"),
            "generated_at": digest.get("generated_at"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get latest sector digest")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscribe")
async def subscribe_to_sector(request: SectorSubscribeRequest):
    """
    Subscribe a user to a sector for daily digests.
    """
    try:
        sector = get_sector_by_id(request.sector_id)
        if not sector:
            raise HTTPException(status_code=404, detail=f"Sector '{request.sector_id}' not found")

        if not sector.enabled:
            raise HTTPException(status_code=400, detail=f"Sector '{request.sector_id}' is disabled")

        result = await db.subscribe_to_sector(
            user_id=request.user_id,
            sector_id=request.sector_id,
        )

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to subscribe"))

        return {
            "success": True,
            "message": f"Subscribed to {sector.name_zh}",
            "sector_id": request.sector_id,
            "is_new": result.get("is_new", True),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to subscribe to sector")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions")
async def get_sector_subscriptions(user_id: str = Query(..., description="User ID")):
    """
    Get user's sector subscriptions.
    """
    try:
        result = await db.get_user_sector_subscriptions(user_id)

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to get subscriptions"))

        # Enrich with sector info
        subscriptions = []
        for sub in result.get("subscriptions", []):
            sector = get_sector_by_id(sub.get("sector_id"))
            if sector:
                subscriptions.append({
                    "sector_id": sector.id,
                    "name_en": sector.name_en,
                    "name_zh": sector.name_zh,
                    "description": sector.description,
                    "symbols": sector.symbols,
                    "subscribed_at": sub.get("subscribed_at"),
                })

        return {
            "success": True,
            "subscriptions": subscriptions,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get sector subscriptions")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{sector_id}/unsubscribe")
async def unsubscribe_from_sector(sector_id: str, user_id: str = Query(..., description="User ID")):
    """
    Unsubscribe a user from a sector.
    """
    try:
        result = await db.unsubscribe_from_sector(
            user_id=user_id,
            sector_id=sector_id,
        )

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to unsubscribe"))

        return {
            "success": True,
            "message": f"Unsubscribed from sector",
            "sector_id": sector_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to unsubscribe from sector")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sector_id}/digest/history")
async def get_sector_digest_history(
    sector_id: str,
    days: int = Query(30, ge=1, le=365, description="Number of days of history"),
):
    """
    Get digest history for a specific sector.
    """
    try:
        sector = get_sector_by_id(sector_id)
        if not sector:
            raise HTTPException(status_code=404, detail=f"Sector '{sector_id}' not found")

        result = await db.get_sector_digest_history(
            sector_id=sector_id,
            days=days,
        )

        if not result.get("success"):
            # Return empty list instead of error for history
            return {
                "success": True,
                "sector_id": sector_id,
                "digests": [],
            }

        return {
            "success": True,
            "sector_id": sector_id,
            "digests": result.get("digests", []),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get sector digest history")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-all")
async def generate_all_sector_digests(
    _secret: str = Depends(verify_cron_secret),
):
    """
    Generate digests for all enabled sectors.
    This endpoint is designed for CI/CD automation.

    Requires X-Cron-Secret header for authentication.
    """

    try:
        sectors = get_enabled_sectors()
        digest_agent = get_sector_digest()

        results = []
        digest_date = today_str()

        for sector in sectors:
            logger.info("Generating digest for: %s (%s)", sector.name_zh, sector.id)
            try:
                # Generate digest
                digest_result = await digest_agent.generate(sector.id)

                if digest_result.get("success"):
                    # Save to database
                    save_result = await db.save_sector_digest(
                        sector_id=sector.id,
                        digest_date=digest_date,
                        digest_data=digest_result,
                    )

                    results.append({
                        "sector_id": sector.id,
                        "sector_name": sector.name_zh,
                        "success": True,
                        "saved": save_result.get("success", False),
                    })
                else:
                    results.append({
                        "sector_id": sector.id,
                        "sector_name": sector.name_zh,
                        "success": False,
                        "error": digest_result.get("error", "Generation failed"),
                    })

            except Exception as e:
                logger.error("Error generating %s: %s", sector.id, e)
                results.append({
                    "sector_id": sector.id,
                    "sector_name": sector.name_zh,
                    "success": False,
                    "error": str(e),
                })

        successful = sum(1 for r in results if r.get("success"))
        total = len(results)

        return {
            "success": True,
            "message": f"Generated {successful}/{total} sector digests",
            "digest_date": digest_date,
            "results": results,
        }

    except Exception as e:
        logger.exception("Failed to generate all sector digests")
        raise HTTPException(status_code=500, detail=str(e))
