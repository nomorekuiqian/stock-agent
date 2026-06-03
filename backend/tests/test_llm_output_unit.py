"""Unit tests for CoerceNoneToDefaultsMixin."""

import pytest
from pydantic import BaseModel, Field, ValidationError

from app.shared.llm_output import CoerceNoneToDefaultsMixin


class _Sample(CoerceNoneToDefaultsMixin, BaseModel):
    required_str: str
    static_int: int = Field(default=100)
    static_str: str = Field(default="desc")
    static_bool: bool = Field(default=False)
    factory_list: list[str] = Field(default_factory=list)
    factory_dict: dict[str, str] = Field(default_factory=dict)


def test_none_coerced_to_static_default():
    out = _Sample.model_validate(
        {"required_str": "ok", "static_int": None, "static_str": None, "static_bool": None}
    )
    assert out.static_int == 100
    assert out.static_str == "desc"
    assert out.static_bool is False


def test_none_coerced_to_factory_default():
    out = _Sample.model_validate(
        {"required_str": "ok", "factory_list": None, "factory_dict": None}
    )
    assert out.factory_list == []
    assert out.factory_dict == {}


def test_none_on_required_field_raises_missing():
    with pytest.raises(ValidationError) as exc:
        _Sample.model_validate({"required_str": None})
    # Should be a clean "missing" error, not "input should be str"
    assert "required_str" in str(exc.value)
    assert "missing" in str(exc.value).lower()


def test_non_none_values_pass_through_untouched():
    out = _Sample.model_validate(
        {
            "required_str": "ok",
            "static_int": 7,
            "static_str": "asc",
            "static_bool": True,
            "factory_list": ["a"],
            "factory_dict": {"k": "v"},
        }
    )
    assert out.static_int == 7
    assert out.static_str == "asc"
    assert out.static_bool is True
    assert out.factory_list == ["a"]
    assert out.factory_dict == {"k": "v"}


def test_missing_keys_use_field_defaults_normally():
    # Mixin only fires when the key is explicitly None — omitted keys should
    # still flow through Pydantic's normal default handling.
    out = _Sample.model_validate({"required_str": "ok"})
    assert out.static_int == 100
    assert out.factory_list == []


def test_non_dict_input_passes_through():
    # If validate is called with something weird (a model instance, etc.) the
    # mixin must not blow up.
    existing = _Sample(required_str="ok")
    out = _Sample.model_validate(existing)
    assert out.required_str == "ok"
