"""Unit tests for signup attribution persistence (user_acquisition)."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.features.subscription import acquisition
from app.features.subscription.models import AcquisitionPayload


def _db_with(response=None, error=None):
    client = MagicMock()
    client.post = AsyncMock(return_value=response, side_effect=error)
    db = MagicMock()
    db.base_url = "https://insforge.test"
    db._get_client = AsyncMock(return_value=client)
    return db, client


def _payload():
    return AcquisitionPayload.model_validate(
        {
            "first_touch": {"utm_source": "x", "utm_medium": "", "landing_path": "/"},
            "last_touch": {"ref": "frank"},
        }
    )


@pytest.fixture(autouse=True)
def _service_key(monkeypatch):
    monkeypatch.setattr(acquisition, "INSFORGE_SERVICE_KEY", "service-key")
    monkeypatch.setattr(acquisition, "INSFORGE_ANON_KEY", "anon-key")


@pytest.mark.asyncio
async def test_first_insert_posts_one_row_without_empty_fields():
    db, client = _db_with(httpx.Response(201, json=[{}]))
    with patch.object(acquisition, "get_insforge_service", return_value=db):
        assert await acquisition.record_user_acquisition("u-1", _payload()) is True

    url = client.post.await_args.args[0]
    kwargs = client.post.await_args.kwargs
    assert url == "https://insforge.test/api/database/records/user_acquisition"
    assert kwargs["json"] == [
        {
            "user_id": "u-1",
            "first_touch": {"utm_source": "x", "landing_path": "/"},
            "last_touch": {"ref": "frank"},
        }
    ]
    assert kwargs["headers"]["Authorization"] == "Bearer service-key"


@pytest.mark.asyncio
async def test_missing_payload_records_direct_visit():
    db, client = _db_with(httpx.Response(201, json=[{}]))
    with patch.object(acquisition, "get_insforge_service", return_value=db):
        assert await acquisition.record_user_acquisition("u-1", None) is True
    row = client.post.await_args.kwargs["json"][0]
    assert row["first_touch"] == {} and row["last_touch"] == {}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(409, text="conflict"),
        httpx.Response(400, text='duplicate key value violates unique constraint "user_acquisition_pkey"'),
    ],
)
async def test_existing_row_is_ignored(response):
    db, _ = _db_with(response)
    with patch.object(acquisition, "get_insforge_service", return_value=db):
        assert await acquisition.record_user_acquisition("u-1", _payload()) is False


@pytest.mark.asyncio
async def test_errors_never_raise():
    db, _ = _db_with(error=httpx.ConnectError("down"))
    with patch.object(acquisition, "get_insforge_service", return_value=db):
        assert await acquisition.record_user_acquisition("u-1", _payload()) is False

    db, _ = _db_with(httpx.Response(500, text="boom"))
    with patch.object(acquisition, "get_insforge_service", return_value=db):
        assert await acquisition.record_user_acquisition("u-1", _payload()) is False


@pytest.mark.asyncio
async def test_skips_without_service_key(monkeypatch):
    monkeypatch.setattr(acquisition, "INSFORGE_SERVICE_KEY", "")
    db, client = _db_with(httpx.Response(201))
    with patch.object(acquisition, "get_insforge_service", return_value=db):
        assert await acquisition.record_user_acquisition("u-1", _payload()) is False
    client.post.assert_not_called()
