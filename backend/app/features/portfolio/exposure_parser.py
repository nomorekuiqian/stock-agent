"""
Sector exposure parser — decomposes portfolio into sector weights.

Pure function: `get_true_exposure(holdings)` takes HoldingView list
and returns {sector: pct} by combining:
  1. ETF decomposition via static ETF_SECTOR_MAP
  2. $CASH → "Cash" sector
  3. Individual stocks → sector from company profile cache

LLD: docs/plans/for-you/p0-foundation.md §R-1
"""

from collections import defaultdict
from typing import Dict, List

from app.features.portfolio.models import HoldingView
from app.shared.data_tools._cash_guard import CASH_SYMBOL


ETF_SECTOR_MAP: Dict[str, Dict[str, float]] = {
    "SPY":  {"Technology": 0.30, "Financials": 0.13, "Healthcare": 0.12,
             "Consumer Cyclical": 0.10, "Others": 0.35},
    "QQQ":  {"Technology": 0.50, "Communication Services": 0.15,
             "Consumer Cyclical": 0.15, "Others": 0.20},
    "IWM":  {"Healthcare": 0.16, "Financials": 0.15, "Industrials": 0.15,
             "Technology": 0.13, "Others": 0.41},
    "DIA":  {"Technology": 0.22, "Healthcare": 0.18, "Financials": 0.16,
             "Industrials": 0.14, "Others": 0.30},
    "VTI":  {"Technology": 0.27, "Financials": 0.13, "Healthcare": 0.13,
             "Consumer Cyclical": 0.11, "Others": 0.36},
    "VOO":  {"Technology": 0.30, "Financials": 0.13, "Healthcare": 0.12,
             "Consumer Cyclical": 0.10, "Others": 0.35},
    "VGT":  {"Technology": 1.0},
    "XLK":  {"Technology": 1.0},
    "XLF":  {"Financials": 1.0},
    "XLE":  {"Energy": 1.0},
    "XLV":  {"Healthcare": 1.0},
    "XLY":  {"Consumer Cyclical": 1.0},
    "XLP":  {"Consumer Defensive": 1.0},
    "XLI":  {"Industrials": 1.0},
    "XLB":  {"Basic Materials": 1.0},
    "XLU":  {"Utilities": 1.0},
    "XLRE": {"Real Estate": 1.0},
    "XLC":  {"Communication Services": 1.0},
    "ARKK": {"Technology": 0.45, "Healthcare": 0.25, "Communication Services": 0.15,
             "Others": 0.15},
    "ARKW": {"Technology": 0.55, "Communication Services": 0.20, "Others": 0.25},
    "SOXX": {"Technology": 1.0},
    "SMH":  {"Technology": 1.0},
    "VWO":  {"Financials": 0.22, "Technology": 0.18, "Consumer Cyclical": 0.14,
             "Others": 0.46},
    "EEM":  {"Financials": 0.22, "Technology": 0.18, "Consumer Cyclical": 0.14,
             "Others": 0.46},
    "EFA":  {"Financials": 0.18, "Healthcare": 0.14, "Industrials": 0.14,
             "Technology": 0.10, "Others": 0.44},
    "AGG":  {"Bonds": 1.0},
    "BND":  {"Bonds": 1.0},
    "TLT":  {"Bonds": 1.0},
    "LQD":  {"Bonds": 1.0},
    "HYG":  {"Bonds": 1.0},
    "GLD":  {"Commodities": 1.0},
    "SLV":  {"Commodities": 1.0},
    "USO":  {"Commodities": 1.0},
    "VNQ":  {"Real Estate": 1.0},
    "SCHD": {"Financials": 0.18, "Healthcare": 0.16, "Technology": 0.13,
             "Consumer Defensive": 0.13, "Others": 0.40},
    "JEPI": {"Technology": 0.20, "Healthcare": 0.15, "Financials": 0.14,
             "Others": 0.51},
    "VIG":  {"Technology": 0.22, "Healthcare": 0.16, "Financials": 0.15,
             "Industrials": 0.14, "Others": 0.33},
    "VTIP": {"Bonds": 1.0},
    "VXUS": {"Financials": 0.19, "Technology": 0.13, "Industrials": 0.12,
             "Others": 0.56},
    "IVV":  {"Technology": 0.30, "Financials": 0.13, "Healthcare": 0.12,
             "Consumer Cyclical": 0.10, "Others": 0.35},
    "IEFA": {"Financials": 0.18, "Healthcare": 0.14, "Industrials": 0.14,
             "Technology": 0.10, "Others": 0.44},
    "IEMG": {"Financials": 0.22, "Technology": 0.18, "Consumer Cyclical": 0.14,
             "Others": 0.46},
}


def get_true_exposure(
    holdings: List[HoldingView],
    sector_lookup: Dict[str, str] | None = None,
) -> Dict[str, float]:
    """
    Decompose portfolio holdings into sector exposure percentages.

    Args:
        holdings: List of HoldingView with effective_weight_pct already computed.
        sector_lookup: Optional {symbol: sector} mapping for individual stocks.
            If not provided, individual stocks go to "Unknown" sector.
            Caller can pre-fetch via get_company_profile() and build this map.

    Returns:
        {sector_name: pct} where pct is 0-100 scale (same as weight).
    """
    exposure: Dict[str, float] = defaultdict(float)
    lookup = sector_lookup or {}

    for h in holdings:
        w = h.effective_weight_pct
        if w <= 0:
            continue

        if h.symbol == CASH_SYMBOL:
            exposure["Cash"] += w
        elif h.symbol in ETF_SECTOR_MAP:
            for sector, ratio in ETF_SECTOR_MAP[h.symbol].items():
                exposure[sector] += w * ratio
        else:
            sector = lookup.get(h.symbol, "Unknown")
            exposure[sector] += w

    return {k: round(v, 4) for k, v in exposure.items()}
