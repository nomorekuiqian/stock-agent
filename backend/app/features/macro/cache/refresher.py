"""
Macro data cache refresher - fetches external data and stores in DB.

Tier 1 (every 4h): FRED daily data, FMP treasury rates, CNN, VIX/sentiment
Tier 2 (every 12h): Computed dashboards (macro risk, economy, inflation, sentiment),
                     liquidity percentiles (from Tier 3 history)
Tier 3 (every 24h): Calendars, liquidity history (365 days)
"""

import asyncio
import bisect
import traceback
from typing import Any

from app.features.macro.cache.db import set_cached, get_cached, get_cache_data


# ---------------------------------------------------------------------------
# TTL constants (hours)
# ---------------------------------------------------------------------------
TTL_T1 = 5.0    # 4h refresh cycle, 5h TTL for safety margin
TTL_T2 = 14.0   # 12h refresh cycle
TTL_T3 = 26.0   # 24h refresh cycle


async def _safe_set(key: str, data: Any, source: str, ttl: float) -> bool:
    """Write to DB cache, log errors but don't raise."""
    try:
        ok = await set_cached(key, data, source, ttl)
        if ok:
            print(f"[Refresher] Cached {key}")
        else:
            print(f"[Refresher] FAILED to cache {key}")
        return ok
    except Exception as e:
        print(f"[Refresher] Error caching {key}: {e}")
        return False


async def _safe_set_with_error(key: str, source: str, ttl: float, error: str) -> None:
    """Record a fetch failure in DB - keep old data, update error field."""
    try:
        existing = await get_cached(key)
        old_data = existing.get("data") if existing else None
        await set_cached(key, old_data, source, min(ttl, 1.0), error=error)
    except Exception:
        pass


async def refresh_tier1() -> dict:
    """
    Fetch and cache:
    - fred:liquidity_metrics (SOFR, EFFR, RRP, etc.)
    - macro:treasury_rates (FMP treasury yield curve with daily change)
    - macro:sentiment (CNN Fear&Greed + VIX/breadth/credit)
    Note: Commodities & dollar are always fetched real-time, not cached in DB.
    """
    results = {}

    # 1. Liquidity metrics (FRED)
    try:
        from app.features.macro.liquidity.fred_service import (
            get_latest_value, LIQUIDITY_SERIES, fetch_fred_series,
        )

        async def fetch_one(key, sid):
            try:
                return key, await get_latest_value(sid)
            except Exception as e:
                return key, {"value": None, "error": str(e)}

        raw = await asyncio.gather(
            *[fetch_one(k, sid) for k, sid in LIQUIDITY_SERIES.items()]
        )
        metrics = dict(raw)

        # Calculate net liquidity
        try:
            fed = metrics["fed_assets"]["value"]
            tga = metrics["tga"]["value"]
            rrp = metrics["rrp"]["value"]
            if fed is not None and tga is not None and rrp is not None:
                fed_b = fed / 1000
                tga_b = tga / 1000
                net = fed_b - tga_b - rrp

                fed_data = await fetch_fred_series("WALCL", limit=5)
                tga_data = await fetch_fred_series("WDTGAL", limit=5)
                rrp_data = await fetch_fred_series("RRPONTSYD", limit=5)

                prev_fed = fed_data["observations"][1]["value"] if len(fed_data["observations"]) >= 2 else None
                prev_tga = tga_data["observations"][1]["value"] if len(tga_data["observations"]) >= 2 else None
                prev_rrp = rrp_data["observations"][1]["value"] if len(rrp_data["observations"]) >= 2 else None

                net_change = None
                if prev_fed is not None and prev_tga is not None and prev_rrp is not None:
                    prev_net = prev_fed / 1000 - prev_tga / 1000 - prev_rrp
                    if prev_net:
                        net_change = ((net - prev_net) / abs(prev_net)) * 100

                metrics["net_liquidity"] = {
                    "series_id": "CALCULATED",
                    "title": "Net Liquidity (WALCL - TGA - RRP)",
                    "value": net,
                    "date": metrics["fed_assets"]["date"],
                    "units": "Billions of Dollars",
                    "change": net_change,
                    "formula": "Fed Assets - TGA - RRP",
                }
            else:
                metrics["net_liquidity"] = {"value": None, "error": "Missing component data"}
        except Exception as e:
            metrics["net_liquidity"] = {"value": None, "error": str(e)}

        ok = await _safe_set("fred:liquidity_metrics", metrics, "fred", TTL_T1)
        results["fred:liquidity_metrics"] = ok
    except Exception as e:
        print(f"[Refresher] T1 liquidity_metrics error: {e}")
        traceback.print_exc()
        await _safe_set_with_error("fred:liquidity_metrics", "fred", TTL_T1, str(e))
        results["fred:liquidity_metrics"] = False

    # 2. Treasury rates only (commodities are always fetched real-time)
    try:
        from app.shared.fmp_service import get_fmp_service
        fmp = get_fmp_service()
        treasury_data = fmp.get_treasury_rates_with_change()

        from app.features.macro.risk.service import _get_cache, _set_cached
        _set_cached(_get_cache("treasury_rates"), treasury_data)

        ok = await _safe_set("macro:treasury_rates", treasury_data, "fmp", TTL_T1)
        results["macro:treasury_rates"] = ok
    except Exception as e:
        print(f"[Refresher] T1 treasury_rates error: {e}")
        traceback.print_exc()
        await _safe_set_with_error("macro:treasury_rates", "fmp", TTL_T1, str(e))
        results["macro:treasury_rates"] = False

    # 3. Market Sentiment (CNN + VIX/breadth/credit)
    try:
        from app.features.macro.risk.service import get_market_sentiment, _get_cache
        _get_cache("sentiment").clear()

        data = await get_market_sentiment(skip_db_cache=True)
        ok = await _safe_set("macro:sentiment", data.model_dump(), "computed", TTL_T1)
        results["macro:sentiment"] = ok
    except Exception as e:
        print(f"[Refresher] T1 sentiment error: {e}")
        traceback.print_exc()
        await _safe_set_with_error("macro:sentiment", "computed", TTL_T1, str(e))
        results["macro:sentiment"] = False

    return results


def _compute_liquidity_context(history: dict) -> dict | None:
    """
    Compute summary statistics from liquidity history (365 days).
    Returns compact dict with percentiles, multi-period changes, and ranges.
    """
    observations = history.get("observations", [])
    if len(observations) < 4:
        return None

    def _series_stats(values: list[float]) -> dict:
        """Compute percentile rank, range, and multi-period changes for a series."""
        if not values:
            return {}
        current = values[-1]
        sorted_vals = sorted(values)
        rank = bisect.bisect_right(sorted_vals, current)
        percentile = round((rank / len(sorted_vals)) * 100)

        stats: dict = {
            "current": round(current, 2),
            "percentile_1y": percentile,
            "52w_high": round(max(values), 2),
            "52w_low": round(min(values), 2),
        }

        # Multi-period changes (WALCL is weekly: ~4/mo, ~13/3mo, ~26/6mo, ~52/yr)
        if len(values) >= 5:
            stats["1m_change"] = round(current - values[-5], 2)
        if len(values) >= 13:
            stats["3m_change"] = round(current - values[-13], 2)
        if len(values) >= 26:
            stats["6m_change"] = round(current - values[-26], 2)
        if len(values) >= 52:
            stats["1y_change"] = round(current - values[-52], 2)

        return stats

    def _extract(key: str) -> list[float]:
        return [o[key] for o in observations if isinstance(o, dict) and o.get(key) is not None]

    series_keys = {
        "net_liquidity": "value",
        "fed_assets": "fed_assets",
        "tga": "tga",
        "rrp": "rrp",
        "nfci": "nfci",
    }

    context: dict = {}
    for ctx_key, obs_key in series_keys.items():
        vals = _extract(obs_key)
        if vals:
            context[ctx_key] = _series_stats(vals)

    if "net_liquidity" in context:
        context["net_liquidity"]["units"] = "Billions USD"

    return context if context else None


async def refresh_tier2() -> dict:
    """
    Fetch and cache computed dashboards:
    - macro:dashboard (macro risk dashboard with 4 categories)
    - macro:economy (economic fundamentals with sub-dimensions)
    - macro:inflation_rates (inflation & rates with sub-dimensions)
    - fred:cpi_breakdown (CPI component breakdown)
    - macro:liquidity_percentiles (percentile/trend stats from Tier 3 history)
    """
    results = {}

    refresh_tasks = [
        ("macro:dashboard", _refresh_dashboard),
        ("macro:economy", _refresh_economy),
        ("macro:inflation_rates", _refresh_inflation_rates),
        ("fred:cpi_breakdown", _refresh_cpi_breakdown),
        ("macro:liquidity_percentiles", _refresh_liquidity_percentiles),
        ("fred:global_liquidity", _refresh_global_liquidity),
    ]

    for key, fn in refresh_tasks:
        try:
            ok = await fn()
            results[key] = ok
        except Exception as e:
            print(f"[Refresher] T2 {key} error: {e}")
            traceback.print_exc()
            results[key] = False
        # Small delay between tasks to avoid FRED API rate limiting
        await asyncio.sleep(2)

    return results


async def _refresh_dashboard() -> bool:
    from app.features.macro.risk.service import get_macro_risk_dashboard, _get_cache
    _get_cache("dashboard").clear()
    data = await get_macro_risk_dashboard(skip_db_cache=True)
    return await _safe_set("macro:dashboard", data.model_dump(), "computed", TTL_T2)


async def _refresh_economy() -> bool:
    from app.features.macro.risk.service import get_economic_fundamentals, _get_cache
    _get_cache("economy").clear()
    data = await get_economic_fundamentals(skip_db_cache=True)
    return await _safe_set("macro:economy", data.model_dump(), "computed", TTL_T2)


async def _refresh_inflation_rates() -> bool:
    from app.features.macro.risk.service import get_inflation_rates, _get_cache
    _get_cache("inflation").clear()
    data = await get_inflation_rates(skip_db_cache=True)
    return await _safe_set("macro:inflation_rates", data.model_dump(), "computed", TTL_T2)


async def _refresh_cpi_breakdown() -> bool:
    from app.features.macro.risk.service import get_cpi_breakdown, _get_cache
    _get_cache("cpi").clear()
    data = await get_cpi_breakdown(skip_db_cache=True)
    payload = data.model_dump()
    # Validate: don't cache if any component has null yoy_pct (FRED rate limit failure)
    null_components = [
        c["name"] for c in payload.get("components", [])
        if c.get("yoy_pct") is None
    ]
    if null_components:
        print(f"[Refresher] CPI breakdown has null components: {null_components}, skipping DB cache")
        await _safe_set_with_error(
            "fred:cpi_breakdown", "computed", TTL_T2,
            f"Null components: {', '.join(null_components)}",
        )
        return False
    return await _safe_set("fred:cpi_breakdown", payload, "computed", TTL_T2)


async def _refresh_liquidity_percentiles() -> bool:
    """
    Read liquidity history from Tier 3 cache, compute percentile/trend stats,
    and store as macro:liquidity_percentiles.
    """
    row = await get_cached("fred:liquidity_history")
    history = get_cache_data(row)
    if not history:
        print("[Refresher] No liquidity history in cache, skipping percentiles")
        return False

    context = _compute_liquidity_context(history)
    if not context:
        print("[Refresher] Could not compute liquidity context (insufficient data)")
        return False

    return await _safe_set("macro:liquidity_percentiles", context, "computed", TTL_T2)


async def _refresh_global_liquidity() -> bool:
    """Fetch current global M2 + central bank metrics and cache."""
    from app.features.macro.liquidity.global_service import fetch_and_compute_global_m2
    data = await fetch_and_compute_global_m2()
    if not data or not data.get("us_m2", {}).get("value"):
        print("[Refresher] Global liquidity: no valid US M2 data")
        await _safe_set_with_error("fred:global_liquidity", "fred", TTL_T2, "No valid US M2")
        return False
    return await _safe_set("fred:global_liquidity", data, "fred", TTL_T2)


async def _refresh_global_liquidity_history() -> bool:
    """Fetch 365-day global M2 history and cache."""
    from app.features.macro.liquidity.global_service import get_global_liquidity_history
    data = await get_global_liquidity_history(days=365)
    obs = data.get("observations", [])
    if not obs:
        print("[Refresher] Global liquidity history: no observations")
        await _safe_set_with_error("fred:global_liquidity_history", "fred", TTL_T3, "No observations")
        return False
    return await _safe_set("fred:global_liquidity_history", data, "fred", TTL_T3)


async def refresh_tier3() -> dict:
    """
    Fetch and cache:
    - fred:liquidity_history (365-day history for charts)
    """
    results = {}

    # Liquidity history (365 days)
    try:
        from app.features.macro.liquidity.fred_service import get_liquidity_history
        data = await get_liquidity_history(days=365)
        ok = await _safe_set("fred:liquidity_history", data, "fred", TTL_T3)
        results["fred:liquidity_history"] = ok
    except Exception as e:
        print(f"[Refresher] T3 liquidity_history error: {e}")
        traceback.print_exc()
        await _safe_set_with_error("fred:liquidity_history", "fred", TTL_T3, str(e))
        results["fred:liquidity_history"] = False

    # Global liquidity history (365 days)
    try:
        ok = await _refresh_global_liquidity_history()
        results["fred:global_liquidity_history"] = ok
    except Exception as e:
        print(f"[Refresher] T3 global_liquidity_history error: {e}")
        traceback.print_exc()
        await _safe_set_with_error("fred:global_liquidity_history", "fred", TTL_T3, str(e))
        results["fred:global_liquidity_history"] = False

    return results


async def refresh_all() -> dict:
    """Refresh all tiers sequentially: T1 -> T3 -> T2.

    T3 must run before T2 because T2's _refresh_liquidity_percentiles()
    reads from the fred:liquidity_history cache key populated by T3.
    """
    results = {}
    results["tier1"] = await refresh_tier1()
    results["tier3"] = await refresh_tier3()
    results["tier2"] = await refresh_tier2()
    return results
