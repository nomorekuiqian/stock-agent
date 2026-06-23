"""Unit tests for app.features.zsxq_ingest.db.

All tests mock get_insforge_service so no real network calls are made.
The fake service's call_function is an AsyncMock returning canned
{status_code, data, text} dicts that mirror what database.py returns.
"""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.features.zsxq_ingest.db as zsxq_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_service(status_code: int = 200, data: dict | None = None, text: str = "") -> MagicMock:
    """Return a fake InsforgeService whose call_function is an AsyncMock."""
    svc = MagicMock()
    svc.call_function = AsyncMock(
        return_value={"status_code": status_code, "data": data or {}, "text": text}
    )
    return svc


def _patch(monkeypatch, svc):
    monkeypatch.setattr(zsxq_db, "get_insforge_service", lambda: svc)


# ---------------------------------------------------------------------------
# get_credential
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_credential_found(monkeypatch):
    row = {"group_id": "g1", "cookie": "abc", "status": "active"}
    svc = _make_service(data={"success": True, "data": row})
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_credential("g1")

    assert result == row
    svc.call_function.assert_awaited_once()
    call_kwargs = svc.call_function.call_args
    assert call_kwargs[0][0] == "zsxq-ingest-store"
    assert call_kwargs[1]["method"] == "GET"
    assert call_kwargs[1]["params"]["action"] == "get_credential"
    assert call_kwargs[1]["params"]["group_id"] == "g1"


@pytest.mark.asyncio
async def test_get_credential_not_found(monkeypatch):
    svc = _make_service(data={"success": True, "data": None})
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_credential("missing")
    assert result is None


@pytest.mark.asyncio
async def test_get_credential_non_200_returns_none(monkeypatch):
    svc = _make_service(status_code=500, data={}, text="error")
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_credential("g1")
    assert result is None


# ---------------------------------------------------------------------------
# set_credential
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_set_credential_upserts(monkeypatch):
    saved = {"group_id": "g1", "status": "active", "updated_at": "2026-01-01T00:00:00Z"}
    svc = _make_service(data={"success": True, "data": saved})
    _patch(monkeypatch, svc)

    result = await zsxq_db.set_credential("g1", "my-cookie", status="active", updated_by="admin")

    assert result == saved
    _, kwargs = svc.call_function.call_args
    assert kwargs["method"] == "POST"
    assert kwargs["params"]["action"] == "set_credential"
    body = kwargs["json_body"]
    assert body["group_id"] == "g1"
    assert body["cookie"] == "my-cookie"
    assert body["status"] == "active"
    assert body["updated_by"] == "admin"


@pytest.mark.asyncio
async def test_set_credential_raises_on_failure(monkeypatch):
    svc = _make_service(status_code=500, data={"success": False}, text="db error")
    _patch(monkeypatch, svc)

    with pytest.raises(RuntimeError, match="set_credential failed"):
        await zsxq_db.set_credential("g1", "cookie")


# ---------------------------------------------------------------------------
# get_state / update_state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_state_found(monkeypatch):
    state = {"group_id": "g1", "last_seen_topic_id": "t99"}
    svc = _make_service(data={"success": True, "data": state})
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_state("g1")
    assert result == state
    _, kwargs = svc.call_function.call_args
    assert kwargs["params"]["action"] == "get_state"
    assert kwargs["params"]["group_id"] == "g1"


@pytest.mark.asyncio
async def test_get_state_not_found(monkeypatch):
    svc = _make_service(data={"success": True, "data": None})
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_state("g1")
    assert result is None


@pytest.mark.asyncio
async def test_update_state_sends_fields(monkeypatch):
    updated = {"group_id": "g1", "last_seen_topic_id": "t100"}
    svc = _make_service(data={"success": True, "data": updated})
    _patch(monkeypatch, svc)

    result = await zsxq_db.update_state("g1", last_seen_topic_id="t100", last_input_hash="abc123")

    assert result == updated
    _, kwargs = svc.call_function.call_args
    assert kwargs["params"]["action"] == "update_state"
    assert kwargs["json_body"]["group_id"] == "g1"
    assert kwargs["json_body"]["last_seen_topic_id"] == "t100"
    assert kwargs["json_body"]["last_input_hash"] == "abc123"


@pytest.mark.asyncio
async def test_update_state_raises_on_failure(monkeypatch):
    svc = _make_service(status_code=500, data={"success": False}, text="err")
    _patch(monkeypatch, svc)

    with pytest.raises(RuntimeError, match="update_state failed"):
        await zsxq_db.update_state("g1", last_seen_topic_id="t1")


# ---------------------------------------------------------------------------
# create_run / update_run / get_run
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_run_returns_run_id(monkeypatch):
    run_row = {
        "run_id": "run-uuid-1",
        "group_id": "g1",
        "crawl_type": "full",
        "started_at": "2026-01-01T00:00:00Z",
        "status": "running",
    }
    svc = _make_service(data={"success": True, "data": run_row})
    _patch(monkeypatch, svc)

    result = await zsxq_db.create_run("g1", "full")

    assert result["run_id"] == "run-uuid-1"
    _, kwargs = svc.call_function.call_args
    assert kwargs["params"]["action"] == "create_run"
    assert kwargs["json_body"] == {"group_id": "g1", "crawl_type": "full"}


@pytest.mark.asyncio
async def test_create_run_raises_on_failure(monkeypatch):
    svc = _make_service(status_code=500, data={"success": False}, text="fail")
    _patch(monkeypatch, svc)

    with pytest.raises(RuntimeError, match="create_run failed"):
        await zsxq_db.create_run("g1", "incremental")


@pytest.mark.asyncio
async def test_update_run_sends_fields(monkeypatch):
    updated = {"run_id": "run-uuid-1", "status": "done", "finished_at": "2026-01-01T01:00:00Z"}
    svc = _make_service(data={"success": True, "data": updated})
    _patch(monkeypatch, svc)

    result = await zsxq_db.update_run(
        "run-uuid-1", status="done", finished_at="2026-01-01T01:00:00Z", indexed=42
    )

    assert result["status"] == "done"
    _, kwargs = svc.call_function.call_args
    assert kwargs["params"]["action"] == "update_run"
    body = kwargs["json_body"]
    assert body["run_id"] == "run-uuid-1"
    assert body["status"] == "done"
    assert body["indexed"] == 42


@pytest.mark.asyncio
async def test_update_run_raises_on_failure(monkeypatch):
    svc = _make_service(status_code=400, data={"success": False}, text="bad")
    _patch(monkeypatch, svc)

    with pytest.raises(RuntimeError, match="update_run failed"):
        await zsxq_db.update_run("run-uuid-1", status="done")


@pytest.mark.asyncio
async def test_get_run_found(monkeypatch):
    run = {"run_id": "run-uuid-1", "group_id": "g1", "status": "done"}
    svc = _make_service(data={"success": True, "data": run})
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_run("run-uuid-1")
    assert result == run
    _, kwargs = svc.call_function.call_args
    assert kwargs["params"]["action"] == "get_run"
    assert kwargs["params"]["run_id"] == "run-uuid-1"


@pytest.mark.asyncio
async def test_get_run_not_found(monkeypatch):
    svc = _make_service(data={"success": True, "data": None})
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_run("nonexistent")
    assert result is None


@pytest.mark.asyncio
async def test_get_run_non_200_returns_none(monkeypatch):
    svc = _make_service(status_code=404, data={}, text="not found")
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_run("run-uuid-1")
    assert result is None


# ---------------------------------------------------------------------------
# upsert_ledger
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upsert_ledger_sends_row(monkeypatch):
    saved = {"group_id": "g1", "topic_id": "t1", "stage_indexed": "done", "updated_at": "2026-01-01T00:00:00Z"}
    svc = _make_service(data={"success": True, "data": saved})
    _patch(monkeypatch, svc)

    entry = {
        "group_id": "g1",
        "topic_id": "t1",
        "stage_indexed": "done",
        "storage_keys": ["bucket/raw/t1.json"],
    }
    result = await zsxq_db.upsert_ledger(entry)

    assert result == saved
    _, kwargs = svc.call_function.call_args
    assert kwargs["params"]["action"] == "upsert_ledger"
    assert kwargs["json_body"]["row"] == entry


@pytest.mark.asyncio
async def test_upsert_ledger_raises_on_failure(monkeypatch):
    svc = _make_service(status_code=500, data={"success": False}, text="conflict")
    _patch(monkeypatch, svc)

    with pytest.raises(RuntimeError, match="upsert_ledger failed"):
        await zsxq_db.upsert_ledger({"group_id": "g1", "topic_id": "t1"})


# ---------------------------------------------------------------------------
# aggregate_ledger
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_aggregate_ledger_returns_agg(monkeypatch):
    agg = {
        "total": 10,
        "stage_indexed": {"done": 8, "failed": 2},
        "drop_reasons": {},
    }
    svc = _make_service(data={"success": True, "data": agg})
    _patch(monkeypatch, svc)

    result = await zsxq_db.aggregate_ledger("run-uuid-1")

    assert result["total"] == 10
    assert result["stage_indexed"]["done"] == 8
    _, kwargs = svc.call_function.call_args
    assert kwargs["method"] == "GET"
    assert kwargs["params"]["action"] == "aggregate_ledger"
    assert kwargs["params"]["last_run_id"] == "run-uuid-1"


@pytest.mark.asyncio
async def test_aggregate_ledger_raises_on_failure(monkeypatch):
    svc = _make_service(status_code=500, data={"success": False}, text="err")
    _patch(monkeypatch, svc)

    with pytest.raises(RuntimeError, match="aggregate_ledger failed"):
        await zsxq_db.aggregate_ledger("run-uuid-1")


# ---------------------------------------------------------------------------
# put_object — verifies base64 encoding
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_put_object_base64_encodes_content(monkeypatch):
    url_val = "https://storage.example.com/bucket/key.json"
    svc = _make_service(data={"success": True, "data": {"url": url_val, "key": "bucket/key.json"}})
    _patch(monkeypatch, svc)

    raw = b"\x00\x01\x02hello"
    result = await zsxq_db.put_object("my-bucket", "path/key.json", raw)

    assert result["url"] == url_val
    assert result["key"] == "bucket/key.json"

    _, kwargs = svc.call_function.call_args
    assert kwargs["params"]["action"] == "put_object"
    body = kwargs["json_body"]
    assert body["bucket"] == "my-bucket"
    assert body["key"] == "path/key.json"
    # Verify the base64 round-trips back to the original bytes
    decoded = base64.b64decode(body["content_base64"])
    assert decoded == raw


@pytest.mark.asyncio
async def test_put_object_raises_on_failure(monkeypatch):
    svc = _make_service(status_code=500, data={"success": False}, text="storage error")
    _patch(monkeypatch, svc)

    with pytest.raises(RuntimeError, match="put_object failed"):
        await zsxq_db.put_object("bucket", "key", b"data")


@pytest.mark.asyncio
async def test_put_object_empty_bytes_encodes_empty_string(monkeypatch):
    svc = _make_service(data={"success": True, "data": {"url": "u", "key": "k"}})
    _patch(monkeypatch, svc)

    await zsxq_db.put_object("b", "k", b"")
    _, kwargs = svc.call_function.call_args
    assert kwargs["json_body"]["content_base64"] == ""


# ---------------------------------------------------------------------------
# get_object_url
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_object_url_returns_url(monkeypatch):
    url_val = "https://storage.example.com/bucket/key.json"
    svc = _make_service(data={"success": True, "data": {"url": url_val, "key": "bucket/key.json"}})
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_object_url("my-bucket", "bucket/key.json")

    assert result == url_val
    _, kwargs = svc.call_function.call_args
    assert kwargs["method"] == "GET"
    assert kwargs["params"]["action"] == "get_object_url"
    assert kwargs["params"]["bucket"] == "my-bucket"
    assert kwargs["params"]["key"] == "bucket/key.json"


@pytest.mark.asyncio
async def test_get_object_url_non_200_returns_none(monkeypatch):
    svc = _make_service(status_code=404, data={}, text="not found")
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_object_url("bucket", "key")
    assert result is None


@pytest.mark.asyncio
async def test_get_object_url_success_false_returns_none(monkeypatch):
    svc = _make_service(data={"success": False, "error": "denied"})
    _patch(monkeypatch, svc)

    result = await zsxq_db.get_object_url("bucket", "key")
    assert result is None


# ---------------------------------------------------------------------------
# internal_headers — verifies secret is threaded through
# ---------------------------------------------------------------------------


def test_internal_headers_with_secret(monkeypatch):
    monkeypatch.setattr(zsxq_db, "EDGE_FUNCTION_SECRET", "super-secret")
    # Re-import EDGE_FUNCTION_SECRET into the module under test
    import importlib
    import app.core.config as cfg
    monkeypatch.setattr(cfg, "EDGE_FUNCTION_SECRET", "super-secret")
    # Reload to pick up the patched constant
    import app.features.zsxq_ingest.db as db_mod
    monkeypatch.setattr(db_mod, "EDGE_FUNCTION_SECRET", "super-secret")
    headers = db_mod.internal_headers()
    assert headers == {"X-Internal-Secret": "super-secret"}


def test_internal_headers_without_secret(monkeypatch):
    import app.features.zsxq_ingest.db as db_mod
    monkeypatch.setattr(db_mod, "EDGE_FUNCTION_SECRET", "")
    headers = db_mod.internal_headers()
    assert headers is None


# ---------------------------------------------------------------------------
# upload_binary — direct storage REST PUT (no base64; handles large files)
# ---------------------------------------------------------------------------

class _FakeResp:
    def __init__(self, status_code=200, json_data=None, text=""):
        self.status_code = status_code
        self._json = json_data or {}
        self.text = text

    def json(self):
        return self._json


class _FakeAsyncClient:
    """Async-context-manager stand-in for httpx.AsyncClient."""
    captured: dict = {}

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def put(self, url, headers=None, files=None):
        _FakeAsyncClient.captured = {"url": url, "headers": headers, "files": files}
        return _FakeResp(200, {"url": "https://cdn/x"})


@pytest.mark.asyncio
async def test_upload_binary_direct_put_no_base64(monkeypatch):
    monkeypatch.setattr(zsxq_db.httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setattr(zsxq_db, "INSFORGE_BASE_URL", "https://host")
    # API_KEY is preferred over SERVICE_KEY (verified live as the storage credential)
    monkeypatch.setattr(zsxq_db, "INSFORGE_API_KEY", "api-key")
    monkeypatch.setattr(zsxq_db, "INSFORGE_SERVICE_KEY", "svc-key")

    big = b"%PDF-1.7" + b"x" * 5_000_000  # 5MB — impossible via base64-in-JSON
    res = await zsxq_db.upload_binary(
        "zsxq-archive", "raw/zsxq/g/files/t/a.pdf", big, content_type="application/pdf"
    )

    cap = _FakeAsyncClient.captured
    assert res["key"] == "raw/zsxq/g/files/t/a.pdf"
    assert "/api/storage/buckets/zsxq-archive/objects/" in cap["url"]
    assert cap["headers"]["Authorization"] == "Bearer api-key"
    # Raw bytes passed straight through (multipart) — NOT base64-encoded.
    assert cap["files"]["file"][1] is big
    assert cap["files"]["file"][2] == "application/pdf"


@pytest.mark.asyncio
async def test_upload_binary_raises_on_non_2xx(monkeypatch):
    class _ErrClient(_FakeAsyncClient):
        async def put(self, url, headers=None, files=None):
            return _FakeResp(500, text="boom")

    monkeypatch.setattr(zsxq_db.httpx, "AsyncClient", _ErrClient)
    monkeypatch.setattr(zsxq_db, "INSFORGE_SERVICE_KEY", "svc-key")
    with pytest.raises(RuntimeError):
        await zsxq_db.upload_binary("b", "k", b"x")
