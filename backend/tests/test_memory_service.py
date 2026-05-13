"""
Tests for memory service — get_user_memory() aggregation.

Tests rendering logic with mocked DB responses.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.features.memory.models import FeedbackRow, SuggestionRow
from app.features.memory.service import (
    MAX_FEEDBACK_CHARS,
    MAX_THESIS_CHARS,
    MAX_TRACKING_CHARS,
    _render_feedback_tendency,
    _render_theses,
    _render_tracking,
    get_user_memory,
)
from app.features.portfolio.models import HoldingRow


# =============================================================================
# Fixtures
# =============================================================================


def _make_holding(symbol: str, thesis: str = "") -> HoldingRow:
    return HoldingRow(user_id="u1", symbol=symbol, thesis=thesis)


def _make_feedback(
    target_type: str = "digest_headline",
    sentiment: int = -1,
    snapshot: dict = None,
) -> FeedbackRow:
    return FeedbackRow(
        user_id="u1",
        target_type=target_type,
        target_id="some-id",
        sentiment=sentiment,
        snapshot=snapshot,
    )


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


# =============================================================================
# _render_theses tests
# =============================================================================


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
        # Thesis should be truncated to 60 chars
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


# =============================================================================
# _render_feedback_tendency tests
# =============================================================================


class TestRenderFeedbackTendency:
    def test_empty_with_no_negatives(self):
        feedback = [_make_feedback(sentiment=1)]
        result = _render_feedback_tendency(feedback)
        assert result == ""

    def test_empty_with_one_negative(self):
        feedback = [_make_feedback(sentiment=-1)]
        result = _render_feedback_tendency(feedback)
        assert result == ""

    def test_renders_with_two_negatives_same_type(self):
        feedback = [
            _make_feedback(target_type="digest_headline", sentiment=-1),
            _make_feedback(target_type="digest_headline", sentiment=-1),
        ]
        result = _render_feedback_tendency(feedback)
        assert "【反馈倾向" in result
        assert "digest_headline" in result

    def test_empty_when_negatives_spread_across_types(self):
        """One negative per type is not significant."""
        feedback = [
            _make_feedback(target_type="digest_headline", sentiment=-1),
            _make_feedback(target_type="health_diagnosis", sentiment=-1),
        ]
        result = _render_feedback_tendency(feedback)
        assert result == ""

    def test_includes_snapshot_text(self):
        feedback = [
            _make_feedback(
                target_type="digest_headline",
                sentiment=-1,
                snapshot={"text": "市场暴跌引发恐慌"},
            ),
            _make_feedback(
                target_type="digest_headline",
                sentiment=-1,
                snapshot={"text": "另一条消息"},
            ),
        ]
        result = _render_feedback_tendency(feedback)
        assert "市场暴跌引发恐慌" in result

    def test_respects_char_limit(self):
        feedback = [
            _make_feedback(
                target_type="digest_headline",
                sentiment=-1,
                snapshot={"text": "x" * 200},
            )
            for _ in range(10)
        ]
        result = _render_feedback_tendency(feedback)
        assert len(result) <= MAX_FEEDBACK_CHARS


# =============================================================================
# _render_tracking tests
# =============================================================================


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


# =============================================================================
# get_user_memory integration tests
# =============================================================================


class TestGetUserMemory:
    @pytest.mark.asyncio
    async def test_empty_data_returns_empty(self):
        """No data at all -> empty string."""
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=[])
            mock_mdb.get_recent_feedback = AsyncMock(return_value=[])
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=[])

            result = await get_user_memory("user-123")
            assert result == ""

    @pytest.mark.asyncio
    async def test_thesis_only(self):
        """Only theses present -> renders thesis section."""
        holdings = [_make_holding("AAPL", "AI 增长引擎")]
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=holdings)
            mock_mdb.get_recent_feedback = AsyncMock(return_value=[])
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=[])

            result = await get_user_memory("user-123")
            assert "## 用户记忆" in result
            assert "【持仓 thesis】" in result
            assert "AAPL" in result

    @pytest.mark.asyncio
    async def test_feedback_only_needs_two_negatives(self):
        """Feedback section needs >=2 negatives of same type."""
        feedback = [
            _make_feedback("digest_headline", -1, {"text": "坏消息"}),
            _make_feedback("digest_headline", -1, {"text": "坏消息 2"}),
        ]
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=[])
            mock_mdb.get_recent_feedback = AsyncMock(return_value=feedback)
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=[])

            result = await get_user_memory("user-123")
            assert "## 用户记忆" in result
            assert "【反馈倾向" in result

    @pytest.mark.asyncio
    async def test_tracking_only(self):
        """Only tracking data present -> renders tracking section."""
        suggestions = [_make_suggestion("建议保留现金")]
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=[])
            mock_mdb.get_recent_feedback = AsyncMock(return_value=[])
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=suggestions)

            result = await get_user_memory("user-123")
            assert "## 用户记忆" in result
            assert "【建议追踪】" in result

    @pytest.mark.asyncio
    async def test_all_three_sections(self):
        """All data present -> combined markdown."""
        holdings = [_make_holding("AAPL", "AI 增长")]
        feedback = [
            _make_feedback("digest_headline", -1, {"text": "坏消息"}),
            _make_feedback("digest_headline", -1, {"text": "坏消息 2"}),
        ]
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
            mock_mdb.get_recent_feedback = AsyncMock(return_value=feedback)
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=suggestions)

            result = await get_user_memory("user-123")
            assert "## 用户记忆" in result
            assert "【持仓 thesis】" in result
            assert "【反馈倾向" in result
            assert "【建议追踪】" in result

    @pytest.mark.asyncio
    async def test_total_length_within_limit(self):
        """Combined output stays within ~2100 chars."""
        holdings = [
            _make_holding(f"SYM{i}", "x" * 60) for i in range(15)
        ]
        feedback = [
            _make_feedback("digest_headline", -1, {"text": "y" * 60})
            for _ in range(10)
        ]
        suggestions = [_make_suggestion(f"建议 {i}") for i in range(5)]

        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=holdings)
            mock_mdb.get_recent_feedback = AsyncMock(return_value=feedback)
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=suggestions)

            result = await get_user_memory("user-123")
            # 2100 chars ~ 1050 tokens, allow some header overhead
            assert len(result) <= 2200

    @pytest.mark.asyncio
    async def test_error_handling_returns_empty(self):
        """Exception during data loading -> returns empty string."""
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(
                side_effect=Exception("DB down")
            )
            mock_mdb.get_recent_feedback = AsyncMock(
                side_effect=Exception("DB down")
            )
            mock_mdb.get_pending_and_recent = AsyncMock(
                side_effect=Exception("DB down")
            )

            result = await get_user_memory("user-123")
            assert result == ""

    @pytest.mark.asyncio
    async def test_holdings_without_thesis_excluded(self):
        """Holdings with empty thesis are not included."""
        holdings = [
            _make_holding("AAPL", "AI 增长"),
            _make_holding("MSFT", ""),  # no thesis
            _make_holding("GOOG", None),  # no thesis
        ]
        with (
            patch("app.features.memory.service.portfolio_db") as mock_pdb,
            patch("app.features.memory.service.memory_db") as mock_mdb,
        ):
            mock_pdb.list_portfolio = AsyncMock(return_value=holdings)
            mock_mdb.get_recent_feedback = AsyncMock(return_value=[])
            mock_mdb.get_pending_and_recent = AsyncMock(return_value=[])

            result = await get_user_memory("user-123")
            assert "AAPL" in result
            assert "MSFT" not in result
            assert "GOOG" not in result
