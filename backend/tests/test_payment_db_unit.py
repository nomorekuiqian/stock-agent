"""Unit tests for payment subscription DB helpers."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.features.payment import db as payment_db


@pytest.fixture(autouse=True)
def clear_subscription_cache():
    payment_db._sub_cache.clear()
    yield
    payment_db._sub_cache.clear()


@pytest.mark.asyncio
async def test_get_subscription_uses_fresh_client_and_short_timeout():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(
        return_value={
            "status_code": 200,
            "data": {
                "success": True,
                "data": {"user_id": "user-1", "plan": "max"},
            },
        },
    )

    with patch("app.features.payment.db.get_insforge_service", return_value=fake_service):
        result = await payment_db.get_subscription("user-1")

    assert result == {"user_id": "user-1", "plan": "max"}
    fake_service.call_function.assert_awaited_once_with(
        "subscriptions",
        method="GET",
        params={"action": "get", "user_id": "user-1"},
        json_body=None,
        timeout=8.0,
        use_pool=False,
    )


@pytest.mark.asyncio
async def test_get_subscription_none_only_when_edge_function_confirms_no_row():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(
        return_value={
            "status_code": 200,
            "data": {"success": True, "data": None},
        },
    )

    with patch("app.features.payment.db.get_insforge_service", return_value=fake_service):
        result = await payment_db.get_subscription("free-user")

    assert result is None


@pytest.mark.asyncio
async def test_get_subscription_raises_on_lookup_failure():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(
        return_value={
            "status_code": 408,
            "data": {},
            "text": "Request timeout",
        },
    )

    with patch("app.features.payment.db.get_insforge_service", return_value=fake_service):
        with pytest.raises(payment_db.SubscriptionLookupError):
            await payment_db.get_subscription("user-1")


@pytest.mark.asyncio
async def test_upsert_subscription_uses_fresh_client_and_short_timeout():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(
        return_value={"status_code": 200, "data": {"success": True}},
    )

    with patch("app.features.payment.db.get_insforge_service", return_value=fake_service):
        ok = await payment_db.upsert_subscription("user-1", plan="pro")

    assert ok is True
    fake_service.call_function.assert_awaited_once_with(
        "subscriptions",
        method="POST",
        params={"action": "upsert"},
        json_body={"user_id": "user-1", "plan": "pro"},
        timeout=8.0,
        use_pool=False,
    )
