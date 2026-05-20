"""Sanity tests for the feature-flag registry."""

from app.features.flags.registry import KNOWN_FLAGS, FlagDef, is_known_flag


def test_known_flags_is_non_empty():
    assert len(KNOWN_FLAGS) >= 1


def test_for_you_v2_present():
    keys = {f.key for f in KNOWN_FLAGS}
    assert "for_you_v2" in keys


def test_flag_keys_unique():
    keys = [f.key for f in KNOWN_FLAGS]
    assert len(keys) == len(set(keys))


def test_flag_def_has_required_fields():
    for f in KNOWN_FLAGS:
        assert isinstance(f, FlagDef)
        assert f.key and f.key.replace("_", "").isalnum()
        assert f.description


def test_is_known_flag():
    assert is_known_flag("for_you_v2") is True
    assert is_known_flag("not_a_real_flag") is False
    assert is_known_flag("") is False
