"""Pydantic models for the zsxq_ingest persistence layer.

These mirror the four tables managed by zsxq-ingest-store.js:
  - Credential       → zsxq_credentials
  - IngestState      → zsxq_ingest_state
  - IngestRun        → zsxq_ingest_runs
  - LedgerEntry      → zsxq_thread_ledger

IngestReport captures the audit summary produced by indexing.audit_distribution
plus run-level counters written to zsxq_ingest_runs.report.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class Credential(BaseModel):
    """Row in zsxq_credentials."""

    group_id: str
    cookie: str
    status: str = "active"  # active | cookie_expired | access_denied | membership_expired
    updated_at: str | None = None
    updated_by: str | None = None


class IngestState(BaseModel):
    """Row in zsxq_ingest_state — per-group crawl cursor."""

    group_id: str
    last_success_at: str | None = None
    last_seen_create_time: str | None = None
    last_seen_topic_id: str | None = None
    last_input_hash: str | None = None
    last_summary: dict[str, Any] = Field(default_factory=dict)


class IngestRun(BaseModel):
    """Row in zsxq_ingest_runs — per-run audit log."""

    run_id: str | None = None
    group_id: str
    crawl_type: str
    started_at: str | None = None
    finished_at: str | None = None
    status: str = "running"  # running | done | degraded | failed | auth_failed
    pages_fetched: int = 0
    topics_seen: int = 0
    topics_new: int = 0
    topics_updated: int = 0
    comments_fetched: int = 0
    files_downloaded: int = 0
    indexed: int = 0
    skipped: int = 0
    failed: int = 0
    error_message: str | None = None
    report: dict[str, Any] = Field(default_factory=dict)


class LedgerEntry(BaseModel):
    """Row in zsxq_thread_ledger — per-topic pipeline stage tracking."""

    group_id: str
    topic_id: str
    first_seen_run_id: str | None = None
    last_run_id: str | None = None
    topic_type: str | None = None
    author_role: str | None = None
    create_time: str | None = None
    content_hash: str | None = None
    stage_crawled: str = "pending"
    stage_comments: str = "pending"
    stage_binaries: str = "pending"
    stage_normalized: str = "pending"
    stage_indexed: str = "pending"
    drop_reason: str | None = None
    binaries_total: int = 0
    binaries_failed: int = 0
    storage_keys: list[str] = Field(default_factory=list)
    last_error: str | None = None
    updated_at: str | None = None


class IngestReport(BaseModel):
    """Audit summary stored in zsxq_ingest_runs.report.

    Combines indexing.audit_distribution output with run-level counters.
    """

    # From audit_distribution
    total: int = 0
    selected: int = 0
    dropped: dict[str, int] = Field(default_factory=dict)
    content_type: dict[str, int] = Field(default_factory=dict)
    ticker_coverage: float = 0.0
    top_tickers: dict[str, int] = Field(default_factory=dict)
    multi_chunk_docs: int = 0

    # Run-level counters
    indexed: int = 0
    skipped: int = 0
    failed: int = 0
    pages_fetched: int = 0
    topics_seen: int = 0
    topics_new: int = 0
    topics_updated: int = 0
    comments_fetched: int = 0
    files_downloaded: int = 0

    # Optional diagnostics
    errors: list[str] = Field(default_factory=list)
