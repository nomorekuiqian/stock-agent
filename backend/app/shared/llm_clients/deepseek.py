"""Direct DeepSeek Chat Completions client."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL


class DeepSeekAPIError(RuntimeError):
    """Raised when the DeepSeek API returns an error response."""


async def create_chat_completion(
    *,
    model: str,
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
    response_format: dict[str, str] | None = None,
    timeout_s: float = 90.0,
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
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        response = await client.post(url, headers=headers, json=body)

    if response.status_code >= 400:
        raise DeepSeekAPIError(
            "DeepSeek API failed: HTTP %s %s"
            % (response.status_code, (response.text or "")[:500])
        )
    return response.json()
