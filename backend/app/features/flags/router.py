"""Feature flags API — returns current user's active flags."""

from fastapi import APIRouter, Depends

from app.core.deps import verify_user_token
from app.features.flags.db import get_user_flags

router = APIRouter(prefix="/api/flags", tags=["flags"])


@router.get("")
async def list_my_flags(user_id: str = Depends(verify_user_token)):
    flags = await get_user_flags(user_id)
    return {"flags": sorted(flags)}
