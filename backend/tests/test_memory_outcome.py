"""
Tests for memory outcome computation — pure functions.

Tests compute_outcome() and _judge_direction() with various scenarios.
"""

import pytest

from app.features.memory.outcome import compute_outcome, _judge_direction


# =============================================================================
# _judge_direction tests
# =============================================================================


class TestJudgeDirection:
    """Test rule-based direction judgment."""

    def test_cash_suggestion_market_down_correct(self):
        """Cash/hold suggestion when market fell -> direction correct."""
        result = _judge_direction("建议保留现金观望", {}, -0.03)
        assert result is True

    def test_cash_suggestion_market_up_incorrect(self):
        """Cash suggestion when market rose -> direction incorrect."""
        result = _judge_direction("建议持币等待机会", {}, 0.02)
        assert result is False

    def test_cash_english_keyword(self):
        """English 'cash' keyword should also match."""
        result = _judge_direction("recommend holding cash", {}, -0.01)
        assert result is True

    def test_观望_market_down(self):
        """观望 (wait-and-see) when market fell -> correct."""
        result = _judge_direction("建议观望", {}, -0.05)
        assert result is True

    def test_观望_market_up(self):
        """观望 when market rose -> incorrect."""
        result = _judge_direction("建议观望不操作", {}, 0.03)
        assert result is False

    def test_defensive_outperforms_correct(self):
        """Defensive suggestion when defensive sectors outperform -> correct."""
        sector_vs_spy = {
            "Utilities": 0.02,
            "Technology": -0.03,
            "Consumer Staples": 0.01,
        }
        result = _judge_direction("建议转向防御性板块", sector_vs_spy, -0.02)
        assert result is True

    def test_defensive_underperforms_incorrect(self):
        """Defensive suggestion when defensive sectors underperform -> incorrect."""
        sector_vs_spy = {
            "Utilities": -0.01,
            "Technology": 0.03,
            "Consumer Staples": -0.02,
            "Healthcare": -0.01,
        }
        result = _judge_direction("降低风险配置", sector_vs_spy, 0.02)
        assert result is False

    def test_避险_defensive_outperforms(self):
        """避险 keyword triggers defensive rule."""
        sector_vs_spy = {"Healthcare": 0.05}
        result = _judge_direction("建议避险", sector_vs_spy, -0.01)
        assert result is True

    def test_tech_concentration_underperforms_correct(self):
        """Tech concentration warning when tech underperforms -> correct."""
        sector_vs_spy = {"Technology": -0.05}
        result = _judge_direction("科技集中度过高，建议分散", sector_vs_spy, 0.01)
        assert result is True

    def test_tech_concentration_outperforms_incorrect(self):
        """Tech concentration warning when tech outperforms -> incorrect."""
        sector_vs_spy = {"Technology": 0.03}
        result = _judge_direction("减少科技板块占比", sector_vs_spy, 0.01)
        assert result is False

    def test_科技占比_keyword(self):
        """科技占比 keyword triggers tech concentration rule."""
        sector_vs_spy = {"Technology": -0.02}
        result = _judge_direction("科技占比偏高", sector_vs_spy, 0.0)
        assert result is True

    def test_unknown_text_returns_none(self):
        """Text with no matching keywords -> None (unknown)."""
        result = _judge_direction("建议关注新能源板块", {}, 0.01)
        assert result is None

    def test_empty_text_returns_none(self):
        """Empty text -> None."""
        result = _judge_direction("", {}, 0.0)
        assert result is None


# =============================================================================
# compute_outcome tests
# =============================================================================


class TestComputeOutcome:
    """Test full outcome computation."""

    def test_cash_correct_outcome(self):
        """Cash suggestion + market down -> direction_correct=True."""
        result = compute_outcome(
            suggestion_text="建议保留现金",
            spy_return_7d=-0.03,
            sector_returns_7d={"Technology": -0.05, "Utilities": -0.01},
            portfolio_change_7d=-0.02,
        )
        assert result["direction_correct"] is True
        assert result["spy_return_7d"] == -0.03
        assert result["portfolio_change_7d"] == -0.02
        assert "sector_vs_spy" in result
        assert "narrative" in result

    def test_cash_incorrect_outcome(self):
        """Cash suggestion + market up -> direction_correct=False."""
        result = compute_outcome(
            suggestion_text="建议持币观望",
            spy_return_7d=0.05,
            sector_returns_7d={"Technology": 0.08},
        )
        assert result["direction_correct"] is False
        assert result["portfolio_change_7d"] is None

    def test_defensive_correct_outcome(self):
        """Defensive suggestion with defensive outperforming."""
        result = compute_outcome(
            suggestion_text="建议防御配置",
            spy_return_7d=-0.02,
            sector_returns_7d={
                "Utilities": 0.01,
                "Technology": -0.05,
            },
        )
        assert result["direction_correct"] is True
        # Utilities vs SPY = 0.01 - (-0.02) = 0.03 > 0
        assert result["sector_vs_spy"]["Utilities"] == pytest.approx(0.03)

    def test_unknown_direction_outcome(self):
        """Unknown suggestion text -> direction_correct=None."""
        result = compute_outcome(
            suggestion_text="关注半导体行业",
            spy_return_7d=0.01,
            sector_returns_7d={"Technology": 0.02},
        )
        assert result["direction_correct"] is None

    def test_sector_vs_spy_computation(self):
        """Verify sector_vs_spy is correctly computed."""
        result = compute_outcome(
            suggestion_text="test",
            spy_return_7d=0.02,
            sector_returns_7d={
                "Technology": 0.05,
                "Utilities": -0.01,
            },
        )
        assert result["sector_vs_spy"]["Technology"] == pytest.approx(0.03)
        assert result["sector_vs_spy"]["Utilities"] == pytest.approx(-0.03)

    def test_narrative_correct(self):
        """Narrative for correct direction."""
        result = compute_outcome(
            suggestion_text="建议保留现金",
            spy_return_7d=-0.03,
            sector_returns_7d={},
        )
        assert "方向正确" in result["narrative"]
        assert "SPY" in result["narrative"]

    def test_narrative_incorrect(self):
        """Narrative for incorrect direction."""
        result = compute_outcome(
            suggestion_text="建议持币",
            spy_return_7d=0.05,
            sector_returns_7d={},
        )
        assert "方向偏差" in result["narrative"]

    def test_narrative_unknown(self):
        """Narrative for unknown direction."""
        result = compute_outcome(
            suggestion_text="关注某个板块",
            spy_return_7d=0.01,
            sector_returns_7d={},
        )
        assert "无法判断" in result["narrative"]
