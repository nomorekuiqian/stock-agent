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
from typing import Optional
import httpx
from dotenv import load_dotenv

from app.utils.timezone import today_str, days_ago

load_dotenv()

FRED_API_KEY = os.getenv("FRED_API_KEY")
FRED_BASE_URL = "https://api.stlouisfed.org/fred"

# Key FRED series for liquidity monitoring
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
) -> dict:
    """
    Fetch a single FRED series.

    Args:
        series_id: FRED series ID (e.g., "WALCL")
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        limit: Maximum number of observations

    Returns:
        Dict with series info and observations
    """
    if not FRED_API_KEY:
        raise ValueError("FRED_API_KEY not configured")

    # Default to last 2 years if no dates specified (Pacific timezone)
    if not end_date:
        end_date = today_str()
    if not start_date:
        start_date = days_ago(730)

    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "observation_start": start_date,
        "observation_end": end_date,
        "sort_order": "desc",
        "limit": limit,
    }

    async with httpx.AsyncClient() as client:
        # Get series info
        info_response = await client.get(
            f"{FRED_BASE_URL}/series",
            params={"series_id": series_id, "api_key": FRED_API_KEY, "file_type": "json"}
        )
        info_data = info_response.json()

        # Get observations
        obs_response = await client.get(
            f"{FRED_BASE_URL}/series/observations",
            params=params
        )
        obs_data = obs_response.json()

    series_info = info_data.get("seriess", [{}])[0]
    observations = obs_data.get("observations", [])

    return {
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


async def get_latest_value(series_id: str) -> dict:
    """Get the most recent value for a FRED series."""
    data = await fetch_fred_series(series_id, limit=5)

    if not data["observations"]:
        return {"value": None, "date": None}

    latest = data["observations"][0]

    # Calculate change compared to previous data point
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

    Returns:
        Dict with all liquidity indicators and calculated net liquidity
    """
    metrics = {}

    # Fetch all series in parallel using asyncio.gather
    keys = list(LIQUIDITY_SERIES.keys())
    series_ids = list(LIQUIDITY_SERIES.values())

    async def fetch_with_error_handling(key: str, series_id: str):
        try:
            return key, await get_latest_value(series_id)
        except Exception as e:
            print(f"Error fetching {series_id}: {e}")
            return key, {"value": None, "error": str(e)}

    results = await asyncio.gather(
        *[fetch_with_error_handling(key, series_id) for key, series_id in zip(keys, series_ids)]
    )

    for key, value in results:
        metrics[key] = value

    # Calculate Net Liquidity = Fed Assets - TGA - RRP
    # Note: Units differ - WALCL is in Millions, WDTGAL is in Millions, RRPONTSYD is in Billions
    try:
        fed_assets = metrics["fed_assets"]["value"] / 1000 if metrics["fed_assets"]["value"] else None  # Convert Millions to Billions
        tga = metrics["tga"]["value"] / 1000 if metrics["tga"]["value"] else None  # Convert Millions to Billions
        rrp = metrics["rrp"]["value"]  # Billions

        if all([fed_assets, tga is not None, rrp]):
            net_liquidity = fed_assets - tga - rrp

            # Get previous values for change calculation
            fed_data = await fetch_fred_series("WALCL", limit=5)
            tga_data = await fetch_fred_series("WDTGAL", limit=5)
            rrp_data = await fetch_fred_series("RRPONTSYD", limit=5)

            if (len(fed_data["observations"]) >= 2 and
                len(tga_data["observations"]) >= 2 and
                len(rrp_data["observations"]) >= 2):

                prev_fed = fed_data["observations"][1]["value"] / 1000  # Convert Millions to Billions
                prev_tga = tga_data["observations"][1]["value"] / 1000  # Convert Millions to Billions
                prev_rrp = rrp_data["observations"][1]["value"]  # Already in Billions
                prev_net = prev_fed - prev_tga - prev_rrp

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
        print(f"Error calculating net liquidity: {e}")
        metrics["net_liquidity"] = {"value": None, "error": str(e)}

    return metrics


async def get_liquidity_history(days: int = 365) -> dict:
    """
    Fetch historical data for net liquidity calculation.

    Args:
        days: Number of days of history to fetch

    Returns:
        Dict with historical net liquidity data including reserves, rates, and NFCI
    """
    start_date = days_ago(days)  # Pacific timezone
    end_date = today_str()

    # Fetch all component series in parallel
    fed_data, tga_data, rrp_data, reserves_data, sofr_data, effr_data, nfci_data = await asyncio.gather(
        fetch_fred_series("WALCL", start_date, end_date, limit=500),
        fetch_fred_series("WDTGAL", start_date, end_date, limit=500),
        fetch_fred_series("RRPONTSYD", start_date, end_date, limit=500),
        fetch_fred_series("WRESBAL", start_date, end_date, limit=500),
        fetch_fred_series("SOFR", start_date, end_date, limit=500),
        fetch_fred_series("EFFR", start_date, end_date, limit=500),
        fetch_fred_series("NFCI", start_date, end_date, limit=500),
    )

    # Create lookup dicts by date - convert to Billions
    fed_by_date = {obs["date"]: obs["value"] / 1000 for obs in fed_data["observations"]}  # Convert Millions to Billions
    tga_by_date = {obs["date"]: obs["value"] / 1000 for obs in tga_data["observations"]}  # Convert Millions to Billions
    rrp_by_date = {obs["date"]: obs["value"] for obs in rrp_data["observations"]}  # Already in Billions

    # Additional lookups (reserves in Millions, rates in %)
    reserves_by_date = {obs["date"]: obs["value"] / 1000 for obs in reserves_data["observations"]}  # Convert to Billions
    sofr_by_date = {obs["date"]: obs["value"] for obs in sofr_data["observations"]}
    effr_by_date = {obs["date"]: obs["value"] for obs in effr_data["observations"]}
    nfci_by_date = {obs["date"]: obs["value"] for obs in nfci_data["observations"]}

    def find_closest_value(lookup_dict, target_date):
        """Find the closest available value for a given date."""
        if target_date in lookup_dict:
            return lookup_dict[target_date]
        for d in sorted(lookup_dict.keys(), reverse=True):
            if d <= target_date:
                return lookup_dict[d]
        return None

    # Calculate net liquidity for each date where we have all components
    # Use Fed assets dates as base (weekly)
    net_liquidity_history = []

    for obs in fed_data["observations"]:
        date = obs["date"]
        fed_val = obs["value"] / 1000  # Convert Millions to Billions

        # Find closest values for all components
        tga_val = find_closest_value(tga_by_date, date)
        rrp_val = find_closest_value(rrp_by_date, date)
        reserves_val = find_closest_value(reserves_by_date, date)
        sofr_val = find_closest_value(sofr_by_date, date)
        effr_val = find_closest_value(effr_by_date, date)
        nfci_val = find_closest_value(nfci_by_date, date)

        if all([fed_val, tga_val is not None, rrp_val]):
            net_liquidity_history.append({
                "time": date,  # Use "time" for lightweight-charts compatibility
                "value": round(fed_val - tga_val - rrp_val, 2),
                "fed_assets": fed_val,
                "tga": tga_val,
                "rrp": rrp_val,
                "reserves": reserves_val,
                "sofr": sofr_val,
                "effr": effr_val,
                "nfci": nfci_val,
            })

    # Sort by date ascending for charts
    net_liquidity_history.sort(key=lambda x: x["time"])

    # Build metrics from latest data point to avoid separate API calls
    metrics = None
    if len(net_liquidity_history) >= 2:
        latest = net_liquidity_history[-1]
        previous = net_liquidity_history[-2]

        def calc_change(current, prev):
            if current is not None and prev is not None and prev != 0:
                return ((current - prev) / abs(prev)) * 100
            return None

        # Get raw values from original data for accurate units
        latest_fed_raw = fed_data["observations"][0]["value"] if fed_data["observations"] else None
        latest_tga_raw = tga_data["observations"][0]["value"] if tga_data["observations"] else None
        latest_rrp_raw = rrp_data["observations"][0]["value"] if rrp_data["observations"] else None
        latest_reserves_raw = reserves_data["observations"][0]["value"] if reserves_data["observations"] else None
        latest_sofr_raw = sofr_data["observations"][0]["value"] if sofr_data["observations"] else None
        latest_effr_raw = effr_data["observations"][0]["value"] if effr_data["observations"] else None
        latest_nfci_raw = nfci_data["observations"][0]["value"] if nfci_data["observations"] else None

        # Get previous raw values for change calculation
        prev_fed_raw = fed_data["observations"][1]["value"] if len(fed_data["observations"]) > 1 else None
        prev_tga_raw = tga_data["observations"][1]["value"] if len(tga_data["observations"]) > 1 else None
        prev_rrp_raw = rrp_data["observations"][1]["value"] if len(rrp_data["observations"]) > 1 else None
        prev_reserves_raw = reserves_data["observations"][1]["value"] if len(reserves_data["observations"]) > 1 else None
        prev_sofr_raw = sofr_data["observations"][1]["value"] if len(sofr_data["observations"]) > 1 else None
        prev_effr_raw = effr_data["observations"][1]["value"] if len(effr_data["observations"]) > 1 else None
        prev_nfci_raw = nfci_data["observations"][1]["value"] if len(nfci_data["observations"]) > 1 else None

        metrics = {
            "fed_assets": {
                "series_id": "WALCL",
                "title": fed_data.get("title", "Fed Total Assets"),
                "value": latest_fed_raw,
                "date": fed_data["observations"][0]["date"] if fed_data["observations"] else None,
                "units": fed_data.get("units", "Millions of U.S. Dollars"),
                "change": calc_change(latest_fed_raw, prev_fed_raw),
                "previous_date": fed_data["observations"][1]["date"] if len(fed_data["observations"]) > 1 else None,
            },
            "tga": {
                "series_id": "WDTGAL",
                "title": tga_data.get("title", "Treasury General Account"),
                "value": latest_tga_raw,
                "date": tga_data["observations"][0]["date"] if tga_data["observations"] else None,
                "units": tga_data.get("units", "Millions of U.S. Dollars"),
                "change": calc_change(latest_tga_raw, prev_tga_raw),
                "previous_date": tga_data["observations"][1]["date"] if len(tga_data["observations"]) > 1 else None,
            },
            "rrp": {
                "series_id": "RRPONTSYD",
                "title": rrp_data.get("title", "Overnight Reverse Repo"),
                "value": latest_rrp_raw,
                "date": rrp_data["observations"][0]["date"] if rrp_data["observations"] else None,
                "units": rrp_data.get("units", "Billions of US Dollars"),
                "change": calc_change(latest_rrp_raw, prev_rrp_raw),
                "previous_date": rrp_data["observations"][1]["date"] if len(rrp_data["observations"]) > 1 else None,
            },
            "reserves": {
                "series_id": "WRESBAL",
                "title": reserves_data.get("title", "Bank Reserves"),
                "value": latest_reserves_raw,
                "date": reserves_data["observations"][0]["date"] if reserves_data["observations"] else None,
                "units": reserves_data.get("units", "Millions of U.S. Dollars"),
                "change": calc_change(latest_reserves_raw, prev_reserves_raw),
                "previous_date": reserves_data["observations"][1]["date"] if len(reserves_data["observations"]) > 1 else None,
            },
            "sofr": {
                "series_id": "SOFR",
                "title": sofr_data.get("title", "SOFR"),
                "value": latest_sofr_raw,
                "date": sofr_data["observations"][0]["date"] if sofr_data["observations"] else None,
                "units": sofr_data.get("units", "Percent"),
                "change": calc_change(latest_sofr_raw, prev_sofr_raw),
                "previous_date": sofr_data["observations"][1]["date"] if len(sofr_data["observations"]) > 1 else None,
            },
            "effr": {
                "series_id": "EFFR",
                "title": effr_data.get("title", "Effective Federal Funds Rate"),
                "value": latest_effr_raw,
                "date": effr_data["observations"][0]["date"] if effr_data["observations"] else None,
                "units": effr_data.get("units", "Percent"),
                "change": calc_change(latest_effr_raw, prev_effr_raw),
                "previous_date": effr_data["observations"][1]["date"] if len(effr_data["observations"]) > 1 else None,
            },
            "nfci": {
                "series_id": "NFCI",
                "title": nfci_data.get("title", "Chicago Fed National Financial Conditions Index"),
                "value": latest_nfci_raw,
                "date": nfci_data["observations"][0]["date"] if nfci_data["observations"] else None,
                "units": nfci_data.get("units", "Index"),
                "change": calc_change(latest_nfci_raw, prev_nfci_raw),
                "previous_date": nfci_data["observations"][1]["date"] if len(nfci_data["observations"]) > 1 else None,
            },
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
