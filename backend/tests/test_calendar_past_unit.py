"""
Economic Calendar Past Events Unit Tests -- generated from git diff

Tests for:
- get_economic_calendar_past surprise direction logic
- High-impact filtering
- Sorting behavior

Uses mocked FMP service. No network access.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_calendar_past_unit.py -v
"""

import pytest
from unittest.mock import patch, MagicMock


# ===========================================================================
# TestSurpriseDirection
# ===========================================================================


class TestSurpriseDirection:
    """Tests for surprise direction calculation in get_economic_calendar_past."""

    def _compute_surprise(self, actual, estimate):
        """Replicate the surprise logic from get_economic_calendar_past."""
        if actual is not None and estimate is not None and estimate != 0:
            if actual > estimate * 1.01:
                return "above"
            elif actual < estimate * 0.99:
                return "below"
            else:
                return "inline"
        return "unknown"

    def test_above_surprise(self):
        """Actual > estimate * 1.01 => 'above'."""
        assert self._compute_surprise(102, 100) == "above"
        assert self._compute_surprise(3.5, 3.0) == "above"

    def test_below_surprise(self):
        """Actual < estimate * 0.99 => 'below'."""
        assert self._compute_surprise(98, 100) == "below"
        assert self._compute_surprise(2.5, 3.0) == "below"

    def test_inline_surprise(self):
        """Actual within 1% of estimate => 'inline'."""
        assert self._compute_surprise(100, 100) == "inline"
        assert self._compute_surprise(100.5, 100) == "inline"
        assert self._compute_surprise(99.5, 100) == "inline"

    def test_none_actual_unknown(self):
        """None actual => 'unknown'."""
        assert self._compute_surprise(None, 100) == "unknown"

    def test_none_estimate_unknown(self):
        """None estimate => 'unknown'."""
        assert self._compute_surprise(100, None) == "unknown"

    def test_zero_estimate_unknown(self):
        """Zero estimate => 'unknown' (division guard)."""
        assert self._compute_surprise(100, 0) == "unknown"

    def test_both_none_unknown(self):
        """Both None => 'unknown'."""
        assert self._compute_surprise(None, None) == "unknown"

    def test_negative_values(self):
        """Negative values work correctly."""
        # -50 > -100 * 1.01 = -101, so -50 > -101 => above
        assert self._compute_surprise(-50, -100) == "above"
        # -150 < -100 * 0.99 = -99, so -150 < -99 => below
        assert self._compute_surprise(-150, -100) == "below"


# ===========================================================================
# TestGetEconomicCalendarPast (integration with mocked FMP)
# ===========================================================================


class TestGetEconomicCalendarPast:
    """Tests for get_economic_calendar_past with mocked FMP."""

    @patch("app.utils.timezone.today_str", return_value="2024-04-13")
    @patch("app.utils.timezone.days_ago", return_value="2024-04-06")
    @patch("app.shared.fmp_service.get_fmp_service")
    def test_filters_high_impact_only(self, mock_get_fmp, mock_days_ago, mock_today):
        """Only High impact events are returned."""
        from app.shared.data_tools.calendar import get_economic_calendar_past

        mock_fmp = MagicMock()
        mock_get_fmp.return_value = mock_fmp
        mock_fmp._request.return_value = [{"dummy": True}]
        mock_fmp._parse_economic_events.return_value = [
            {"date": "2024-04-10", "event": "CPI", "impact": "High",
             "actual": 3.5, "estimate": 3.4},
            {"date": "2024-04-11", "event": "Initial Claims", "impact": "Medium",
             "actual": 220, "estimate": 215},
            {"date": "2024-04-09", "event": "PPI", "impact": "High",
             "actual": 2.1, "estimate": 2.3},
        ]

        result = get_economic_calendar_past(7)
        assert result["status"] == "success"
        assert result["events_count"] == 2
        events = result["events"]
        assert all(e["impact"] == "High" for e in events)

    @patch("app.utils.timezone.today_str", return_value="2024-04-13")
    @patch("app.utils.timezone.days_ago", return_value="2024-04-06")
    @patch("app.shared.fmp_service.get_fmp_service")
    def test_sorted_most_recent_first(self, mock_get_fmp, mock_days_ago, mock_today):
        """Events sorted by date descending (most recent first)."""
        from app.shared.data_tools.calendar import get_economic_calendar_past

        mock_fmp = MagicMock()
        mock_get_fmp.return_value = mock_fmp
        mock_fmp._request.return_value = [{"dummy": True}]
        mock_fmp._parse_economic_events.return_value = [
            {"date": "2024-04-08", "event": "A", "impact": "High",
             "actual": 1.0, "estimate": 1.0},
            {"date": "2024-04-12", "event": "B", "impact": "High",
             "actual": 2.0, "estimate": 2.0},
            {"date": "2024-04-10", "event": "C", "impact": "High",
             "actual": 3.0, "estimate": 3.0},
        ]

        result = get_economic_calendar_past(7)
        dates = [e["date"] for e in result["events"]]
        assert dates == sorted(dates, reverse=True)

    @patch("app.utils.timezone.today_str", return_value="2024-04-13")
    @patch("app.utils.timezone.days_ago", return_value="2024-04-06")
    @patch("app.shared.fmp_service.get_fmp_service")
    def test_surprise_field_added(self, mock_get_fmp, mock_days_ago, mock_today):
        """Each returned event has a surprise field."""
        from app.shared.data_tools.calendar import get_economic_calendar_past

        mock_fmp = MagicMock()
        mock_get_fmp.return_value = mock_fmp
        mock_fmp._request.return_value = [{"dummy": True}]
        mock_fmp._parse_economic_events.return_value = [
            {"date": "2024-04-10", "event": "CPI", "impact": "High",
             "actual": 3.5, "estimate": 3.2},
        ]

        result = get_economic_calendar_past(7)
        assert result["events"][0]["surprise"] == "above"

    @patch("app.utils.timezone.today_str", return_value="2024-04-13")
    @patch("app.utils.timezone.days_ago", return_value="2024-04-06")
    @patch("app.shared.fmp_service.get_fmp_service")
    def test_empty_api_response(self, mock_get_fmp, mock_days_ago, mock_today):
        """Empty API response returns empty events list."""
        from app.shared.data_tools.calendar import get_economic_calendar_past

        mock_fmp = MagicMock()
        mock_get_fmp.return_value = mock_fmp
        mock_fmp._request.return_value = []

        result = get_economic_calendar_past(7)
        assert result["status"] == "success"
        assert result["events_count"] == 0
        assert result["events"] == []

    @patch("app.shared.fmp_service.get_fmp_service")
    def test_fmp_exception_returns_error(self, mock_get_fmp):
        """Exception during FMP call returns error status."""
        from app.shared.data_tools.calendar import get_economic_calendar_past

        mock_get_fmp.side_effect = RuntimeError("API down")

        result = get_economic_calendar_past(7)
        assert result["status"] == "error"
        assert result["events"] == []
