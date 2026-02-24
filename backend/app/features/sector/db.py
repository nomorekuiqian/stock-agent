"""
Sector database operations - Insforge Edge Function calls for sector digests and subscriptions.
"""

from typing import Dict, Any, Optional

import httpx

from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)


async def save_sector_digest(
    sector_id: str,
    digest_date: str,
    digest_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Save a sector digest to the database using Edge Function.

    Args:
        sector_id: Sector identifier
        digest_date: Date in YYYY-MM-DD format
        digest_data: Complete digest data (stored as JSONB)

    Returns:
        dict with success status and digest ID
    """
    try:
        service = get_insforge_service()
        function_url = f"{service.base_url}/functions/sector-digests"

        # Store the complete digest_data as JSONB
        db_digest = {
            "sector_id": sector_id,
            "digest_date": digest_date,
            "digest_data": digest_data,  # Full digest data as JSON
        }

        logger.info("Saving sector digest: %s for %s", sector_id, digest_date)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                function_url,
                headers=service.headers,
                json=db_digest,
                timeout=30.0,
            )

            if response.status_code in (200, 201):
                data = response.json()
                if data.get("success"):
                    digest_id = data.get("data", {}).get("id")
                    logger.info("Sector digest saved, ID: %s", digest_id)
                    return {
                        "success": True,
                        "digest_id": digest_id,
                    }
                else:
                    error_msg = data.get("error", "Unknown error")
                    logger.error("Sector digest save failed: %s", error_msg)
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                logger.error("Sector digest save failed: %s - %s", response.status_code, error_msg)
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        logger.exception("Exception saving sector digest")
        return {"success": False, "error": str(e)}


async def get_latest_sector_digest(sector_id: str) -> Optional[Dict[str, Any]]:
    """
    Get the latest sector digest from the database using Edge Function.

    Args:
        sector_id: Sector identifier

    Returns:
        Digest data or None if not found
    """
    try:
        service = get_insforge_service()
        function_url = f"{service.base_url}/functions/sector-digests"
        query_url = f"{function_url}?sector_id={sector_id}&latest=true"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                query_url,
                headers=service.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return data.get("data")
            return None

    except Exception as e:
        logger.error("Exception getting latest sector digest: %s", e)
        return None


async def subscribe_to_sector(
    user_id: str,
    sector_id: str,
) -> Dict[str, Any]:
    """
    Subscribe a user to a sector using Edge Function.

    Args:
        user_id: User ID
        sector_id: Sector ID

    Returns:
        dict with success status
    """
    try:
        service = get_insforge_service()
        function_url = f"{service.base_url}/functions/sector-subscriptions"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                function_url,
                headers=service.headers,
                json={
                    "user_id": user_id,
                    "sector_id": sector_id,
                },
                timeout=30.0,
            )

            if response.status_code in (200, 201):
                data = response.json()
                if data.get("success"):
                    return {"success": True, "is_new": data.get("is_new", True)}
                else:
                    error_msg = data.get("error", "Unknown error")
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        logger.error("Exception subscribing to sector: %s", e)
        return {"success": False, "error": str(e)}


async def unsubscribe_from_sector(
    user_id: str,
    sector_id: str,
) -> Dict[str, Any]:
    """
    Unsubscribe a user from a sector using Edge Function.

    Args:
        user_id: User ID
        sector_id: Sector ID

    Returns:
        dict with success status
    """
    try:
        service = get_insforge_service()
        function_url = f"{service.base_url}/functions/sector-subscriptions"
        query_url = f"{function_url}?user_id={user_id}&sector_id={sector_id}"

        async with httpx.AsyncClient() as client:
            response = await client.delete(
                query_url,
                headers=service.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return {"success": True}
                else:
                    error_msg = data.get("error", "Unknown error")
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        logger.error("Exception unsubscribing from sector: %s", e)
        return {"success": False, "error": str(e)}


async def get_user_sector_subscriptions(user_id: str) -> Dict[str, Any]:
    """
    Get a user's sector subscriptions using Edge Function.

    Args:
        user_id: User ID

    Returns:
        dict with subscriptions list
    """
    try:
        service = get_insforge_service()
        function_url = f"{service.base_url}/functions/sector-subscriptions"
        query_url = f"{function_url}?user_id={user_id}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                query_url,
                headers=service.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return {
                        "success": True,
                        "subscriptions": data.get("subscriptions", []),
                    }
                else:
                    error_msg = data.get("error", "Unknown error")
                    return {"success": False, "error": error_msg, "subscriptions": []}
            else:
                error_msg = response.text
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}", "subscriptions": []}

    except Exception as e:
        logger.error("Exception getting sector subscriptions: %s", e)
        return {"success": False, "error": str(e), "subscriptions": []}


async def get_sector_digest_history(
    sector_id: str | None = None,
    days: int = 30,
) -> Dict[str, Any]:
    """
    Get sector digest history from the database using Edge Function.

    Args:
        sector_id: Optional sector ID to filter by (None = all sectors)
        days: Number of days of history to retrieve

    Returns:
        dict with success status and list of digest summaries
    """
    try:
        service = get_insforge_service()
        function_url = f"{service.base_url}/functions/sector-digests"
        params = [f"history=true", f"days={days}"]
        if sector_id:
            params.append(f"sector_id={sector_id}")
        query_url = f"{function_url}?{'&'.join(params)}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                query_url,
                headers=service.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return {
                        "success": True,
                        "digests": data.get("digests", []),
                    }
                else:
                    error_msg = data.get("error", "Unknown error")
                    return {"success": False, "error": error_msg, "digests": []}
            else:
                error_msg = response.text
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}", "digests": []}

    except Exception as e:
        logger.error("Exception getting sector digest history: %s", e)
        return {"success": False, "error": str(e), "digests": []}
