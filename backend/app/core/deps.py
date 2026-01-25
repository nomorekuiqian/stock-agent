"""
Shared dependencies - authentication, cron secret verification.
"""

import hmac

from fastapi import Header, HTTPException

from app.core.config import CRON_SECRET


async def verify_cron_secret(
    x_cron_secret: str = Header(None, alias="X-Cron-Secret"),
) -> str:
    """Verify X-Cron-Secret header for admin/cron endpoints."""
    if CRON_SECRET and not hmac.compare_digest(x_cron_secret or "", CRON_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_cron_secret
