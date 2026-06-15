"""Unit tests for the daily-report CTA paid classifier."""

from app.features.subscription.cta_tier import is_real_paid_sub


def test_anonymous_or_no_sub_record_is_not_paid():
    assert is_real_paid_sub(None) is False
    assert is_real_paid_sub({}) is False


def test_lifetime_user_is_paid_even_without_entitlements():
    assert is_real_paid_sub({"is_lifetime": True}) is True
    assert is_real_paid_sub({"is_lifetime": True, "entitlements": []}) is True
    assert is_real_paid_sub({"is_lifetime": 1}) is True


def test_grant_or_trial_with_access_expiry_is_not_real_paid():
    sub = {
        "status": "active",
        "stripe_subscription_id": "sub_trial_123",
        "entitlements": ["morning_report_email", "weekly_report_email"],
        "access_expires_at": "2030-01-01T00:00:00Z",
        "invite_code": "AUTO_TRIAL",
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is False


def test_non_stripe_grant_without_expiry_is_not_real_paid():
    sub = {
        "status": "active",
        "stripe_subscription_id": None,
        "entitlements": ["morning_report_email"],
        "access_expires_at": None,
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is False


def test_real_paid_active_stripe_subscription_is_paid():
    sub = {
        "status": "active",
        "stripe_subscription_id": "sub_paid_789",
        "entitlements": ["morning_report_email", "for_you_website"],
        "access_expires_at": None,
        "invite_code": None,
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is True


def test_trialing_stripe_subscription_is_not_real_paid():
    sub = {
        "status": "trialing",
        "stripe_subscription_id": "sub_trialing_789",
        "entitlements": ["morning_report_email", "for_you_website"],
        "access_expires_at": None,
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is False


def test_canceled_subscription_with_entitlements_is_not_real_paid():
    sub = {
        "status": "canceled",
        "stripe_subscription_id": "sub_canceled_789",
        "entitlements": ["morning_report_email", "for_you_website"],
        "access_expires_at": None,
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is False


def test_empty_entitlements_are_not_paid_even_for_active_stripe_row():
    sub = {
        "status": "active",
        "stripe_subscription_id": "sub_paid_789",
        "entitlements": [],
        "access_expires_at": None,
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is False


def test_missing_status_is_not_paid():
    sub = {
        "stripe_subscription_id": "sub_paid_789",
        "entitlements": ["morning_report_email"],
        "access_expires_at": None,
        "is_lifetime": False,
    }
    assert is_real_paid_sub(sub) is False
