"""
Shared helpers for LLM structured output schemas.

Use these when an agent runs on a provider that does NOT enforce JSON Schema
server-side (e.g. DeepSeek's `response_format={"type": "json_object"}`). Such
providers describe the schema in the prompt but happily emit nulls for fields
that the schema declares as non-Optional, which makes Pydantic v2 reject the
whole turn — surfacing to users as "AI 助手输出格式异常".

Providers that DO enforce schema server-side (Gemini `responseSchema`, OpenAI
strict `json_schema`) don't need this — they already guarantee the model can
only emit conforming JSON.
"""

from typing import Any

from pydantic import BaseModel, model_validator


class CoerceNoneToDefaultsMixin(BaseModel):
    """Replace any `None` field value with that field's declared default.

    Apply via multiple inheritance on any Pydantic model whose JSON comes from a
    prompt-only ("json_object") provider:

        class FooOutput(CoerceNoneToDefaultsMixin, BaseModel):
            count: int = Field(default=0)
            tags: list[str] = Field(default_factory=list)

    Behavior per field that arrived as `None`:
      - has a declared default (value or factory) → use it
      - required (no default)                    → drop the key so Pydantic
                                                   raises "missing" instead of
                                                   a confusing type error
    """

    @model_validator(mode="before")
    @classmethod
    def _coerce_none_to_defaults(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        cleaned = dict(data)
        for name, field in cls.model_fields.items():
            if cleaned.get(name, ...) is not None:
                continue
            if field.is_required():
                cleaned.pop(name, None)
                continue
            # get_default handles both the 0-arg and validated-data factory
            # signatures Pydantic 2.10+ supports.
            cleaned[name] = field.get_default(call_default_factory=True)
        return cleaned
