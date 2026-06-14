"""Unit tests for final KOL answer output hygiene."""

from __future__ import annotations

import pytest

from app.features.kol_research import agent as kol_agent_module
from app.features.kol_research.agent import (
    generate_kol_follow_up_options,
    _normalize_follow_up_options,
    _sanitize_user_facing_markdown,
    _slim_content_context_for_follow_up,
)


def test_sanitizer_translates_internal_coverage_label():
    out = _sanitize_user_facing_markdown("针对当前约 211 美元的股价（`coverage: high`）。")

    assert "coverage" not in out
    assert "high" not in out
    assert "博主讨论很充分" in out


def test_sanitizer_strips_debug_code_spans_but_keeps_ticker_and_threshold():
    out = _sanitize_user_facing_markdown(
        "`Revenue YoY` 还不错，`Blackwell` 是核心；`NVDA` 若 `PE < 20` 再看。"
    )

    assert "`Revenue YoY`" not in out
    assert "`Blackwell`" not in out
    assert "Revenue YoY" in out
    assert "Blackwell" in out
    assert "`NVDA`" in out
    assert "`PE < 20`" in out


def test_sanitizer_removes_bold_bullet_labels_and_caps_bold_count():
    out = _sanitize_user_facing_markdown(
        "**结论一**。\n"
        "**结论二**。\n"
        "**结论三**。\n"
        "* **如果你已经持有**：看数据。\n"
        "* **必须警惕**：看风险。"
    )

    assert "* **如果你已经持有**：" not in out
    assert "* 如果你已经持有：" in out
    # _BOLD_RE caps bold runs at 3 (matches the prompt rule "全篇最多 3 处")
    assert out.count("**") // 2 == 3
    assert "结论三" in out


def test_sanitizer_downgrades_trading_action_language():
    out = _sanitize_user_facing_markdown(
        "不建议追高，应该等待回调后分批建仓，也不要恐慌卖出。"
    )

    assert "不建议" not in out
    assert "应该等待" not in out
    assert "分批建仓" not in out
    assert "恐慌卖出" not in out
    assert "不适合追高" in out
    assert "更稳的是等待" in out
    assert "分批评估" in out


def test_sanitizer_preserves_frank_methodology_terms_for_frank_persona():
    out = _sanitize_user_facing_markdown(
        "Frank 的三杀框架里，这更像杀估值，不是杀业绩或杀逻辑。",
        persona_username="qinbafrank",
    )

    assert "三杀" in out
    assert "杀估值" in out
    assert "杀业绩" in out
    assert "杀逻辑" in out
    assert "判断状态" not in out
    assert "估值回撤" not in out


def test_follow_up_options_filter_trading_advice_and_deduplicate():
    out = _normalize_follow_up_options([
        " 1. 哪些数据会证伪 NVDA 逻辑? ",
        "哪些数据会证伪 NVDA 逻辑?",
        "这只股票可以买入吗?",
        "给我一个目标价",
        "把 MU 和 AVGO 放一起比",
    ])

    assert out == [
        "哪些数据会证伪 NVDA 逻辑?",
        "把 MU 和 AVGO 放一起比",
    ]


def test_follow_up_context_slimmer_keeps_only_useful_fields():
    out = _slim_content_context_for_follow_up({
        "type": "stock",
        "label": "NVDA 个股研究",
        "summary": "NVDA",
        "symbol": "NVDA",
        "params": {"symbol": "NVDA", "tab": "earnings", "ignored": "x"},
        "quote": {"price": 180, "change_percent": 2.1, "extra": "drop"},
        "large_blob": {"ignore": True},
    })

    assert out == {
        "type": "stock",
        "label": "NVDA 个股研究",
        "summary": "NVDA",
        "symbol": "NVDA",
        "params": {"symbol": "NVDA", "tab": "earnings"},
        "quote": {"price": 180, "change_percent": 2.1},
    }


@pytest.mark.asyncio
async def test_follow_up_generator_is_best_effort_when_runner_fails(monkeypatch):
    async def fail_create_session(**_kwargs):
        raise RuntimeError("runner unavailable")

    monkeypatch.setattr(
        kol_agent_module._follow_up_options_runner.session_service,
        "create_session",
        fail_create_session,
    )

    out = await generate_kol_follow_up_options(
        user_message="NVDA 怎么看?",
        assistant_message="答案",
        persona_username="qinbafrank",
    )

    assert out == []
