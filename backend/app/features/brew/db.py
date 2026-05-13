"""
Digest database operations using Insforge Edge Functions.

Provides save and retrieve operations for personalized user digests.
"""

from typing import Optional, Dict, Any, List

import asyncio

import httpx

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.utils.timezone import today_str

logger = get_logger(__name__)


def _watchlist_headers(base_headers: Dict[str, str]) -> Dict[str, str]:
    """Build headers for user-watchlists Edge Function calls."""
    headers = dict(base_headers)
    if EDGE_FUNCTION_SECRET:
        headers["X-Internal-Secret"] = EDGE_FUNCTION_SECRET
    return headers


def _validate_digest_quality(digest_data: Dict[str, Any]) -> Optional[str]:
    """Validate digest data quality before saving. Returns error message or None."""
    stocks = digest_data.get("stocks", [])
    if not stocks:
        return "No stocks data"

    required_stock_fields = ("symbol", "name", "daily_change", "status")
    for stock in stocks:
        missing = [f for f in required_stock_fields if not stock.get(f)]
        if missing:
            return "Incomplete stock data for %s: missing %s" % (
                stock.get("symbol", "?"), ", ".join(missing)
            )

    if not digest_data.get("one_line_summary"):
        return "Missing one_line_summary"

    return None


async def save_user_digest(digest_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save a personal digest to the database (always creates new record).

    Validates data quality before saving to prevent incomplete records.

    Args:
        digest_data: Dictionary containing digest data including user_id

    Returns:
        dict with success status and saved digest ID
    """
    try:
        quality_error = _validate_digest_quality(digest_data)
        if quality_error:
            logger.warning(
                "Rejected digest save for user %s: %s",
                digest_data.get("user_id", "?")[:8], quality_error,
            )
            return {"success": False, "error": f"Quality check failed: {quality_error}"}
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
            # Full structured data. Round-2 fields (action_items,
            # portfolio_summary) must be persisted here so cache-hit reads in
            # router and service see the same shape as fresh-generation reads.
            # Without this, the Action Bar appears empty on any cached digest.
            "digest_data": {
                "stocks": digest_data.get("stocks", []),
                "news": digest_data.get("news", {}),
                "events": digest_data.get("events", []),
                "summary": digest_data.get("summary", {}),
                "action_items": digest_data.get("action_items", []),
                "portfolio_summary": digest_data.get("portfolio_summary", ""),
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
    max_attempts = 2
    for attempt in range(max_attempts):
        try:
            service = get_insforge_service()
            watchlist_url = f"{service.base_url}/functions/user-watchlists"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{watchlist_url}?user_id={user_id}",
                    headers=_watchlist_headers(service.headers),
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        result = data.get("data")
                        if result is None:
                            logger.info(
                                "Watchlist for user %s: success=true but data=null "
                                "(user has no watchlist)",
                                user_id[:12],
                            )
                            return {
                                "user_id": user_id,
                                "symbols": [],
                                "email": "",
                            }
                        return result
                    logger.warning(
                        "Watchlist for user %s: status=200 but success=%s, "
                        "error=%s (attempt %d/%d)",
                        user_id[:12], data.get("success"),
                        data.get("error", "none"), attempt + 1, max_attempts,
                    )
                else:
                    body = response.text[:200]
                    logger.warning(
                        "Watchlist for user %s: HTTP %s (attempt %d/%d) body=%s",
                        user_id[:12], response.status_code,
                        attempt + 1, max_attempts, body,
                    )
        except Exception as e:
            if attempt < max_attempts - 1:
                logger.warning(
                    "Watchlist error for user %s (attempt %d/%d): %s",
                    user_id[:12], attempt + 1, max_attempts, e,
                )
            else:
                logger.exception(
                    "Watchlist failed for user %s after %d attempts",
                    user_id[:12], max_attempts,
                )
                return None
        if attempt < max_attempts - 1:
            await asyncio.sleep(3)
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


async def save_user_watchlist(
    user_id: str,
    symbols: List[str],
    email: str = "",
    base_updated_at: str | None = None,
) -> Dict[str, Any]:
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
                headers=_watchlist_headers(service.headers),
                json={
                    "user_id": user_id,
                    "symbols": symbols,
                    "email": email,
                    "base_updated_at": base_updated_at,
                },
                timeout=30.0,
            )

            if response.status_code in (200, 201):
                data = response.json()
                if data.get("success"):
                    return {"success": True, "data": data.get("data"), "status_code": response.status_code}
                else:
                    error_msg = data.get("error", "Unknown error")
                    logger.error("Save watchlist failed: %s", error_msg)
                    return {"success": False, "error": error_msg, "status_code": response.status_code}
            else:
                try:
                    error_json = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                except Exception:
                    error_json = {}
                error_msg = error_json.get("error") or response.text
                logger.error("Save watchlist failed: %s - %s", response.status_code, error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "status_code": response.status_code,
                }

    except Exception as e:
        logger.exception("Exception saving user watchlist")
        return {"success": False, "error": str(e), "status_code": 500}


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


async def resolve_digest_id_by_date(user_id: str, date: str) -> Optional[str]:
    """Resolve a YYYY-MM-DD date into the user's digest UUID, if one exists.

    Used by action_items validator as the fallback path when an in-memory
    cache (limit=30) misses. The broader limit lets LLM references up to
    six months back still resolve.
    """
    target = date[:10]
    # Wider window than the service.py cache (30) so the fallthrough buys real
    # range. If the user has >180 digests the corner case isn't worth
    # structured-query investment.
    digests = await list_user_digests(user_id, limit=180)
    for d in digests:
        raw = (d.get("digest_date") or "")[:10]
        if raw == target:
            return d.get("digest_id") or d.get("id")
    return None
