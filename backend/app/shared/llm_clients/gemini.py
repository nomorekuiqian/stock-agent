"""Gemini structured generation with bounded retries and normalized usage."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
from google import genai
from google.genai import errors, types

from app.core.ai_models import GENERATIVE_MODEL
from app.core.config import GOOGLE_API_KEY
from app.core.logging import get_logger

logger = get_logger(__name__)


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
    """Keep the internal JSON helper contract while calling Gemini natively.

    Candidates and thinking are separate in usage; callers must meter both.
    Output is validated against the application schema by structured.py.
    """
    if model != GENERATIVE_MODEL:
        raise ValueError("Structured generation must use %s" % GENERATIVE_MODEL)
    if not GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY is not configured")
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    contents = [
        types.Content(
            role="model" if m["role"] == "assistant" else "user",
            parts=[types.Part(text=m["content"])],
        )
        for m in messages
        if m["role"] != "system"
    ]
    config = types.GenerateContentConfig(
        system_instruction=system or None,
        max_output_tokens=max_tokens,
        temperature=temperature,
        response_mime_type="application/json" if response_format else None,
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
    )
    async with genai.Client(
        api_key=GOOGLE_API_KEY,
        http_options=types.HttpOptions(
            timeout=int(timeout_s * 1000),
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    ).aio as client:
        for attempt in range(max(0, retries) + 1):
            try:
                response = await client.models.generate_content(
                    model=model, contents=contents, config=config,
                )
                usage = response.usage_metadata
                return {
                    "choices": [{"message": {"content": response.text or ""}}],
                    "usage": {
                        "prompt_tokens": getattr(usage, "prompt_token_count", None),
                        "completion_tokens": getattr(usage, "candidates_token_count", None),
                        "cached_tokens": getattr(usage, "cached_content_token_count", None),
                        "thoughts_tokens": getattr(usage, "thoughts_token_count", None),
                        "total_tokens": getattr(usage, "total_token_count", None),
                    },
                }
            except (errors.APIError, httpx.HTTPError, TimeoutError) as exc:
                code = getattr(exc, "code", None)
                if (
                    isinstance(exc, errors.APIError)
                    and code not in {429, 500, 502, 503, 504}
                ) or attempt >= retries:
                    raise
                delay = min(2.0 ** attempt, 8.0)
                logger.warning(
                    "Gemini retryable error model=%s status=%s attempt=%s delay=%.1fs",
                    model, code, attempt, delay,
                )
                await asyncio.sleep(delay)
    raise RuntimeError("Gemini generation exhausted retries")
