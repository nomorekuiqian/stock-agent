"""
TDD tests for ZsxqClient cursor pagination and rate-limit mechanics.

All network calls are mocked — no live API calls.

Mechanics verified:
- next_end_time subtracts offset_ms and preserves +0800 format
- iter_topics stops on empty page
- iter_topics advances cursor across multiple pages
- incremental stop via stop_create_time
- long-sleep fires every long_delay_interval pages
"""
from __future__ import annotations

import time
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.features.zsxq_ingest.crawl import ZsxqClient, next_end_time


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_client(**kwargs) -> ZsxqClient:
    """Return a ZsxqClient with safe test defaults (no real cookie, no real HTTP)."""
    defaults = dict(
        cookie="test-cookie",
        group_id="99999",
        min_delay=0.0,
        max_delay=0.0,
        long_delay_interval=5,
        long_delay_range=(180.0, 300.0),
        offset_ms=1,
    )
    defaults.update(kwargs)
    return ZsxqClient(**defaults)


def _topic(create_time: str, topic_id: int = 1) -> dict:
    return {"topic_id": topic_id, "create_time": create_time, "comments_count": 0}


def _page(topics: list[dict]) -> dict:
    return {"topics": topics}


# ---------------------------------------------------------------------------
# next_end_time
# ---------------------------------------------------------------------------

class TestNextEndTime:
    def test_subtracts_1ms_basic(self):
        result = next_end_time("2025-07-03T12:54:05.849+0800")
        assert result == "2025-07-03T12:54:05.848+0800"

    def test_preserves_plus0800_suffix(self):
        result = next_end_time("2025-07-03T12:54:05.849+0800")
        assert result.endswith("+0800")

    def test_borrows_across_second_boundary(self):
        # .000 - 1ms → borrows a second: .999 at previous second
        result = next_end_time("2025-07-03T12:54:05.000+0800")
        assert result == "2025-07-03T12:54:04.999+0800"

    def test_custom_offset_2ms(self):
        result = next_end_time("2025-07-03T12:54:05.010+0800", offset_ms=2)
        assert result == "2025-07-03T12:54:05.008+0800"

    def test_output_format_3_digit_ms(self):
        # must always have exactly 3 ms digits
        result = next_end_time("2025-07-03T12:54:05.001+0800")
        # "001" - 1 = "000"
        assert result == "2025-07-03T12:54:05.000+0800"


# ---------------------------------------------------------------------------
# iter_topics — cursor advancement and empty-page stop
# ---------------------------------------------------------------------------

class TestIterTopicsCursor:
    def test_stops_on_empty_page(self):
        client = _make_client()
        client._sleep = lambda s: None  # no-op sleep

        # First page returns empty
        client._fetch_topics_page = MagicMock(return_value=_page([]))

        topics = list(client.iter_topics())
        assert topics == []
        client._fetch_topics_page.assert_called_once()

    def test_single_page_yields_topics(self):
        client = _make_client()
        client._sleep = lambda s: None

        page1_topics = [
            _topic("2025-07-03T10:00:00.100+0800", topic_id=1),
            _topic("2025-07-03T09:00:00.500+0800", topic_id=2),
        ]
        responses = iter([_page(page1_topics), _page([])])
        client._fetch_topics_page = MagicMock(side_effect=responses)

        topics = list(client.iter_topics())
        assert len(topics) == 2
        assert topics[0]["topic_id"] == 1
        assert topics[1]["topic_id"] == 2

    def test_cursor_advances_to_last_topic_time(self):
        """Second page request must use next_end_time of the last topic on page 1."""
        client = _make_client(offset_ms=1)
        client._sleep = lambda s: None

        page1_topics = [
            _topic("2025-07-03T10:00:00.100+0800", topic_id=1),
            _topic("2025-07-03T09:00:00.500+0800", topic_id=2),  # <- last
        ]
        responses = iter([_page(page1_topics), _page([])])
        client._fetch_topics_page = MagicMock(side_effect=responses)

        list(client.iter_topics())

        calls = client._fetch_topics_page.call_args_list
        assert len(calls) == 2
        # First call: no end_time
        assert calls[0].kwargs.get("end_time") is None
        # Second call: cursor is next_end_time of "2025-07-03T09:00:00.500+0800"
        expected_cursor = next_end_time("2025-07-03T09:00:00.500+0800", offset_ms=1)
        assert calls[1].kwargs["end_time"] == expected_cursor

    def test_multi_page_yields_all_topics(self):
        client = _make_client()
        client._sleep = lambda s: None

        page1 = [_topic("2025-07-03T10:00:00.100+0800", 1), _topic("2025-07-03T09:00:00.500+0800", 2)]
        page2 = [_topic("2025-07-03T08:00:00.200+0800", 3), _topic("2025-07-03T07:00:00.000+0800", 4)]
        page3: list[dict] = []
        responses = iter([_page(page1), _page(page2), _page(page3)])
        client._fetch_topics_page = MagicMock(side_effect=responses)

        topics = list(client.iter_topics())
        assert [t["topic_id"] for t in topics] == [1, 2, 3, 4]


# ---------------------------------------------------------------------------
# iter_topics — incremental stop
# ---------------------------------------------------------------------------

class TestIterTopicsIncrementalStop:
    def test_stops_when_topic_at_or_before_stop_time(self):
        """Topics with create_time <= stop_create_time must not be yielded."""
        client = _make_client()
        client._sleep = lambda s: None

        stop_time = "2025-07-03T09:00:00.000+0800"
        page1_topics = [
            _topic("2025-07-03T10:00:00.100+0800", 1),  # newer: should yield
            _topic("2025-07-03T09:00:00.000+0800", 2),  # == stop_time: should NOT yield
            _topic("2025-07-03T08:00:00.000+0800", 3),  # older: should NOT yield
        ]
        client._fetch_topics_page = MagicMock(return_value=_page(page1_topics))

        topics = list(client.iter_topics(stop_create_time=stop_time))
        assert [t["topic_id"] for t in topics] == [1]
        # Should have stopped after the first page (no second fetch needed)
        assert client._fetch_topics_page.call_count == 1

    def test_full_true_ignores_stop_cursor(self):
        """full=True disables the incremental stop even with stop_create_time set."""
        client = _make_client()
        client._sleep = lambda s: None

        stop_time = "2025-07-03T09:00:00.000+0800"
        page1_topics = [
            _topic("2025-07-03T10:00:00.100+0800", 1),
            _topic("2025-07-03T08:00:00.000+0800", 2),  # older than stop — but full=True
        ]
        responses = iter([_page(page1_topics), _page([])])
        client._fetch_topics_page = MagicMock(side_effect=responses)

        topics = list(client.iter_topics(stop_create_time=stop_time, full=True))
        assert [t["topic_id"] for t in topics] == [1, 2]


# ---------------------------------------------------------------------------
# Long-sleep fires every N pages
# ---------------------------------------------------------------------------

class TestLongSleepInterval:
    def test_long_sleep_fires_at_interval_boundary(self):
        """After every long_delay_interval pages, _sleep is called with a value
        in [long_delay_range[0], long_delay_range[1]]."""
        INTERVAL = 3
        LONG_MIN, LONG_MAX = 180.0, 300.0
        client = _make_client(
            long_delay_interval=INTERVAL,
            long_delay_range=(LONG_MIN, LONG_MAX),
            min_delay=0.0,
            max_delay=0.0,
        )
        sleep_calls: list[float] = []
        client._sleep = lambda s: sleep_calls.append(s)

        # 3 pages of 1 topic each, then empty
        def make_pages():
            for i in range(INTERVAL):
                yield _page([_topic(f"2025-07-0{i+1}T10:00:00.100+0800", i + 1)])
            yield _page([])

        client._fetch_topics_page = MagicMock(side_effect=make_pages())

        list(client.iter_topics())

        # At least one long sleep should have occurred in [180, 300]
        long_sleeps = [s for s in sleep_calls if LONG_MIN <= s <= LONG_MAX]
        assert long_sleeps, (
            f"Expected a long sleep in [{LONG_MIN}, {LONG_MAX}]; got sleep_calls={sleep_calls}"
        )

    def test_no_long_sleep_before_interval(self):
        """If we complete fewer pages than the interval, no long sleep fires."""
        INTERVAL = 5
        client = _make_client(
            long_delay_interval=INTERVAL,
            long_delay_range=(180.0, 300.0),
            min_delay=0.0,
            max_delay=0.0,
        )
        sleep_calls: list[float] = []
        client._sleep = lambda s: sleep_calls.append(s)

        # Only 2 pages (< INTERVAL=5)
        pages = iter([
            _page([_topic("2025-07-01T10:00:00.100+0800", 1)]),
            _page([_topic("2025-07-01T09:00:00.100+0800", 2)]),
            _page([]),
        ])
        client._fetch_topics_page = MagicMock(side_effect=pages)

        list(client.iter_topics())

        long_sleeps = [s for s in sleep_calls if 180.0 <= s <= 300.0]
        assert not long_sleeps, f"Unexpected long sleep: {long_sleeps}"


# ---------------------------------------------------------------------------
# fetch_creator_ids — official roles (owner + admins + guests + partners)
# ---------------------------------------------------------------------------
class TestFetchCreatorIds:
    def test_parses_owner_admins_guests_partners_deduped(self):
        client = _make_client()
        client._fetch_with_retry = MagicMock(return_value={
            "group": {
                "owner": {"user_id": 100, "name": "球主"},
                "admin_ids": [200, 201],
                "guest_ids": [300, 301, 302],
                "partner_ids": [200],  # also an admin → deduped
            }
        })
        assert client.fetch_creator_ids() == {100, 200, 201, 300, 301, 302}

    def test_owner_only_when_no_special_roles(self):
        client = _make_client()
        client._fetch_with_retry = MagicMock(return_value={"group": {"owner": {"user_id": 7}}})
        assert client.fetch_creator_ids() == {7}

    def test_members_not_included(self):
        # A plain member's user_id never appears in the official role lists.
        client = _make_client()
        client._fetch_with_retry = MagicMock(return_value={
            "group": {"owner": {"user_id": 1}, "admin_ids": [2], "guest_ids": [3], "partner_ids": []}
        })
        assert 814811842588222 not in client.fetch_creator_ids()
