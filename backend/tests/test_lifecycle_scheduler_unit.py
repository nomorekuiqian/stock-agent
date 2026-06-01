"""Unit tests for lifecycle_scheduler pure helpers (no I/O)."""

from datetime import datetime, timedelta, timezone

from app.features.subscription.lifecycle_scheduler import (
    MAG7,
    SAMPLE_POOL,
    _already_sent,
    _behavior_hint,
    _days_since,
    _pick_sample_ticker,
)


# ---------------------------------------------------------------------------
# _days_since
# ---------------------------------------------------------------------------


def test_days_since_returns_zero_for_today():
    now = datetime.now(timezone.utc).isoformat()
    assert _days_since(now) == 0


def test_days_since_handles_z_suffix():
    iso = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat().replace("+00:00", "Z")
    assert _days_since(iso) == 3


def test_days_since_returns_none_on_empty():
    assert _days_since("") is None
    assert _days_since(None) is None  # type: ignore[arg-type]


def test_days_since_returns_none_on_garbage():
    assert _days_since("not-a-timestamp") is None


# ---------------------------------------------------------------------------
# _already_sent
# ---------------------------------------------------------------------------


def test_already_sent_false_for_empty_state():
    assert _already_sent(None, 0) is False
    assert _already_sent({}, 0) is False
    assert _already_sent({"onboarding_sent": {}}, 0) is False


def test_already_sent_true_when_day_key_present_as_string():
    state = {"onboarding_sent": {"4": "2026-05-31T00:00:00Z"}}
    assert _already_sent(state, 4) is True
    assert _already_sent(state, 5) is False


def test_already_sent_tolerates_int_keys():
    state = {"onboarding_sent": {6: "2026-05-31T00:00:00Z"}}
    assert _already_sent(state, 6) is True


# ---------------------------------------------------------------------------
# _pick_sample_ticker
# ---------------------------------------------------------------------------


def test_pick_sample_prefers_watchlist_mag7_match():
    assert _pick_sample_ticker("any-user", ["IBM", "TSLA", "F"]) == "TSLA"


def test_pick_sample_case_insensitive_match():
    assert _pick_sample_ticker("any-user", ["aapl"]) == "AAPL"


def test_pick_sample_falls_back_to_pool_when_no_mag7():
    pick = _pick_sample_ticker("any-user", ["IBM", "F", "GE"])
    assert pick in SAMPLE_POOL


def test_pick_sample_falls_back_for_empty_watchlist():
    pick = _pick_sample_ticker("any-user", [])
    assert pick in SAMPLE_POOL


def test_pick_sample_is_deterministic_per_user():
    a = _pick_sample_ticker("user-abc", [])
    b = _pick_sample_ticker("user-abc", [])
    assert a == b


def test_mag7_constant_contents():
    assert "NVDA" in MAG7
    assert "TSLA" in MAG7
    assert len(MAG7) == 7


# ---------------------------------------------------------------------------
# _behavior_hint
# ---------------------------------------------------------------------------


def test_behavior_hint_max_pitch_when_research_heavy():
    user = {"api_by_type": {"ai_research": 7}}
    assert _behavior_hint(user) == "max_pitch"


def test_behavior_hint_pro_pitch_for_personal_digest_consumer():
    user = {"api_by_type": {}, "personal_digest_count_30d": 4}
    assert _behavior_hint(user) == "pro_pitch"


def test_behavior_hint_pro_pitch_for_light_research_use():
    user = {"api_by_type": {"ai_research": 3}}
    assert _behavior_hint(user) == "pro_pitch"


def test_behavior_hint_default_for_inactive_user():
    user = {"api_by_type": {}, "personal_digest_count_30d": 0}
    assert _behavior_hint(user) == "default"


def test_behavior_hint_handles_missing_fields():
    assert _behavior_hint({}) == "default"
