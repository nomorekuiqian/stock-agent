"""Unit tests for signup attribution persistence (user_acquisition)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.features.subscription import acquisition
from app.features.subscription.models import AcquisitionPayload


def _service(result=None, error=None):
    service = MagicMock()
    service.call_function = AsyncMock(return_value=result, side_effect=error)
    return service


def _payload():
    return AcquisitionPayload.model_validate(
        {
            "first_touch": {"utm_source": "x", "utm_medium": "", "landing_path": "/"},
            "last_touch": {"ref": "frank"},
        }
    )


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setattr(acquisition, "EDGE_FUNCTION_SECRET", "edge-secret")


@pytest.mark.asyncio
async def test_first_insert_calls_internal_function_without_empty_fields():
    service = _service({"status_code": 200, "data": {"success": True, "recorded": True}})
    with patch.object(acquisition, "get_insforge_service", return_value=service):
        assert await acquisition.record_user_acquisition("u-1", _payload()) is True

    args, kwargs = service.call_function.await_args
    assert args == ("user-acquisition",)
    assert kwargs["method"] == "POST"
    assert kwargs["params"] == {"action": "record"}
    assert kwargs["extra_headers"] == {"X-Internal-Secret": "edge-secret"}
    assert kwargs["json_body"] == {
        "user_id": "u-1",
        "first_touch": {"utm_source": "x", "landing_path": "/"},
        "last_touch": {"ref": "frank"},
    }


@pytest.mark.asyncio
async def test_missing_payload_records_direct_visit():
    service = _service({"status_code": 200, "data": {"success": True, "recorded": True}})
    with patch.object(acquisition, "get_insforge_service", return_value=service):
        assert await acquisition.record_user_acquisition("u-1", None) is True
    body = service.call_function.await_args.kwargs["json_body"]
    assert body["first_touch"] == {} and body["last_touch"] == {}


@pytest.mark.asyncio
async def test_existing_row_is_not_recorded_again():
    service = _service({"status_code": 200, "data": {"success": True, "recorded": False}})
    with patch.object(acquisition, "get_insforge_service", return_value=service):
        assert await acquisition.record_user_acquisition("u-1", _payload()) is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kwargs",
    [
        {"error": RuntimeError("down")},
        {"result": {"status_code": 500, "data": {}, "text": "boom"}},
        {"result": {"status_code": 401, "data": {"success": False}, "text": "Unauthorized"}},
        {"result": {"status_code": 502, "data": {}, "text": "Request error"}},
    ],
)
async def test_errors_never_raise(kwargs):
    service = _service(**kwargs)
    with patch.object(acquisition, "get_insforge_service", return_value=service):
        assert await acquisition.record_user_acquisition("u-1", _payload()) is False


@pytest.mark.asyncio
async def test_skips_without_edge_secret(monkeypatch):
    monkeypatch.setattr(acquisition, "EDGE_FUNCTION_SECRET", "")
    service = _service({"status_code": 200, "data": {"success": True, "recorded": True}})
    with patch.object(acquisition, "get_insforge_service", return_value=service):
        assert await acquisition.record_user_acquisition("u-1", _payload()) is False
    service.call_function.assert_not_called()
