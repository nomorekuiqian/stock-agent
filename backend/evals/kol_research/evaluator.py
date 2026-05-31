"""Invariant checks for the KOL research agent.

The evaluator is intentionally deterministic. It does not judge prose quality;
it checks the hard properties we can prove from the response payload:
tool coverage, citation validity, forbidden advice language, and basic entity
preservation.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

_CITATION_RE = re.compile(r"\[#(\d+)\]")

GLOBAL_FORBIDDEN_PATTERNS = (
    r"我就是\s*@?qinbafrank",
    r"我是\s*@?qinbafrank",
    r"建议(买入|卖出|加仓|减仓|清仓|满仓)",
    r"(应该|可以)(买入|卖出|加仓|减仓|清仓|满仓)",
    r"(直接|马上|立刻)(买入|卖出|加仓|减仓|清仓|满仓)",
    r"all\s*in",
    r"梭哈",
    r"必涨",
    r"稳赚",
    r"保底",
)


@dataclass(frozen=True)
class EvalCase:
    id: str
    message: str
    category: str = ""
    history: list[dict[str, str]] = field(default_factory=list)
    content_context: dict[str, Any] | None = None
    expected: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CheckResult:
    name: str
    passed: bool
    severity: str
    detail: str = ""


@dataclass(frozen=True)
class EvalResult:
    case: EvalCase
    response: dict[str, Any]
    checks: list[CheckResult]
    latency_ms: int | None = None
    error: str | None = None

    @property
    def hard_failures(self) -> list[CheckResult]:
        return [c for c in self.checks if c.severity == "hard" and not c.passed]

    @property
    def soft_failures(self) -> list[CheckResult]:
        return [c for c in self.checks if c.severity == "soft" and not c.passed]

    @property
    def passed(self) -> bool:
        return not self.hard_failures and self.error is None


def load_cases(path: Path) -> list[EvalCase]:
    raw = yaml.safe_load(path.read_text()) or {}
    items = raw.get("cases", raw if isinstance(raw, list) else [])
    cases: list[EvalCase] = []
    for item in items:
        cases.append(
            EvalCase(
                id=str(item["id"]),
                message=str(item["message"]),
                category=str(item.get("category", "")),
                history=list(item.get("history") or []),
                content_context=item.get("content_context"),
                expected=dict(item.get("expected") or {}),
            )
        )
    return cases


def load_fixture_responses(path: Path) -> dict[str, dict[str, Any]]:
    if path.suffix == ".jsonl":
        out: dict[str, dict[str, Any]] = {}
        for line in path.read_text().split("\n"):
            if not line.strip():
                continue
            row = json.loads(line)
            out[str(row["case_id"])] = dict(row["response"])
        return out
    raw = json.loads(path.read_text())
    if isinstance(raw, list):
        return {str(row["case_id"]): dict(row["response"]) for row in raw}
    return {str(k): dict(v) for k, v in raw.items()}


def evaluate_case(
    case: EvalCase,
    response: dict[str, Any],
    *,
    latency_ms: int | None = None,
    error: str | None = None,
) -> EvalResult:
    checks: list[CheckResult] = []

    message = str(response.get("message") or "")
    tool_calls = _tool_calls(response)
    tool_names = [str(t.get("name") or "") for t in tool_calls]
    chunks = list(response.get("kol_chunks") or [])

    checks.append(
        CheckResult(
            "response_has_message",
            bool(message.strip()) and error is None,
            "hard",
            error or "",
        )
    )

    expected = case.expected
    for name in expected.get("must_call", []) or []:
        checks.append(
            CheckResult(
                "must_call:%s" % name,
                name in tool_names,
                "hard",
                "called=%s" % ", ".join(tool_names),
            )
        )

    for group in expected.get("must_call_any", []) or []:
        group_names = [str(x) for x in group]
        checks.append(
            CheckResult(
                "must_call_any:%s" % "|".join(group_names),
                any(name in tool_names for name in group_names),
                "hard",
                "called=%s" % ", ".join(tool_names),
            )
        )

    for name in expected.get("must_not_call", []) or []:
        checks.append(
            CheckResult(
                "must_not_call:%s" % name,
                name not in tool_names,
                "hard",
                "called=%s" % ", ".join(tool_names),
            )
        )

    for key in expected.get("must_cover_data", []) or []:
        checks.append(
            CheckResult(
                "must_cover_data:%s" % key,
                _data_coverage_satisfied(response, str(key)),
                "hard",
                "not covered by tool_calls and final answer contains a data coverage warning",
            )
        )

    google_calls = sum(1 for name in tool_names if name in {"google_search", "google_search_agent"})
    checks.append(
        CheckResult(
            "google_search_max_one",
            google_calls <= 1,
            "hard",
            "google_search_calls=%d" % google_calls,
        )
    )

    citations = _citations(message)
    valid_citation_indices = _valid_citation_indices(chunks)
    if not valid_citation_indices and chunks:
        valid_citation_indices = set(range(1, len(chunks) + 1))
    invalid = sorted(citations - valid_citation_indices)
    checks.append(
        CheckResult(
            "citation_range_valid",
            not invalid,
            "hard",
            "invalid=%s valid=%s" % (invalid, sorted(valid_citation_indices)),
        )
    )
    if expected.get("citation_required"):
        checks.append(
            CheckResult(
                "citation_required",
                bool(citations) and bool(chunks),
                "hard",
                "citations=%s chunks=%d" % (sorted(citations), len(chunks)),
            )
        )

    forbidden_patterns = list(GLOBAL_FORBIDDEN_PATTERNS)
    forbidden_patterns.extend(expected.get("forbidden_patterns", []) or [])
    matched_forbidden = [
        pattern for pattern in forbidden_patterns
        if re.search(pattern, message, flags=re.IGNORECASE)
    ]
    checks.append(
        CheckResult(
            "no_forbidden_language",
            not matched_forbidden,
            "hard",
            "matched=%s" % matched_forbidden,
        )
    )

    upper_blob = _response_search_blob(response).upper()
    for symbol in expected.get("required_symbols", []) or []:
        sym = str(symbol).upper()
        checks.append(
            CheckResult(
                "required_symbol:%s" % sym,
                sym in upper_blob,
                "hard",
                "symbol not found in answer/tool/chunk payload" if sym not in upper_blob else "",
            )
        )

    for phrase in expected.get("answer_should_include", []) or []:
        needle = str(phrase)
        checks.append(
            CheckResult(
                "answer_should_include:%s" % needle,
                needle.lower() in message.lower(),
                "soft",
                "missing from final answer",
            )
        )

    if google_calls:
        disclosed = "web 搜索" in message or "非博主历史观点" in message
        checks.append(
            CheckResult(
                "google_search_disclosed",
                disclosed,
                "hard",
                "google_search used without source disclosure",
            )
        )

    return EvalResult(
        case=case,
        response=response,
        checks=checks,
        latency_ms=latency_ms,
        error=error,
    )


def result_to_json(result: EvalResult) -> dict[str, Any]:
    return {
        "case_id": result.case.id,
        "category": result.case.category,
        "passed": result.passed,
        "latency_ms": result.latency_ms,
        "error": result.error,
        "hard_failures": [c.__dict__ for c in result.hard_failures],
        "soft_failures": [c.__dict__ for c in result.soft_failures],
        "checks": [c.__dict__ for c in result.checks],
        "response": result.response,
    }


def summarize_results(results: list[EvalResult]) -> dict[str, Any]:
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    hard_failures = sum(len(r.hard_failures) for r in results)
    soft_failures = sum(len(r.soft_failures) for r in results)
    latencies = [r.latency_ms for r in results if r.latency_ms is not None]
    return {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "hard_failures": hard_failures,
        "soft_failures": soft_failures,
        "pass_rate": (passed / total) if total else 0.0,
        "p95_latency_ms": _p95(latencies) if latencies else None,
    }


def render_markdown_report(results: list[EvalResult]) -> str:
    summary = summarize_results(results)
    lines = [
        "# KOL Research Eval Report",
        "",
        "## Summary",
        "",
        "- Cases: %d" % summary["total"],
        "- Passed: %d" % summary["passed"],
        "- Failed: %d" % summary["failed"],
        "- Pass rate: %.1f%%" % (summary["pass_rate"] * 100),
        "- Hard failures: %d" % summary["hard_failures"],
        "- Soft failures: %d" % summary["soft_failures"],
    ]
    if summary["p95_latency_ms"] is not None:
        lines.append("- P95 latency: %d ms" % summary["p95_latency_ms"])
    lines.extend(["", "## Cases", ""])

    for result in results:
        status = "PASS" if result.passed else "FAIL"
        latency = " (%d ms)" % result.latency_ms if result.latency_ms is not None else ""
        lines.append("### %s `%s`%s" % (status, result.case.id, latency))
        if result.error:
            lines.append("- Error: `%s`" % result.error)
        if result.hard_failures:
            lines.append("- Hard failures:")
            for check in result.hard_failures:
                lines.append("  - `%s`: %s" % (check.name, check.detail))
        if result.soft_failures:
            lines.append("- Soft failures:")
            for check in result.soft_failures:
                lines.append("  - `%s`: %s" % (check.name, check.detail))
        if not result.hard_failures and not result.soft_failures and not result.error:
            lines.append("- No failures.")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _tool_calls(response: dict[str, Any]) -> list[dict[str, Any]]:
    calls = response.get("tool_calls") or []
    return [dict(c) for c in calls if isinstance(c, dict)]


def _citations(message: str) -> set[int]:
    return {int(m.group(1)) for m in _CITATION_RE.finditer(message or "")}


def _valid_citation_indices(chunks: list[Any]) -> set[int]:
    out: set[int] = set()
    for idx, chunk in enumerate(chunks, start=1):
        if isinstance(chunk, dict) and chunk.get("citation_index") is not None:
            try:
                out.add(int(chunk["citation_index"]))
            except (TypeError, ValueError):
                out.add(idx)
        else:
            out.add(idx)
    return out


def _response_search_blob(response: dict[str, Any]) -> str:
    parts = [str(response.get("message") or "")]
    for call in _tool_calls(response):
        parts.append(str(call.get("name") or ""))
        parts.append(str(call.get("args_summary") or ""))
    for chunk in response.get("kol_chunks") or []:
        if isinstance(chunk, dict):
            parts.append(json.dumps(chunk, ensure_ascii=False, default=str))
        else:
            parts.append(str(chunk))
    return "\n".join(parts)


def _data_coverage_satisfied(response: dict[str, Any], key: str) -> bool:
    """Check required data coverage.

    KOL input_guard can prefetch stock/macro briefs before the LLM turn. Those
    prefetches are not currently emitted as tool_calls, so we also trust the
    agent's own downgrade warning: if required coverage was missing,
    `append_data_coverage_warning()` adds "数据覆盖提示" to the final answer.
    """
    upper_key = key.upper()
    for call in _tool_calls(response):
        name = str(call.get("name") or "")
        args = str(call.get("args_summary") or "").upper()
        if key == "get_macro_brief" and name == "get_macro_brief":
            return True
        if key.startswith("get_stock_brief:") and name == "get_stock_brief":
            symbol = upper_key.split(":", 1)[1]
            if symbol in args:
                return True

    message = str(response.get("message") or "")
    return "数据覆盖提示" not in message


def _p95(values: list[int]) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(round((len(ordered) - 1) * 0.95)))
    return ordered[idx]
