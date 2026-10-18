from unittest.mock import AsyncMock, patch
import pytest
from app.features.morning_report.router import _maybe_lock_report
from app.features.stock.router import get_stock_analysis_preview


def test_public_morning_excerpt_and_private_remainder():
    report = {"futures_analysis": "公开期货解读" * 35 + "\n\nPRIVATE", "global_markets_analysis": "公开全球市场解读" * 20, "market_pulse": "PRIVATE", "summary": ["PRIVATE"]}
    result = _maybe_lock_report(report, viewer_has_access=False)
    assert 150 <= len(result["public_excerpt"]) <= 250
    assert "PRIVATE" not in result["public_excerpt"]
    assert "全球市场" not in result["public_excerpt"]
    assert result["global_markets_analysis"] == ""
    assert result["futures_analysis"] == ""
    assert result["summary"] == []
    assert result["is_locked"] is True
    assert report["summary"] == ["PRIVATE"]
    assert _maybe_lock_report(report, viewer_has_access=True)["summary"] == ["PRIVATE"]


@pytest.mark.asyncio
async def test_stock_preview_never_returns_full_cache():
    cached = {"content": {"investment_summary": "摘要" * 150 + "\n\nPRIVATE", "financial_health": "PRIVATE"}, "generated_at": "2026-10-18T00:00:00Z"}
    with patch("app.features.stock.router.get_stock_analysis", new=AsyncMock(return_value=cached)):
        result = await get_stock_analysis_preview("NVDA")
    assert len(result["excerpt"]) == 250
    assert set(result) == {"excerpt", "generated_at"}
    assert "PRIVATE" not in str(result)


@pytest.mark.asyncio
async def test_stock_preview_missing_cache():
    with patch("app.features.stock.router.get_stock_analysis", new=AsyncMock(return_value=None)):
        assert (await get_stock_analysis_preview("NVDA"))["excerpt"] == ""
