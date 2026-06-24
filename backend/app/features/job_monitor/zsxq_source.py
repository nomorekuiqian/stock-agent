"""zsxq ingest exposed as a monitorable job source.

Wraps the read functions in ``app.features.zsxq_ingest.db`` into the normalized
JobSource shapes. **Never exposes the cookie** — only credential *status*.
"""
from __future__ import annotations

from typing import Any

from app.core.logging import get_logger
from app.features.job_monitor import sources
from app.features.job_monitor.sources import (
    STATE_FAIL,
    STATE_OK,
    STATE_RUNNING,
    STATE_WARN,
    TONE_FAIL,
    TONE_NEUTRAL,
    TONE_OK,
    TONE_WARN,
    duration_seconds,
)
from app.features.zsxq_ingest import db as zsxq_db
from app.features.zsxq_ingest.router import GROUP

logger = get_logger(__name__)

# zsxq run.status -> normalized state (drives UI row coloring).
_STATE_BY_STATUS = {
    "done": STATE_OK,
    "running": STATE_RUNNING,
    "degraded": STATE_WARN,
    "failed": STATE_FAIL,
    "auth_failed": STATE_FAIL,
}

# Curated per-run display metrics: (run-row column, label), in display order.
_METRIC_FIELDS = [
    ("topics_seen", "抓取"),
    ("indexed", "入库"),
    ("skipped", "跳过"),
    ("failed", "失败"),
    ("files_downloaded", "附件"),
]

_STATE_TONE = {
    STATE_OK: TONE_OK,
    STATE_RUNNING: TONE_NEUTRAL,
    STATE_WARN: TONE_WARN,
    STATE_FAIL: TONE_FAIL,
}


async def _safe(awaitable, *, default=None):
    """Await, swallowing errors to *default* — monitoring must never 500 the page."""
    try:
        return await awaitable
    except Exception:  # noqa: BLE001 — a read failure degrades to empty, never crashes
        logger.warning("job_monitor zsxq source: read failed", exc_info=True)
        return default


def _normalize_run(row: dict[str, Any]) -> dict[str, Any]:
    status = row.get("status") or "running"
    return {
        "id": row.get("run_id"),
        "type": row.get("crawl_type"),
        "status": status,
        "state": _STATE_BY_STATUS.get(status, STATE_WARN),
        "started_at": row.get("started_at"),
        "finished_at": row.get("finished_at"),
        "duration_seconds": duration_seconds(row.get("started_at"), row.get("finished_at")),
        "metrics": [
            {"label": label, "value": int(row.get(field) or 0)}
            for field, label in _METRIC_FIELDS
        ],
        "error": row.get("error_message"),
    }


class ZsxqJobSource:
    key = "zsxq"
    label = "知识星球采集"

    async def overview(self) -> dict[str, Any]:
        cred = await _safe(zsxq_db.get_credential(GROUP))
        state = await _safe(zsxq_db.get_state(GROUP))
        recent = await _safe(zsxq_db.list_runs(GROUP, limit=1), default=[])

        cookie_status = (cred or {}).get("status") or "missing"
        cookie_ok = cookie_status == "active"

        last_success = (state or {}).get("last_success_at")
        cursor = (state or {}).get("last_seen_create_time")

        last_run = (recent or [None])[0]
        last_state = _STATE_BY_STATUS.get((last_run or {}).get("status")) if last_run else None
        if last_run:
            last_value = "%s · 入库 %d" % (
                last_run.get("status"),
                int(last_run.get("indexed") or 0),
            )
        else:
            last_value = "无记录"

        # Cookie drives overall health; a failed/degraded last run is a warning.
        if not cookie_ok:
            health = TONE_FAIL
        elif last_state in (STATE_FAIL, STATE_WARN):
            health = TONE_WARN
        else:
            health = TONE_OK

        return {
            "health": health,
            "stats": [
                {"label": "Cookie", "value": cookie_status, "tone": TONE_OK if cookie_ok else TONE_FAIL},
                {"label": "上次成功", "value": last_success or "无", "tone": TONE_OK if last_success else TONE_WARN},
                {"label": "最近运行", "value": last_value, "tone": _STATE_TONE.get(last_state, TONE_NEUTRAL)},
                {"label": "增量游标", "value": cursor or "无", "tone": TONE_NEUTRAL},
            ],
        }

    async def list_runs(self, *, limit: int = 30) -> list[dict[str, Any]]:
        rows = await _safe(zsxq_db.list_runs(GROUP, limit=limit), default=[])
        return [_normalize_run(r) for r in rows or []]

    async def get_run(self, run_id: str) -> dict[str, Any] | None:
        row = await _safe(zsxq_db.get_run(run_id))
        if not row:
            return None
        norm = _normalize_run(row)
        # Source-specific detail: per-stage ledger aggregate + the run report.
        agg = await _safe(zsxq_db.aggregate_ledger(run_id), default={})
        norm["detail"] = {"ledger": agg or {}, "report": row.get("report") or {}}
        return norm


sources.register(ZsxqJobSource())
