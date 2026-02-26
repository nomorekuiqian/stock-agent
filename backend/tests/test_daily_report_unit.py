"""
Daily Report Router Unit Tests

Tests for _report_to_response() from app.features.daily_report.router.
Pure transformation logic only - no network calls, no database access.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_daily_report_unit.py -v
"""

import pytest

from app.features.daily_report.router import _report_to_response


@pytest.fixture
def mock_db_report():
    """Simulated database report row."""
    return {
        "id": "report-uuid-789",
        "report_date": "2025-02-20",
        "timestamp": "2025-02-20T23:00:00Z",
        "title": "VIX Drops Below 18",
        "summary": "Markets rallied today.",
        "intro": "A strong session across the board.",
        "news": {
            "headlines": [{"title": "Fed holds steady"}],
        },
        "report_summary": [{"title": "Key Takeaway", "content": "Bullish setup."}],
        "calendar": [{"date": "2025-02-21", "event": "PCE data"}],
        "market_data": {"equities": {"SPY": {"value": 500, "daily_change": 0.5}}},
        "indices": [{"name": "S&P 500", "value": 5000, "change_percent": 0.5}],
    }


class TestReportToResponse:
    """Test _report_to_response() from daily report router."""

    def test_includes_report_date(self, mock_db_report):
        """Response includes report_date from the DB row."""
        result = _report_to_response(mock_db_report)
        assert result["report_date"] == "2025-02-20"

    def test_includes_report_id(self, mock_db_report):
        """Response includes report_id mapped from the DB row's 'id' field."""
        result = _report_to_response(mock_db_report)
        assert result["report_id"] == "report-uuid-789"

    def test_missing_report_date_defaults_empty(self):
        """When report_date is missing from DB row, defaults to empty string."""
        report = {"id": "abc", "title": "Minimal"}
        result = _report_to_response(report)
        assert result["report_date"] == ""


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
