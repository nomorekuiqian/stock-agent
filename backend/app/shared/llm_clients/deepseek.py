"""Direct DeepSeek Chat Completions client."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.core.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
from app.core.logging import get_logger

logger = get_logger(__name__)


class DeepSeekAPIError(RuntimeError):
    """Raised when the DeepSeek API returns an error response."""


def _retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("retry-after")
    if not raw:
        return None
    try:
        return max(0.0, min(float(raw), 30.0))
    except ValueError:
        return None


def _is_retryable_status(status_code: int) -> bool:
    return status_code == 429 or status_code in {500, 502, 503, 504}


async def create_chat_completion(
    *,
    model: str,
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
    response_format: dict[str, str] | None = None,
    timeout_s: float = 90.0,
    retries: int = 2,
) -> dict[str, Any]:
    """Call DeepSeek's OpenAI-compatible chat completions endpoint."""
    if not DEEPSEEK_API_KEY:
        raise DeepSeekAPIError("DEEPSEEK_API_KEY is not configured")

    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "thinking": {"type": "disabled"},
        "stream": False,
    }
    if response_format:
        body["response_format"] = response_format

    url = "%s/chat/completions" % DEEPSEEK_BASE_URL.rstrip("/")
    headers = {
        "Authorization": "Bearer %s" % DEEPSEEK_API_KEY,
        "Content-Type": "application/json",
    }

    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        for attempt in range(max(0, retries) + 1):
            try:
                response = await client.post(url, headers=headers, json=body)
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt >= retries:
                    break
                delay = min(2.0 ** attempt, 8.0)
                logger.warning(
                    "DeepSeek request failed, retrying model=%s attempt=%s delay=%.1fs: %s",
                    model,
                    attempt,
                    delay,
                    str(exc)[:200],
                )
                await asyncio.sleep(delay)
                continue

            if response.status_code < 400:
                return response.json()

            if not _is_retryable_status(response.status_code) or attempt >= retries:
                raise DeepSeekAPIError(
                    "DeepSeek API failed: HTTP %s %s"
                    % (response.status_code, (response.text or "")[:500])
                )

            delay = _retry_after_seconds(response)
            if delay is None:
                delay = min(2.0 ** attempt, 8.0)
            logger.warning(
                "DeepSeek API retryable error model=%s status=%s attempt=%s delay=%.1fs",
                model,
                response.status_code,
                attempt,
                delay,
            )
            await asyncio.sleep(delay)

    raise DeepSeekAPIError("DeepSeek API request failed: %s" % str(last_error))
