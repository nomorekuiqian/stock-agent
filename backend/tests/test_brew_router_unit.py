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
        result = await save_watchlist(body=body, user_info={"user_id": "user-1", "email": "tester@example.com"})

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
                user_info={"user_id": "user-1", "email": "test@example.com"},
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

    async def test_fresh_digest_response_includes_action_items(self, monkeypatch):
        """Agent-produced action_items should appear in the DigestResponse body."""
        async def _mock_get_user_digest(user_id: str, digest_date: str):
            return None

        class _MockAgent:
            async def generate(self, *, symbols: list[str], user_id: str):
                return {
                    "success": True,
                    "timestamp": "2026-03-06T12:00:00Z",
                    "symbols_used": symbols,
                    "greeting": "g",
                    "one_line_summary": "s",
                    "stocks": [],
                    "news": {},
                    "events": [],
                    "summary": {"content": "ok"},
                    "action_items": [
                        {"label": "看体检", "target": "health", "reason": "14 天未体检", "priority": 1},
                    ],
                }

        async def _mock_save_user_digest(payload: dict):
            return {"success": True, "digest_id": "d-1"}

        monkeypatch.setattr("app.features.brew.router.get_user_digest", _mock_get_user_digest)
        monkeypatch.setattr("app.features.brew.router.get_personal_digest", lambda: _MockAgent())
        monkeypatch.setattr("app.features.brew.router.save_user_digest", _mock_save_user_digest)
        monkeypatch.setattr("app.features.brew.router.ENVIRONMENT", "production")

        response = await generate_digest(
            request=self._request(),
            body=DigestRequest(symbols=["NVDA"]),
            user_id="token-user",
        )

        assert response.success is True
        assert len(response.action_items) == 1
        assert response.action_items[0].target == "health"
        assert response.action_items[0].label == "看体检"

    async def test_cache_hit_response_includes_action_items(self, monkeypatch):
        """Cached digest_data with action_items should be surfaced in the response."""
        async def _mock_get_user_digest(user_id: str, digest_date: str):
            return {
                "user_id": user_id,
                "created_at": "2026-03-06T08:00:00Z",
                "symbols": ["NVDA"],
                "greeting": "cached-greet",
                "one_line_summary": "cached-summary",
                "digest_data": {
                    "stocks": [],
                    "news": {"headlines": [], "briefs": []},
                    "events": [],
                    "summary": {"content": "cached"},
                    "action_items": [
                        {"label": "看组合", "target": "portfolio", "reason": "cached reason", "priority": 2},
                    ],
                },
            }

        monkeypatch.setattr("app.features.brew.router.get_user_digest", _mock_get_user_digest)

        response = await generate_digest(
            request=self._request(),
            body=DigestRequest(symbols=["NVDA"]),
            user_id="token-user",
        )

        assert response.success is True
        assert response.from_cache is True
        assert len(response.action_items) == 1
        assert response.action_items[0].target == "portfolio"
        assert response.action_items[0].label == "看组合"

    async def test_cache_hit_action_items_as_dict_coerced(self, monkeypatch):
        """LLM hallucination safety: cached action_items shaped as a dict
        (instead of a list) must be coerced to a single-item list instead of
        iterating dict keys and losing every chip."""

        async def _mock_get_user_digest(user_id: str, digest_date: str):
            return {
                "user_id": user_id,
                "created_at": "2026-03-06T08:00:00Z",
                "symbols": ["NVDA"],
                "greeting": "cached-greet",
                "one_line_summary": "cached-summary",
                "digest_data": {
                    "stocks": [],
                    "news": {"headlines": [], "briefs": []},
                    "events": [],
                    "summary": {"content": "cached"},
                    # Dict instead of list — simulating LLM hallucination
                    "action_items": {
                        "label": "看组合",
                        "target": "portfolio",
                        "reason": "cached reason",
                        "priority": 2,
                    },
                },
            }

        monkeypatch.setattr("app.features.brew.router.get_user_digest", _mock_get_user_digest)

        response = await generate_digest(
            request=self._request(),
            body=DigestRequest(symbols=["NVDA"]),
            user_id="token-user",
        )

        assert response.success is True
        assert response.from_cache is True
        # One item, coerced from dict
        assert len(response.action_items) == 1
        assert response.action_items[0].target == "portfolio"

    async def test_fresh_digest_save_data_includes_portfolio_summary(self, monkeypatch):
        """Persistence guarantee: router must forward portfolio_summary into
        save_data so the db.py round-trip (action_items + portfolio_summary)
        actually works end-to-end. Previously only action_items was forwarded."""
        captured_save: dict = {}

        async def _mock_save(payload: dict):
            captured_save.update(payload)
            return {"success": True, "digest_id": "uuid-new"}

        async def _mock_get_user_digest(user_id: str, digest_date: str):
            return None  # force fresh generation

        class _MockAgent:
            async def generate(self, *, symbols: list[str], user_id: str):
                return {
                    "success": True,
                    "timestamp": "2026-04-26T00:00:00Z",
                    "symbols_used": symbols,
                    "greeting": "g",
                    "one_line_summary": "ols",
                    "stocks": [],
                    "news": {"headlines": [], "briefs": []},
                    "events": [],
                    "summary": {"content": "c"},
                    "portfolio_summary": "组合涨 2%，NVDA 领涨",
                    "action_items": [
                        {"label": "x", "target": "portfolio", "reason": "r", "priority": 1},
                    ],
                }

        # Force the production save path
        monkeypatch.setattr("app.features.brew.router.ENVIRONMENT", "production")
        monkeypatch.setattr("app.features.brew.router.get_user_digest", _mock_get_user_digest)
        monkeypatch.setattr("app.features.brew.router.save_user_digest", _mock_save)
        monkeypatch.setattr("app.features.brew.router.get_personal_digest", lambda: _MockAgent())

        response = await generate_digest(
            request=self._request(),
            body=DigestRequest(symbols=["NVDA"]),
            user_id="token-user",
        )

        # Confirm save_data had BOTH keys
        assert "action_items" in captured_save
        assert "portfolio_summary" in captured_save
        assert captured_save["portfolio_summary"] == "组合涨 2%，NVDA 领涨"

        # And that the DigestResponse surfaces portfolio_summary too
        assert response.portfolio_summary == "组合涨 2%，NVDA 领涨"

    async def test_cache_hit_response_includes_portfolio_summary(self, monkeypatch):
        """Cached digest's portfolio_summary must surface on cache-hit response."""
        async def _mock_get_user_digest(user_id: str, digest_date: str):
            return {
                "user_id": user_id,
                "created_at": "2026-03-06T08:00:00Z",
                "symbols": ["NVDA"],
                "greeting": "g",
                "one_line_summary": "ols",
                "digest_data": {
                    "stocks": [],
                    "news": {"headlines": [], "briefs": []},
                    "events": [],
                    "summary": {"content": "ok"},
                    "action_items": [],
                    "portfolio_summary": "缓存的组合总结",
                },
            }

        monkeypatch.setattr("app.features.brew.router.get_user_digest", _mock_get_user_digest)

        response = await generate_digest(
            request=self._request(),
            body=DigestRequest(symbols=["NVDA"]),
            user_id="token-user",
        )

        assert response.success is True
        assert response.from_cache is True
        assert response.portfolio_summary == "缓存的组合总结"

    async def test_cache_hit_malformed_action_item_is_dropped_not_500(self, monkeypatch):
        """A malformed cached action_item must not 500 the whole digest — it should be dropped with a warning."""
        async def _mock_get_user_digest(user_id: str, digest_date: str):
            return {
                "user_id": user_id,
                "created_at": "2026-03-06T08:00:00Z",
                "symbols": ["NVDA"],
                "greeting": "g",
                "one_line_summary": "s",
                "digest_data": {
                    "stocks": [],
                    "news": {"headlines": [], "briefs": []},
                    "events": [],
                    "summary": {"content": "ok"},
                    "action_items": [
                        # Valid item
                        {"label": "看体检", "target": "health", "reason": "14 天未体检", "priority": 1},
                        # Malformed: missing required 'reason' and 'priority' fields
                        {"label": "broken", "target": "portfolio"},
                        # Malformed: priority out of range (>3)
                        {"label": "bad-pri", "target": "portfolio", "reason": "r", "priority": 99},
                    ],
                },
            }

        monkeypatch.setattr("app.features.brew.router.get_user_digest", _mock_get_user_digest)

        response = await generate_digest(
            request=self._request(),
            body=DigestRequest(symbols=["NVDA"]),
            user_id="token-user",
        )

        # Must not 500. Must return 200 with the valid item retained and the
        # malformed ones dropped.
        assert response.success is True
        assert response.from_cache is True
        assert len(response.action_items) == 1
        assert response.action_items[0].target == "health"


def test_action_item_accepts_router_payload_shape():
    """Schema sanity: ActionItem.model_validate accepts the router's raw dict shape."""
    from app.features.brew.router import _transform_digest_sections
    from app.features.brew.models import ActionItem

    # _transform_digest_sections handles stocks/news/events/summary; action_items
    # is passed through separately in the return path. Verify via a shaped result.
    result = {
        "timestamp": "2026-04-25T00:00:00Z",
        "symbols_used": ["NVDA"],
        "greeting": "g",
        "one_line_summary": "o",
        "stocks": [],
        "news": {"headlines": [], "briefs": []},
        "events": [],
        "summary": {"content": "c"},
        "action_items": [
            {"label": "看体检", "target": "health", "reason": "14 天未体检", "priority": 1},
        ],
    }
    # Validate that ActionItem.model_validate accepts router's raw dict shape
    items = [ActionItem.model_validate(i) for i in result["action_items"]]
    assert len(items) == 1
    assert items[0].target == "health"


@pytest.mark.asyncio
class TestAdminRegenerate:
    """POST /api/admin/digest/regenerate — force regen for a single user."""

    async def test_merges_watchlist_and_portfolio_symbols(self, monkeypatch):
        """Symbols passed to agent.generate must be watchlist ∪ portfolio,
        deduped — mirrors lazy POST. Regression for the email-cron bug where
        portfolio-only symbols were never analyzed."""
        from app.features.brew.router import (
            AdminRegenerateRequest,
            admin_regenerate_digest,
        )

        calls: dict[str, object] = {}

        async def _mock_get_watchlist(user_id: str):
            return {"symbols": ["AAPL", "MSFT"]}

        class _MockRow:
            def __init__(self, symbol):
                self.symbol = symbol

        async def _mock_list_portfolio(user_id: str):
            return [_MockRow("NVDA"), _MockRow("AMD"), _MockRow("$CASH"), _MockRow("MSFT")]

        class _MockAgent:
            async def generate(self, *, symbols: list[str], user_id: str):
                calls["agent_symbols"] = symbols
                calls["agent_user_id"] = user_id
                return {
                    "success": True,
                    "timestamp": "2026-05-20T22:00:00Z",
                    "symbols_used": symbols,
                    "greeting": "hi",
                    "one_line_summary": "summary",
                    "stocks": [{"symbol": s} for s in symbols],
                    "news": {"headlines": [], "briefs": []},
                    "events": [],
                    "summary": {"content": "ok"},
                    "action_items": [],
                    "portfolio_summary": "",
                }

        async def _mock_save(payload: dict):
            calls["save_payload"] = payload
            return {"success": True, "digest_id": "d-admin-1"}

        monkeypatch.setattr("app.features.brew.router.get_user_watchlist", _mock_get_watchlist)
        monkeypatch.setattr(
            "app.features.brew.router.portfolio_db.list_portfolio", _mock_list_portfolio
        )
        monkeypatch.setattr("app.features.brew.router.get_personal_digest", lambda: _MockAgent())
        monkeypatch.setattr("app.features.brew.router.save_user_digest", _mock_save)

        result = await admin_regenerate_digest(
            body=AdminRegenerateRequest(user_id="test-user-123"),
            _=True,
        )

        # Watchlist first (preserves caller-visible order), portfolio appended,
        # $CASH excluded, duplicates (MSFT) deduped.
        assert calls["agent_symbols"] == ["AAPL", "MSFT", "NVDA", "AMD"]
        assert calls["agent_user_id"] == "test-user-123"
        assert result["success"] is True
        assert result["stocks_count"] == 4
        assert result["digest_id"] == "d-admin-1"

    async def test_rejects_empty_symbols_with_400(self, monkeypatch):
        """User with no watchlist + no portfolio → 400, no agent call."""
        from app.features.brew.router import (
            AdminRegenerateRequest,
            admin_regenerate_digest,
        )

        async def _mock_get_watchlist(user_id: str):
            return {"symbols": []}

        async def _mock_list_portfolio(user_id: str):
            return []

        called = {"agent": False}

        class _MockAgent:
            async def generate(self, *, symbols, user_id):
                called["agent"] = True
                return {"success": True}

        monkeypatch.setattr("app.features.brew.router.get_user_watchlist", _mock_get_watchlist)
        monkeypatch.setattr(
            "app.features.brew.router.portfolio_db.list_portfolio", _mock_list_portfolio
        )
        monkeypatch.setattr("app.features.brew.router.get_personal_digest", lambda: _MockAgent())

        with pytest.raises(HTTPException) as exc:
            await admin_regenerate_digest(
                body=AdminRegenerateRequest(user_id="empty-user"),
                _=True,
            )
        assert exc.value.status_code == 400
        assert called["agent"] is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
