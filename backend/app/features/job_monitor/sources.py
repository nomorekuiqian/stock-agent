"""Source protocol, registry, and shared normalization helpers.

The admin UI only ever sees the *normalized* shapes defined here, so it stays
generic across job types. Each source maps its own tables/status strings into
these shapes.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol, runtime_checkable

# Normalized run state — drives generic row coloring, independent of any
# source's own status vocabulary.
STATE_OK = "ok"
STATE_RUNNING = "running"
STATE_WARN = "warn"
STATE_FAIL = "fail"

# Health tone for overview stat chips.
TONE_OK = "ok"
TONE_WARN = "warn"
TONE_FAIL = "fail"
TONE_NEUTRAL = "neutral"


@runtime_checkable
class JobSource(Protocol):
    """A monitorable recurring background job.

    Implementations MUST NOT expose secrets (cookies, tokens) in any returned
    shape — only operational status.
    """

    key: str    # URL-safe identifier, e.g. "zsxq"
    label: str  # human label, e.g. "知识星球采集"

    async def overview(self) -> dict[str, Any]:
        """Health header: ``{health, stats: [{label, value, tone}]}``."""

    async def list_runs(self, *, limit: int = 30) -> list[dict[str, Any]]:
        """Recent runs (newest first), each a normalized-run dict."""

    async def get_run(self, run_id: str) -> dict[str, Any] | None:
        """One run, normalized, optionally with a source-specific ``detail``."""


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_REGISTRY: dict[str, JobSource] = {}


def register(source: JobSource) -> None:
    _REGISTRY[source.key] = source


def get_source(key: str) -> JobSource | None:
    return _REGISTRY.get(key)


def list_sources() -> list[dict[str, str]]:
    return [{"key": s.key, "label": s.label} for s in _REGISTRY.values()]


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def parse_iso(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat((value or "").replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def duration_seconds(started_at: str | None, finished_at: str | None) -> float | None:
    """Whole-second wall-clock duration, or None if either bound is unparseable."""
    start = parse_iso(started_at)
    end = parse_iso(finished_at)
    if not start or not end:
        return None
    return round((end - start).total_seconds(), 1)
