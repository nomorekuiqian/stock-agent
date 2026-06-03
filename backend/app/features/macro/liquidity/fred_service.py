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
from app.features.macro.cache.db import set_cached, try_db_cache

logger = get_logger(__name__)

load_dotenv()

FRED_API_KEY = os.getenv("FRED_API_KEY")
FRED_BASE_URL = "https://api.stlouisfed.org/fred"

_FRED_SEMAPHORE: asyncio.Semaphore | None = None
_CACHE_TTL = 1800  # 30 minutes — FRED data updates at most daily
_SERIES_CACHE_TTL = 1800  # 30 min cache for individual series fetches
_SERIES_DB_CACHE_TTL_HOURS = 26.0  # FRED series update daily or slower
_liquidity_cache: dict = {}
_liquidity_lock: asyncio.Lock | None = None
_series_cache: dict[str, dict] = {}  # per-series result cache
_series_locks: dict[str, asyncio.Lock] = {}

_LIQUIDITY_HISTORY_SERIES_FIELDS: dict[str, tuple[str, str, str, str, float]] = {
    "WALCL": ("fed_assets", "Federal Reserve Total Assets", "Millions of U.S. Dollars", "Weekly", 1000.0),
    "WDTGAL": ("tga", "Treasury General Account", "Millions of U.S. Dollars", "Daily", 1000.0),
    "RRPONTSYD": ("rrp", "Overnight Reverse Repurchase Agreements", "Billions of US Dollars", "Daily", 1.0),
    "WRESBAL": ("reserves", "Reserve Balances with Federal Reserve Banks", "Millions of U.S. Dollars", "Weekly", 1000.0),
    "SOFR": ("sofr", "Secured Overnight Financing Rate", "Percent", "Daily", 1.0),
    "EFFR": ("effr", "Effective Federal Funds Rate", "Percent", "Daily", 1.0),
    "NFCI": ("nfci", "Chicago Fed National Financial Conditions Index", "Index", "Weekly", 1.0),
}


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


def _get_series_lock(cache_key: str) -> asyncio.Lock:
    lock = _series_locks.get(cache_key)
    if lock is None:
        lock = asyncio.Lock()
        _series_locks[cache_key] = lock
    return lock


def _extract_series_from_liquidity_history(
    history: dict | None,
    series_id: str,
    limit: int,
    start_date: str,
    end_date: str,
) -> dict | None:
    config = _LIQUIDITY_HISTORY_SERIES_FIELDS.get(series_id)
    if not config or not isinstance(history, dict):
        return None

    field, title, units, frequency, multiplier = config
    observations = history.get("observations")
    if not isinstance(observations, list):
        return None

    rows = []
    for obs in observations:
        if not isinstance(obs, dict):
            continue
        date = obs.get("time")
        value = obs.get(field)
        if not isinstance(date, str) or value is None:
            continue
        if date < start_date or date > end_date:
            continue
        rows.append({"date": date, "value": float(value) * multiplier})

    rows.sort(key=lambda row: row["date"], reverse=True)
    if limit:
        rows = rows[:limit]
    if not rows:
        return None

    return {
        "series_id": series_id,
        "title": title,
        "units": units,
        "frequency": frequency,
        "last_updated": history.get("last_updated", ""),
        "observations": rows,
    }


async def _liquidity_history_series_fallback(
    series_id: str,
    limit: int,
    start_date: str,
    end_date: str,
) -> dict | None:
    history, _ = await try_db_cache("fred:liquidity_history")
    return _extract_series_from_liquidity_history(history, series_id, limit, start_date, end_date)


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

    memory_cache_key = f"{series_id}:{units}:{limit}:{start_date}"
    db_cache_key = f"fred:series:{series_id}:{units or 'raw'}:{limit}:{start_date}:{end_date}"
    use_db_cache = limit >= 100

    cached = _series_cache.get(memory_cache_key)
    if cached and time.time() - cached["ts"] < _SERIES_CACHE_TTL:
        return cached["data"]

    def _safe_fred_error(exc: Exception, request_name: str) -> RuntimeError:
        if isinstance(exc, httpx.HTTPStatusError):
            status = exc.response.status_code
            if status == 429:
                return RuntimeError(
                    "FRED API rate limited while fetching %s for %s" % (request_name, series_id)
                )
            return RuntimeError(
                "FRED API %s request failed with status %s for %s"
                % (request_name, status, series_id)
            )
        if isinstance(exc, httpx.RequestError):
            return RuntimeError(
                "FRED API %s request failed for %s" % (request_name, series_id)
            )
        return RuntimeError(
            "FRED API %s response failed for %s" % (request_name, series_id)
        )

    async def _get_fred_json(
        client: httpx.AsyncClient,
        path: str,
        request_name: str,
        request_params: dict,
    ) -> dict:
        try:
            response = await client.get(f"{FRED_BASE_URL}/{path}", params=request_params)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPStatusError, httpx.RequestError, ValueError) as exc:
            raise _safe_fred_error(exc, request_name) from None

    async with _get_series_lock(memory_cache_key):
        cached = _series_cache.get(memory_cache_key)
        if cached and time.time() - cached["ts"] < _SERIES_CACHE_TTL:
            return cached["data"]

        stale_db_data = None
        if use_db_cache:
            db_data, db_valid = await try_db_cache(db_cache_key)
            if db_valid and db_data:
                _series_cache[memory_cache_key] = {"data": db_data, "ts": time.time()}
                return db_data
            stale_db_data = db_data

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
                try:
                    info_data = await _get_fred_json(
                        client,
                        "series",
                        "series metadata",
                        {"series_id": series_id, "api_key": FRED_API_KEY, "file_type": "json"},
                    )
                    obs_data = await _get_fred_json(
                        client,
                        "series/observations",
                        "series observations",
                        params,
                    )
                except RuntimeError:
                    if stale_db_data:
                        logger.warning(
                            "Returning stale DB-cached FRED series for %s units=%s start=%s",
                            series_id,
                            units,
                            start_date,
                        )
                        _series_cache[memory_cache_key] = {"data": stale_db_data, "ts": time.time()}
                        return stale_db_data
                    liquidity_history_fallback = await _liquidity_history_series_fallback(
                        series_id,
                        limit,
                        start_date,
                        end_date,
                    )
                    if liquidity_history_fallback:
                        logger.warning(
                            "Returning liquidity-history fallback FRED series for %s units=%s start=%s",
                            series_id,
                            units,
                            start_date,
                        )
                        _series_cache[memory_cache_key] = {
                            "data": liquidity_history_fallback,
                            "ts": time.time(),
                        }
                        return liquidity_history_fallback
                    raise

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

        _series_cache[memory_cache_key] = {"data": result, "ts": time.time()}
        if use_db_cache and result["observations"]:
            await set_cached(db_cache_key, result, "fred", _SERIES_DB_CACHE_TTL_HOURS)
        return result


async def get_latest_value(series_id: str) -> dict:
    """Get the most recent value for a FRED series."""
    data = await fetch_fred_series(series_id, limit=5)

    if not data["observations"]:
        return {"value": None, "date": None}

    latest = data["observations"][0]

    change = None
    previous_value = None
    previous_date = None
    if len(data["observations"]) >= 2:
        current = latest["value"]
        previous_value = data["observations"][1]["value"]
        previous_date = data["observations"][1]["date"]
        if current and previous_value and previous_value != 0:
            change = ((current - previous_value) / abs(previous_value)) * 100

    return {
        "series_id": series_id,
        "title": data["title"],
        "value": latest["value"],
        "date": latest["date"],
        "units": data["units"],
        "change": change,
        "previous_value": previous_value,
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
        if db_valid and _has_liquidity_metric_values(db_data):
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

                # Use previous values already fetched by get_latest_value (no extra API calls)
                prev_fed_v = metrics["fed_assets"].get("previous_value")
                prev_tga_v = metrics["tga"].get("previous_value")
                prev_rrp_v = metrics["rrp"].get("previous_value")

                net_change = None
                if prev_fed_v is not None and prev_tga_v is not None and prev_rrp_v is not None:
                    prev_net = prev_fed_v / 1000 - prev_tga_v / 1000 - prev_rrp_v
                    if prev_net:
                        net_change = ((net_liquidity - prev_net) / abs(prev_net)) * 100

                metrics["net_liquidity"] = {
                    "series_id": "CALCULATED",
                    "title": "Net Liquidity (WALCL - TGA - RRP)",
                    "value": net_liquidity,
                    "date": metrics["fed_assets"]["date"],
                    "units": "Billions of Dollars",
                    "change": net_change,
                    "previous_date": metrics["fed_assets"].get("previous_date"),
                    "formula": "Fed Assets - TGA - RRP"
                }
            else:
                metrics["net_liquidity"] = {"value": None, "error": "Missing component data"}

        except Exception as e:
            logger.error("Error calculating net liquidity: %s", e)
            metrics["net_liquidity"] = {"value": None, "error": str(e)}

        if not _has_liquidity_metric_values(metrics):
            fallback = await _liquidity_metrics_fallback(db_data)
            if fallback:
                logger.warning("Using liquidity metrics fallback because fresh data is empty")
                _liquidity_cache["data"] = fallback
                _liquidity_cache["ts"] = time.time()
                return fallback

        _liquidity_cache["data"] = metrics
        _liquidity_cache["ts"] = time.time()
        logger.info("Cached %d metrics", len(metrics))

        return metrics


def _has_liquidity_metric_values(metrics: dict | None) -> bool:
    if not isinstance(metrics, dict):
        return False
    return any(
        isinstance(metric, dict) and metric.get("value") is not None
        for metric in metrics.values()
    )


async def _liquidity_metrics_fallback(stale_db_data: dict | None) -> dict | None:
    if _has_liquidity_metric_values(stale_db_data):
        return stale_db_data

    history, _ = await try_db_cache("fred:liquidity_history")
    if not history:
        return None
    return _build_liquidity_metrics_from_history(history)


def _build_liquidity_metrics_from_history(history: dict | None) -> dict | None:
    if not isinstance(history, dict):
        return None

    observations = history.get("observations")
    if not isinstance(observations, list) or not observations:
        return None

    latest = next((obs for obs in reversed(observations) if isinstance(obs, dict)), None)
    if not latest:
        return None

    def previous_value(key: str):
        for obs in reversed(observations[:-1]):
            if isinstance(obs, dict) and obs.get(key) is not None:
                return obs.get(key), obs.get("time")
        return None, None

    def change_pct(key: str, current):
        prev, _ = previous_value(key)
        if current is None or prev in (None, 0):
            return None
        return ((current - prev) / abs(prev)) * 100

    def metric(key: str, series_id: str, title: str, units: str) -> dict:
        current = latest.get(key)
        prev, prev_date = previous_value(key)
        return {
            "series_id": series_id,
            "title": title,
            "value": current,
            "date": latest.get("time"),
            "units": units,
            "change": change_pct(key, current),
            "previous_value": prev,
            "previous_date": prev_date,
        }

    metrics = {
        "fed_assets": metric("fed_assets", "WALCL", "Federal Reserve Total Assets", "Billions of Dollars"),
        "tga": metric("tga", "WDTGAL", "Treasury General Account", "Billions of Dollars"),
        "rrp": metric("rrp", "RRPONTSYD", "Overnight Reverse Repurchase Agreements", "Billions of Dollars"),
        "reserves": metric("reserves", "WRESBAL", "Reserve Balances with Federal Reserve Banks", "Billions of Dollars"),
        "sofr": metric("sofr", "SOFR", "Secured Overnight Financing Rate", "Percent"),
        "effr": metric("effr", "EFFR", "Effective Federal Funds Rate", "Percent"),
        "nfci": metric("nfci", "NFCI", "Chicago Fed National Financial Conditions Index", "Index"),
    }

    net_current = latest.get("value")
    net_prev, net_prev_date = previous_value("value")
    metrics["net_liquidity"] = {
        "series_id": "CALCULATED",
        "title": "Net Liquidity (WALCL - TGA - RRP)",
        "value": net_current,
        "date": latest.get("time"),
        "units": "Billions of Dollars",
        "change": change_pct("value", net_current),
        "previous_value": net_prev,
        "previous_date": net_prev_date,
        "formula": "Fed Assets - TGA - RRP",
    }

    return metrics if _has_liquidity_metric_values(metrics) else None


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

    # Build lookup for fed assets (Millions -> Billions)
    fed_by_date = {obs["date"]: obs["value"] / 1000 for obs in fed_data["observations"]}

    # Use the union of all three core series dates as backbone
    # so the chart extends as far as any component has data
    all_dates = sorted(set(fed_by_date.keys()) | set(tga_by_date.keys()) | set(rrp_by_date.keys()))

    net_liquidity_history = []

    for date in all_dates:
        fed_val = find_closest_value(fed_by_date, date)
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
