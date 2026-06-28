"""Shared error classification for streaming AI agents."""

from __future__ import annotations

import asyncio
from typing import Literal


AgentErrorCode = Literal[
    "agent_timeout",
    "context_too_long",
    "model_schema_error",
    "provider_unavailable",
    "provider_auth_error",
    "agent_error",
]


_CONTEXT_TOO_LONG_MARKERS = (
    "token",
    "context",
    "too long",
    "maximum input",
    "input too large",
    "exceeds the maximum",
)
_SCHEMA_MARKERS = (
    "schema",
    "validation",
    "json",
    "parse",
)
_PROVIDER_UNAVAILABLE_MARKERS = (
    "429",
    "503",
    "deadline_exceeded",
    "high demand",
    "overloaded",
    "rate limit",
    "resource_exhausted",
    "server overloaded",
    "service unavailable",
    "temporarily unavailable",
    "try again later",
    "unavailable",
)
_PROVIDER_AUTH_MARKERS = (
    "401",
    "403",
    "api key",
    "permission_denied",
    "unauthenticated",
)


def classify_agent_error(err: BaseException) -> AgentErrorCode:
    """Map provider/runtime exceptions to stable UI and telemetry codes."""

    if isinstance(err, asyncio.TimeoutError):
        return "agent_timeout"

    err_text = str(err).lower()
    if any(marker in err_text for marker in _CONTEXT_TOO_LONG_MARKERS):
        return "context_too_long"
    if any(marker in err_text for marker in _SCHEMA_MARKERS):
        return "model_schema_error"
    if any(marker in err_text for marker in _PROVIDER_UNAVAILABLE_MARKERS):
        return "provider_unavailable"
    if any(marker in err_text for marker in _PROVIDER_AUTH_MARKERS):
        return "provider_auth_error"
    return "agent_error"


def agent_error_message(code: str) -> str:
    """Return the user-facing Chinese copy for an agent error code."""

    if code == "agent_timeout":
        return "AI 助手思考时间太长了，请再试一次"
    if code == "context_too_long":
        return "对话上下文太长了。系统会保留最近重点，请重新发送一次。"
    if code == "model_schema_error":
        return "AI 助手输出格式异常，请重新发送一次。"
    if code == "provider_unavailable":
        return "模型服务暂时繁忙或限流，请稍后再试一次。"
    if code == "provider_auth_error":
        return "AI 模型服务鉴权失败，请检查后端模型配置。"
    return "AI 助手出了点问题，请再试一次"
