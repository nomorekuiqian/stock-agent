"""
Global Liquidity Service - Computes Global Liquidity Index from FRED data.

Formula: Fed Assets + ECB*EURUSD + BOJ*JPYUSD - TGA - RRP (all in Billions USD)
Data is monthly/weekly from FRED; 12h (T2) refresh is sufficient.
"""

import asyncio
import bisect
import time
from typing import Optional

from app.features.macro.liquidity.fred_service import (
    fetch_fred_series,
    get_latest_value,
)
from app.features.macro.cache.db import try_db_cache
from app.utils.timezone import days_ago, today_str


GLOBAL_M2_SERIES = {
    "us_m2": "M2SL",  # US M2 (Billions USD, Monthly)
}

CENTRAL_BANK_SERIES = {
    "fed_assets": "WALCL",       # Fed Total Assets (USD Millions, Weekly)
    "ecb_assets": "ECBASSETSW",  # ECB Total Assets (EUR Millions, Weekly)
    "boj_assets": "JPNASSETS",   # BOJ Total Assets (JPY 100M, Weekly)
}

DRAIN_SERIES = {
    "tga": "WDTGAL",       # Treasury General Account (USD Millions, Weekly)
    "rrp": "RRPONTSYD",    # Overnight Reverse Repo (USD Billions, Daily)
}

FX_SERIES = {
    "eurusd": "DEXUSEU",  # EUR/USD (Daily)
    "usdjpy": "DEXJPUS",  # USD/JPY (Daily)
}

_global_cache: dict = {}
_global_lock: asyncio.Lock | None = None
_CACHE_TTL = 1800  # 30 min (data is monthly/weekly, no need for fast refresh)


def _get_global_lock() -> asyncio.Lock:
    global _global_lock
    if _global_lock is None:
        _global_lock = asyncio.Lock()
    return _global_lock


def _get_cached_global():
    if _global_cache and (time.time() - _global_cache.get("ts", 0)) < _CACHE_TTL:
        return _global_cache.get("data")
    return None


async def fetch_and_compute_global_m2() -> dict:
    """
    Fetch all components and compute Global Liquidity Index.

    Global Liquidity = Fed Assets + ECB*EURUSD + BOJ*JPYUSD - TGA - RRP
    (Same formula as TradingView community Global Liquidity indicators)
    """
    all_series = {
        **GLOBAL_M2_SERIES,
        **CENTRAL_BANK_SERIES,
        **DRAIN_SERIES,
        **FX_SERIES,
    }

    async def fetch_one(key: str, series_id: str):
        try:
            return key, await get_latest_value(series_id)
        except Exception as e:
            print(f"[GlobalLiquidity] Failed to fetch {series_id}: {e}")
            return key, {"value": None, "error": str(e)}

    raw = await asyncio.gather(
        *[fetch_one(k, sid) for k, sid in all_series.items()]
    )
    raw_metrics = dict(raw)

    # Extract FX rates for currency conversion
    fx = {}
    for fx_key in FX_SERIES:
        val = raw_metrics.get(fx_key, {}).get("value")
        if val is not None:
            fx[fx_key] = val

    us_m2_val = raw_metrics.get("us_m2", {}).get("value")

    # Convert all components to Billions USD
    fed_raw = raw_metrics.get("fed_assets", {}).get("value")
    fed_usd = fed_raw / 1000 if fed_raw is not None else None

    ecb_raw = raw_metrics.get("ecb_assets", {}).get("value")
    ecb_usd = None
    if ecb_raw is not None and fx.get("eurusd") is not None:
        ecb_usd = (ecb_raw * fx["eurusd"]) / 1000

    boj_raw = raw_metrics.get("boj_assets", {}).get("value")
    boj_usd = None
    if boj_raw is not None and fx.get("usdjpy") is not None and fx["usdjpy"] != 0:
        boj_usd = (boj_raw * 1e8) / fx["usdjpy"] / 1e9

    tga_raw = raw_metrics.get("tga", {}).get("value")
    tga_usd = tga_raw / 1000 if tga_raw is not None else None

    rrp_val = raw_metrics.get("rrp", {}).get("value")

    # Global Liquidity = Fed + ECB + BOJ - TGA - RRP (all in Billions USD)
    global_total: Optional[float] = None
    if (
        fed_usd is not None
        and ecb_usd is not None
        and boj_usd is not None
        and tga_usd is not None
        and rrp_val is not None
    ):
        global_total = fed_usd + ecb_usd + boj_usd - tga_usd - rrp_val

    def _build_metric(
        series_id: str, raw_data: dict, usd_value: Optional[float], label: str
    ) -> dict:
        return {
            "series_id": series_id,
            "title": label,
            "value": round(usd_value, 2) if usd_value is not None else None,
            "raw_value": raw_data.get("value"),
            "date": raw_data.get("date"),
            "units": "Billions of U.S. Dollars",
            "change": raw_data.get("change"),
            "previous_date": raw_data.get("previous_date"),
        }

    metrics = {
        "global_liquidity": {
            "series_id": "GLOBAL_LIQUIDITY_INDEX",
            "title": "Global Liquidity Index",
            "value": round(global_total, 2) if global_total is not None else None,
            "date": raw_metrics.get("fed_assets", {}).get("date"),
            "units": "Billions of U.S. Dollars",
            "formula": "Fed Assets + ECB + BOJ - TGA - RRP",
        },
        "fed_assets": _build_metric(
            "WALCL", raw_metrics.get("fed_assets", {}),
            fed_usd, "Fed Total Assets (USD)"
        ),
        "us_m2": _build_metric(
            "M2SL", raw_metrics.get("us_m2", {}), us_m2_val, "US M2"
        ),
        "ecb_assets": _build_metric(
            "ECBASSETSW", raw_metrics.get("ecb_assets", {}),
            ecb_usd, "ECB Total Assets (USD)"
        ),
        "boj_assets": _build_metric(
            "JPNASSETS", raw_metrics.get("boj_assets", {}),
            boj_usd, "BOJ Total Assets (USD)"
        ),
        "fx_rates": {
            "eurusd": fx.get("eurusd"),
            "usdjpy": fx.get("usdjpy"),
        },
    }

    return metrics


async def get_global_liquidity_metrics() -> dict:
    """
    Get global liquidity metrics with 3-layer caching:
    in-memory (30 min) -> DB cache -> FRED API
    """
    cached = _get_cached_global()
    if cached:
        return cached

    async with _get_global_lock():
        cached = _get_cached_global()
        if cached:
            return cached

        # DB cache layer
        db_data, db_valid = await try_db_cache("fred:global_liquidity")
        if db_valid and db_data:
            print("[GlobalLiquidity] Returning DB-cached metrics")
            _global_cache["data"] = db_data
            _global_cache["ts"] = time.time()
            return db_data

        # Fetch fresh from FRED
        metrics = await fetch_and_compute_global_m2()
        _global_cache["data"] = metrics
        _global_cache["ts"] = time.time()
        print(f"[GlobalLiquidity] Cached {len(metrics)} metrics")
        return metrics


async def get_global_liquidity_history(days: int = 365) -> dict:
    """
    Build historical time series for Global Liquidity Index.
    Uses WALCL (weekly) as the date backbone for weekly resolution.
    Global Liquidity = Fed/1000 + ECB*EURUSD/1000 + BOJ*1e8/USDJPY/1e9 - TGA/1000 - RRP
    """
    # DB cache layer (only for default 365-day request)
    if days == 365:
        db_data, db_valid = await try_db_cache("fred:global_liquidity_history")
        if db_valid and db_data:
            print("[GlobalLiquidity] Returning DB-cached history")
            return db_data

    start_date = days_ago(days)
    end_date = today_str()

    async def safe_fetch(series_id: str) -> dict:
        try:
            return await fetch_fred_series(series_id, start_date, end_date, limit=500)
        except Exception as e:
            print(f"[GlobalLiquidity] Failed to fetch {series_id}: {e}")
            return {"series_id": series_id, "observations": []}

    # Fetch all series in parallel (WALCL as backbone + components)
    (
        fed_data,
        ecb_data, boj_data,
        tga_data, rrp_data,
        eurusd_data, usdjpy_data,
    ) = await asyncio.gather(
        safe_fetch("WALCL"),
        safe_fetch("ECBASSETSW"),
        safe_fetch("JPNASSETS"),
        safe_fetch("WDTGAL"),
        safe_fetch("RRPONTSYD"),
        safe_fetch("DEXUSEU"),
        safe_fetch("DEXJPUS"),
    )

    # Build lookup dicts
    def _by_date(data: dict) -> dict:
        return {obs["date"]: obs["value"] for obs in data.get("observations", [])}

    ecb_by_date = _by_date(ecb_data)
    boj_by_date = _by_date(boj_data)
    tga_by_date = _by_date(tga_data)
    rrp_by_date = _by_date(rrp_data)
    eurusd_by_date = _by_date(eurusd_data)
    usdjpy_by_date = _by_date(usdjpy_data)

    # Pre-sort date keys for efficient binary search
    ecb_sorted = sorted(ecb_by_date.keys())
    boj_sorted = sorted(boj_by_date.keys())
    tga_sorted = sorted(tga_by_date.keys())
    rrp_sorted = sorted(rrp_by_date.keys())
    eurusd_sorted = sorted(eurusd_by_date.keys())
    usdjpy_sorted = sorted(usdjpy_by_date.keys())

    def find_closest_value(sorted_dates: list, lookup_dict: dict, target_date: str):
        if target_date in lookup_dict:
            return lookup_dict[target_date]
        idx = bisect.bisect_right(sorted_dates, target_date)
        if idx > 0:
            return lookup_dict[sorted_dates[idx - 1]]
        return None

    observations = []

    for obs in fed_data.get("observations", []):
        date = obs["date"]
        fed_raw = obs["value"]
        fed_usd = fed_raw / 1000 if fed_raw is not None else None

        eur_rate = find_closest_value(eurusd_sorted, eurusd_by_date, date)
        jpy_rate = find_closest_value(usdjpy_sorted, usdjpy_by_date, date)

        ecb_raw = find_closest_value(ecb_sorted, ecb_by_date, date)
        ecb_usd = (ecb_raw * eur_rate / 1000) if ecb_raw is not None and eur_rate is not None else None

        boj_raw = find_closest_value(boj_sorted, boj_by_date, date)
        boj_usd = (boj_raw * 1e8 / jpy_rate / 1e9) if boj_raw is not None and jpy_rate not in (None, 0) else None

        tga_raw = find_closest_value(tga_sorted, tga_by_date, date)
        tga_usd = tga_raw / 1000 if tga_raw is not None else None

        rrp_val = find_closest_value(rrp_sorted, rrp_by_date, date)

        gl_value = None
        if (
            fed_usd is not None
            and ecb_usd is not None
            and boj_usd is not None
            and tga_usd is not None
            and rrp_val is not None
        ):
            gl_value = fed_usd + ecb_usd + boj_usd - tga_usd - rrp_val

        observations.append({
            "time": date,
            "value": round(gl_value, 2) if gl_value is not None else None,
        })

    observations.sort(key=lambda x: x["time"])

    return {
        "series_id": "GLOBAL_LIQUIDITY_INDEX",
        "title": "Global Liquidity Index",
        "units": "Billions of U.S. Dollars",
        "observations": observations,
    }
