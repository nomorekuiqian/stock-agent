"""
Digest database operations using Insforge Edge Functions.

Provides save and retrieve operations for personalized user digests.
"""

from typing import Optional, Dict, Any, List

import httpx

from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.utils.timezone import today_str

logger = get_logger(__name__)


async def save_user_digest(digest_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save a personal digest to the database (always creates new record).

    Args:
        digest_data: Dictionary containing digest data including user_id

    Returns:
        dict with success status and saved digest ID
    """
    try:
        service = get_insforge_service()
        digest_url = f"{service.base_url}/functions/user-digests"

        # Get summary content for legacy fields
        summary_data = digest_data.get("summary", {})
        summary_content = summary_data.get("content", "") if isinstance(summary_data, dict) else ""

        db_digest = {
            "user_id": digest_data.get("user_id"),
            "digest_date": digest_data.get("digest_date", today_str()),
            "symbols": digest_data.get("symbols", []),
            # Header fields
            "greeting": digest_data.get("greeting", ""),
            "one_line_summary": digest_data.get("one_line_summary", ""),
            "bottom_line": summary_content,
            # Legacy field
            "analysis": summary_content,
            # Full structured data
            "digest_data": {
                "stocks": digest_data.get("stocks", []),
                "news": digest_data.get("news", {}),
                "events": digest_data.get("events", []),
                "summary": digest_data.get("summary", {}),
            },
        }

        logger.info("Saving user digest for user: %s, date: %s", db_digest.get('user_id'), db_digest.get('digest_date'))

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{digest_url}?action=insert",
                headers=service.headers,
                json=db_digest,
                timeout=30.0,
            )

            if response.status_code in (200, 201):
                data = response.json()
                if data.get("success"):
                    digest_id = data.get("data", {}).get("id")
                    action = data.get("action", "saved")
                    logger.info("User digest %s, ID: %s", action, digest_id)
                    return {
                        "success": True,
                        "digest_id": digest_id,
                        "action": action,
                    }
                else:
                    error_msg = data.get("error", "Unknown error")
                    logger.error("Save failed: %s", error_msg)
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                logger.error("Save failed: %s - %s", response.status_code, error_msg)
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        logger.exception("Exception saving user digest")
        return {"success": False, "error": str(e)}


async def get_user_watchlist(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a user's watchlist from the database via Edge Function.

    Args:
        user_id: User UUID

    Returns:
        Watchlist data with symbols array, or None if not found
    """
    try:
        service = get_insforge_service()
        watchlist_url = f"{service.base_url}/functions/user-watchlists"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{watchlist_url}?user_id={user_id}",
                headers=service.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return data.get("data")
            return None

    except Exception as e:
        logger.error("Exception getting user watchlist: %s", e)
        return None


async def get_user_digest(user_id: str, digest_date: str) -> Optional[Dict[str, Any]]:
    """
    Get a user digest by user_id and date.

    Args:
        user_id: User UUID
        digest_date: Date in YYYY-MM-DD format

    Returns:
        Digest data or None if not found
    """
    try:
        service = get_insforge_service()
        digest_url = f"{service.base_url}/functions/user-digests"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{digest_url}?user_id={user_id}&date={digest_date}",
                headers=service.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return data.get("data")
            return None

    except Exception as e:
        logger.error("Exception getting user digest: %s", e)
        return None


async def save_user_watchlist(user_id: str, symbols: List[str], email: str = "") -> Dict[str, Any]:
    """
    Save (upsert) a user's watchlist via Edge Function.

    Args:
        user_id: User UUID
        symbols: List of stock symbols
        email: User email (optional)

    Returns:
        dict with success status
    """
    try:
        service = get_insforge_service()
        watchlist_url = f"{service.base_url}/functions/user-watchlists"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                watchlist_url,
                headers=service.headers,
                json={
                    "user_id": user_id,
                    "symbols": symbols,
                    "email": email,
                },
                timeout=30.0,
            )

            if response.status_code in (200, 201):
                data = response.json()
                if data.get("success"):
                    return {"success": True, "data": data.get("data")}
                else:
                    error_msg = data.get("error", "Unknown error")
                    logger.error("Save watchlist failed: %s", error_msg)
                    return {"success": False, "error": error_msg}
            else:
                error_msg = response.text
                logger.error("Save watchlist failed: %s - %s", response.status_code, error_msg)
                return {"success": False, "error": f"HTTP {response.status_code}: {error_msg}"}

    except Exception as e:
        logger.exception("Exception saving user watchlist")
        return {"success": False, "error": str(e)}


async def get_user_digest_by_id(digest_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a user digest by its ID.

    Args:
        digest_id: UUID of the digest

    Returns:
        Digest data or None if not found
    """
    try:
        service = get_insforge_service()
        digest_url = f"{service.base_url}/functions/user-digests"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{digest_url}?digest_id={digest_id}",
                headers=service.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return data.get("data")
            return None

    except Exception as e:
        logger.error("Exception getting user digest by ID: %s", e)
        return None


async def list_user_digests(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    List digests for a user.

    Args:
        user_id: User UUID
        limit: Maximum number of digests to return

    Returns:
        List of digest summaries
    """
    try:
        service = get_insforge_service()
        digest_url = f"{service.base_url}/functions/user-digests"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{digest_url}?user_id={user_id}&limit={limit}",
                headers=service.headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return data.get("data", [])
            return []

    except Exception as e:
        logger.error("Exception listing user digests: %s", e)
        return []
