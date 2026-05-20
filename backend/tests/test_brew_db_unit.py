"""Unit tests for brew/db helpers — focused on resolve_digest_id_by_date."""

import pytest
from unittest.mock import AsyncMock, patch

from app.features.brew.db import resolve_digest_id_by_date


class TestResolveDigestIdByDate:
    @pytest.mark.asyncio
    async def test_matches_date_in_list(self):
        fake_digests = [
            {"digest_id": "uuid-1", "digest_date": "2026-04-21T00:00:00Z"},
            {"digest_id": "uuid-2", "digest_date": "2026-04-22"},
        ]
        with patch(
            "app.features.brew.db.list_user_digests",
            new=AsyncMock(return_value=fake_digests),
        ):
            uuid = await resolve_digest_id_by_date("user-1", "2026-04-21")
            assert uuid == "uuid-1"

    @pytest.mark.asyncio
    async def test_no_match_returns_none(self):
        with patch(
            "app.features.brew.db.list_user_digests",
            new=AsyncMock(return_value=[{"digest_id": "x", "digest_date": "2026-04-20"}]),
        ):
            assert await resolve_digest_id_by_date("user-1", "2026-04-99") is None

    @pytest.mark.asyncio
    async def test_empty_list(self):
        with patch(
            "app.features.brew.db.list_user_digests",
            new=AsyncMock(return_value=[]),
        ):
            assert await resolve_digest_id_by_date("user-1", "2026-04-21") is None

    @pytest.mark.asyncio
    async def test_resolve_uses_broader_limit_than_service_cache(self):
        """resolve_digest_id_by_date must query with a limit larger than
        service.py's cached_recent limit (30) so the fallthrough buys real
        range. Target: limit=180 (six months)."""
        from app.features.brew import db as brew_db

        captured_limit = []

        async def _mock_list(user_id: str, limit: int):
            captured_limit.append(limit)
            return []

        with patch("app.features.brew.db.list_user_digests", new=_mock_list):
            await brew_db.resolve_digest_id_by_date("user-1", "2026-04-21")

        assert captured_limit == [180]


class TestSaveUserDigestPersistsRoundTwoFields:
    """Verify save_user_digest includes action_items and portfolio_summary in
    the persisted digest_data blob. Without this, cache hits return empty
    Action Bar on V2 path."""

    @pytest.mark.asyncio
    async def test_action_items_persisted_in_digest_data(self):
        # Conftest auto-mocks save_user_digest. Reload the module to restore
        # the real function before exercising it through a fake httpx client.
        import importlib
        from app.features.brew import db as brew_db_mod
        importlib.reload(brew_db_mod)

        captured_body: dict = {}

        class FakeResponse:
            status_code = 201

            def json(self):
                return {"success": True, "data": {"id": "uuid-new"}}

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, url, headers=None, json=None, timeout=None):
                captured_body.update(json)
                return FakeResponse()

        try:
            with patch("httpx.AsyncClient", new=FakeClient):
                await brew_db_mod.save_user_digest({
                    "user_id": "u",
                    "digest_date": "2026-04-26",
                    "symbols": ["NVDA"],
                    "greeting": "g",
                    "one_line_summary": "ols",
                    "stocks": [
                        {
                            "symbol": "NVDA",
                            "name": "NVIDIA",
                            "daily_change": "+1.0%",
                            "status": "ok",
                        }
                    ],
                    "news": {"headlines": [], "briefs": []},
                    "events": [],
                    "summary": {"content": "s"},
                    "action_items": [
                        {"label": "x", "target": "portfolio", "reason": "r", "priority": 1},
                    ],
                    "portfolio_summary": "组合涨 1%",
                })

            # digest_data is the JSONB blob persisted at Insforge
            persisted_blob = captured_body.get("digest_data", {})
            assert "action_items" in persisted_blob
            assert len(persisted_blob["action_items"]) == 1
            assert persisted_blob["action_items"][0]["target"] == "portfolio"
            assert persisted_blob.get("portfolio_summary") == "组合涨 1%"
        finally:
            # Re-reload so other tests still see the mocked version via
            # module.save_user_digest attribute lookup.
            importlib.reload(brew_db_mod)
