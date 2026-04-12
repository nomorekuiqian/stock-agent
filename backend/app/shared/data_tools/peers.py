"""
Peer comparison and industry/sector valuation data.
"""

from app.core.logging import get_logger

logger = get_logger(__name__)


def get_peer_companies(symbol: str, industry: str = None, limit: int = 10) -> dict:
    """
    Get peer companies by industry (preferred) or stock-peers fallback.
    Returns: {"status": "success", "peers": [{"symbol": "...", "name": "..."}, ...]}
    """
    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()

    if industry:
        result = fmp.get_industry_peers(industry, exclude_symbol=symbol, limit=limit)
        if result.get("status") == "success" and result.get("peers"):
            return result

    return fmp.get_stock_peers(symbol)


def get_peer_valuation(symbol: str, peer_symbols: list[str]) -> dict:
    """
    Compare valuation metrics between target and peers.
    Returns: {
        "status": "success",
        "company": {"symbol": ..., "metrics": {...}},
        "peers": [{"symbol": ..., "metrics": {...}}, ...]
    }
    """
    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()

    company_result = fmp.get_key_metrics_ttm(symbol)
    company_metrics = company_result.get("metrics", {}) if company_result.get("status") == "success" else {}

    peer_metrics = []
    for peer_sym in peer_symbols:
        result = fmp.get_key_metrics_ttm(peer_sym)
        if result.get("status") == "success":
            peer_metrics.append({
                "symbol": peer_sym,
                "metrics": result.get("metrics", {}),
            })

    return {
        "status": "success",
        "company": {"symbol": symbol, "metrics": company_metrics},
        "peers": peer_metrics,
    }


def get_industry_valuation(industry: str = None, sector: str = None) -> dict:
    """
    Get industry and/or sector average PE ratios.
    Returns: {
        "status": "success",
        "industry_pe": float | None,
        "sector_pe": float | None,
        "industries": {...},
        "sectors": {...}
    }
    """
    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()
    result = {"status": "success", "industry_pe": None, "sector_pe": None}

    if industry:
        industry_data = fmp.get_industry_pe()
        if industry_data.get("status") == "success":
            industries = industry_data.get("industries", {})
            result["industry_pe"] = industries.get(industry)
            result["industries"] = industries

    if sector:
        sector_data = fmp.get_sector_pe()
        if sector_data.get("status") == "success":
            sectors = sector_data.get("sectors", {})
            result["sector_pe"] = sectors.get(sector)
            result["sectors"] = sectors

    return result
