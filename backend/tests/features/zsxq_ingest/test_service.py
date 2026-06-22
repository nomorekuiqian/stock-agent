"""Unit tests for app.features.zsxq_ingest.service.

All external I/O (db, crawl, indexing, resend, vector search) is mocked.
No live network calls are made.
"""

from __future__ import annotations

import asyncio
from collections import Counter
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

import app.features.zsxq_ingest.service as svc
from app.features.zsxq_ingest.crawl import (
    ZsxqAuthError,
    ZsxqRateLimitError,
)
from app.features.zsxq_ingest.indexing import PreparedRecord


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

GROUP = "15554581218512"
RUN_ID = "run-abc-123"

_ACTIVE_CRED = {"cookie": "test_cookie", "status": "active"}

_RAW_TOPIC = {
    "topic_id": "111",
    "type": "talk",
    "create_time": "2024-06-01T10:00:00.000+0800",
    "comments_count": 2,
    "likes_count": 3,
    "digested": False,
    "talk": {
        "owner": {"user_id": 15555428815112, "name": "潘大"},
        "text": "测试内容，这是一段足够长的文字，用于通过 min_chars 过滤",
    },
}

_NORM_RECORD = {
    "topic_id": "111",
    "group_id": GROUP,
    "group_name": "潘大的科技交流圈",
    "type": "talk",
    "text": "测试内容，这是一段足够长的文字，用于通过 min_chars 过滤",
    "author": {"user_id": "15555428815112", "name": "潘大", "role": "owner"},
    "create_time": "2024-06-01T10:00:00.000+0800",
    "tags": [],
    "digested": False,
    "likes_count": 3,
    "url": "https://wx.zsxq.com/dweb2/index/topic_detail/111",
    "images": [],
    "files": [],
    "comments": [],
    "title": "",
}

_PREPARED = PreparedRecord(
    source_id="111",
    title="测试内容",
    url="https://wx.zsxq.com/dweb2/index/topic_detail/111",
    content="测试内容",
    body="测试内容，这是一段足够长的文字，用于通过 min_chars 过滤",
    content_type="note",
    tickers=[],
    report_date="2024-06-01",
    metadata={"persona_username": "pandacircle"},
    raw=_NORM_RECORD,
)


def _make_iter(topics: list[dict]):
    """Return a MagicMock whose __iter__ yields the given topics."""
    it = iter(topics)
    m = MagicMock()
    m.__next__ = MagicMock(side_effect=it)
    m.__iter__ = MagicMock(return_value=m)
    return m


def _iter_gen(topics: list[dict], exc: Exception | None = None):
    """Generator that yields topics then optionally raises exc."""
    yield from topics
    if exc:
        raise exc


class _FakeIndexResponse:
    skipped = False


# ---------------------------------------------------------------------------
# gate_should_block tests
# ---------------------------------------------------------------------------

class TestGateShouldBlock:
    def test_blocks_large_drop(self):
        # 700 → 120 is a ~83% drop (well below the 50% threshold)
        assert svc.gate_should_block(700, 120) is True

    def test_allows_stable(self):
        assert svc.gate_should_block(700, 705) is False

    def test_allows_zero_prev(self):
        # First run — no baseline, never block
        assert svc.gate_should_block(0, 0) is False

    def test_allows_exactly_at_threshold(self):
        # curr == prev * 0.5 → NOT blocked (strictly less than)
        assert svc.gate_should_block(100, 50) is False

    def test_blocks_just_below_threshold(self):
        assert svc.gate_should_block(100, 49) is True

    def test_allows_prev_zero_with_curr(self):
        assert svc.gate_should_block(0, 10) is False


# ---------------------------------------------------------------------------
# _notify_auth_failure tests
# ---------------------------------------------------------------------------

class TestNotifyAuthFailure:
    @pytest.mark.asyncio
    async def test_cookie_expired_sends_email(self):
        with patch("resend.Emails.send") as mock_send:
            await svc._notify_auth_failure(GROUP, "cookie_expired")
            mock_send.assert_called_once()
            args = mock_send.call_args[0][0]
            assert "cookie_expired" in args["subject"] or "Cookie" in args["subject"]

    @pytest.mark.asyncio
    async def test_membership_expired_sends_email(self):
        with patch("resend.Emails.send") as mock_send:
            await svc._notify_auth_failure(GROUP, "membership_expired")
            mock_send.assert_called_once()
            args = mock_send.call_args[0][0]
            assert "续费" in args["html"] or "membership" in args["subject"].lower()

    @pytest.mark.asyncio
    async def test_access_denied_sends_email(self):
        with patch("resend.Emails.send") as mock_send:
            await svc._notify_auth_failure(GROUP, "access_denied")
            mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_email_failure_does_not_raise(self):
        with patch("resend.Emails.send", side_effect=RuntimeError("smtp down")):
            # Must not raise
            await svc._notify_auth_failure(GROUP, "cookie_expired")


# ---------------------------------------------------------------------------
# run_ingest: missing / expired credential
# ---------------------------------------------------------------------------

class TestRunIngestCredentialFailure:
    @pytest.mark.asyncio
    async def test_missing_credential_returns_auth_failed(self):
        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=None),
            patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock) as mock_update_run,
            patch("app.features.zsxq_ingest.service._notify_auth_failure", new_callable=AsyncMock) as mock_notify,
        ):
            result = await svc.run_ingest(GROUP, run_id=RUN_ID)

        assert result["status"] == "auth_failed"
        mock_notify.assert_awaited_once()
        mock_update_run.assert_awaited_once()
        kwargs = mock_update_run.call_args
        assert kwargs[1]["status"] == "auth_failed"

    @pytest.mark.asyncio
    async def test_expired_credential_returns_auth_failed(self):
        expired_cred = {"cookie": "old", "status": "cookie_expired"}
        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=expired_cred),
            patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock) as mock_update_run,
            patch("app.features.zsxq_ingest.service._notify_auth_failure", new_callable=AsyncMock) as mock_notify,
        ):
            result = await svc.run_ingest(GROUP, run_id=RUN_ID)

        assert result["status"] == "auth_failed"
        mock_notify.assert_awaited_once_with(GROUP, "cookie_expired")
        assert mock_update_run.call_args[1]["status"] == "auth_failed"

    @pytest.mark.asyncio
    async def test_crawl_not_started_on_bad_credential(self):
        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=None),
            patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service._notify_auth_failure", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.crawl.ZsxqClient") as mock_client_cls,
        ):
            await svc.run_ingest(GROUP, run_id=RUN_ID)

        mock_client_cls.assert_not_called()


# ---------------------------------------------------------------------------
# ZsxqAuthError during crawl — each of the 3 kinds
# ---------------------------------------------------------------------------

class TestRunIngestAuthErrorDuringCrawl:
    """ZsxqAuthError raised by iter_topics → set_credential + email + auth_failed."""

    def _patch_all(self, auth_err: ZsxqAuthError, mocker_ctx):
        """Context managers to patch everything for an auth-error scenario."""
        return mocker_ctx

    @pytest.mark.asyncio
    @pytest.mark.parametrize("kind", ["cookie_expired", "access_denied", "membership_expired"])
    async def test_auth_error_kinds(self, kind):
        auth_exc = ZsxqAuthError(kind, "test")

        mock_client = MagicMock()
        mock_client.iter_topics.return_value = _iter_gen([], exc=auth_exc)

        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=_ACTIVE_CRED),
            patch("app.features.zsxq_ingest.service._db.get_state", new_callable=AsyncMock, return_value={}),
            patch("app.features.zsxq_ingest.service._db.set_credential", new_callable=AsyncMock) as mock_set_cred,
            patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock) as mock_update_run,
            patch("app.features.zsxq_ingest.service._notify_auth_failure", new_callable=AsyncMock) as mock_notify,
            patch("app.features.zsxq_ingest.crawl.ZsxqClient", return_value=mock_client),
        ):
            result = await svc.run_ingest(GROUP, run_id=RUN_ID)

        assert result["status"] == "auth_failed"
        mock_set_cred.assert_awaited_once_with(GROUP, _ACTIVE_CRED["cookie"], status=kind)
        mock_notify.assert_awaited_once_with(GROUP, kind)
        assert mock_update_run.call_args[1]["status"] == "auth_failed"


# ---------------------------------------------------------------------------
# Normal incremental run
# ---------------------------------------------------------------------------

class TestRunIngestNormalIncremental:
    @pytest.mark.asyncio
    async def test_normal_run_completes_done(self):
        mock_client = MagicMock()
        mock_client.iter_topics.return_value = _iter_gen([_RAW_TOPIC])
        mock_client.fetch_full_comments.return_value = []
        mock_client.download_binaries.return_value = (0, 0)

        mock_index_resp = _FakeIndexResponse()

        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=_ACTIVE_CRED),
            # prev_selected=0 → gate never blocks on first run
            patch("app.features.zsxq_ingest.service._db.get_state", new_callable=AsyncMock, return_value={}),
            patch("app.features.zsxq_ingest.service._db.put_object", new_callable=AsyncMock, return_value={"key": "raw/key", "url": "https://x"}),
            patch("app.features.zsxq_ingest.service._db.upsert_ledger", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service._db.update_state", new_callable=AsyncMock) as mock_update_state,
            patch("app.features.zsxq_ingest.service.normalize_topic", return_value=_NORM_RECORD),
            patch("app.features.zsxq_ingest.service.prepare_records", return_value=([_PREPARED], Counter())),
            patch("app.features.zsxq_ingest.service.audit_distribution", return_value={"total": 1, "selected": 1, "dropped": {}}),
            patch("app.features.zsxq_ingest.service.index_prepared", new_callable=AsyncMock, return_value=mock_index_resp),
            patch("app.features.zsxq_ingest.crawl.ZsxqClient", return_value=mock_client),
            patch("app.features.vector.service.search", new_callable=AsyncMock, return_value=[MagicMock()]),
            patch("app.features.vector.models.VectorSearchRequest", MagicMock()),
            patch("app.features.vector.models.VectorSearchFilters", MagicMock()),
        ):
            result = await svc.run_ingest(GROUP, run_id=RUN_ID)

        assert result["status"] in ("done", "degraded")
        assert result["topics_crawled"] == 1

    @pytest.mark.asyncio
    async def test_ledger_upserted_per_topic(self):
        mock_client = MagicMock()
        mock_client.iter_topics.return_value = _iter_gen([_RAW_TOPIC])
        mock_client.download_binaries.return_value = (0, 0)

        mock_upsert = AsyncMock()

        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=_ACTIVE_CRED),
            patch("app.features.zsxq_ingest.service._db.get_state", new_callable=AsyncMock, return_value={}),
            patch("app.features.zsxq_ingest.service._db.put_object", new_callable=AsyncMock, return_value={"key": "k", "url": "u"}),
            patch("app.features.zsxq_ingest.service._db.upsert_ledger", mock_upsert),
            patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service._db.update_state", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service.normalize_topic", return_value=_NORM_RECORD),
            patch("app.features.zsxq_ingest.service.prepare_records", return_value=([_PREPARED], Counter())),
            patch("app.features.zsxq_ingest.service.audit_distribution", return_value={"total": 1, "selected": 1, "dropped": {}}),
            patch("app.features.zsxq_ingest.service.index_prepared", new_callable=AsyncMock, return_value=_FakeIndexResponse()),
            patch("app.features.zsxq_ingest.crawl.ZsxqClient", return_value=mock_client),
            patch("app.features.vector.service.search", new_callable=AsyncMock, return_value=[MagicMock()]),
            patch("app.features.vector.models.VectorSearchRequest", MagicMock()),
            patch("app.features.vector.models.VectorSearchFilters", MagicMock()),
        ):
            await svc.run_ingest(GROUP, run_id=RUN_ID)

        # At least: crawl ledger + normalize ledger + index ledger
        assert mock_upsert.await_count >= 2

    @pytest.mark.asyncio
    async def test_update_state_cursor_advanced(self):
        mock_client = MagicMock()
        mock_client.iter_topics.return_value = _iter_gen([_RAW_TOPIC])
        mock_client.download_binaries.return_value = (0, 0)

        mock_update_state = AsyncMock()

        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=_ACTIVE_CRED),
            patch("app.features.zsxq_ingest.service._db.get_state", new_callable=AsyncMock, return_value={}),
            patch("app.features.zsxq_ingest.service._db.put_object", new_callable=AsyncMock, return_value={"key": "k", "url": "u"}),
            patch("app.features.zsxq_ingest.service._db.upsert_ledger", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service._db.update_state", mock_update_state),
            patch("app.features.zsxq_ingest.service.normalize_topic", return_value=_NORM_RECORD),
            patch("app.features.zsxq_ingest.service.prepare_records", return_value=([_PREPARED], Counter())),
            patch("app.features.zsxq_ingest.service.audit_distribution", return_value={"total": 1, "selected": 1, "dropped": {}}),
            patch("app.features.zsxq_ingest.service.index_prepared", new_callable=AsyncMock, return_value=_FakeIndexResponse()),
            patch("app.features.zsxq_ingest.crawl.ZsxqClient", return_value=mock_client),
            patch("app.features.vector.service.search", new_callable=AsyncMock, return_value=[MagicMock()]),
            patch("app.features.vector.models.VectorSearchRequest", MagicMock()),
            patch("app.features.vector.models.VectorSearchFilters", MagicMock()),
        ):
            await svc.run_ingest(GROUP, run_id=RUN_ID)

        mock_update_state.assert_awaited_once()
        call_kwargs = mock_update_state.call_args[1]
        assert "last_seen_create_time" in call_kwargs
        assert call_kwargs["last_seen_create_time"] == _RAW_TOPIC["create_time"]


# ---------------------------------------------------------------------------
# Gate blocks indexing
# ---------------------------------------------------------------------------

class TestRunIngestGateBlock:
    @pytest.mark.asyncio
    async def test_gate_blocks_index_not_called(self):
        """When gate triggers, index_prepared must NOT be called and run is 'failed'."""
        mock_client = MagicMock()
        mock_client.iter_topics.return_value = _iter_gen([_RAW_TOPIC])
        mock_client.download_binaries.return_value = (0, 0)

        mock_index = AsyncMock()

        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=_ACTIVE_CRED),
            patch("app.features.zsxq_ingest.service._db.get_state", new_callable=AsyncMock,
                  return_value={"last_summary": {"selected": 1000}}),  # high baseline
            patch("app.features.zsxq_ingest.service._db.put_object", new_callable=AsyncMock, return_value={"key": "k", "url": "u"}),
            patch("app.features.zsxq_ingest.service._db.upsert_ledger", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock) as mock_update_run,
            patch("app.features.zsxq_ingest.service._db.update_state", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service.normalize_topic", return_value=_NORM_RECORD),
            patch("app.features.zsxq_ingest.service.prepare_records", return_value=([_PREPARED], Counter())),
            # curr_selected = 1 << 1000 * 0.5 = 500  → gate blocks
            patch("app.features.zsxq_ingest.service.audit_distribution", return_value={"total": 1, "selected": 1, "dropped": {}}),
            patch("app.features.zsxq_ingest.service.index_prepared", mock_index),
            patch("app.features.zsxq_ingest.crawl.ZsxqClient", return_value=mock_client),
        ):
            result = await svc.run_ingest(GROUP, run_id=RUN_ID)

        assert result["status"] == "failed"
        assert "gate" in result.get("error", "")
        mock_index.assert_not_awaited()
        assert mock_update_run.call_args[1]["status"] == "failed"


# ---------------------------------------------------------------------------
# Smoke returns empty → degraded
# ---------------------------------------------------------------------------

class TestRunIngestSmokeDegraded:
    @pytest.mark.asyncio
    async def test_smoke_empty_results_degraded(self):
        mock_client = MagicMock()
        mock_client.iter_topics.return_value = _iter_gen([_RAW_TOPIC])
        mock_client.download_binaries.return_value = (0, 0)

        mock_update_run = AsyncMock()

        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=_ACTIVE_CRED),
            patch("app.features.zsxq_ingest.service._db.get_state", new_callable=AsyncMock, return_value={}),
            patch("app.features.zsxq_ingest.service._db.put_object", new_callable=AsyncMock, return_value={"key": "k", "url": "u"}),
            patch("app.features.zsxq_ingest.service._db.upsert_ledger", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service._db.update_run", mock_update_run),
            patch("app.features.zsxq_ingest.service._db.update_state", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service.normalize_topic", return_value=_NORM_RECORD),
            patch("app.features.zsxq_ingest.service.prepare_records", return_value=([_PREPARED], Counter())),
            patch("app.features.zsxq_ingest.service.audit_distribution", return_value={"total": 1, "selected": 1, "dropped": {}}),
            patch("app.features.zsxq_ingest.service.index_prepared", new_callable=AsyncMock, return_value=_FakeIndexResponse()),
            patch("app.features.zsxq_ingest.crawl.ZsxqClient", return_value=mock_client),
            # Smoke: empty results
            patch("app.features.vector.service.search", new_callable=AsyncMock, return_value=[]),
            patch("app.features.vector.models.VectorSearchRequest", MagicMock()),
            patch("app.features.vector.models.VectorSearchFilters", MagicMock()),
        ):
            result = await svc.run_ingest(GROUP, run_id=RUN_ID)

        assert result["status"] == "degraded"
        assert mock_update_run.call_args[1]["status"] == "degraded"


# ---------------------------------------------------------------------------
# Email send failure doesn't crash run
# ---------------------------------------------------------------------------

class TestEmailFailureResilience:
    @pytest.mark.asyncio
    async def test_email_failure_doesnt_crash_run_on_bad_credential(self):
        """Email error during notify should not prevent run from completing."""
        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=None),
            patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock),
            patch("resend.Emails.send", side_effect=RuntimeError("email service down")),
        ):
            # Must not raise
            result = await svc.run_ingest(GROUP, run_id=RUN_ID)

        assert result["status"] == "auth_failed"

    @pytest.mark.asyncio
    async def test_email_failure_doesnt_crash_on_auth_error_during_crawl(self):
        """ZsxqAuthError path: email failure must not crash run."""
        auth_exc = ZsxqAuthError("cookie_expired", "test")

        mock_client = MagicMock()
        mock_client.iter_topics.return_value = _iter_gen([], exc=auth_exc)

        with (
            patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=_ACTIVE_CRED),
            patch("app.features.zsxq_ingest.service._db.get_state", new_callable=AsyncMock, return_value={}),
            patch("app.features.zsxq_ingest.service._db.set_credential", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock),
            patch("app.features.zsxq_ingest.crawl.ZsxqClient", return_value=mock_client),
            patch("resend.Emails.send", side_effect=RuntimeError("email down")),
        ):
            result = await svc.run_ingest(GROUP, run_id=RUN_ID)

        assert result["status"] == "auth_failed"


# ---------------------------------------------------------------------------
# Rate-limit cooldown: one free cooldown then re-try; 2 consecutive → abort
# ---------------------------------------------------------------------------

class TestRateLimitCooldown:
    @pytest.mark.asyncio
    async def test_one_rate_limit_sleeps_and_retries(self):
        """First ZsxqRateLimitError → sleep → retry iterator succeeds."""
        call_count = 0

        def _iter_factory(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                yield from []
                raise ZsxqRateLimitError("429")
            else:
                yield from []  # second call: empty, crawl finishes clean

        mock_client = MagicMock()
        mock_client.iter_topics.side_effect = _iter_factory

        slept: list[float] = []

        async def _fake_sleep(seconds):
            slept.append(seconds)

        original_sleep = svc._sleep_fn
        svc._sleep_fn = _fake_sleep

        try:
            with (
                patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=_ACTIVE_CRED),
                patch("app.features.zsxq_ingest.service._db.get_state", new_callable=AsyncMock, return_value={}),
                patch("app.features.zsxq_ingest.service._db.put_object", new_callable=AsyncMock, return_value={"key": "k", "url": "u"}),
                patch("app.features.zsxq_ingest.service._db.upsert_ledger", new_callable=AsyncMock),
                patch("app.features.zsxq_ingest.service._db.update_run", new_callable=AsyncMock),
                patch("app.features.zsxq_ingest.service._db.update_state", new_callable=AsyncMock),
                patch("app.features.zsxq_ingest.service.normalize_topic", return_value=_NORM_RECORD),
                patch("app.features.zsxq_ingest.service.prepare_records", return_value=([], Counter())),
                patch("app.features.zsxq_ingest.service.audit_distribution", return_value={"total": 0, "selected": 0, "dropped": {}}),
                patch("app.features.zsxq_ingest.service.index_prepared", new_callable=AsyncMock),
                patch("app.features.zsxq_ingest.crawl.ZsxqClient", return_value=mock_client),
                patch("app.features.vector.service.search", new_callable=AsyncMock, return_value=[]),
                patch("app.features.vector.models.VectorSearchRequest", MagicMock()),
                patch("app.features.vector.models.VectorSearchFilters", MagicMock()),
            ):
                result = await svc.run_ingest(GROUP, run_id=RUN_ID)
        finally:
            svc._sleep_fn = original_sleep

        # Slept at least once for the cooldown
        assert len(slept) >= 1
        assert slept[0] == svc._RATE_LIMIT_COOLDOWN
        # Run completed (not aborted)
        assert result["status"] in ("done", "degraded")

    @pytest.mark.asyncio
    async def test_two_consecutive_rate_limits_aborts(self):
        """Two consecutive ZsxqRateLimitErrors → run aborted as 'failed'."""
        call_count = 0

        def _iter_factory(**kwargs):
            nonlocal call_count
            call_count += 1
            yield from []
            raise ZsxqRateLimitError("429 always")

        mock_client = MagicMock()
        mock_client.iter_topics.side_effect = _iter_factory

        slept: list[float] = []

        async def _fake_sleep(seconds):
            slept.append(seconds)

        original_sleep = svc._sleep_fn
        svc._sleep_fn = _fake_sleep

        mock_update_run = AsyncMock()

        try:
            with (
                patch("app.features.zsxq_ingest.service._db.get_credential", new_callable=AsyncMock, return_value=_ACTIVE_CRED),
                patch("app.features.zsxq_ingest.service._db.get_state", new_callable=AsyncMock, return_value={}),
                patch("app.features.zsxq_ingest.service._db.put_object", new_callable=AsyncMock, return_value={"key": "k", "url": "u"}),
                patch("app.features.zsxq_ingest.service._db.upsert_ledger", new_callable=AsyncMock),
                patch("app.features.zsxq_ingest.service._db.update_run", mock_update_run),
                patch("app.features.zsxq_ingest.crawl.ZsxqClient", return_value=mock_client),
            ):
                result = await svc.run_ingest(GROUP, run_id=RUN_ID)
        finally:
            svc._sleep_fn = original_sleep

        assert result["status"] == "failed"
        assert mock_update_run.call_args[1]["status"] == "failed"
        # Exactly one sleep (after first rate limit; second → abort without sleeping)
        assert len(slept) == 1
