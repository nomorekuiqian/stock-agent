"""
Unit tests for liquidity fallback reconstruction.

No network access and no database dependency.
"""

import pytest

from app.features.macro.liquidity.fred_service import (
    _build_liquidity_metrics_from_history,
    _has_liquidity_metric_values,
)


def test_build_liquidity_metrics_from_history_latest_point():
    history = {
        "observations": [
            {
                "time": "2026-04-10",
                "value": 5700.0,
                "fed_assets": 6600.0,
                "tga": 900.0,
                "rrp": 0.2,
                "reserves": 3100.0,
                "sofr": 3.70,
                "effr": 3.65,
                "nfci": -0.50,
            },
            {
                "time": "2026-04-17",
                "value": 5781.12,
                "fed_assets": 6705.696,
                "tga": 924.435,
                "rrp": 0.137,
                "reserves": 3129.588,
                "sofr": 3.67,
                "effr": 3.64,
                "nfci": -0.465,
            },
        ]
    }

    metrics = _build_liquidity_metrics_from_history(history)

    assert metrics is not None
    assert metrics["net_liquidity"]["value"] == 5781.12
    assert metrics["net_liquidity"]["date"] == "2026-04-17"
    assert metrics["fed_assets"]["units"] == "Billions of Dollars"
    assert metrics["sofr"]["value"] == 3.67
    assert metrics["effr"]["value"] == 3.64
    assert metrics["nfci"]["value"] == -0.465
    assert metrics["net_liquidity"]["change"] == pytest.approx(1.4231, abs=0.001)


def test_has_liquidity_metric_values_rejects_all_null_payload():
    assert not _has_liquidity_metric_values({
        "fed_assets": {"value": None},
        "net_liquidity": {"value": None},
    })

    assert _has_liquidity_metric_values({
        "fed_assets": {"value": 6705.696},
        "net_liquidity": {"value": None},
    })
