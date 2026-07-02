"""Langfuse observability bootstrap tests."""

from __future__ import annotations

import os
import sys
import types

import pytest


@pytest.fixture(autouse=True)
def reset_langfuse_state():
    from app.core import langfuse as core_langfuse

    core_langfuse._reset_for_tests()
    yield
    core_langfuse._reset_for_tests()


def test_configure_langfuse_noops_without_credentials(monkeypatch):
    from app.core import langfuse as core_langfuse

    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_ENABLED", raising=False)

    assert core_langfuse.configure_langfuse() is False
    assert core_langfuse.get_langfuse_client() is None


def test_configure_langfuse_sets_host_masks_and_instruments(monkeypatch):
    from app.core import langfuse as core_langfuse

    created_clients = []
    instrumented = []

    class FakeLangfuse:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            created_clients.append(self)

        def flush(self):
            return None

    class FakePatch:
        def __init__(self, delete_attributes=(), set_attributes=None):
            self.delete_attributes = delete_attributes
            self.set_attributes = set_attributes or {}

    class FakeMaskResult:
        def __init__(self, span_patches):
            self.span_patches = span_patches

    class FakeGoogleADKInstrumentor:
        def instrument(self):
            instrumented.append("adk")

    class FakeGoogleGenAIInstrumentor:
        def instrument(self):
            instrumented.append("genai")

    monkeypatch.setitem(
        sys.modules,
        "langfuse",
        types.SimpleNamespace(Langfuse=FakeLangfuse),
    )
    monkeypatch.setitem(
        sys.modules,
        "langfuse.types",
        types.SimpleNamespace(MaskOtelSpansResult=FakeMaskResult, OtelSpanPatch=FakePatch),
    )
    monkeypatch.setitem(sys.modules, "openinference", types.ModuleType("openinference"))
    monkeypatch.setitem(
        sys.modules,
        "openinference.instrumentation",
        types.ModuleType("openinference.instrumentation"),
    )
    monkeypatch.setitem(
        sys.modules,
        "openinference.instrumentation.google_adk",
        types.SimpleNamespace(GoogleADKInstrumentor=FakeGoogleADKInstrumentor),
    )
    monkeypatch.setitem(
        sys.modules,
        "openinference.instrumentation.google_genai",
        types.SimpleNamespace(GoogleGenAIInstrumentor=FakeGoogleGenAIInstrumentor),
    )
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    monkeypatch.setenv("LANGFUSE_BASE_URL", "https://us.cloud.langfuse.com")
    monkeypatch.delenv("LANGFUSE_HOST", raising=False)
    monkeypatch.setenv("LANGFUSE_CAPTURE_CONTENT", "false")

    assert core_langfuse.configure_langfuse() is True
    assert created_clients
    assert os.environ.get("LANGFUSE_HOST") == "https://us.cloud.langfuse.com"
    assert instrumented == ["adk", "genai"]

    mask = created_clients[0].kwargs["mask_otel_spans"]

    class Span:
        attributes = {
            "authorization": "Bearer secret-token",
            "gen_ai.prompt.0.content": "user test@example.com",
            "metadata.note": "call me at 415-555-1212",
        }

    result = mask(params=types.SimpleNamespace(spans={"span-id": Span()}))
    patch = result.span_patches["span-id"]

    assert patch.set_attributes["authorization"] == "[REDACTED]"
    assert "gen_ai.prompt.0.content" in patch.delete_attributes
    assert patch.set_attributes["metadata.note"] == "call me at [REDACTED_PHONE]"


def test_custom_observation_redacts_content_when_disabled(monkeypatch):
    from app.core import langfuse as core_langfuse

    observations = []

    class FakeObservation:
        def __init__(self, kwargs):
            self.kwargs = kwargs
            self.updates = []

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def update(self, **kwargs):
            self.updates.append(kwargs)

    class FakeLangfuse:
        def start_as_current_observation(self, **kwargs):
            observation = FakeObservation(kwargs)
            observations.append(observation)
            return observation

    monkeypatch.setattr(core_langfuse, "_configured", True)
    monkeypatch.setattr(core_langfuse, "_client", FakeLangfuse())
    monkeypatch.setenv("LANGFUSE_CAPTURE_CONTENT", "false")
    monkeypatch.setitem(
        sys.modules,
        "langfuse",
        types.SimpleNamespace(propagate_attributes=lambda **kwargs: _NullContext()),
    )

    core_langfuse.record_langfuse_observation(
        name="test.tool",
        input={"query": "NVDA test@example.com", "api_key": "secret"},
        output="result with 415-555-1212",
        metadata={"duration_ms": 12, "note": "call 415-555-1212"},
    )

    assert observations
    kwargs = observations[0].kwargs
    assert kwargs["input"]["redacted"] is True
    assert kwargs["metadata"]["duration_ms"] == 12
    assert kwargs["metadata"]["note"] == "call [REDACTED_PHONE]"
    assert observations[0].updates[0]["output"]["redacted"] is True


class _NullContext:
    def __enter__(self):
        return None

    def __exit__(self, exc_type, exc, tb):
        return False
