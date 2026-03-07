import pytest

from app.features.sector.router import (
    SectorSubscribeRequest,
    get_sector_subscriptions,
    subscribe_to_sector,
    unsubscribe_from_sector,
)


@pytest.mark.asyncio
class TestSectorSubscriptionAuth:
    async def test_subscribe_uses_authenticated_user_id(self, monkeypatch):
        calls: dict[str, str] = {}

        async def _mock_subscribe_to_sector(*, user_id: str, sector_id: str):
            calls["user_id"] = user_id
            calls["sector_id"] = sector_id
            return {"success": True, "is_new": True}

        monkeypatch.setattr("app.features.sector.router.db.subscribe_to_sector", _mock_subscribe_to_sector)

        result = await subscribe_to_sector(
            request=SectorSubscribeRequest(sector_id="ai"),
            user_id="token-user",
        )

        assert result["success"] is True
        assert calls == {"user_id": "token-user", "sector_id": "ai"}

    async def test_get_subscriptions_uses_authenticated_user_id(self, monkeypatch):
        calls: dict[str, str] = {}

        async def _mock_get_user_sector_subscriptions(user_id: str):
            calls["user_id"] = user_id
            return {
                "success": True,
                "subscriptions": [{"sector_id": "ai", "subscribed_at": "2026-03-06T00:00:00Z"}],
            }

        monkeypatch.setattr(
            "app.features.sector.router.db.get_user_sector_subscriptions",
            _mock_get_user_sector_subscriptions,
        )

        result = await get_sector_subscriptions(user_id="token-user")

        assert result["success"] is True
        assert result["subscriptions"][0]["sector_id"] == "ai"
        assert calls["user_id"] == "token-user"

    async def test_unsubscribe_uses_authenticated_user_id(self, monkeypatch):
        calls: dict[str, str] = {}

        async def _mock_unsubscribe_from_sector(*, user_id: str, sector_id: str):
            calls["user_id"] = user_id
            calls["sector_id"] = sector_id
            return {"success": True}

        monkeypatch.setattr("app.features.sector.router.db.unsubscribe_from_sector", _mock_unsubscribe_from_sector)

        result = await unsubscribe_from_sector(sector_id="ai", user_id="token-user")

        assert result["success"] is True
        assert calls == {"user_id": "token-user", "sector_id": "ai"}
