"""Offline regression checks for low-cost classification billing."""

import pytest

from app.shared.llm_pricing import estimate_usd


@pytest.mark.parametrize("day", ["2026-09-17", "2027-01-01"])
def test_lite_bills_thoughts_and_cached_input_without_flash_promotion(day):
    assert estimate_usd(
        "gemini-3.5-flash-lite", 1_000_000, 100_000,
        thoughts_tokens=300_000, cached_tokens=200_000, usage_day=day,
    ) == pytest.approx(1.246)


def test_lite_cached_tokens_cannot_exceed_prompt_tokens():
    assert estimate_usd(
        "gemini-3.5-flash-lite", 100, 0, cached_tokens=200,
    ) == pytest.approx(0.000003)
