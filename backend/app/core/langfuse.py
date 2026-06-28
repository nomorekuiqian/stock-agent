"""Langfuse observability bootstrap and safe tracing helpers."""

from __future__ import annotations

from contextlib import ExitStack, contextmanager, nullcontext
import os
import re
from typing import Any, Iterator

from app.core.logging import get_logger

logger = get_logger(__name__)

_configured = False
_client: Any | None = None

_EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(
    r"\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b"
)
_BEARER_RE = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
_COMMON_SECRET_RE = re.compile(
    r"\b(?:sk|pk)-(?:lf|test|live|proj|ant|or|[A-Za-z0-9]{2,})-[A-Za-z0-9_-]{12,}\b"
)
_GOOGLE_KEY_RE = re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b")

_SENSITIVE_KEY_PARTS = (
    "authorization",
    "cookie",
    "password",
    "secret",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
)

_CONTENT_KEY_PARTS = (
    "gen_ai.prompt",
    "gen_ai.completion",
    "input.value",
    "output.value",
    "llm.input_messages",
    "llm.output_messages",
)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _redact_text(value: str) -> str:
    redacted = _BEARER_RE.sub("Bearer [REDACTED]", value)
    redacted = _JWT_RE.sub("[REDACTED_JWT]", redacted)
    redacted = _COMMON_SECRET_RE.sub("[REDACTED_SECRET]", redacted)
    redacted = _GOOGLE_KEY_RE.sub("[REDACTED_GOOGLE_API_KEY]", redacted)
    redacted = _EMAIL_RE.sub("[REDACTED_EMAIL]", redacted)
    redacted = _PHONE_RE.sub("[REDACTED_PHONE]", redacted)
    return redacted


def _is_sensitive_key(key: str) -> bool:
    key_lower = key.lower()
    return any(part in key_lower for part in _SENSITIVE_KEY_PARTS)


def _is_content_key(key: str) -> bool:
    key_lower = key.lower()
    return any(part in key_lower for part in _CONTENT_KEY_PARTS)


def _build_mask_otel_spans(mask_result_cls: Any, patch_cls: Any):
    capture_content = _env_bool("LANGFUSE_CAPTURE_CONTENT", True)

    def mask_otel_spans(*, params: Any) -> Any | None:
        patches: dict[Any, Any] = {}

        for identifier, span in params.spans.items():
            replacements: dict[str, Any] = {}
            deletes: list[str] = []

            for key, value in span.attributes.items():
                if not capture_content and _is_content_key(key):
                    deletes.append(key)
                    continue

                if _is_sensitive_key(key):
                    replacements[key] = "[REDACTED]"
                    continue

                if isinstance(value, str):
                    redacted = _redact_text(value)
                    if redacted != value:
                        replacements[key] = redacted
                elif isinstance(value, (list, tuple)) and all(
                    isinstance(item, str) for item in value
                ):
                    redacted_items = [_redact_text(item) for item in value]
                    if redacted_items != list(value):
                        replacements[key] = redacted_items

            if replacements or deletes:
                patches[identifier] = patch_cls(
                    delete_attributes=tuple(deletes),
                    set_attributes=replacements,
                )

        if not patches:
            return None
        return mask_result_cls(span_patches=patches)

    return mask_otel_spans


def _metadata_strings(metadata: dict[str, Any] | None) -> dict[str, str]:
    if not metadata:
        return {}
    out: dict[str, str] = {}
    for key, value in metadata.items():
        if value is None:
            continue
        text = str(value)
        if len(text) > 200:
            text = text[:197] + "..."
        out[str(key)] = text
    return out


def configure_langfuse() -> bool:
    """Configure Langfuse/OpenInference once, if credentials are present."""
    global _configured, _client

    if _configured:
        return _client is not None
    _configured = True

    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "")
    explicit_enabled = os.getenv("LANGFUSE_ENABLED")
    enabled = _env_bool("LANGFUSE_ENABLED", bool(public_key and secret_key))

    if not enabled:
        logger.info("Langfuse tracing disabled")
        return False
    if not public_key or not secret_key:
        if explicit_enabled is not None:
            logger.warning(
                "Langfuse tracing requested but LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY is missing"
            )
        return False

    base_url = os.getenv("LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_HOST")
    if base_url:
        os.environ.setdefault("LANGFUSE_BASE_URL", base_url)
        os.environ.setdefault("LANGFUSE_HOST", base_url)
    os.environ.setdefault(
        "LANGFUSE_TRACING_ENVIRONMENT",
        os.getenv("ENVIRONMENT", "development"),
    )

    try:
        from langfuse import Langfuse
        from langfuse.types import MaskOtelSpansResult, OtelSpanPatch
    except Exception as exc:  # noqa: BLE001
        logger.warning("Langfuse SDK is not available; tracing disabled: %s", exc)
        return False

    try:
        _client = Langfuse(
            mask_otel_spans=_build_mask_otel_spans(MaskOtelSpansResult, OtelSpanPatch)
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Langfuse client initialization failed; tracing disabled: %s", exc)
        _client = None
        return False

    try:
        from openinference.instrumentation.google_adk import GoogleADKInstrumentor

        GoogleADKInstrumentor().instrument()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Google ADK Langfuse instrumentation unavailable: %s", exc)

    try:
        from openinference.instrumentation.google_genai import GoogleGenAIInstrumentor

        GoogleGenAIInstrumentor().instrument()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Google GenAI Langfuse instrumentation unavailable: %s", exc)

    logger.info("Langfuse tracing configured")
    return True


def get_langfuse_client() -> Any | None:
    if not _configured:
        configure_langfuse()
    return _client


@contextmanager
def start_langfuse_generation(
    *,
    name: str,
    model: str,
    input: Any | None = None,
    metadata: dict[str, Any] | None = None,
    tags: list[str] | None = None,
    user_id: str | None = None,
    session_id: str | None = None,
) -> Iterator[Any | None]:
    """Start a generation observation when Langfuse is configured."""
    client = get_langfuse_client()
    if client is None:
        yield None
        return

    from langfuse import propagate_attributes

    trace_attrs = {
        "trace_name": name,
        "user_id": user_id,
        "session_id": session_id,
        "tags": tags or [],
        "metadata": _metadata_strings(metadata),
    }
    trace_attrs = {key: value for key, value in trace_attrs.items() if value}

    with ExitStack() as stack:
        try:
            generation = stack.enter_context(
                client.start_as_current_observation(
                    as_type="generation",
                    name=name,
                    model=model,
                    input=input,
                    metadata=metadata,
                )
            )
            attribute_context = (
                propagate_attributes(**trace_attrs) if trace_attrs else nullcontext()
            )
            stack.enter_context(attribute_context)
        except Exception:  # noqa: BLE001
            logger.debug("Langfuse generation setup failed", exc_info=True)
            yield None
            return
        yield generation


def update_observation(observation: Any | None, **kwargs: Any) -> None:
    if observation is None:
        return
    try:
        observation.update(**kwargs)
    except Exception:  # noqa: BLE001
        logger.debug("Langfuse observation update failed", exc_info=True)


def flush_langfuse() -> None:
    client = get_langfuse_client()
    if client is None:
        return
    try:
        client.flush()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error flushing Langfuse events: %s", exc)


def _reset_for_tests() -> None:
    global _configured, _client
    _configured = False
    _client = None
