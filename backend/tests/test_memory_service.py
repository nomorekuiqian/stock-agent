"""
Tests for memory service — get_user_memory() aggregation.

Tests rendering logic with mocked DB responses.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.features.memory.models import SuggestionRow
from app.features.memory.service import (
    MAX_THESIS_CHARS,
    MAX_TRACKING_CHARS,
    _render_theses,
    _render_tracking,
    get_user_memory,
)
from app.features.portfolio.models import HoldingRow


def _make_holding(symbol: str, thesis: str = "") -> HoldingRow:
    return HoldingRow(user_id="u1", symbol=symbol, thesis=thesis)


def _make_suggestion(
    text: str = "建议保留现金",
    outcome: dict = None,
) -> SuggestionRow:
    return SuggestionRow(
        user_id="u1",
        source="health_check",
        suggestion_text=text,
        outcome=outcome,
    )


class TestRenderTheses:
    def test_basic_render(self):
        theses = [
            {"symbol": "AAPL", "thesis": "AI 增长", "weight": 0},
            {"symbol": "MSFT", "thesis": "云计算龙头", "weight": 0},
        ]
        result = _render_theses(theses)
        assert "【持仓 thesis】" in result
        assert "AAPL: AI 增长" in result
        assert "MSFT: 云计算龙头" in result

    def test_truncates_long_thesis(self):
        theses = [
            {"symbol": "AAPL", "thesis": "x" * 100, "weight": 0},
        ]
        result = _render_theses(theses)
        assert "x" * 60 in result
        assert "x" * 100 not in result

    def test_limits_to_15_entries(self):
        theses = [
            {"symbol": f"SYM{i}", "thesis": f"thesis {i}", "weight": 0}
            for i in range(20)
        ]
        result = _render_theses(theses)
        assert "SYM14" in result
        assert "SYM15" not in result

    def test_respects_char_limit(self):
        theses = [
            {"symbol": f"SYM{i}", "thesis": "a" * 60, "weight": 0}
            for i in range(15)
        ]
        result = _render_theses(theses)
        assert len(result) <= MAX_THESIS_CHARS


class TestRenderTracking:
    def test_pending_suggestion(self):
        rows = [_make_suggestion("建议保留现金", outcome=None)]
        result = _render_tracking(rows)
        assert "【建议追踪】" in result
        assert "观察中" in result

    def test_correct_direction(self):
        rows = [
            _make_suggestion(
                "建议保留现金",
                outcome={"direction_correct": True},
            )
        ]
        result = _render_tracking(rows)
        assert "方向正确" in result

    def test_incorrect_direction(self):
        rows = [
            _make_suggestion(
                "建议持币",
                outcome={"direction_correct": False},
            )
        ]
        result = _render_tracking(rows)
        assert "方向偏差" in result

    def test_evaluated_no_direction(self):
        rows = [
            _make_suggestion(
                "关注新能源",
                outcome={"direction_correct": None},
            )
        ]
        result = _render_tracking(rows)
        assert "已评估" in result

    def test_limits_to_3_entries(self):
        rows = [_make_suggestion(f"建议 {i}") for i in range(5)]
        result = _render_tracking(rows)
        lines = [l for l in result.split("\n") if l.startswith("- ")]
        assert len(lines) == 3

    def test_empty_rows(self):
        result = _render_tracking([])
        assert result == ""

    def test_respects_char_limit(self):
        rows = [_make_suggestion("x" * 80) for _ in range(5)]
        result = _render_tracking(rows)
        assert len(result) <= MAX_TRACKING_CHARS


class TestGetUserMemory:
    @pytest.mark.asyncio
    async def test_empty_data_returns_empty(self):
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=[])
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=[])

            result = await get_user_memory("user-123")
            assert result == ""

    @pytest.mark.asyncio
    async def test_thesis_only(self):
        holdings = [_make_holding("AAPL", "AI 增长引擎")]
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=holdings)
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=[])

            result = await get_user_memory("user-123")
            assert "## 用户记忆" in result
            assert "【持仓 thesis】" in result
            assert "AAPL" in result

    @pytest.mark.asyncio
    async def test_tracking_only(self):
        suggestions = [_make_suggestion("建议保留现金")]
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=[])
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=suggestions)

            result = await get_user_memory("user-123")
            assert "## 用户记忆" in result
            assert "【建议追踪】" in result

    @pytest.mark.asyncio
    async def test_thesis_and_tracking(self):
        holdings = [_make_holding("AAPL", "AI 增长")]
        suggestions = [
            _make_suggestion(
                "建议保留现金",
                outcome={"direction_correct": True},
            )
        ]
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=holdings)
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=suggestions)

            result = await get_user_memory("user-123")
            assert "## 用户记忆" in result
            assert "【持仓 thesis】" in result
            assert "【建议追踪】" in result

    @pytest.mark.asyncio
    async def test_total_length_within_limit(self):
        holdings = [
            _make_holding(f"SYM{i}", "x" * 60) for i in range(15)
        ]
        suggestions = [_make_suggestion(f"建议 {i}") for i in range(5)]

        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=holdings)
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=suggestions)

            result = await get_user_memory("user-123")
            assert len(result) <= 2200

    @pytest.mark.asyncio
    async def test_error_handling_returns_empty(self):
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(
                side_effect=Exception("DB down")
            )
            mock_mdb.get_pending_and_recent = AsyncMock(
                side_effect=Exception("DB down")
            )

            result = await get_user_memory("user-123")
            assert result == ""

    @pytest.mark.asyncio
    async def test_holdings_without_thesis_excluded(self):
        holdings = [
            _make_holding("AAPL", "AI 增长"),
            _make_holding("MSFT", ""),
            _make_holding("GOOG", None),
        ]
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=holdings)
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=[])

            result = await get_user_memory("user-123")
            assert "AAPL" in result
            assert "MSFT" not in result
            assert "GOOG" not in result
