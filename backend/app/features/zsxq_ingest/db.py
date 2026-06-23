"""Database operations for zsxq_ingest persistence via Insforge Edge Functions.

All operations go through the `zsxq-ingest-store` edge function.
Returns clean Python dicts / typed objects; raises RuntimeError on non-200
for mutating operations, returns None on 404-style misses for reads —
consistent with the pattern in app/features/vector/db.py.
"""

from __future__ import annotations

import base64
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import (
    EDGE_FUNCTION_SECRET,
    INSFORGE_BASE_URL,
    INSFORGE_SERVICE_KEY,
)
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "zsxq-ingest-store"


async def upload_binary(
    bucket: str,
    key: str,
    content: bytes,
    *,
    content_type: str = "application/octet-stream",
    timeout: float = 120.0,
) -> dict[str, Any]:
    """Upload a binary object DIRECTLY to Insforge storage (no base64, any size).

    Uses the storage REST API ``PUT /api/storage/buckets/{bucket}/objects/{key}``
    with a multipart ``file`` field and the SERVICE key — the same shape the
    ``insforge storage upload`` CLI uses. This is the path for binaries/large
    files; the edge-function ``put_object`` (base64-in-JSON) cannot carry large
    payloads. Returns ``{"key", "url"}``.
    """
    base = (INSFORGE_BASE_URL or "").rstrip("/")
    url = f"{base}/api/storage/buckets/{quote(bucket, safe='')}/objects/{quote(key, safe='')}"
    filename = key.rsplit("/", 1)[-1] or "file"
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.put(
            url,
            headers={"Authorization": f"Bearer {INSFORGE_SERVICE_KEY}"},
            files={"file": (filename, content, content_type)},
        )
    if resp.status_code not in (200, 201):
        raise RuntimeError(
            "upload_binary failed: HTTP %s %s" % (resp.status_code, resp.text[:300])
        )
    try:
        data = resp.json()
    except Exception:  # noqa: BLE001
        data = {}
    url_out = data.get("url") if isinstance(data, dict) else None
    return {"key": key, "url": url_out}


def internal_headers() -> dict | None:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------


async def get_credential(group_id: str) -> dict[str, Any] | None:
    """Return the credential row for *group_id*, or None if not found."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "get_credential", "group_id": group_id},
        extra_headers=internal_headers(),
        timeout=20.0,
    )
    if result["status_code"] != 200:
        return None
    payload = result.get("data") or {}
    if not payload.get("success"):
        return None
    return payload.get("data")


async def set_credential(
    group_id: str,
    cookie: str,
    *,
    status: str = "active",
    updated_by: str | None = None,
) -> dict[str, Any]:
    """Upsert a credential row. Returns the saved row excerpt."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "set_credential"},
        json_body={
            "group_id": group_id,
            "cookie": cookie,
            "status": status,
            "updated_by": updated_by,
        },
        extra_headers=internal_headers(),
        timeout=20.0,
    )
    payload = result.get("data") or {}
    if result["status_code"] not in (200, 201) or not payload.get("success"):
        raise RuntimeError(
            "set_credential failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    return payload["data"]


# ---------------------------------------------------------------------------
# Ingest state (cursor)
# ---------------------------------------------------------------------------


async def get_state(group_id: str) -> dict[str, Any] | None:
    """Return the ingest state row for *group_id*, or None."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "get_state", "group_id": group_id},
        extra_headers=internal_headers(),
        timeout=20.0,
    )
    if result["status_code"] != 200:
        return None
    payload = result.get("data") or {}
    if not payload.get("success"):
        return None
    return payload.get("data")


async def update_state(group_id: str, **fields: Any) -> dict[str, Any]:
    """Upsert ingest state fields for *group_id*. Returns the full updated row."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "update_state"},
        json_body={"group_id": group_id, **fields},
        extra_headers=internal_headers(),
        timeout=20.0,
    )
    payload = result.get("data") or {}
    if result["status_code"] not in (200, 201) or not payload.get("success"):
        raise RuntimeError(
            "update_state failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    return payload["data"]


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


async def create_run(group_id: str, crawl_type: str) -> dict[str, Any]:
    """Insert a new run row. Returns {run_id, group_id, crawl_type, started_at, status}."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "create_run"},
        json_body={"group_id": group_id, "crawl_type": crawl_type},
        extra_headers=internal_headers(),
        timeout=20.0,
    )
    payload = result.get("data") or {}
    if result["status_code"] not in (200, 201) or not payload.get("success"):
        raise RuntimeError(
            "create_run failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    return payload["data"]


async def update_run(run_id: str, **fields: Any) -> dict[str, Any]:
    """Update run fields by *run_id*. Returns {run_id, status, finished_at}."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "update_run"},
        json_body={"run_id": run_id, **fields},
        extra_headers=internal_headers(),
        timeout=20.0,
    )
    payload = result.get("data") or {}
    if result["status_code"] not in (200, 201) or not payload.get("success"):
        raise RuntimeError(
            "update_run failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    return payload["data"]


async def get_run(run_id: str) -> dict[str, Any] | None:
    """Return the full run row, or None if not found."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "get_run", "run_id": run_id},
        extra_headers=internal_headers(),
        timeout=20.0,
    )
    if result["status_code"] != 200:
        return None
    payload = result.get("data") or {}
    if not payload.get("success"):
        return None
    return payload.get("data")


# ---------------------------------------------------------------------------
# Thread ledger
# ---------------------------------------------------------------------------


async def upsert_ledger(entry: dict[str, Any]) -> dict[str, Any]:
    """Upsert a ledger row. Returns {group_id, topic_id, stage_indexed, updated_at}."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "upsert_ledger"},
        json_body={"row": entry},
        extra_headers=internal_headers(),
        timeout=30.0,
    )
    payload = result.get("data") or {}
    if result["status_code"] not in (200, 201) or not payload.get("success"):
        raise RuntimeError(
            "upsert_ledger failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    return payload["data"]


async def aggregate_ledger(last_run_id: str) -> dict[str, Any]:
    """Return stage-count aggregates for all ledger rows belonging to *last_run_id*."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "aggregate_ledger", "last_run_id": last_run_id},
        extra_headers=internal_headers(),
        timeout=30.0,
    )
    payload = result.get("data") or {}
    if result["status_code"] != 200 or not payload.get("success"):
        raise RuntimeError(
            "aggregate_ledger failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    return payload.get("data") or {}


# ---------------------------------------------------------------------------
# Object storage
# ---------------------------------------------------------------------------


async def put_object(bucket: str, key: str, content: bytes) -> dict[str, str]:
    """Upload *content* to *bucket* at *key*. Returns {url, key}.

    Content is base64-encoded for the JSON request body since the edge
    function does not accept raw binary in its JSON body.
    """
    db = get_insforge_service()
    content_b64 = base64.b64encode(content).decode("ascii")
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "put_object"},
        json_body={"bucket": bucket, "key": key, "content_base64": content_b64},
        extra_headers=internal_headers(),
        timeout=60.0,
    )
    payload = result.get("data") or {}
    if result["status_code"] not in (200, 201) or not payload.get("success"):
        raise RuntimeError(
            "put_object failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:300])
        )
    return payload["data"]


async def get_object_url(bucket: str, key: str) -> str | None:
    """Return the public URL for *bucket*/*key*, or None if unavailable."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "get_object_url", "bucket": bucket, "key": key},
        extra_headers=internal_headers(),
        timeout=20.0,
    )
    if result["status_code"] != 200:
        return None
    payload = result.get("data") or {}
    if not payload.get("success"):
        return None
    return (payload.get("data") or {}).get("url")
