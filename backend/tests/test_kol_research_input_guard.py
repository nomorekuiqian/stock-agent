"""Unit tests for KOL research input guard."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.features.kol_research.input_guard import (
    append_data_coverage_warning,
    build_input_guard_context,
    parse_input,
    validate_data_coverage,
)
from app.features.kol_research.models import KolToolCallSummary


def test_parse_input_detects_ticker_and_chinese_alias():
    parsed = parse_input("英伟达 NVDA 现在能买吗？")

    assert parsed.symbols == ["NVDA"]
    assert parsed.priceable_symbols == ["NVDA"]
    assert parsed.is_stock_question is True
    assert parsed.source["NVDA"] in {"ticker", "alias:英伟达"}


def test_parse_input_uses_stock_content_context_for_this_stock():
    parsed = parse_input(
        "这只股票要不要卖？",
        content_context={"type": "stock", "symbol": "MSFT"},
    )

    assert parsed.symbols == ["MSFT"]
    assert parsed.source["MSFT"] == "content_context"
    assert parsed.required_tool_keys() == {"get_stock_brief:MSFT"}


def test_parse_input_detects_macro_and_news_intents():
    parsed = parse_input("这个 CPI 新闻对美股是利好还是利空？ https://example.com/cpi")

    assert parsed.is_macro_question is True
    assert parsed.is_news_question is True
    assert parsed.urls == ["https://example.com/cpi"]
    assert "get_macro_brief" in parsed.required_tool_keys()


def test_parse_input_requires_stock_and_macro_when_question_crosses_both():
    parsed = parse_input("如果宏观流动性变紧，NVDA 还能拿吗？")

    assert parsed.required_tool_keys() == {
        "get_stock_brief:NVDA",
        "get_macro_brief",
    }


@pytest.mark.asyncio
async def test_build_input_guard_context_prefetches_stock_data():
    with patch(
        "app.features.kol_research.input_guard.get_stock_brief",
        AsyncMock(return_value='{"symbol":"NVDA","quote":{"price":123}}'),
    ):
        ctx = await build_input_guard_context(message="NVDA 现在能买吗？")

    assert "get_stock_brief:NVDA" in ctx.fulfilled_tool_keys
    assert "Deterministic Input Guard" in ctx.prompt_section
    assert '"symbols": ["NVDA"]' in ctx.prompt_section
    assert '"price": 123' in ctx.prompt_section


def test_validate_data_coverage_accepts_prefetched_data():
    parsed = parse_input("NVDA 现在能买吗？")

    missing = validate_data_coverage(
        parsed,
        fulfilled_tool_keys={"get_stock_brief:NVDA"},
        tool_calls=[],
    )

    assert missing == []


def test_validate_data_coverage_accepts_matching_tool_call():
    parsed = parse_input("NVDA 现在能买吗？")
    tool_calls = [
        KolToolCallSummary(
            name="get_stock_brief",
            args_summary='{"symbol":"NVDA"}',
        )
    ]

    missing = validate_data_coverage(
        parsed,
        fulfilled_tool_keys=set(),
        tool_calls=tool_calls,
    )

    assert missing == []


def test_append_data_coverage_warning_adds_downgrade_note():
    text = append_data_coverage_warning("原回答", ["get_stock_brief:NVDA"])

    assert "数据覆盖提示" in text
    assert "`NVDA` 的当下行情 / 基本面数据" in text
