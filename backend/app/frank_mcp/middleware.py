"""Market Lens MCP middleware (v1 guardrails): tool-call logging + optional access gate.

Rate limiting uses FastMCP's built-in RateLimitingMiddleware, wired in server.py.
"""
from __future__ import annotations

import os
import time

from fastmcp.exceptions import ToolError
from fastmcp.server.dependencies import get_http_headers
from fastmcp.server.middleware import Middleware, MiddlewareContext

from app.core.logging import get_logger

logger = get_logger("frank_mcp")

# Optional "unlisted" soft gate. If FRANK_MCP_ACCESS_TOKEN is set, callers must
# send it (Authorization: Bearer <token> or X-Frank-Token). If unset, the MCP is
# open - flip it on for invited-only private-preview validation.
_ACCESS_TOKEN = os.getenv("FRANK_MCP_ACCESS_TOKEN", "").strip()


class ToolCallLogMiddleware(Middleware):
    """Structured per-tool-call logging - the v1 feasibility-validation signal."""

    async def on_call_tool(self, context: MiddlewareContext, call_next):
        tool = getattr(context.message, "name", "?")
        start = time.monotonic()
        try:
            result = await call_next(context)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "frank_mcp tool=%s status=error elapsed_ms=%d err=%s",
                tool, int((time.monotonic() - start) * 1000), exc.__class__.__name__,
            )
            raise
        logger.info(
            "frank_mcp tool=%s status=ok elapsed_ms=%d",
            tool, int((time.monotonic() - start) * 1000),
        )
        return result


class AccessGateMiddleware(Middleware):
    """Soft 'unlisted' gate: require a shared token only when one is configured."""

    async def on_call_tool(self, context: MiddlewareContext, call_next):
        if _ACCESS_TOKEN:
            headers = get_http_headers() or {}
            supplied = headers.get("x-frank-token", "").strip()
            if not supplied:
                auth = headers.get("authorization", "")
                if auth.lower().startswith("bearer "):
                    supplied = auth[7:].strip()
            if supplied != _ACCESS_TOKEN:
                raise ToolError(
                    "Frank Lens is in private preview - a valid access token is required."
                )
        return await call_next(context)
