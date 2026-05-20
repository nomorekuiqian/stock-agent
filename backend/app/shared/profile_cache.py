"""
Shared company profile cache.

3-tier cache: memory (30 min) -> Insforge stock_profiles (30 days) -> FMP /profile.
Used by stock detail agents and personal digest (brew) so any LLM that reasons
about a ticker gets authoritative company facts (name, sector, industry,
description) instead of relying on its training-data knowledge.

Lives in shared/ to avoid coupling brew -> features.stock. Calls the
"stock-data" Insforge edge function directly (the same function stock/db.py
uses) so DB rows stay in one table.
"""

from __future__ import annotations

import asyncio
import json
import threading
from datetime import datetime, timedelta
from typing import Any, Optional

from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.shared.data_tools.fundamentals import get_company_profile

logger = get_logger(__name__)

PROFILE_TTL_DAYS = 30
MEMORY_TTL_MINUTES = 30
MEMORY_MAX_SIZE = 500

_memory_cache: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def _evict_expired(cache: dict[str, dict[str, Any]]) -> None:
    now = datetime.now()
    expired = [k for k, v in cache.items() if now >= v["expires"]]
    for k in expired:
        del cache[k]
    if len(cache) > MEMORY_MAX_SIZE:
        sorted_keys = sorted(cache.keys(), key=lambda k: cache[k]["expires"])
        for k in sorted_keys[: len(cache) - MEMORY_MAX_SIZE]:
            del cache[k]


def _memory_get(symbol: str) -> Optional[dict[str, Any]]:
    with _lock:
        entry = _memory_cache.get(symbol)
        if entry and datetime.now() < entry["expires"]:
            return {**entry["data"]}
    return None


def _memory_set(symbol: str, data: dict[str, Any]) -> None:
    with _lock:
        _evict_expired(_memory_cache)
        _memory_cache[symbol] = {
            "data": data,
            "expires": datetime.now() + timedelta(minutes=MEMORY_TTL_MINUTES),
        }


def _is_db_fresh(cached: dict[str, Any]) -> bool:
    updated_at = cached.get("updated_at")
    if not isinstance(updated_at, str):
        return False
    try:
        updated_dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        cutoff = datetime.now(updated_dt.tzinfo) - timedelta(days=PROFILE_TTL_DAYS)
        return updated_dt > cutoff
    except (ValueError, TypeError):
        return False


def _parse_jsonb(data: dict[str, Any], fields: list[str]) -> dict[str, Any]:
    if not data:
        return data
    for field in fields:
        value = data.get(field)
        if isinstance(value, str):
            try:
                data[field] = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                pass
    return data


async def _db_get(symbol: str) -> Optional[dict[str, Any]]:
    try:
        db = get_insforge_service()
        result = await db.call_function(
            "stock-data",
            method="GET",
            params={"action": "get_profile", "symbol": symbol},
            timeout=30.0,
        )
        if result["status_code"] == 200:
            payload = result.get("data", {})
            if payload.get("success"):
                profile = payload.get("data")
                return _parse_jsonb(
                    profile, ["classification", "description", "company_details"]
                )
        return None
    except Exception as e:
        logger.error("profile_cache db_get %s failed: %s: %s", symbol, type(e).__name__, e)
        return None


async def _db_upsert(symbol: str, profile: dict[str, Any]) -> None:
    try:
        db = get_insforge_service()
        body = {
            "symbol": symbol.upper(),
            "company_name": profile.get("company_name", ""),
            "company_name_zh": profile.get("company_name_zh"),
            "exchange": profile.get("exchange"),
            "classification": profile.get("classification"),
            "description": profile.get("description"),
            "company_details": profile.get("company_details"),
            "data_source": profile.get("data_source", "fmp"),
        }
        await db.call_function(
            "stock-data",
            method="POST",
            params={"action": "upsert_profile"},
            json_body=body,
            timeout=30.0,
        )
    except Exception as e:
        logger.error("profile_cache db_upsert %s failed: %s: %s", symbol, type(e).__name__, e)


async def get_profile_cached(symbol: str) -> dict[str, Any]:
    """
    Fetch company profile with 3-tier cache. Returns {} if not found.

    Returned dict shape (matches fmp_service.get_company_profile_detail output):
        {
          "company_name": str,
          "company_name_zh": str | None,
          "exchange": str,
          "classification": {"sector": str, "industry": str},
          "description": {"en": str, "zh": str | None},
          "company_details": {...},
        }
    """
    if not symbol:
        return {}
    symbol = symbol.upper()

    cached = _memory_get(symbol)
    if cached:
        return cached

    db_cached = await _db_get(symbol)
    if db_cached and _is_db_fresh(db_cached):
        _memory_set(symbol, db_cached)
        return {**db_cached}

    logger.info("profile_cache miss, fetching FMP for %s", symbol)
    profile = await asyncio.to_thread(get_company_profile, symbol)
    if profile:
        _memory_set(symbol, profile)
        task = asyncio.create_task(_db_upsert(symbol, profile))
        task.add_done_callback(
            lambda t: logger.error("profile_cache async upsert error: %s", t.exception())
            if t.exception() else None
        )
        return profile
    return {}


async def get_profiles_cached(symbols: list[str]) -> dict[str, dict[str, Any]]:
    """Batch fetch. Returns {symbol: profile_dict}; symbols with no data are absent."""
    if not symbols:
        return {}
    unique = list({s.upper() for s in symbols if s})
    results = await asyncio.gather(
        *[get_profile_cached(s) for s in unique], return_exceptions=True
    )
    out: dict[str, dict[str, Any]] = {}
    for sym, profile in zip(unique, results):
        if isinstance(profile, BaseException):
            logger.warning("profile_cache batch failure for %s: %s", sym, profile)
            continue
        if profile:
            out[sym] = profile
    return out


def summarize_for_prompt(profile: Optional[dict[str, Any]]) -> dict[str, Any]:
    """
    Reduce a profile to the minimal fields useful for grounding an LLM prompt.
    Keeps token usage low (~60 tokens per stock).
    """
    if not profile:
        return {}
    classification = profile.get("classification") or {}
    description = profile.get("description") or {}
    desc_zh = (description.get("zh") or "").strip()
    desc_en = (description.get("en") or "").strip()
    desc = desc_zh[:150] if desc_zh else desc_en[:150]
    return {
        "company_name": profile.get("company_name"),
        "company_name_zh": profile.get("company_name_zh"),
        "sector": classification.get("sector"),
        "industry": classification.get("industry"),
        "description": desc or None,
    }
