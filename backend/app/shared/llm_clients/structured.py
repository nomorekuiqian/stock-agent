"""Provider-neutral structured JSON generation helpers."""

from __future__ import annotations

import json
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.feature_pause import require_generation_active
from app.core.logging import get_logger
from app.shared.llm_clients.gemini import create_chat_completion
from app.shared.llm_metering import record_usage

logger = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)


def _compact_json(data: Any, *, max_chars: int = 12000) -> str:
    text = json.dumps(data, ensure_ascii=False, default=str)
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "...[truncated]"


def _response_text(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    if not choices:
        return ""
    message = (choices[0] or {}).get("message") or {}
    return str(message.get("content") or "").strip()


def _usage(response: dict[str, Any]) -> dict[str, Any]:
    usage = response.get("usage") or {}
    return {
        "prompt_tokens": usage.get("prompt_tokens"),
        "output_tokens": usage.get("completion_tokens"),
        "cached_tokens": usage.get("cached_tokens"),
        "thoughts_tokens": usage.get("thoughts_tokens"),
        "total_tokens": usage.get("total_tokens"),
    }


def _record_generation_usage(
    *,
    feature: str,
    agent_name: str,
    model: str,
    response: dict[str, Any],
    attempt: int,
    outcome: str,
) -> None:
    usage = _usage(response)
    record_usage(
        feature=feature,
        agent_name=agent_name,
        model=model,
        prompt_tokens=usage["prompt_tokens"],
        output_tokens=usage["output_tokens"],
        cached_tokens=usage["cached_tokens"],
        thoughts_tokens=usage["thoughts_tokens"],
        total_tokens=usage["total_tokens"],
        extra={
            "provider": "google",
            "attempt": attempt,
            "outcome": outcome,
        },
    )


def _schema_text(output_model: type[BaseModel]) -> str:
    schema = output_model.model_json_schema()
    for key in ("title", "$schema"):
        schema.pop(key, None)
    return _compact_json(schema, max_chars=10000)


async def generate_structured_json(
    *,
    feature: str,
    agent_name: str,
    model: str,
    system_prompt: str,
    user_payload: dict[str, Any],
    output_model: type[T],
    max_tokens: int,
    retries: int = 2,
    temperature: float = 0.2,
) -> T:
    """Generate and validate one structured JSON object.

    Gemini JSON mode produces JSON; application schema conformance is still
    validated locally. Ask the model to repair invalid
    output before surfacing a hard failure to the caller.
    """
    require_generation_active(feature)
    schema = _schema_text(output_model)
    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": (
                system_prompt.strip()
                + "\n\nReturn only one valid json object. Do not wrap it in markdown."
                + "\nThe json object must conform to this schema:\n"
                + schema
            ),
        },
        {
            "role": "user",
            "content": (
                "Generate the structured json output from this compact input JSON:\n"
                + _compact_json(user_payload)
            ),
        },
    ]

    last_error: Exception | None = None
    last_text = ""
    for attempt in range(retries + 1):
        response = await create_chat_completion(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        text = _response_text(response)
        last_text = text
        outcome = "ok"
        try:
            if not text:
                raise RuntimeError("Gemini returned empty content")
            raw = json.loads(text)
            parsed = output_model.model_validate(raw)
            _record_generation_usage(
                feature=feature,
                agent_name=agent_name,
                model=model,
                response=response,
                attempt=attempt,
                outcome=outcome,
            )
            return parsed
        except (json.JSONDecodeError, ValidationError, RuntimeError) as exc:
            last_error = exc
            outcome = "invalid_json" if isinstance(exc, json.JSONDecodeError) else "invalid_schema"
            _record_generation_usage(
                feature=feature,
                agent_name=agent_name,
                model=model,
                response=response,
                attempt=attempt,
                outcome=outcome,
            )
            if attempt >= retries:
                break
            logger.warning(
                "structured LLM output invalid for feature=%s model=%s attempt=%s: %s",
                feature,
                model,
                attempt,
                str(exc)[:500],
            )
            if text:
                messages.append({"role": "assistant", "content": text[:8000]})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "The previous json failed validation. Return a corrected "
                        "json object only. Validation error:\n"
                        + str(exc)[:3000]
                    ),
                }
            )

    raise RuntimeError(
        "structured LLM output failed after %s attempts: %s; last output=%s"
        % (retries + 1, last_error, last_text[:1000])
    )
