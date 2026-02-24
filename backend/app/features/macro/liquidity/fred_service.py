"""
FRED API Service for Macro Liquidity Data

Provides access to Federal Reserve Economic Data (FRED) for:
- Fed Balance Sheet (WALCL)
- Treasury General Account (WDTGAL)
- Overnight Reverse Repo (RRPONTSYD)
- Bank Reserves (WRESBAL)
- SOFR, EFFR rates
- NFCI (Financial Conditions Index)
"""

import os
import asyncio
import time
from typing import Optional
import httpx
from dotenv import load_dotenv

from app.core.logging import get_logger
from app.utils.timezone import today_str, days_ago
from app.features.macro.cache.db import try_db_cache

logger = get_logger(__name__)

load_dotenv()

FRED_API_KEY = os.getenv("FRED_API_KEY")
FRED_BASE_URL = "https://api.stlouisfed.org/fred"

_FRED_SEMAPHORE: asyncio.Semaphore | None = None
_CACHE_TTL = 600  # 10 minutes
_SERIES_CACHE_TTL = 300  # 5 min cache for individual series fetches
_liquidity_cache: dict = {}
_liquidity_lock: asyncio.Lock | None = None
_series_cache: dict[str, dict] = {}  # per-series result cache


def _get_semaphore() -> asyncio.Semaphore:
    global _FRED_SEMAPHORE
    if _FRED_SEMAPHORE is None:
        _FRED_SEMAPHORE = asyncio.Semaphore(5)
    return _FRED_SEMAPHORE


def _get_liquidity_lock() -> asyncio.Lock:
    global _liquidity_lock
    if _liquidity_lock is None:
        _liquidity_lock = asyncio.Lock()
    return _liquidity_lock


def _get_cached_liquidity():
    if _liquidity_cache and (time.time() - _liquidity_cache.get("ts", 0)) < _CACHE_TTL:
        return _liquidity_cache.get("data")
    return None


LIQUIDITY_SERIES = {
    "fed_assets": "WALCL",       # Fed Total Assets (Billions, Weekly)
    "tga": "WDTGAL",             # Treasury General Account (Millions, Weekly)
    "rrp": "RRPONTSYD",          # Overnight Reverse Repo (Billions, Daily)
    "reserves": "WRESBAL",       # Reserve Balances (Billions, Weekly)
    "sofr": "SOFR",              # SOFR Rate (Percent, Daily)
    "effr": "EFFR",              # Effective Fed Funds Rate (Percent, Daily)
    "nfci": "NFCI",              # Financial Conditions Index (Weekly)
}


async def fetch_fred_series(
    series_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
    units: Optional[str] = None,
) -> dict:
    """Fetch a single FRED series with info and observations.

    Results are cached for 5 minutes to avoid redundant API calls when
    multiple service functions request the same series during a refresh cycle.

    Args:
        units: FRED units transformation. Common values:
            None  - raw index level (default)
            "pc1" - Percent Change from Year Ago (YoY%)
            "pch" - Percent Change (MoM% for monthly series)
    """
    if not FRED_API_KEY:
        raise ValueError("FRED_API_KEY not configured")

    if not end_date:
        end_date = today_str()
    if not start_date:
        start_date = days_ago(730)

    cache_key = f"{series_id}:{units}:{limit}:{start_date}"
    cached = _series_cache.get(cache_key)
    if cached and time.time() - cached["ts"] < _SERIES_CACHE_TTL:
        return cached["data"]

    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "observation_start": start_date,
        "observation_end": end_date,
        "sort_order": "desc",
        "limit": limit,
    }
    if units:
        params["units"] = units

    async with _get_semaphore():
        async with httpx.AsyncClient() as client:
            info_response = await client.get(
                f"{FRED_BASE_URL}/series",
                params={"series_id": series_id, "api_key": FRED_API_KEY, "file_type": "json"}
            )
            info_response.raise_for_status()
            info_data = info_response.json()

            obs_response = await client.get(
                f"{FRED_BASE_URL}/series/observations",
                params=params
            )
            obs_response.raise_for_status()
            obs_data = obs_response.json()

    series_info = info_data.get("seriess", [{}])[0]
    observations = obs_data.get("observations", [])

    result = {
        "series_id": series_id,
        "title": series_info.get("title", ""),
        "units": series_info.get("units", ""),
        "frequency": series_info.get("frequency", ""),
        "last_updated": series_info.get("last_updated", ""),
        "observations": [
            {
                "date": obs["date"],
                "value": float(obs["value"]) if obs["value"] != "." else None
            }
            for obs in observations
            if obs["value"] != "."
        ]
    }

    _series_cache[cache_key] = {"data": result, "ts": time.time()}
    return result


async def get_latest_value(series_id: str) -> dict:
    """Get the most recent value for a FRED series."""
    data = await fetch_fred_series(series_id, limit=5)

    if not data["observations"]:
        return {"value": None, "date": None}

    latest = data["observations"][0]

    change = None
    previous_date = None
    if len(data["observations"]) >= 2:
        current = latest["value"]
        previous = data["observations"][1]["value"]
        previous_date = data["observations"][1]["date"]
        if current and previous and previous != 0:
            change = ((current - previous) / abs(previous)) * 100

    return {
        "series_id": series_id,
        "title": data["title"],
        "value": latest["value"],
        "date": latest["date"],
        "units": data["units"],
        "change": change,
        "previous_date": previous_date,
    }


async def get_all_liquidity_metrics() -> dict:
    """
    Fetch all key liquidity metrics in parallel.
    Uses in-memory cache (10 min TTL) + request coalescing to avoid FRED rate limits.
    """
    cached = _get_cached_liquidity()
    if cached:
        return cached

    async with _get_liquidity_lock():
        cached = _get_cached_liquidity()
        if cached:
            logger.info("Returning cached data (coalesced)")
            return cached

        # DB cache layer
        db_data, db_valid = await try_db_cache("fred:liquidity_metrics")
        if db_valid and db_data:
            logger.info("Returning DB-cached metrics")
            _liquidity_cache["data"] = db_data
            _liquidity_cache["ts"] = time.time()
            return db_data

        async def fetch_with_error_handling(key: str, series_id: str):
            try:
                return key, await get_latest_value(series_id)
            except Exception as e:
                logger.error("Error fetching %s: %s", series_id, e)
                return key, {"value": None, "error": str(e)}

        results = await asyncio.gather(
            *[fetch_with_error_handling(k, sid) for k, sid in LIQUIDITY_SERIES.items()]
        )

        metrics = {key: value for key, value in results}

        # Net Liquidity = Fed Assets - TGA - RRP
        # Units: WALCL (Millions), WDTGAL (Millions), RRPONTSYD (Billions)
        try:
            fed_assets = metrics["fed_assets"]["value"] / 1000 if metrics["fed_assets"]["value"] else None
            tga = metrics["tga"]["value"] / 1000 if metrics["tga"]["value"] else None
            rrp = metrics["rrp"]["value"]

            if fed_assets is not None and tga is not None and rrp is not None:
                net_liquidity = fed_assets - tga - rrp

                # Get previous values for change calculation
                fed_data = await fetch_fred_series("WALCL", limit=5)
                tga_data = await fetch_fred_series("WDTGAL", limit=5)
                rrp_data = await fetch_fred_series("RRPONTSYD", limit=5)

                prev_fed_v = fed_data["observations"][1]["value"] if len(fed_data["observations"]) >= 2 else None
                prev_tga_v = tga_data["observations"][1]["value"] if len(tga_data["observations"]) >= 2 else None
                prev_rrp_v = rrp_data["observations"][1]["value"] if len(rrp_data["observations"]) >= 2 else None

                if prev_fed_v is not None and prev_tga_v is not None and prev_rrp_v is not None:
                    prev_net = prev_fed_v / 1000 - prev_tga_v / 1000 - prev_rrp_v
                    net_change = ((net_liquidity - prev_net) / abs(prev_net)) * 100 if prev_net else None
                else:
                    net_change = None

                metrics["net_liquidity"] = {
                    "series_id": "CALCULATED",
                    "title": "Net Liquidity (WALCL - TGA - RRP)",
                    "value": net_liquidity,
                    "date": metrics["fed_assets"]["date"],
                    "units": "Billions of Dollars",
                    "change": net_change,
                    "previous_date": fed_data["observations"][1]["date"] if len(fed_data["observations"]) >= 2 else None,
                    "formula": "Fed Assets - TGA - RRP"
                }
            else:
                metrics["net_liquidity"] = {"value": None, "error": "Missing component data"}

        except Exception as e:
            logger.error("Error calculating net liquidity: %s", e)
            metrics["net_liquidity"] = {"value": None, "error": str(e)}

        _liquidity_cache["data"] = metrics
        _liquidity_cache["ts"] = time.time()
        logger.info("Cached %d metrics", len(metrics))

        return metrics


async def get_liquidity_history(days: int = 365) -> dict:
    """Fetch historical data for net liquidity calculation including reserves, rates, and NFCI."""
    # DB cache layer (only for default 365-day request)
    if days == 365:
        db_data, db_valid = await try_db_cache("fred:liquidity_history")
        if db_valid and db_data:
            logger.info("Returning DB-cached history")
            return db_data

    start_date = days_ago(days)
    end_date = today_str()

    async def safe_fetch(series_id: str) -> dict:
        try:
            return await fetch_fred_series(series_id, start_date, end_date, limit=500)
        except Exception as e:
            logger.error("Failed to fetch %s: %s", series_id, e)
            return {"series_id": series_id, "title": "", "units": "", "frequency": "", "last_updated": "", "observations": []}

    fed_data, tga_data, rrp_data, reserves_data, sofr_data, effr_data, nfci_data = await asyncio.gather(
        safe_fetch("WALCL"),
        safe_fetch("WDTGAL"),
        safe_fetch("RRPONTSYD"),
        safe_fetch("WRESBAL"),
        safe_fetch("SOFR"),
        safe_fetch("EFFR"),
        safe_fetch("NFCI"),
    )

    # Lookup dicts by date (Millions converted to Billions where needed)
    tga_by_date = {obs["date"]: obs["value"] / 1000 for obs in tga_data["observations"]}
    rrp_by_date = {obs["date"]: obs["value"] for obs in rrp_data["observations"]}
    reserves_by_date = {obs["date"]: obs["value"] / 1000 for obs in reserves_data["observations"]}
    sofr_by_date = {obs["date"]: obs["value"] for obs in sofr_data["observations"]}
    effr_by_date = {obs["date"]: obs["value"] for obs in effr_data["observations"]}
    nfci_by_date = {obs["date"]: obs["value"] for obs in nfci_data["observations"]}

    def find_closest_value(lookup_dict, target_date):
        if target_date in lookup_dict:
            return lookup_dict[target_date]
        for d in sorted(lookup_dict.keys(), reverse=True):
            if d <= target_date:
                return lookup_dict[d]
        return None

    net_liquidity_history = []

    for obs in fed_data["observations"]:
        date = obs["date"]
        fed_val = obs["value"] / 1000

        tga_val = find_closest_value(tga_by_date, date)
        rrp_val = find_closest_value(rrp_by_date, date)
        reserves_val = find_closest_value(reserves_by_date, date)
        sofr_val = find_closest_value(sofr_by_date, date)
        effr_val = find_closest_value(effr_by_date, date)
        nfci_val = find_closest_value(nfci_by_date, date)

        if fed_val is not None and tga_val is not None and rrp_val is not None:
            net_liquidity_history.append({
                "time": date,
                "value": round(fed_val - tga_val - rrp_val, 2),
                "fed_assets": fed_val,
                "tga": tga_val,
                "rrp": rrp_val,
                "reserves": reserves_val,
                "sofr": sofr_val,
                "effr": effr_val,
                "nfci": nfci_val,
            })

    net_liquidity_history.sort(key=lambda x: x["time"])

    metrics = None
    if len(net_liquidity_history) >= 2:
        latest = net_liquidity_history[-1]
        previous = net_liquidity_history[-2]

        def calc_change(current, prev):
            if current is not None and prev is not None and prev != 0:
                return ((current - prev) / abs(prev)) * 100
            return None

        def build_metric(series_id: str, data: dict, default_title: str, default_units: str) -> dict:
            obs = data["observations"]
            latest_val = obs[0]["value"] if obs else None
            prev_val = obs[1]["value"] if len(obs) > 1 else None
            return {
                "series_id": series_id,
                "title": data.get("title", default_title),
                "value": latest_val,
                "date": obs[0]["date"] if obs else None,
                "units": data.get("units", default_units),
                "change": calc_change(latest_val, prev_val),
                "previous_date": obs[1]["date"] if len(obs) > 1 else None,
            }

        metrics = {
            "fed_assets": build_metric("WALCL", fed_data, "Fed Total Assets", "Millions of U.S. Dollars"),
            "tga": build_metric("WDTGAL", tga_data, "Treasury General Account", "Millions of U.S. Dollars"),
            "rrp": build_metric("RRPONTSYD", rrp_data, "Overnight Reverse Repo", "Billions of US Dollars"),
            "reserves": build_metric("WRESBAL", reserves_data, "Bank Reserves", "Millions of U.S. Dollars"),
            "sofr": build_metric("SOFR", sofr_data, "SOFR", "Percent"),
            "effr": build_metric("EFFR", effr_data, "Effective Federal Funds Rate", "Percent"),
            "nfci": build_metric("NFCI", nfci_data, "Chicago Fed National Financial Conditions Index", "Index"),
            "net_liquidity": {
                "series_id": "CALCULATED",
                "title": "Net Liquidity (WALCL - TGA - RRP)",
                "value": latest["value"],
                "date": latest["time"],
                "units": "Billions of Dollars",
                "change": calc_change(latest["value"], previous["value"]),
                "previous_date": previous["time"],
                "formula": "Fed Assets - TGA - RRP",
            },
        }

    return {
        "series_id": "NET_LIQUIDITY",
        "title": "Net Liquidity",
        "units": "Billions of Dollars",
        "formula": "WALCL - TGA - RRP",
        "observations": net_liquidity_history,
        "metrics": metrics,
    }
