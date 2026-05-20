"""Unit tests for brew/models ActionItem and PersonalDigestOutput action_items wiring."""

import pytest
from pydantic import ValidationError

from app.features.brew.models import (
    ActionItem,
    DigestResponse,
    PersonalDigestOutput,
)


class TestActionItem:
    def test_valid_action_item(self):
        item = ActionItem(
            label="补 NVDA 投资论点",
            target="thesis:NVDA",
            reason="NVDA 缺论点，今日财报临近",
            priority=1,
        )
        assert item.priority == 1

    def test_priority_bounds(self):
        with pytest.raises(ValidationError):
            ActionItem(label="x", target="portfolio", reason="y", priority=0)
        with pytest.raises(ValidationError):
            ActionItem(label="x", target="portfolio", reason="y", priority=4)

    def test_label_soft_limit_allows_up_to_20(self):
        # Schema allows up to 20 chars as a safety cushion; prompt asks for ≤12.
        # Example from prompt "回看 4/21 美联储预警" is 13 chars — must not be rejected.
        label_13 = "回看 4/21 美联储预警"
        assert len(label_13) == 13
        item = ActionItem(label=label_13, target="portfolio", reason="y", priority=1)
        assert item.label == label_13

    def test_label_exceeds_hard_cap(self):
        with pytest.raises(ValidationError):
            ActionItem(label="一" * 21, target="portfolio", reason="y", priority=1)


class TestDigestResponseActionItems:
    def test_action_items_default_empty(self):
        resp = DigestResponse(timestamp="2026-04-25T00:00:00Z")
        assert resp.action_items == []

    def test_action_items_populated(self):
        items = [
            ActionItem(label="看体检", target="health", reason="14 天未体检", priority=1),
        ]
        resp = DigestResponse(timestamp="2026-04-25T00:00:00Z", action_items=items)
        assert len(resp.action_items) == 1
        assert resp.action_items[0].target == "health"


class TestPersonalDigestOutputActionItems:
    def test_action_items_default_empty(self):
        out = PersonalDigestOutput(
            greeting="g", one_line_summary="o",
            stocks=[], news={"headlines": [], "briefs": []},
            events=[], summary={"content": "c"},
        )
        assert out.action_items == []

    def test_action_items_max_3(self):
        items = [
            ActionItem(label=f"a{i}", target="portfolio", reason="r", priority=1)
            for i in range(4)
        ]
        with pytest.raises(ValidationError):
            PersonalDigestOutput(
                greeting="g", one_line_summary="o",
                stocks=[], news={"headlines": [], "briefs": []},
                events=[], summary={"content": "c"},
                action_items=items,
            )
