"""Context assembly primitives for agent runs."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.config import (
    AGENT_RUNTIME_BUDGET_ACTIVE_MEMORY,
    AGENT_RUNTIME_BUDGET_ATTACHED_WORKSPACE,
    AGENT_RUNTIME_BUDGET_CONTENT_CONTEXT,
    AGENT_RUNTIME_BUDGET_HISTORY,
    AGENT_RUNTIME_BUDGET_INFERRED_MEMORY,
    AGENT_RUNTIME_BUDGET_INPUT_GUARD,
    AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT,
)
from app.core.logging import get_logger
from app.features.agent_runtime.models import SessionSnapshot

logger = get_logger(__name__)


@dataclass(frozen=True)
class BudgetPlan:
    """Central char budget for prompt sections.

    The current engine still uses char counts as a cheap token proxy. Keeping
    the allocation here prevents future workspace/memory injections from
    growing independently and silently exceeding the model context.
    """

    total_chars: int = 60_000
    allocations: dict[str, int] = field(
        default_factory=lambda: {
            "input_guard": 6_000,
            "active_memory": 1_800,
            "attached_workspace": 6_000,
            "history": 20_000,
            "content_context": 8_000,
            "inferred_memory": 800,
        }
    )

    def section_limit(self, section: str, fallback: int | None = None) -> int:
        if section in self.allocations:
            return max(0, self.allocations[section])
        if fallback is not None:
            return max(0, fallback)
        return self.total_chars


def default_budget_plan() -> BudgetPlan:
    """Build the canonical BudgetPlan from runtime config.

    Centralizes the per-section caps so that workspace / memory work in
    Phase 2/3 can land new keys here instead of every caller. Falls back to
    `AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT` for the total so an operator who
    raises just that env var still gets a coherent budget.
    """
    return BudgetPlan(
        total_chars=AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT,
        allocations={
            "input_guard": AGENT_RUNTIME_BUDGET_INPUT_GUARD,
            "active_memory": AGENT_RUNTIME_BUDGET_ACTIVE_MEMORY,
            "attached_workspace": AGENT_RUNTIME_BUDGET_ATTACHED_WORKSPACE,
            "history": AGENT_RUNTIME_BUDGET_HISTORY,
            "content_context": AGENT_RUNTIME_BUDGET_CONTENT_CONTEXT,
            "inferred_memory": AGENT_RUNTIME_BUDGET_INFERRED_MEMORY,
        },
    )


ContentContextRenderer = Any  # Callable[[dict[str, Any]], str | None]


@dataclass(frozen=True)
class ContextAssemblyRequest:
    message: str
    history: list[dict[str, str]] = field(default_factory=list)
    content_context: dict[str, Any] | None = None
    input_guard_section: str | None = None
    session_summary: str | None = None
    session: SessionSnapshot | None = None
    budget_plan: BudgetPlan | None = None
    history_keep: int = 12
    char_soft_limit: int = 60_000
    minimum_history_keep: int = 4
    # Feature-agent escape hatches so callers can inject rich sections
    # (watchlist, filters, universe, deep content_context renders) without
    # re-implementing the rest of the prompt skeleton. Rendered between
    # session summary and history when set.
    prefix_sections: list[str] = field(default_factory=list)
    content_renderer: ContentContextRenderer | None = None


@dataclass(frozen=True)
class AssembledContext:
    prompt: str
    kept_history: int
    dropped_history: int
    char_count: int
    metadata: dict[str, Any] = field(default_factory=dict)


class DefaultContextEngine:
    """Budget-aware context assembler.

    This is intentionally prompt-format compatible with the existing KOL agent.
    The abstraction boundary is the important part: feature agents can stop
    hand-rolling prompt sections while keeping their current answer contracts.
    """

    async def assemble(self, request: ContextAssemblyRequest) -> AssembledContext:
        parts: list[str] = []
        history, history_source = self._history_for(request)
        budget_plan = request.budget_plan
        truncations: dict[str, dict[str, int]] = {}

        kept_history = self._select_history(request, history)
        dropped_history = min(len(history), request.history_keep) - len(kept_history)
        if dropped_history > 0:
            truncations["history"] = {
                "dropped": int(dropped_history),
                "kept": int(len(kept_history)),
            }

        session_summary = request.session_summary
        if not session_summary and request.session is not None:
            session_summary = request.session.summary
        if session_summary:
            parts.append("## Session Summary")
            parts.append(session_summary)
            parts.append("")

        for section in request.prefix_sections:
            if section:
                parts.append(section)
                parts.append("")

        if kept_history:
            if dropped_history > 0:
                logger.info(
                    "agent context history truncated: kept=%d dropped=%d",
                    len(kept_history),
                    dropped_history,
                )
            parts.append("## Conversation History")
            for turn in kept_history:
                role = turn.get("role", "user")
                content = turn.get("content", "")
                label = "User" if role == "user" else "Assistant"
                parts.append("%s: %s" % (label, content))
            parts.append("")

        content_context = request.content_context
        if not content_context and request.session is not None:
            content_context = request.session.ui_state
        if content_context:
            renderer = request.content_renderer or self._render_content_context
            try:
                rendered = renderer(content_context)
            except Exception:  # noqa: BLE001
                logger.exception("content_renderer failed; falling back to default")
                rendered = self._render_content_context(content_context)
            content_limit = (
                budget_plan.section_limit("content_context", 8_000)
                if budget_plan else request.char_soft_limit
            )
            content_section, content_trunc = self._truncate_section_with_meta(rendered, content_limit)
            if content_trunc is not None:
                truncations["content_context"] = content_trunc
            if content_section:
                parts.append(content_section)
                parts.append("")

        if request.input_guard_section:
            guard_limit = (
                budget_plan.section_limit("input_guard", 6_000)
                if budget_plan else request.char_soft_limit
            )
            guard_section, guard_trunc = self._truncate_section_with_meta(
                request.input_guard_section, guard_limit
            )
            if guard_trunc is not None:
                truncations["input_guard"] = guard_trunc
            if guard_section:
                parts.append(guard_section)
                parts.append("")

        parts.append("## User question")
        parts.append(request.message)

        prompt = "\n".join(parts)

        # Final guard: if even after section caps the prompt overshot the
        # global total, record an overall truncation so callers can write a
        # `context_budget_truncated` event without doing the math again.
        total_chars = budget_plan.total_chars if budget_plan else request.char_soft_limit
        if total_chars > 0 and len(prompt) > total_chars:
            truncations["total"] = {
                "limit": int(total_chars),
                "actual": int(len(prompt)),
            }

        return AssembledContext(
            prompt=prompt,
            kept_history=len(kept_history),
            dropped_history=max(0, dropped_history),
            char_count=len(prompt),
            metadata={
                "has_content_context": bool(content_context),
                "has_input_guard": bool(request.input_guard_section),
                "has_session_summary": bool(session_summary),
                "budget_total_chars": total_chars,
                "budget_allocations": budget_plan.allocations if budget_plan else {},
                "truncated_sections": truncations,
                "history_source": history_source,
            },
        )

    def _truncate_section_with_meta(
        self,
        value: str | None,
        max_chars: int,
    ) -> tuple[str | None, dict[str, int] | None]:
        if not value:
            return value, None
        if max_chars <= 0:
            return "", {"limit": 0, "actual": len(value)}
        if len(value) <= max_chars:
            return value, None
        truncated = value[: max(0, max_chars - 32)] + "\n[truncated]"
        return truncated, {"limit": int(max_chars), "actual": int(len(value))}

    def _history_for(
        self, request: ContextAssemblyRequest
    ) -> tuple[list[dict[str, str]], str]:
        # Returns (history, source) — source feeds context_snapshot so Phase 1
        # rollout can monitor session vs. request-history usage per turn.
        if request.session is not None:
            session_history = request.session.chat_history()
            if session_history:
                return session_history, "session"
        if request.history:
            return request.history, "request"
        return [], "empty"

    def _select_history(
        self,
        request: ContextAssemblyRequest,
        history: list[dict[str, str]],
    ) -> list[dict[str, str]]:
        if not history:
            return []

        history_limit = (
            request.budget_plan.section_limit("history", request.char_soft_limit)
            if request.budget_plan
            else request.char_soft_limit
        )
        recent = history[-request.history_keep:]
        minimum_keep = min(request.minimum_history_keep, len(recent))
        accumulated = 0
        kept: list[dict[str, str]] = []

        for turn in reversed(recent):
            content = str(turn.get("content") or "")
            size = len(content) + len(str(turn.get("role") or "")) + 8
            if (
                len(kept) >= minimum_keep
                and (accumulated + size) > history_limit
            ):
                break
            kept.append(turn)
            accumulated += size

        kept.reverse()
        return kept

    def _truncate_section(self, value: str | None, max_chars: int) -> str | None:
        if not value:
            return value
        if max_chars <= 0:
            return ""
        if len(value) <= max_chars:
            return value
        return value[: max(0, max_chars - 32)] + "\n[truncated]"

    def _render_content_context(self, content_context: dict[str, Any]) -> str | None:
        ctx_type = content_context.get("type", "")
        if ctx_type == "stock" and content_context.get("symbol"):
            return "## User is currently viewing: %s Stock Research" % (
                content_context["symbol"],
            )
        if ctx_type == "daily_report":
            return "## User is currently viewing: %s Daily Report" % (
                content_context.get("date", "latest"),
            )
        if ctx_type == "morning_report":
            return "## User is currently viewing: Morning Report"
        if ctx_type == "twitter_digest":
            return "## User is currently viewing: %s KOL Twitter Digest" % (
                content_context.get("date", "latest"),
            )
        if ctx_type == "macro":
            return "## User is currently viewing: Macro Dashboard"
        return None
