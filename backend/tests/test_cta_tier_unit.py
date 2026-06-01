"""Unit tests for is_real_paid_sub — daily report CTA tier classifier.

Post-freemium-transition rules (see
docs/plans/active/freemium-lifecycle-email.md, "用户状态分类与处理"):
any user with non-empty entitlements is treated as paid, regardless of
access_expires_at. This includes legacy trial users during the transition
window.
"""

from app.features.subscription.cta_tier import is_real_paid_sub


def test_anonymous_or_no_sub_record_is_not_paid():
    assert is_real_paid_sub(None) is False
    assert is_real_paid_sub({}) is False


def test_legacy_trial_user_with_entitlements_is_paid():
    """Legacy auto-trial users (in transition window) are treated as paid.

    They have entitlements + access_expires_at. New rule ignores
    access_expires_at — entitlements alone qualify them for PAID CTA
    so the model change does not jolt them with upgrade prompts during
    their remaining trial days.
    """
    sub = {
        "entitlements": ["morning_report_email", "weekly_report_email"],
        "access_expires_at": "2030-01-01T00:00:00Z",
        "invite_code": "AUTO_TRIAL",
        "stripe_subscription_id": "sub_trial_123",
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is True


def test_legacy_invite_redeem_user_is_paid():
    """Same: invite-code recipients with entitlements get PAID CTA."""
    sub = {
        "entitlements": ["morning_report_email"],
        "access_expires_at": "2030-01-01T00:00:00Z",
        "invite_code": "GIFT2026",
        "stripe_subscription_id": "sub_trial_456",
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is True


def test_expired_trial_with_cleared_entitlements_is_not_paid():
    """Trial expired, entitlements revoked → downgraded to free."""
    sub = {
        "entitlements": [],
        "access_expires_at": "2020-01-01T00:00:00Z",
        "invite_code": "AUTO_TRIAL",
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is False


def test_real_paid_user_is_paid():
    """State #4: entitlements + access_expires_at cleared by Stripe webhook."""
    sub = {
        "entitlements": ["morning_report_email", "for_you_website"],
        "access_expires_at": None,
        "invite_code": None,
        "stripe_subscription_id": "sub_paid_789",
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is True


def test_lifetime_user_is_paid():
    """State #5: is_lifetime short-circuits even if other fields look weird."""
    sub = {"is_lifetime": True}
    assert is_real_paid_sub(sub) is True


def test_lifetime_with_empty_entitlements_still_paid():
    """Lifetime bypass: even if entitlements column is empty, still paid."""
    sub = {"is_lifetime": True, "entitlements": []}
    assert is_real_paid_sub(sub) is True


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_trial_to_paid_conversion_with_lingering_invite_code_is_paid():
    """Critical edge case: user converted from trial to paid.

    Stripe customer.subscription.created webhook clears access_expires_at
    via clear_access_expires_at=True (payment/router.py:252) but does NOT
    clear invite_code. The classifier must rely on access_expires_at, not
    invite_code, to correctly identify the user as paid.
    """
    sub = {
        "entitlements": ["morning_report_email", "for_you_website"],
        "access_expires_at": None,  # cleared by webhook
        "invite_code": "AUTO_TRIAL",  # lingers from pre-conversion trial
        "stripe_subscription_id": "sub_paid_after_trial",
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is True


def test_lifetime_revocation_falls_back_to_entitlement_rules():
    """When is_lifetime is revoked (False), the user must fall back to the
    standard rules. If they had entitlements + no access_expires_at they are
    still paid; otherwise free."""
    revoked_with_entitlements = {
        "is_lifetime": False,
        "entitlements": ["morning_report_email"],
        "access_expires_at": None,
    }
    assert is_real_paid_sub(revoked_with_entitlements) is True

    revoked_clean = {
        "is_lifetime": False,
        "entitlements": [],
        "access_expires_at": None,
    }
    assert is_real_paid_sub(revoked_clean) is False


def test_entitlements_as_none_is_treated_as_empty():
    """Defensive: some flows may write entitlements=None instead of []."""
    sub = {
        "entitlements": None,
        "access_expires_at": None,
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is False


def test_access_expires_at_empty_string_treated_as_unset():
    """Defensive: some serializers turn NULL into empty string."""
    sub = {
        "entitlements": ["morning_report_email"],
        "access_expires_at": "",
        "is_lifetime": False,
    }
    # Empty string is falsy in Python, so this should be paid.
    assert is_real_paid_sub(sub) is True


def test_is_lifetime_string_true_treated_as_truthy():
    """Defensive: JSON booleans round-trip correctly but be safe."""
    assert is_real_paid_sub({"is_lifetime": True}) is True
    # If serializer ever writes 1 instead of True, behave the same.
    assert is_real_paid_sub({"is_lifetime": 1}) is True


def test_missing_is_lifetime_field_is_treated_as_false():
    """Defensive: older sub records may not have is_lifetime column."""
    sub = {
        "entitlements": ["morning_report_email"],
        "access_expires_at": None,
    }
    assert is_real_paid_sub(sub) is True

    # Even with access_expires_at set, entitlements present = paid under
    # the new freemium rules.
    sub_with_expiry = {
        "entitlements": ["morning_report_email"],
        "access_expires_at": "2030-01-01T00:00:00Z",
    }
    assert is_real_paid_sub(sub_with_expiry) is True
