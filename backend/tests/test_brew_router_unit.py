"""
Brew Router Unit Tests

Tests for _transform_digest_sections() from app.features.brew.router.
Pure transformation logic only - no network calls, no database access.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_brew_router_unit.py -v
"""

import pytest
from pydantic import ValidationError
from fastapi import HTTPException
from starlette.requests import Request

from app.features.brew.router import (
    _transform_digest_sections,
    DigestRequest,
    WatchlistSaveRequest,
    generate_digest,
    get_watchlist,
    save_watchlist,
)
from app.features.brew.models import (
    StockAnalysis,
    DigestHeadlineNews,
    DigestBriefNews,
    DigestNewsSection,
    DigestEvent,
    DigestSummary,
)


@pytest.fixture
def full_digest_data():
    """Full digest data dict with all sections populated."""
    return {
        "stocks": [
            {
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "price": 192.50,
                "daily_change": "+1.5%",
                "week_change": "+3.2%",
                "status": "Strong uptrend",
                "quick_take": "iPhone demand remains solid.",
            },
            {
                "symbol": "NVDA",
                "name": "NVIDIA Corp",
                "price": 875.30,
                "daily_change": "+2.8%",
                "week_change": "+5.1%",
                "status": "AI momentum",
                "quick_take": "Data center revenue continues to accelerate.",
            },
        ],
        "news": {
            "headlines": [
                {
                    "title": "Chip stocks rally",
                    "related_symbols": ["NVDA", "AMD"],
                    "fact_summary": "Semiconductor ETF up 3%.",
                    "deep_analysis": "AI infrastructure spend drives sector.",
                    "url": "https://example.com/chips",
                }
            ],
            "briefs": [
                {
                    "title": "Apple supplier guidance",
                    "related_symbols": ["AAPL"],
                    "summary": "Key supplier raises guidance.",
                    "analysis": "Positive for iPhone supply chain.",
                    "url": "https://example.com/aapl-supply",
                }
            ],
        },
        "events": [
            {
                "date": "2025-01-28",
                "event": "Apple Q1 Earnings",
                "related_symbols": ["AAPL"],
                "why_important": "Key test for iPhone 16 cycle.",
            }
        ],
        "summary": {"content": "Both stocks are in bullish territory."},
    }


class TestTransformDigestSections:
    """Test _transform_digest_sections() from brew router."""

    def test_returns_four_elements(self, full_digest_data):
        """Transform returns a 4-element tuple (stocks, news, events, summary)."""
        result = _transform_digest_sections(full_digest_data)
        assert len(result) == 4

    def test_stocks_transformed(self, full_digest_data):
        """Stocks are transformed into StockAnalysis objects with correct data."""
        stocks, _, _, _ = _transform_digest_sections(full_digest_data)
        assert len(stocks) == 2
        assert isinstance(stocks[0], StockAnalysis)
        assert stocks[0].symbol == "AAPL"
        assert stocks[0].price == 192.50
        assert stocks[1].symbol == "NVDA"

    def test_news_headlines_transformed(self, full_digest_data):
        """News headlines are transformed into DigestHeadlineNews objects."""
        _, news, _, _ = _transform_digest_sections(full_digest_data)
        assert isinstance(news, DigestNewsSection)
        assert len(news.headlines) == 1
        assert isinstance(news.headlines[0], DigestHeadlineNews)
        assert news.headlines[0].title == "Chip stocks rally"

    def test_news_briefs_transformed(self, full_digest_data):
        """News briefs are transformed into DigestBriefNews objects."""
        _, news, _, _ = _transform_digest_sections(full_digest_data)
        assert len(news.briefs) == 1
        assert isinstance(news.briefs[0], DigestBriefNews)
        assert news.briefs[0].title == "Apple supplier guidance"

    def test_events_transformed(self, full_digest_data):
        """Events are transformed into DigestEvent objects."""
        _, _, events, _ = _transform_digest_sections(full_digest_data)
        assert len(events) == 1
        assert isinstance(events[0], DigestEvent)
        assert events[0].event == "Apple Q1 Earnings"
        assert events[0].date == "2025-01-28"

    def test_summary_transformed(self, full_digest_data):
        """Summary is transformed into a DigestSummary object."""
        _, _, _, summary = _transform_digest_sections(full_digest_data)
        assert isinstance(summary, DigestSummary)
        assert summary.content == "Both stocks are in bullish territory."

    def test_empty_data(self):
        """Empty dict produces empty defaults for all sections."""
        stocks, news, events, summary = _transform_digest_sections({})
        assert stocks == []
        assert isinstance(news, DigestNewsSection)
        assert news.headlines == []
        assert news.briefs == []
        assert events == []
        assert isinstance(summary, DigestSummary)
        assert summary.content == ""

    def test_news_as_non_dict(self):
        """When news value is not a dict, returns empty news section."""
        data = {"news": "not a dict"}
        _, news, _, _ = _transform_digest_sections(data)
        assert isinstance(news, DigestNewsSection)
        assert news.headlines == []
        assert news.briefs == []

    def test_summary_as_string(self):
        """When summary is a string (not dict), content defaults to empty."""
        data = {"summary": "just a string"}
        _, _, _, summary = _transform_digest_sections(data)
        assert isinstance(summary, DigestSummary)
        assert summary.content == ""

    def test_missing_stock_fields_use_defaults(self):
        """Stock entries missing fields fall back to defaults."""
        data = {"stocks": [{"symbol": "TSLA"}]}
        stocks, _, _, _ = _transform_digest_sections(data)
        assert len(stocks) == 1
        assert stocks[0].symbol == "TSLA"
        assert stocks[0].name == ""
        assert stocks[0].price == 0
        assert stocks[0].daily_change == ""
        assert stocks[0].week_change == ""
        assert stocks[0].status == ""
        assert stocks[0].quick_take == ""


class TestWatchlistValidation:
    """Tests for watchlist request normalization/validation."""

    def test_normalizes_and_deduplicates_symbols(self):
        body = WatchlistSaveRequest(symbols=[" aapl ", "AAPL", "brk.b", "", " ^vix "])
        assert body.symbols == ["AAPL", "BRK.B", "^VIX"]

    def test_rejects_invalid_symbol(self):
        with pytest.raises(ValidationError):
            WatchlistSaveRequest(symbols=["AAPL", "BAD SYMBOL!"])

    def test_rejects_more_than_25_symbols(self):
        with pytest.raises(ValidationError):
            WatchlistSaveRequest(symbols=[f"S{i}" for i in range(26)])


@pytest.mark.asyncio
class TestGetWatchlistEndpoint:
    """Tests for get_watchlist endpoint failure/success semantics."""

    async def test_returns_502_when_upstream_fetch_fails(self, monkeypatch):
        async def _mock_get_user_watchlist(_user_id: str):
            return None

        monkeypatch.setattr("app.features.brew.router.get_user_watchlist", _mock_get_user_watchlist)

        with pytest.raises(HTTPException) as exc:
            await get_watchlist(user_id="user-1")

        assert exc.value.status_code == 502

    async def test_returns_success_payload_on_success(self, monkeypatch):
        async def _mock_get_user_watchlist(_user_id: str):
            return {"user_id": "user-1", "symbols": ["AAPL"]}

        monkeypatch.setattr("app.features.brew.router.get_user_watchlist", _mock_get_user_watchlist)

        result = await get_watchlist(user_id="user-1")
        assert result["success"] is True
        assert result["data"]["symbols"] == ["AAPL"]


@pytest.mark.asyncio
class TestSaveWatchlistEndpoint:
    """Tests for save_watchlist endpoint error handling."""

    async def test_forwards_base_updated_at_to_db(self, monkeypatch):
        calls: dict[str, object] = {}

        async def _mock_save_user_watchlist(*, user_id: str, symbols: list[str], email: str, base_updated_at: str | None):
            calls["user_id"] = user_id
            calls["symbols"] = symbols
            calls["email"] = email
            calls["base_updated_at"] = base_updated_at
            return {"success": True, "data": {"user_id": user_id, "symbols": symbols}}

        monkeypatch.setattr("app.features.brew.router.save_user_watchlist", _mock_save_user_watchlist)

        body = WatchlistSaveRequest(symbols=["AAPL"], email="tester@example.com", base_updated_at="2026-03-06T10:00:00Z")
        result = await save_watchlist(body=body, user_id="user-1")

        assert result["success"] is True
        assert calls == {
            "user_id": "user-1",
            "symbols": ["AAPL"],
            "email": "tester@example.com",
            "base_updated_at": "2026-03-06T10:00:00Z",
        }

    async def test_returns_409_when_watchlist_version_conflicts(self, monkeypatch):
        async def _mock_save_user_watchlist(*, user_id: str, symbols: list[str], email: str, base_updated_at: str | None):
            return {
                "success": False,
                "error": "Watchlist was updated elsewhere. Please refresh and try again.",
                "status_code": 409,
            }

        monkeypatch.setattr("app.features.brew.router.save_user_watchlist", _mock_save_user_watchlist)

        with pytest.raises(HTTPException) as exc:
            await save_watchlist(
                body=WatchlistSaveRequest(symbols=["AAPL"], base_updated_at="2026-03-06T10:00:00Z"),
                user_id="user-1",
            )

        assert exc.value.status_code == 409
        assert exc.value.detail == "Watchlist was updated elsewhere. Please refresh and try again."


@pytest.mark.asyncio
class TestGenerateDigestEndpoint:
    """Tests for generate_digest auth semantics."""

    @staticmethod
    def _request() -> Request:
        return Request({"type": "http", "method": "POST", "path": "/api/digest", "headers": []})

    async def test_requires_symbols(self):
        with pytest.raises(HTTPException) as exc:
            await generate_digest(request=self._request(), body=DigestRequest(symbols=[]), user_id="user-1")

        assert exc.value.status_code == 400

    async def test_uses_authenticated_user_id_for_cache_and_generation(self, monkeypatch):
        calls: dict[str, object] = {}

        async def _mock_get_user_digest(user_id: str, digest_date: str):
            calls["cache_user_id"] = user_id
            calls["digest_date"] = digest_date
            return None

        class _MockAgent:
            async def generate(self, *, symbols: list[str], user_id: str):
                calls["agent_symbols"] = symbols
                calls["agent_user_id"] = user_id
                return {
                    "success": True,
                    "timestamp": "2026-03-06T12:00:00Z",
                    "symbols_used": symbols,
                    "greeting": "hello",
                    "one_line_summary": "summary",
                    "stocks": [],
                    "news": {},
                    "events": [],
                    "summary": {"content": "ok"},
                }

        async def _mock_save_user_digest(payload: dict):
            calls["save_payload"] = payload
            return {"success": True, "digest_id": "digest-1"}

        monkeypatch.setattr("app.features.brew.router.get_user_digest", _mock_get_user_digest)
        monkeypatch.setattr("app.features.brew.router.get_personal_digest", lambda: _MockAgent())
        monkeypatch.setattr("app.features.brew.router.save_user_digest", _mock_save_user_digest)
        monkeypatch.setattr("app.features.brew.router.ENVIRONMENT", "production")

        result = await generate_digest(
            request=self._request(),
            body=DigestRequest(symbols=["AAPL", "NVDA"]),
            user_id="token-user",
        )

        assert result.success is True
        assert calls["cache_user_id"] == "token-user"
        assert calls["agent_user_id"] == "token-user"
        assert calls["agent_symbols"] == ["AAPL", "NVDA"]
        assert calls["save_payload"]["user_id"] == "token-user"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
