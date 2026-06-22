"""
TDD tests for ZsxqClient error handling, retry/backoff, comment fetching,
and binary download mechanics.

All network calls are mocked — no live API calls.

Mechanics verified:
- _handle_response: 401 -> ZsxqAuthError(kind="cookie_expired")
- _handle_response: 403 -> ZsxqAuthError(kind="access_denied")
- _handle_response: code=14210 -> ZsxqAuthError(kind="membership_expired")
- _handle_response: 429 -> ZsxqRateLimitError
- _handle_response: succeeded=True -> returns data dict
- retryable code 1059: retries then succeeds; auth errors do NOT retry
- fetch_full_comments: comments_count<=8 -> zero extra requests
- fetch_full_comments: >8 -> paginates
- fetch_full_comments: error -> returns partial without raising
- download_binaries: success + failure counted; failure does not abort; uses injected save_fn
"""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, call, patch

import httpx
import pytest

from app.features.zsxq_ingest.crawl import (
    ZsxqAuthError,
    ZsxqRateLimitError,
    ZsxqClient,
    next_end_time,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_client(**kwargs) -> ZsxqClient:
    defaults = dict(
        cookie="test-cookie",
        group_id="99999",
        min_delay=0.0,
        max_delay=0.0,
        long_delay_interval=100,
        long_delay_range=(180.0, 300.0),
        offset_ms=1,
    )
    defaults.update(kwargs)
    client = ZsxqClient(**defaults)
    client._sleep = lambda s: None  # no-op sleep everywhere
    return client


def _http_response(status: int, json_body: dict) -> httpx.Response:
    """Build a minimal httpx.Response suitable for _handle_response."""
    req = httpx.Request("GET", "https://api.zsxq.com/v2/groups/99999/topics")
    return httpx.Response(status, json=json_body, request=req)


# ---------------------------------------------------------------------------
# _handle_response
# ---------------------------------------------------------------------------

class TestHandleResponse:
    def test_401_raises_cookie_expired(self):
        client = _make_client()
        resp = _http_response(401, {"succeeded": False, "code": 401, "error": "auth"})
        with pytest.raises(ZsxqAuthError) as exc_info:
            client._handle_response(resp)
        assert exc_info.value.kind == "cookie_expired"

    def test_403_raises_access_denied(self):
        client = _make_client()
        resp = _http_response(403, {"succeeded": False, "code": 403, "error": "forbidden"})
        with pytest.raises(ZsxqAuthError) as exc_info:
            client._handle_response(resp)
        assert exc_info.value.kind == "access_denied"

    def test_code_14210_raises_membership_expired(self):
        client = _make_client()
        resp = _http_response(200, {"succeeded": False, "code": 14210, "error": "membership expired"})
        with pytest.raises(ZsxqAuthError) as exc_info:
            client._handle_response(resp)
        assert exc_info.value.kind == "membership_expired"

    def test_429_raises_rate_limit_error(self):
        client = _make_client()
        resp = _http_response(429, {"succeeded": False, "code": 429, "error": "too many requests"})
        with pytest.raises(ZsxqRateLimitError):
            client._handle_response(resp)

    def test_succeeded_true_returns_resp_data(self):
        client = _make_client()
        payload = {"succeeded": True, "resp_data": {"topics": [{"topic_id": 1}]}}
        resp = _http_response(200, payload)
        result = client._handle_response(resp)
        assert result == payload["resp_data"]

    def test_retryable_code_1059_raises_retryable_error(self):
        """API code 1059 (anti-crawl) should raise a retryable error, not ZsxqAuthError."""
        from app.features.zsxq_ingest.crawl import ZsxqRetryableError
        client = _make_client()
        resp = _http_response(200, {"succeeded": False, "code": 1059, "error": "anti-crawl"})
        with pytest.raises(ZsxqRetryableError):
            client._handle_response(resp)

    def test_unknown_api_error_raises_value_error(self):
        client = _make_client()
        resp = _http_response(200, {"succeeded": False, "code": 9999, "error": "unknown"})
        with pytest.raises(Exception):  # should raise something — not silently return None
            client._handle_response(resp)


# ---------------------------------------------------------------------------
# Retry/backoff on _fetch_topics_page
# ---------------------------------------------------------------------------

class TestRetryBackoff:
    def test_retryable_code_retries_then_succeeds(self):
        """_fetch_topics_page should retry on ZsxqRetryableError and eventually succeed."""
        client = _make_client()
        sleep_calls: list[float] = []
        client._sleep = lambda s: sleep_calls.append(s)

        good_data = {"topics": [{"topic_id": 42, "create_time": "2025-07-03T10:00:00.000+0800", "comments_count": 0}]}

        call_count = {"n": 0}

        def fake_get(url, *, headers, params, timeout):
            call_count["n"] += 1
            if call_count["n"] < 3:
                # Return retryable code
                req = httpx.Request("GET", url)
                return httpx.Response(200, json={"succeeded": False, "code": 1059, "error": "anti-crawl"}, request=req)
            else:
                req = httpx.Request("GET", url)
                return httpx.Response(200, json={"succeeded": True, "resp_data": good_data}, request=req)

        with patch.object(client._http, "get", side_effect=fake_get):
            result = client._fetch_topics_page(scope="all", end_time=None, count=20)

        assert result["topics"][0]["topic_id"] == 42
        assert call_count["n"] == 3
        # At least some sleep between retries
        assert len(sleep_calls) >= 2

    def test_auth_error_does_not_retry(self):
        """ZsxqAuthError (401) must propagate immediately — no retry."""
        client = _make_client()
        sleep_calls: list[float] = []
        client._sleep = lambda s: sleep_calls.append(s)

        call_count = {"n": 0}

        def fake_get(url, *, headers, params, timeout):
            call_count["n"] += 1
            req = httpx.Request("GET", url)
            return httpx.Response(401, json={"succeeded": False, "code": 401, "error": "auth"}, request=req)

        with patch.object(client._http, "get", side_effect=fake_get):
            with pytest.raises(ZsxqAuthError) as exc_info:
                client._fetch_topics_page(scope="all", end_time=None, count=20)

        assert exc_info.value.kind == "cookie_expired"
        # Should have called exactly once — no retry
        assert call_count["n"] == 1


# ---------------------------------------------------------------------------
# fetch_full_comments
# ---------------------------------------------------------------------------

class TestFetchFullComments:
    def test_comments_count_lte_8_makes_zero_extra_requests(self):
        client = _make_client()
        topic = {"topic_id": 101, "comments_count": 5, "show_comments": []}

        call_count = {"n": 0}

        def fake_get(url, *, headers, params, timeout):
            call_count["n"] += 1
            req = httpx.Request("GET", url)
            return httpx.Response(200, json={}, request=req)

        with patch.object(client._http, "get", side_effect=fake_get):
            result = client.fetch_full_comments(topic)

        assert result == []
        assert call_count["n"] == 0

    def test_comments_count_8_makes_zero_extra_requests(self):
        """Exactly 8 — boundary: should NOT fetch extra."""
        client = _make_client()
        topic = {"topic_id": 101, "comments_count": 8, "show_comments": []}
        call_count = {"n": 0}

        def fake_get(url, *, headers, params, timeout):
            call_count["n"] += 1
            req = httpx.Request("GET", url)
            return httpx.Response(200, json={}, request=req)

        with patch.object(client._http, "get", side_effect=fake_get):
            result = client.fetch_full_comments(topic)

        assert result == []
        assert call_count["n"] == 0

    def test_comments_count_gt_8_paginates(self):
        """comments_count > 8 should fetch full list via pagination."""
        client = _make_client()

        # Page 1: 30 comments (full page — more to come)
        page1_comments = [
            {"comment_id": i, "create_time": f"2025-07-03T10:{i:02d}:00.000+0800"}
            for i in range(30)
        ]
        # Page 2: fewer than 30 (last page)
        page2_comments = [
            {"comment_id": i + 30, "create_time": f"2025-07-03T11:{i:02d}:00.000+0800"}
            for i in range(5)
        ]

        call_count = {"n": 0}

        def fake_get(url, *, headers, params, timeout):
            call_count["n"] += 1
            req = httpx.Request("GET", url)
            if call_count["n"] == 1:
                return httpx.Response(
                    200,
                    json={"succeeded": True, "resp_data": {"comments": page1_comments}},
                    request=req,
                )
            else:
                return httpx.Response(
                    200,
                    json={"succeeded": True, "resp_data": {"comments": page2_comments}},
                    request=req,
                )

        topic = {"topic_id": 101, "comments_count": 35, "show_comments": []}
        with patch.object(client._http, "get", side_effect=fake_get):
            result = client.fetch_full_comments(topic)

        assert len(result) == 35
        assert call_count["n"] == 2

    def test_comment_fetch_error_returns_partial_without_raising(self):
        """A failure mid-pagination must return what we already collected, not raise."""
        client = _make_client()

        page1_comments = [
            {"comment_id": i, "create_time": f"2025-07-03T10:{i:02d}:00.000+0800"}
            for i in range(30)
        ]
        call_count = {"n": 0}

        def fake_get(url, *, headers, params, timeout):
            call_count["n"] += 1
            req = httpx.Request("GET", url)
            if call_count["n"] == 1:
                return httpx.Response(
                    200,
                    json={"succeeded": True, "resp_data": {"comments": page1_comments}},
                    request=req,
                )
            else:
                # Simulate server error on second page
                return httpx.Response(500, text="Internal Server Error", request=req)

        topic = {"topic_id": 101, "comments_count": 50, "show_comments": []}
        with patch.object(client._http, "get", side_effect=fake_get):
            result = client.fetch_full_comments(topic)

        # Should return what we got from page 1, not raise
        assert len(result) == 30
        assert result[0]["comment_id"] == 0

    def test_complete_failure_returns_empty_list_without_raising(self):
        """Total failure on first comment page: returns [] without raising."""
        client = _make_client()

        def fake_get(url, *, headers, params, timeout):
            req = httpx.Request("GET", url)
            return httpx.Response(500, text="Server Error", request=req)

        topic = {"topic_id": 101, "comments_count": 20, "show_comments": []}
        with patch.object(client._http, "get", side_effect=fake_get):
            result = client.fetch_full_comments(topic)

        assert result == []

    def test_comment_page_retries_on_1059_then_returns_full(self):
        """
        A comment-page fetch that returns code 1059 once should be retried
        (monkeypatched _sleep captures the wait) and ultimately return the
        full comment set from the successful second attempt.
        """
        client = _make_client()
        sleep_calls: list[float] = []
        client._sleep = lambda s: sleep_calls.append(s)

        page1_comments = [
            {"comment_id": i, "create_time": f"2025-07-03T10:{i:02d}:00.000+0800"}
            for i in range(5)
        ]

        call_count = {"n": 0}

        def fake_get(url, *, headers, params, timeout):
            req = httpx.Request("GET", url)
            call_count["n"] += 1
            if call_count["n"] == 1:
                # First attempt: anti-crawl retryable code 1059
                return httpx.Response(
                    200,
                    json={"succeeded": False, "code": 1059, "error": "anti-crawl"},
                    request=req,
                )
            else:
                # Second attempt: success with 5 comments (< 30 → last page)
                return httpx.Response(
                    200,
                    json={"succeeded": True, "resp_data": {"comments": page1_comments}},
                    request=req,
                )

        topic = {"topic_id": 202, "comments_count": 5, "show_comments": []}
        # Override comments_count so fetch is triggered (must be > 8)
        topic["comments_count"] = 9
        with patch.object(client._http, "get", side_effect=fake_get):
            result = client.fetch_full_comments(topic)

        # Should have retried — at least 2 HTTP calls
        assert call_count["n"] == 2, f"Expected 2 HTTP calls, got {call_count['n']}"
        # Sleep was called at least once (backoff between attempts)
        assert len(sleep_calls) >= 1, f"Expected at least 1 sleep call, got {sleep_calls}"
        # Full comment set returned
        assert len(result) == 5
        assert result[0]["comment_id"] == 0

    def test_comment_page_non_retryable_failure_returns_partial(self):
        """
        A non-retryable API error (e.g. code 9999) on the second comment page
        should return what was already collected (partial), without raising.
        This confirms 1059-retry path doesn't break the existing partial-return behavior.
        """
        client = _make_client()
        client._sleep = lambda s: None

        page1_comments = [
            {"comment_id": i, "create_time": f"2025-07-03T10:{i:02d}:00.000+0800"}
            for i in range(30)
        ]
        call_count = {"n": 0}

        def fake_get(url, *, headers, params, timeout):
            req = httpx.Request("GET", url)
            call_count["n"] += 1
            if call_count["n"] == 1:
                return httpx.Response(
                    200,
                    json={"succeeded": True, "resp_data": {"comments": page1_comments}},
                    request=req,
                )
            else:
                # Non-retryable error on page 2
                return httpx.Response(
                    200,
                    json={"succeeded": False, "code": 9999, "error": "permanent failure"},
                    request=req,
                )

        topic = {"topic_id": 203, "comments_count": 50, "show_comments": []}
        with patch.object(client._http, "get", side_effect=fake_get):
            result = client.fetch_full_comments(topic)

        # Returns partial (30 from page 1) without raising
        assert len(result) == 30
        assert result[0]["comment_id"] == 0


# ---------------------------------------------------------------------------
# download_binaries
# ---------------------------------------------------------------------------

class TestDownloadBinaries:
    def _make_topic_with_files(self, n_files: int) -> dict:
        # Real zsxq payload shape: files live under talk.files (no top-level
        # "attachments" field).
        return {
            "topic_id": 999,
            "create_time": "2025-07-03T10:00:00.000+0800",
            "comments_count": 0,
            "talk": {
                "owner": {"user_id": 1, "name": "x"},
                "text": "t",
                "files": [
                    {"file_id": f"file_{i}", "name": f"doc_{i}.pdf"}
                    for i in range(n_files)
                ],
            },
        }

    def test_success_counted(self):
        client = _make_client()
        topic = self._make_topic_with_files(2)

        # download_url fetch returns a signed URL
        def fake_get(url, *, headers, params=None, timeout):
            req = httpx.Request("GET", url)
            if "/download_url" in url:
                return httpx.Response(200, json={"succeeded": True, "resp_data": {"download_url": "https://cdn.example.com/file.pdf"}}, request=req)
            # binary fetch
            return httpx.Response(200, content=b"PDF_BYTES", request=req)

        saved: list[str] = []
        save_fn = lambda name, content: (saved.append(name), True)[1]

        with patch.object(client._http, "get", side_effect=fake_get):
            downloaded, failed = client.download_binaries(topic, save_fn)

        assert downloaded == 2
        assert failed == 0
        assert len(saved) == 2

    def test_failure_counted_does_not_abort(self):
        """One file fails to download — failure counted, second file still attempted."""
        client = _make_client()
        topic = self._make_topic_with_files(2)

        call_count = {"n": 0}

        def fake_get(url, *, headers, params=None, timeout):
            req = httpx.Request("GET", url)
            call_count["n"] += 1
            if "/download_url" in url:
                return httpx.Response(200, json={"succeeded": True, "resp_data": {"download_url": "https://cdn.example.com/file.pdf"}}, request=req)
            # First binary fetch fails, second succeeds
            if call_count["n"] % 2 == 0:
                return httpx.Response(500, text="Server Error", request=req)
            return httpx.Response(200, content=b"PDF_BYTES", request=req)

        save_fn = MagicMock(return_value=True)

        with patch.object(client._http, "get", side_effect=fake_get):
            downloaded, failed = client.download_binaries(topic, save_fn)

        # Total = 2; one succeeded, one failed; sums to 2
        assert downloaded + failed == 2
        assert failed >= 1  # at least the one failure counted

    def test_uses_injected_save_fn(self):
        """download_binaries must call save_fn(name, bytes) for each success."""
        client = _make_client()
        topic = self._make_topic_with_files(1)

        def fake_get(url, *, headers, params=None, timeout):
            req = httpx.Request("GET", url)
            if "/download_url" in url:
                return httpx.Response(200, json={"succeeded": True, "resp_data": {"download_url": "https://cdn.example.com/file.pdf"}}, request=req)
            return httpx.Response(200, content=b"BINARY_DATA", request=req)

        save_fn = MagicMock(return_value=True)

        with patch.object(client._http, "get", side_effect=fake_get):
            client.download_binaries(topic, save_fn)

        save_fn.assert_called_once()
        name_arg, bytes_arg = save_fn.call_args.args
        assert isinstance(name_arg, str)
        assert bytes_arg == b"BINARY_DATA"

    def test_topic_with_no_attachments(self):
        """Topics without attachments return (0, 0)."""
        client = _make_client()
        topic = {"topic_id": 999, "comments_count": 0}

        save_fn = MagicMock(return_value=True)
        downloaded, failed = client.download_binaries(topic, save_fn)

        assert downloaded == 0
        assert failed == 0
        save_fn.assert_not_called()
