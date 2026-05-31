"""Unit tests for DB-only macro brief composition."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

import app.shared.data_tools.briefs as briefs


def _cache_row(key: str, data: Any, *, expires_in_hours: float = 1.0) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "data_key": key,
        "data": data,
        "fetched_at": (now - timedelta(minutes=5)).isoformat(),
        "expires_at": (now + timedelta(hours=expires_in_hours)).isoformat(),
        "source": "test",
        "error": None,
    }


@pytest.mark.asyncio
async def test_get_macro_brief_reads_database_cache_only(monkeypatch):
    captured_keys: list[str] = []

    async def fake_get_cached_many(keys: list[str]) -> dict[str, dict[str, Any] | None]:
        captured_keys.extend(keys)
        return {
            key: None for key in keys
        } | {
            "macro:dashboard": _cache_row("macro:dashboard", {
                "composite_score": 3.2,
                "composite_level": "low",
                "categories": [
                    {
                        "category_name": "Liquidity",
                        "risk_score": 2.5,
                        "risk_level": "low",
                        "headline": "流动性风险低",
                    }
                ],
                "liquidity_summary": {"net_liquidity": 6100},
            }),
            "fred:liquidity_metrics": _cache_row("fred:liquidity_metrics", {
                "net_liquidity": {
                    "title": "Net Liquidity",
                    "value": 6100,
                    "date": "2026-05-29",
                    "change": 0.4,
                }
            }),
            "macro:sentiment": _cache_row("macro:sentiment", {
                "overall_score": 58,
                "overall_level": "medium",
                "overall_headline": "情绪中性偏强",
                "sub_dimensions": [
                    {
                        "name": "cnn_indicators",
                        "name_zh": "CNN 恐慌贪婪指数",
                        "score": 5.8,
                        "risk_level": "medium",
                        "headline": "中性",
                    }
                ],
            }),
            "macro:economic_calendar": _cache_row("macro:economic_calendar", {
                "status": "success",
                "events": [
                    {
                        "date": "2026-06-03 08:30:00",
                        "event": "Non-Farm Payrolls",
                        "previous": 150000,
                        "estimate": 170000,
                        "actual": None,
                        "is_key_event": True,
                    }
                ],
            }),
        }

    monkeypatch.setattr(briefs, "get_cached_many", fake_get_cached_many)

    payload = json.loads(await briefs.get_macro_brief())

    assert payload["cache"]["policy"] == "db_only"
    assert payload["risk_summary"]["composite_score"] == 3.2
    assert payload["risk_summary"]["categories"][0]["name"] == "Liquidity"
    assert payload["liquidity"]["net_liquidity"]["value"] == 6100
    assert payload["sentiment"]["overall_score"] == 58
    assert payload["economic_calendar"]["events_count"] == 1
    assert "error" not in payload
    assert "macro:economic_calendar" in captured_keys


@pytest.mark.asyncio
async def test_get_macro_brief_returns_stale_cache_with_freshness(monkeypatch):
    async def fake_get_cached_many(keys: list[str]) -> dict[str, dict[str, Any] | None]:
        return {
            key: None for key in keys
        } | {
            "macro:dashboard": _cache_row(
                "macro:dashboard",
                {
                    "composite_score": 6.7,
                    "composite_level": "medium",
                    "categories": [],
                },
                expires_in_hours=-1,
            )
        }

    monkeypatch.setattr(briefs, "get_cached_many", fake_get_cached_many)

    payload = json.loads(await briefs.get_macro_brief())

    assert payload["risk_summary"]["composite_score"] == 6.7
    assert "risk_summary" in payload["cache"]["stale_sections"]
    assert payload["cache"]["freshness"]["risk_summary"]["is_stale"] is True
    assert "error" not in payload


@pytest.mark.asyncio
async def test_get_macro_brief_marks_error_when_all_cache_entries_missing(monkeypatch):
    async def fake_get_cached_many(keys: list[str]) -> dict[str, dict[str, Any] | None]:
        return {key: None for key in keys}

    monkeypatch.setattr(briefs, "get_cached_many", fake_get_cached_many)

    payload = json.loads(await briefs.get_macro_brief())

    assert payload["error"] == "macro cache unavailable"
    assert "risk_summary" in payload["cache"]["missing_sections"]
    assert payload["risk_summary"]["error"] == "macro cache entry is missing"


@pytest.mark.asyncio
async def test_get_macro_brief_accepts_inflation_v2_fallback_key(monkeypatch):
    async def fake_get_cached_many(keys: list[str]) -> dict[str, dict[str, Any] | None]:
        return {
            key: None for key in keys
        } | {
            "macro:inflation_rates:v2": _cache_row("macro:inflation_rates:v2", {
                "overall_score": 4.5,
                "overall_level": "medium",
                "overall_headline": "通胀仍有粘性",
                "sub_dimensions": [],
            })
        }

    monkeypatch.setattr(briefs, "get_cached_many", fake_get_cached_many)

    payload = json.loads(await briefs.get_macro_brief())

    assert payload["inflation_rates"]["overall_score"] == 4.5
    assert payload["cache"]["freshness"]["inflation_rates"]["cache_key"] == "macro:inflation_rates:v2"
