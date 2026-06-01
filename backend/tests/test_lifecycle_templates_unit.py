"""Unit tests for lifecycle email templates (Phase 2 onboarding sequence)."""

import pytest

from app.features.subscription.lifecycle_templates import (
    LIFECYCLE_DAYS,
    LifecycleEmail,
    render,
    render_d0,
    render_d4,
    render_d6,
    render_d11,
    render_d14,
)


def test_lifecycle_days_constant_matches_plan():
    """Plan: D0, D1, D2, D4, D6, D8, D11, D14."""
    assert LIFECYCLE_DAYS == (0, 1, 2, 4, 6, 8, 11, 14)


@pytest.mark.parametrize("day", LIFECYCLE_DAYS)
def test_render_returns_email_for_every_lifecycle_day(day):
    payload = render(day, name="Alice")
    assert isinstance(payload, LifecycleEmail)
    assert payload.subject
    assert payload.html.startswith("<!DOCTYPE html>")
    assert "TheMarketBrew" in payload.html
    assert payload.text


def test_render_returns_none_for_unknown_day():
    assert render(3, name="x") is None
    assert render(99, name="x") is None


def test_d0_includes_digest_html_when_provided():
    sample = '<p style="color:red;">live digest snippet</p>'
    payload = render_d0("Alice", twitter_digest_html=sample)
    assert sample in payload.html


def test_d0_falls_back_when_digest_missing():
    payload = render_d0("Alice", twitter_digest_html="")
    assert "正在生成" in payload.html


def test_d4_points_to_max_pricing():
    payload = render_d4("Alice")
    assert "pricing" in payload.html
    assert "max" in payload.html.lower()


def test_d6_swaps_in_chosen_sample_ticker():
    payload = render_d6("Alice", sample_ticker="TSLA")
    assert "Tesla" in payload.html
    assert "TSLA" in payload.html


def test_d6_falls_back_to_nvda_for_unknown_ticker():
    payload = render_d6("Alice", sample_ticker="ZZZZ")
    assert "NVIDIA" in payload.html


def test_d11_pivots_on_behavior_hint():
    max_pitch = render_d11("Alice", behavior_hint="max_pitch")
    pro_pitch = render_d11("Alice", behavior_hint="pro_pitch")
    default = render_d11("Alice", behavior_hint="default")

    # All three subjects are distinct
    assert max_pitch.subject != pro_pitch.subject
    assert max_pitch.subject != default.subject
    assert pro_pitch.subject != default.subject

    # Max pitch routes to Max pricing; Pro/default route to Pro pricing
    assert "plan=max" in max_pitch.html
    assert "plan=pro" in pro_pitch.html
    assert "plan=pro" in default.html
    assert "第 11 天" in default.subject


def test_d14_emits_offer_with_discount():
    payload = render_d14("Alice", discount_pct=25)
    assert "25" in payload.subject
    assert "25" in payload.html


def test_d14_default_discount_is_twenty():
    payload = render_d14("Alice")
    assert "20" in payload.subject
