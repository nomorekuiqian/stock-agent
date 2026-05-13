"""Unit tests for action_items validator and target resolution."""

import pytest
from unittest.mock import AsyncMock, patch

from app.features.brew.models import ActionItem
from app.features.for_you.action_items import (
    parse_target,
    validate_and_resolve,
)


def _item(label="x", target="portfolio", reason="r", priority=1) -> ActionItem:
    return ActionItem(label=label, target=target, reason=reason, priority=priority)


class TestParseTarget:
    def test_parse_thesis(self):
        assert parse_target("thesis:NVDA") == ("thesis", "NVDA")

    def test_parse_bare(self):
        assert parse_target("portfolio") == ("portfolio", "")

    def test_parse_section(self):
        assert parse_target("section:notes") == ("section", "notes")

    def test_parse_digest_date(self):
        assert parse_target("digest:2026-04-21") == ("digest", "2026-04-21")


class TestValidateAndResolve:
    @pytest.mark.asyncio
    async def test_valid_bare_targets_pass(self):
        items = [
            _item(target="portfolio"),
            _item(target="health"),
            _item(target="watchlist"),
        ]
        out = await validate_and_resolve(
            items,
            user_symbols={"NVDA", "AAPL"},
            missing_thesis={"NVDA"},
            previous_digest_dates={"2026-04-21"},
            resolve_digest_id=AsyncMock(return_value=None),
        )
        assert len(out) == 3

    @pytest.mark.asyncio
    async def test_thesis_requires_missing_thesis_symbol(self):
        items = [
            _item(target="thesis:NVDA"),
            _item(target="thesis:AAPL"),  # AAPL has thesis
        ]
        out = await validate_and_resolve(
            items,
            user_symbols={"NVDA", "AAPL"},
            missing_thesis={"NVDA"},
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(return_value=None),
        )
        assert len(out) == 1
        assert out[0].target == "thesis:NVDA"

    @pytest.mark.asyncio
    async def test_stock_requires_user_symbol(self):
        items = [
            _item(target="stock:NVDA"),
            _item(target="stock:XYZ"),  # not held or watched
        ]
        out = await validate_and_resolve(
            items,
            user_symbols={"NVDA"},
            missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(return_value=None),
        )
        assert len(out) == 1
        assert out[0].target == "stock:NVDA"

    @pytest.mark.asyncio
    async def test_section_whitelist(self):
        valid = [_item(target="section:notes"), _item(target="section:events")]
        invalid = [_item(target="section:garbage")]
        out = await validate_and_resolve(
            valid + invalid,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(return_value=None),
        )
        assert len(out) == 2

    @pytest.mark.asyncio
    async def test_digest_date_resolves_to_uuid(self):
        items = [_item(target="digest:2026-04-21")]
        resolver = AsyncMock(return_value="uuid-abc-123")
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates={"2026-04-21"},
            resolve_digest_id=resolver,
        )
        assert len(out) == 1
        assert out[0].target == "digest:uuid-abc-123"
        resolver.assert_awaited_once_with("2026-04-21")

    @pytest.mark.asyncio
    async def test_digest_date_drop_if_not_in_whitelist(self):
        items = [_item(target="digest:2026-04-21")]
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),  # date not known
            resolve_digest_id=AsyncMock(),
        )
        assert len(out) == 0

    @pytest.mark.asyncio
    async def test_digest_date_drop_if_resolver_returns_none(self):
        items = [_item(target="digest:2026-04-21")]
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates={"2026-04-21"},
            resolve_digest_id=AsyncMock(return_value=None),
        )
        assert len(out) == 0

    @pytest.mark.asyncio
    async def test_unknown_prefix_dropped(self):
        items = [_item(target="buy:NVDA"), _item(target="random")]
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(),
        )
        assert len(out) == 0

    @pytest.mark.asyncio
    async def test_stable_sort_by_priority_then_target(self):
        items = [
            _item(label="a", target="portfolio", priority=1),
            _item(label="b", target="health", priority=1),  # same priority
            _item(label="c", target="watchlist", priority=2),
        ]
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(),
        )
        # priority 1 first; inside priority 1, target string ascending: health, portfolio
        assert [i.target for i in out] == ["health", "portfolio", "watchlist"]

    @pytest.mark.asyncio
    async def test_cap_at_three(self):
        items = [_item(target="portfolio", priority=i % 3 + 1) for i in range(5)]
        out = await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(),
        )
        assert len(out) == 3

    @pytest.mark.asyncio
    async def test_truncation_emits_info_log(self, caplog):
        import logging
        caplog.set_level(logging.INFO, logger="app.features.for_you.action_items")
        items = [_item(target="portfolio", priority=1) for _ in range(5)]
        await validate_and_resolve(
            items,
            user_symbols=set(), missing_thesis=set(),
            previous_digest_dates=set(),
            resolve_digest_id=AsyncMock(),
        )
        assert any("truncating from 5 to 3" in rec.message for rec in caplog.records)
