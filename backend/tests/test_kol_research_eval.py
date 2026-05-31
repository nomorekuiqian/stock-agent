"""Unit tests for the lightweight KOL research eval harness."""

from __future__ import annotations

from pathlib import Path

from evals.kol_research.evaluator import (
    EvalCase,
    evaluate_case,
    load_cases,
    render_markdown_report,
    summarize_results,
)


def test_load_cases_reads_yaml():
    cases = load_cases(Path("evals/kol_research/cases.yaml"))

    assert cases
    assert cases[0].id == "frank_nvda_stock_now"
    assert "search_kol_tweets" in cases[0].expected["must_call"]


def test_evaluate_case_passes_hard_invariants_for_grounded_response():
    case = EvalCase(
        id="stock",
        message="NVDA 怎么看",
        expected={
            "must_call": ["search_kol_tweets", "get_stock_brief"],
            "must_cover_data": ["get_stock_brief:NVDA"],
            "required_symbols": ["NVDA"],
            "citation_required": True,
            "answer_should_include": ["风险"],
        },
    )
    response = {
        "message": "`NVDA` 当前要按条件看，不是直接买卖。历史观点见 [#1]，风险是业绩兑现。",
        "kol_chunks": [{"citation_index": 1, "content": "NVDA", "tickers": ["NVDA"]}],
        "tool_calls": [
            {"name": "search_kol_tweets", "args_summary": "{\"query\":\"NVDA\"}"},
            {"name": "get_stock_brief", "args_summary": "{\"symbol\":\"NVDA\"}"},
        ],
    }

    result = evaluate_case(case, response)

    assert result.passed is True
    assert not result.hard_failures
    assert not result.soft_failures


def test_evaluate_case_flags_invalid_citation_and_direct_advice():
    case = EvalCase(
        id="bad",
        message="NVDA 能买吗",
        expected={
            "must_call": ["search_kol_tweets", "get_stock_brief"],
            "required_symbols": ["NVDA"],
            "citation_required": True,
        },
    )
    response = {
        "message": "建议买入 `NVDA`，参考 [#9]。",
        "kol_chunks": [{"citation_index": 1, "content": "NVDA"}],
        "tool_calls": [{"name": "search_kol_tweets", "args_summary": "{\"query\":\"NVDA\"}"}],
    }

    result = evaluate_case(case, response)

    failed_names = {check.name for check in result.hard_failures}
    assert "must_call:get_stock_brief" in failed_names
    assert "citation_range_valid" in failed_names
    assert "no_forbidden_language" in failed_names


def test_data_coverage_accepts_input_guard_prefetch_without_tool_call():
    case = EvalCase(
        id="prefetch",
        message="NVDA 怎么看",
        expected={"must_cover_data": ["get_stock_brief:NVDA"]},
    )
    response = {
        "message": "基于当前数据看 `NVDA`，但不直接给买卖建议。",
        "kol_chunks": [],
        "tool_calls": [],
    }

    result = evaluate_case(case, response)

    assert result.passed is True


def test_data_coverage_warning_fails_required_prefetch():
    case = EvalCase(
        id="missing-prefetch",
        message="NVDA 怎么看",
        expected={"must_cover_data": ["get_stock_brief:NVDA"]},
    )
    response = {
        "message": "框架判断。\n\n> 数据覆盖提示：这轮没有成功覆盖`NVDA` 的当下行情 / 基本面数据。",
        "kol_chunks": [],
        "tool_calls": [],
    }

    result = evaluate_case(case, response)

    assert "must_cover_data:get_stock_brief:NVDA" in {c.name for c in result.hard_failures}


def test_report_summary_counts_failures():
    passing = evaluate_case(
        EvalCase(id="ok", message="x"),
        {"message": "回答", "kol_chunks": [], "tool_calls": []},
    )
    failing = evaluate_case(
        EvalCase(id="fail", message="x", expected={"must_call": ["search_kol_tweets"]}),
        {"message": "回答", "kol_chunks": [], "tool_calls": []},
    )

    summary = summarize_results([passing, failing])
    report = render_markdown_report([passing, failing])

    assert summary["total"] == 2
    assert summary["passed"] == 1
    assert summary["failed"] == 1
    assert "must_call:search_kol_tweets" in report
