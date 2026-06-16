"""
LLM token / cost metering.

Captures per-call usage from every ADK LlmAgent and writes it to the
`llm_usage` Insforge table, tagged by `feature` so monthly cost can be
attributed back to a specific product surface.

Usage:

    from app.shared.llm_metering import meter

    enrich_agent = LlmAgent(
        name="kol_digest_enrich",
        model=ENRICH_MODEL,
        instruction=...,
        output_schema=...,
        output_key=...,
        after_model_callback=meter("twitter_digest.enrich", model=ENRICH_MODEL),
    )

Design notes:
  - Writes are fire-and-forget via `asyncio.create_task`. A metering failure
    must never affect the LLM response path. Strong references to in-flight
    tasks are kept so the asyncio event loop does not GC them mid-flight.
  - The edge function endpoint is `llm-usage` and requires `X-Internal-Secret`.
  - If the endpoint or the secret is unavailable the recorder logs and drops
    the row — observability is best-effort, not a hard dependency.
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable, Coroutine, Optional

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.utils.timezone import now_iso

logger = get_logger(__name__)

_FUNCTION_NAME = "llm-usage"

# Hold strong refs to in-flight insert tasks so the loop does not GC them
# before they finish (asyncio.create_task only keeps a weak ref).
_pending: set[asyncio.Task] = set()


def _ints(v: Any) -> Optional[int]:
    """Coerce usage_metadata fields (sometimes 0, None, or proto ints) to int."""
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


async def _persist(record: dict) -> None:
    """Insert a single usage row via the llm-usage edge function."""
    if not EDGE_FUNCTION_SECRET:
        # Without the secret the edge function rejects writes — drop quietly.
        return
    try:
        db = get_insforge_service()
        result = await db.call_function(
            _FUNCTION_NAME,
            method="POST",
            json_body=record,
            timeout=10.0,
            extra_headers={"X-Internal-Secret": EDGE_FUNCTION_SECRET},
        )
        if result["status_code"] != 200:
            logger.warning(
                "llm_metering persist non-200: status=%s body=%s",
                result["status_code"],
                (result.get("text") or "")[:200],
            )
    except Exception:  # noqa: BLE001
        logger.warning("llm_metering persist failed", exc_info=True)


def _fire_and_forget(coro: Coroutine[Any, Any, None]) -> None:
    """Schedule coro on the running loop, keep a strong ref until it completes."""
    try:
        task = asyncio.create_task(coro)
    except RuntimeError:
        # No running loop (e.g. called from a sync context). Best-effort drop.
        logger.debug("llm_metering: no running loop, dropping row")
        return
    _pending.add(task)
    task.add_done_callback(_pending.discard)


def record_usage(
    *,
    feature: str,
    agent_name: str,
    model: str,
    prompt_tokens: Any = None,
    output_tokens: Any = None,
    cached_tokens: Any = None,
    thoughts_tokens: Any = None,
    total_tokens: Any = None,
    extra: Optional[dict] = None,
) -> None:
    """Record one provider-neutral LLM usage row.

    This is used by non-ADK providers such as DeepSeek. ADK agents should keep
    using `meter(...)`, which delegates here after reading ADK usage metadata.
    """
    record = {
        "ts": now_iso(),
        "feature": feature,
        "agent_name": agent_name or "unknown",
        "model": model,
        "prompt_tokens": _ints(prompt_tokens),
        "output_tokens": _ints(output_tokens),
        "cached_tokens": _ints(cached_tokens),
        "thoughts_tokens": _ints(thoughts_tokens),
        "total_tokens": _ints(total_tokens),
        "extra": extra,
    }
    _fire_and_forget(_persist(record))


def meter(
    feature: str,
    *,
    model: str,
    extra: Optional[dict] = None,
) -> Callable:
    """Build an ADK `after_model_callback` that records token usage.

    Args:
        feature: stable label used to group rows in the report
            (e.g. "brew.digest_paid", "twitter_digest.curate").
        model: model string, passed through so the recorder does not need to
            introspect the agent at runtime.
        extra: optional dict merged into the row's `extra` JSONB column —
            useful for per-call dimensions like model tier.

    Returns:
        An async callback compatible with `LlmAgent.after_model_callback`.
    """
    feature_label = feature
    model_label = model
    extra_payload = extra

    async def after_model(callback_context, llm_response):
        try:
            usage = getattr(llm_response, "usage_metadata", None)
            if usage is None:
                return None
            record_usage(
                feature=feature_label,
                agent_name=getattr(callback_context, "agent_name", None) or "unknown",
                model=model_label,
                prompt_tokens=getattr(usage, "prompt_token_count", None),
                output_tokens=getattr(usage, "candidates_token_count", None),
                cached_tokens=getattr(usage, "cached_content_token_count", None),
                thoughts_tokens=getattr(usage, "thoughts_token_count", None),
                total_tokens=getattr(usage, "total_token_count", None),
                extra=extra_payload,
            )
        except Exception:  # noqa: BLE001 — recorder must never break the LLM call
            logger.warning("llm_metering after_model_callback failed", exc_info=True)
        return None

    return after_model
