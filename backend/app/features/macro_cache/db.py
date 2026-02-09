"""
Macro data cache database operations using Insforge Edge Functions.

Provides get/set operations for the macro_data_cache table.
"""

import traceback
from datetime import datetime, timezone, timedelta
from typing import Optional, Any

import httpx

from app.core.database import get_insforge_service


_FUNCTION_NAME = "macro-data-cache"


def _function_url() -> str:
    service = get_insforge_service()
    return service.function_url(_FUNCTION_NAME)


def _headers() -> dict:
    service = get_insforge_service()
    return service.headers


async def get_cached(key: str) -> Optional[dict]:
    """
    Get a single cached entry by data_key.
    Returns the full row dict (with data, fetched_at, expires_at, etc.) or None.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_function_url()}?key={key}",
                headers=_headers(),
                timeout=10.0,
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    return result.get("data")
        return None
    except Exception as e:
        print(f"[MacroCache] Error reading key={key}: {e}")
        return None


async def get_cached_many(keys: list[str]) -> dict[str, Optional[dict]]:
    """
    Batch-read multiple cache keys.
    Returns a dict mapping each key to its row (or None if missing).
    """
    result_map: dict[str, Optional[dict]] = {k: None for k in keys}
    if not keys:
        return result_map

    try:
        keys_param = ",".join(keys)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_function_url()}?keys={keys_param}",
                headers=_headers(),
                timeout=15.0,
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    for row in result.get("data", []):
                        result_map[row["data_key"]] = row
    except Exception as e:
        print(f"[MacroCache] Error batch reading keys={keys}: {e}")

    return result_map


async def set_cached(
    key: str,
    data: Any,
    source: str,
    ttl_hours: float,
    error: Optional[str] = None,
) -> bool:
    """
    Upsert a cache entry. Returns True on success.

    Args:
        key: Cache key like "fred:liquidity_metrics"
        data: JSON-serializable payload
        source: Data source ("fred", "fmp", "yfinance", "computed")
        ttl_hours: Hours until this entry is considered expired
        error: Optional error message from last fetch attempt
    """
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=ttl_hours)

    body = {
        "data_key": key,
        "data": data,
        "fetched_at": now.isoformat(),
        "expires_at": expires.isoformat(),
        "source": source,
        "error": error,
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{_function_url()}?action=upsert",
                headers=_headers(),
                json=body,
                timeout=15.0,
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    return True
                print(f"[MacroCache] Upsert failed for key={key}: {result.get('error')}")
            else:
                print(f"[MacroCache] Upsert HTTP {response.status_code} for key={key}")
        return False
    except Exception as e:
        print(f"[MacroCache] Error upserting key={key}: {e}")
        traceback.print_exc()
        return False


async def get_all_status() -> list[dict]:
    """Get status of all cache entries (for monitoring endpoint)."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_function_url()}?all=true",
                headers=_headers(),
                timeout=10.0,
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    return result.get("data", [])
        return []
    except Exception as e:
        print(f"[MacroCache] Error fetching status: {e}")
        return []


def is_cache_valid(cache_row: Optional[dict]) -> bool:
    """Check if a cache row exists and has not expired."""
    if not cache_row:
        return False
    expires_at = cache_row.get("expires_at")
    if not expires_at:
        return False
    try:
        if isinstance(expires_at, str):
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        else:
            exp = expires_at
        return datetime.now(timezone.utc) < exp
    except Exception:
        return False


def get_cache_data(cache_row: Optional[dict]) -> Optional[Any]:
    """Extract the data payload from a cache row, regardless of expiry."""
    if not cache_row:
        return None
    return cache_row.get("data")


async def try_db_cache(key: str) -> tuple[Optional[Any], bool]:
    """
    Try to read from DB cache.

    Returns:
        (data, is_valid): data payload and whether it's still within TTL.
        data may be non-None even when is_valid=False (stale data for fallback).
    """
    row = await get_cached(key)
    if row is None:
        return None, False
    data = get_cache_data(row)
    valid = is_cache_valid(row)
    return data, valid
