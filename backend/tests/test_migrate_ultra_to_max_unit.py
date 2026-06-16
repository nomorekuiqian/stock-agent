from datetime import datetime, timezone
from importlib import util
from pathlib import Path
import sys


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "migrate_ultra_to_max.py"
SPEC = util.spec_from_file_location("migrate_ultra_to_max", SCRIPT_PATH)
assert SPEC and SPEC.loader
migrate_ultra_to_max = util.module_from_spec(SPEC)
sys.modules[SPEC.name] = migrate_ultra_to_max
SPEC.loader.exec_module(migrate_ultra_to_max)


NOW = datetime(2026, 6, 16, tzinfo=timezone.utc)


def _target(row):
    return migrate_ultra_to_max._target_for_row(row, NOW)


def test_target_for_stripe_active_ultra_becomes_max_and_clears_grant_expiry():
    target = _target({
        "plan": "ultra",
        "status": "active",
        "stripe_subscription_id": "sub_test",
        "access_expires_at": "2026-01-01T00:00:00+00:00",
        "entitlements": ["kol_pack_qinbafrank"],
    })

    assert target == (
        "max",
        "active",
        sorted(migrate_ultra_to_max.MAX_FEATURES),
        True,
        "review_stripe_price",
        "stripe_active_to_max",
        True,
    )


def test_target_for_lifetime_ultra_becomes_max():
    target = _target({
        "plan": "ultra",
        "status": "active",
        "is_lifetime": True,
        "entitlements": ["kol_pack_qinbafrank"],
    })

    assert target == (
        "max",
        "active",
        sorted(migrate_ultra_to_max.MAX_FEATURES),
        False,
        "none",
        "lifetime_cleanup",
        True,
    )


def test_target_for_active_legacy_grant_becomes_max_until_expiry():
    target = _target({
        "plan": "ultra",
        "status": "active",
        "access_expires_at": "2026-12-31T00:00:00+00:00",
        "entitlements": ["kol_pack_qinbafrank"],
    })

    assert target == (
        "max",
        "active",
        sorted(migrate_ultra_to_max.MAX_FEATURES),
        False,
        "none",
        "active_grant_to_max",
        True,
    )


def test_target_for_expired_legacy_grant_becomes_free_expired():
    target = _target({
        "plan": "ultra",
        "status": "active",
        "access_expires_at": "2026-01-01T00:00:00+00:00",
        "entitlements": ["kol_pack_qinbafrank"],
    })

    assert target == (
        "free",
        "expired",
        [],
        False,
        "none",
        "inactive_legacy_cleanup",
        True,
    )


def test_target_for_non_legacy_row_does_not_update():
    target = _target({
        "plan": "max",
        "status": "active",
        "entitlements": list(migrate_ultra_to_max.MAX_FEATURES),
    })

    assert target == (
        None,
        None,
        None,
        False,
        "none",
        "no_legacy_ultra_state",
        False,
    )
