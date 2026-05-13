"""Tests for shared/profile_context.py::inject_profile()."""

import pytest

from app.features.portfolio.models import ProfileView
from app.shared.profile_context import inject_profile


def _make_profile(**overrides) -> ProfileView:
    defaults = dict(
        user_id="u1", style="passive", horizon="long",
        risk_tolerance="moderate", notify_mode="events_only",
    )
    return ProfileView(**{**defaults, **overrides})


class TestInjectProfile:
    """inject_profile() pure function tests."""

    def test_none_profile_uses_defaults(self):
        result = inject_profile("base instruction", None)
        assert "被动/指数投资者" in result
        assert "长期（3 年以上）" in result
        assert "中等" in result
        assert "base instruction" in result

    def test_profile_fields_appear_in_output(self):
        profile = _make_profile(style="active", horizon="short", risk_tolerance="high")
        result = inject_profile("do something", profile)
        assert "主动择股投资者" in result
        assert "短期（< 1 年）" in result
        assert "激进" in result
        assert "do something" in result

    def test_header_prepended_before_instruction(self):
        result = inject_profile("original instruction", _make_profile())
        idx_header = result.index("用户画像")
        idx_instruction = result.index("original instruction")
        assert idx_header < idx_instruction

    def test_empty_instruction_still_works(self):
        result = inject_profile("", _make_profile(style="balanced"))
        assert "平衡型投资者" in result

    def test_all_three_styles(self):
        for style, label in [("passive", "被动"), ("balanced", "平衡"), ("active", "主动")]:
            result = inject_profile("x", _make_profile(style=style))
            assert label in result

    def test_all_three_horizons(self):
        for horizon, label in [("short", "短期"), ("mid", "中期"), ("long", "长期")]:
            result = inject_profile("x", _make_profile(horizon=horizon))
            assert label in result

    def test_all_three_risk_levels(self):
        for risk, label in [("low", "保守"), ("moderate", "中等"), ("high", "激进")]:
            result = inject_profile("x", _make_profile(risk_tolerance=risk))
            assert label in result

    def test_risk_warning_language_present(self):
        result = inject_profile("x", _make_profile())
        assert "重仓" in result or "梭哈" in result or "抄底" in result

    def test_returns_string(self):
        assert isinstance(inject_profile("x", None), str)
        assert isinstance(inject_profile("x", _make_profile()), str)
