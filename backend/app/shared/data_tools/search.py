"""
Stock search functionality.
"""

from app.core.logging import get_logger

logger = get_logger(__name__)


def search_stocks(query: str, limit: int = 10) -> dict:
    """
    Search stocks by symbol or company name.
    Delegates to fmp_service.search_stocks().
    Returns: {"status": "success", "stocks": [...], "source": "fmp"}
    """
    from app.shared.fmp_service import get_fmp_service

    fmp = get_fmp_service()
    return fmp.search_stocks(query, limit=limit)
