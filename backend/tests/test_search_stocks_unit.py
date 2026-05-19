"""
FMPService.search_stocks() dedup / ranking regression tests.

Covers the share-class collapse bug: name-only dedup folded NYSE BRK-A,
BRK-B and the NEO cross-listing BRK.NE into a single row.

These fixtures mirror the REAL FMP /stable/stock-list shape verified against
the live API: only ``symbol`` and ``companyName`` are populated; ``name``,
``exchange`` and ``exchangeShortName`` are null. Primary-vs-foreign is therefore
inferred from symbol shape (dotless = US-traded, ``.XX`` = foreign), not an
exchange field.

No network, no DB. The instance's _get_stock_list and _request are mocked,
which also bypasses the module-global _stock_list_cache.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_search_stocks_unit.py -v
"""

import pytest
from unittest.mock import patch, MagicMock

from app.shared.fmp_service import FMPService, _share_class_token, _symbol_kind


@pytest.fixture
def service():
    """FMPService instance with mocked API key (bypasses __init__ guard)."""
    with patch.dict("os.environ", {"FMP_API_KEY": "test_key"}):
        svc = FMPService.__new__(FMPService)
        svc.api_key = "test_key"
        return svc


def _mk(symbol, company_name):
    """Build a stock-list row in the real FMP /stable/stock-list shape."""
    return {"symbol": symbol, "companyName": company_name,
            "name": None, "exchange": None, "exchangeShortName": None}


def _run(service, rows, query, limit=8):
    """Call search_stocks with deterministic data (no FMP-API supplement)."""
    with patch.object(service, "_get_stock_list", return_value=rows), \
         patch.object(service, "_request", MagicMock(return_value=[])):
        return service.search_stocks(query, limit=limit)


# ---------------------------------------------------------------------------
# Symbol-shape helpers
# ---------------------------------------------------------------------------


class TestShareClassToken:
    @pytest.mark.parametrize("sym,expected", [
        ("BRK-A", "A"),
        ("BRK-B", "B"),
        ("BF-A", "A"),
        ("BRK.NE", ""),     # foreign suffix, not a class
        ("RY.SW", ""),
        ("005930.KS", ""),  # home-market suffix
        ("BAC-PA", ""),     # preferred series -> fold into common
        ("RY-PT", ""),      # preferred series -> fold
        ("XYZ-WT", ""),     # warrant -> fold
        ("AAPL", ""),
        ("RY", ""),
        ("", ""),
    ])
    def test_token(self, sym, expected):
        assert _share_class_token(sym) == expected


class TestSymbolKind:
    @pytest.mark.parametrize("sym,expected", [
        ("BRK-A", "us"),
        ("RY", "us"),
        ("AAPL", "us"),
        ("BAC-PA", "us"),
        ("BRK.NE", "foreign"),
        ("RY.SW", "foreign"),
        ("BRH.DE", "foreign"),
        ("BRKM3.SA", "foreign"),
        ("005930.KS", "primary"),
        ("7203.T", "primary"),
        ("0700.HK", "primary"),
    ])
    def test_kind(self, sym, expected):
        assert _symbol_kind(sym) == expected


# ---------------------------------------------------------------------------
# search_stocks dedup / suppression  (rows mirror live FMP data)
# ---------------------------------------------------------------------------


class TestSearchDedup:
    def test_brk_query_returns_both_classes_not_canadian(self, service):
        # Order mirrors live /stable/stock-list (BRK.NE precedes BRK-A).
        rows = [
            _mk("BRKM3.SA", "Braskem S.A."),
            _mk("BRK.NE", "Berkshire Hathaway Inc."),
            _mk("BRK-A", "Berkshire Hathaway Inc."),
            _mk("BRK-B", "Berkshire Hathaway Inc."),
            _mk("BRKA.VI", "Berkshire Hathaway Inc."),
            _mk("BRH.DE", "Berkshire Hathaway Inc."),
        ]
        res = _run(service, rows, "BRK")
        syms = [s["symbol"] for s in res["stocks"]]

        assert res["status"] == "success"
        assert "BRK-A" in syms and "BRK-B" in syms
        assert "BRK.NE" not in syms          # suppressed: US listing exists
        assert "BRKA.VI" not in syms and "BRH.DE" not in syms

    def test_berkshire_name_query_ranks_classes_above_foreign(self, service):
        rows = [
            _mk("BRK.NE", "Berkshire Hathaway Inc."),
            _mk("BRK-A", "Berkshire Hathaway Inc."),
            _mk("BRKA.VI", "Berkshire Hathaway Inc."),
            _mk("BRH.DE", "Berkshire Hathaway Inc."),
            _mk("BRK-B", "Berkshire Hathaway Inc."),
        ]
        res = _run(service, rows, "Berkshire")
        syms = [s["symbol"] for s in res["stocks"]]

        assert syms[:2] == ["BRK-A", "BRK-B"]   # US classes first
        assert "BRK.NE" not in syms

    def test_dual_listed_returns_common_us_not_foreign_or_preferred(self, service):
        # Live row order for "Royal Bank of Canada".
        rows = [
            _mk("RY.SW", "Royal Bank of Canada"),
            _mk("0QKU.L", "Royal Bank of Canada"),
            _mk("RY-PT", "Royal Bank of Canada"),
            _mk("RY", "Royal Bank of Canada"),
            _mk("RBCPF", "Royal Bank of Canada"),
            _mk("RY.TO", "Royal Bank of Canada"),
        ]
        res = _run(service, rows, "Royal Bank of Canada")
        # Foreign suppressed; clean common ticker beats RY-PT / RBCPF.
        assert [s["symbol"] for s in res["stocks"]] == ["RY"]

    def test_symbol_query_exact_match_wins(self, service):
        rows = [
            _mk("RY.SW", "Royal Bank of Canada"),
            _mk("RY", "Royal Bank of Canada"),
            _mk("RYAM", "Rayonier Advanced Materials Inc."),
        ]
        res = _run(service, rows, "RY")
        assert res["stocks"][0]["symbol"] == "RY"
        assert "RY.SW" not in [s["symbol"] for s in res["stocks"]]

    def test_foreign_only_listing_not_suppressed(self, service):
        rows = [_mk("RY.SW", "Royal Bank of Canada")]
        res = _run(service, rows, "Royal Bank")
        # No US/home-market listing -> the cross-listing stays discoverable.
        assert [s["symbol"] for s in res["stocks"]] == ["RY.SW"]

    def test_home_market_primary_not_suppressed_by_us_adr(self, service):
        # A genuine .KS primary plus a US OTC ADR: keep both (different kinds,
        # .KS is "primary" not "foreign", so suppression must not fire).
        rows = [
            _mk("SSNLF", "Samsung Electronics Co., Ltd."),
            _mk("005930.KS", "Samsung Electronics Co., Ltd."),
        ]
        res = _run(service, rows, "Samsung Electronics")
        syms = {s["symbol"] for s in res["stocks"]}
        assert "005930.KS" in syms

    def test_genuine_same_symbol_duplicate_dedups(self, service):
        rows = [
            _mk("AAPL", "Apple Inc."),
            _mk("AAPL", "Apple Inc."),  # accidental duplicate row
        ]
        res = _run(service, rows, "AAPL")
        assert [s["symbol"] for s in res["stocks"]] == ["AAPL"]

    def test_preferred_series_folds_into_common(self, service):
        rows = [
            _mk("BAC", "Bank of America Corporation"),
            _mk("BAC-PA", "Bank of America Corporation"),
        ]
        res = _run(service, rows, "BAC")
        assert [s["symbol"] for s in res["stocks"]] == ["BAC"]

    def test_response_shape_has_no_internal_fields(self, service):
        rows = [_mk("AAPL", "Apple Inc.")]
        res = _run(service, rows, "AAPL")
        row = res["stocks"][0]
        assert set(row.keys()) == {"symbol", "name", "type", "exchange"}
