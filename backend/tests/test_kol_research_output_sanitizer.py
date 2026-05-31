"""Unit tests for final KOL answer output hygiene."""

from __future__ import annotations

from app.features.kol_research.agent import _sanitize_user_facing_markdown


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
