"""
Unit tests for SubscriptionService.sync_resend_segments().

Tests the idempotent Resend segment reconciliation logic. Instead of mocking
get_email_preferences directly, we mock the underlying resend.ContactSegments
API so the real preference-reading and diffing logic executes.

The function takes a subscription record (dict) rather than a raw entitlement
set, and the daily CTA tier is derived from the record via
``cta_tier.is_real_paid_sub`` rather than a hand-curated whitelist.
"""

from unittest.mock import patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_service():
    """Create a SubscriptionService with fake API key and deterministic segment IDs."""
    with patch("app.features.subscription.service.RESEND_API_KEY", "test-key"):
        from app.features.subscription.service import SubscriptionService
        svc = SubscriptionService()
        svc.api_key = "test-key"
        svc.SEGMENT_IDS = {
            "morning_report": "seg-morning",
            "daily_report": "seg-evening",
            "weekly_report": "seg-weekly",
            "twitter_digest": "seg-twitter",
        }
        svc.DAILY_CTA_SEGMENT_IDS = {
            "free": "",
            "paid": "",
        }
        return svc


TEST_EMAIL = "user@example.com"


def _mock_current_segments(mock_resend, segment_ids: set):
    """Configure mock so get_email_preferences sees the user in these segments."""
    mock_resend.ContactSegments.list.return_value = {
        "data": [{"id": sid} for sid in segment_ids]
    }


def _trial_sub(entitlements: list) -> dict:
    """Subscription record matching a trial user (state #2/#3 in the plan)."""
    return {
        "entitlements": entitlements,
        "access_expires_at": "2030-01-01T00:00:00Z",
        "invite_code": "AUTO_TRIAL",
        "status": "active",
        "stripe_subscription_id": "sub_trial_or_grant",
        "is_lifetime": False,
    }


def _paid_sub(entitlements: list) -> dict:
    """Subscription record matching a real paid user (state #4)."""
    return {
        "entitlements": entitlements,
        "access_expires_at": None,
        "invite_code": None,
        "status": "active",
        "stripe_subscription_id": "sub_paid",
        "is_lifetime": False,
    }


def _free_sub() -> dict:
    """Subscription record matching a free user with no entitlements."""
    return {
        "entitlements": [],
        "access_expires_at": None,
        "invite_code": None,
        "status": "none",
        "stripe_subscription_id": None,
        "is_lifetime": False,
    }


# ---------------------------------------------------------------------------
# 1. Add: entitlement present, not in segment -> add
# ---------------------------------------------------------------------------


class TestSyncResendSegmentsAdd:
    """Entitlement present + not currently in segment = add."""

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_morning_entitlement_adds_to_morning_segment(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        actions = svc.sync_resend_segments(
            TEST_EMAIL, _paid_sub(["morning_report_email"])
        )

        mock_resend.ContactSegments.list.assert_called_once()

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        assert "seg-morning" in added
        assert "added to morning_report" in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_twitter_entitlement_adds_when_not_explicitly_opted_out(
        self, _wait, mock_resend
    ):
        svc = _make_service()
        _mock_current_segments(mock_resend, set())
        mock_resend.Contacts.get.return_value = {"unsubscribed": False}

        actions = svc.sync_resend_segments(
            TEST_EMAIL,
            _paid_sub(["twitter_digest"]),
        )

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        assert "seg-twitter" in added
        assert "added to twitter_digest" in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_twitter_explicit_opt_out_is_not_readded(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, set())
        mock_resend.Contacts.get.return_value = {"unsubscribed": False}

        actions = svc.sync_resend_segments(
            TEST_EMAIL,
            {
                **_paid_sub(["twitter_digest"]),
                "email_preferences": {"twitter_digest": False},
            },
        )

        mock_resend.ContactSegments.add.assert_not_called()
        assert "added to twitter_digest" not in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_weekly_entitlement_adds_to_weekly_segment(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, {"seg-evening"})

        actions = svc.sync_resend_segments(
            TEST_EMAIL,
            _paid_sub(["morning_report_email", "weekly_report_email"]),
        )

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        assert "seg-morning" in added
        assert "seg-weekly" in added
        assert len(actions) == 2


# ---------------------------------------------------------------------------
# 2. Remove: no entitlement, currently in segment -> remove
# ---------------------------------------------------------------------------


class TestSyncResendSegmentsRemove:
    """No entitlement + currently in segment = remove."""

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_no_entitlement_removes_from_morning(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, {"seg-morning", "seg-weekly", "seg-evening"})

        actions = svc.sync_resend_segments(TEST_EMAIL, _free_sub())

        remove_calls = mock_resend.ContactSegments.remove.call_args_list
        removed = {c[0][0]["segment_id"] for c in remove_calls}
        assert "seg-morning" in removed
        assert "seg-weekly" in removed
        assert "seg-evening" not in removed

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_twitter_explicit_opt_out_removes_existing_segment(
        self, _wait, mock_resend
    ):
        svc = _make_service()
        _mock_current_segments(mock_resend, {"seg-twitter"})
        mock_resend.Contacts.get.return_value = {"unsubscribed": False}

        actions = svc.sync_resend_segments(
            TEST_EMAIL,
            {
                **_paid_sub(["twitter_digest"]),
                "email_preferences": {"twitter_digest": False},
            },
        )

        mock_resend.ContactSegments.remove.assert_called_once_with(
            {"email": TEST_EMAIL, "segment_id": "seg-twitter"}
        )
        assert "removed from twitter_digest" in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_daily_never_removed_even_if_absent(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, {"seg-evening"})

        actions = svc.sync_resend_segments(TEST_EMAIL, _free_sub())

        mock_resend.ContactSegments.add.assert_not_called()
        mock_resend.ContactSegments.remove.assert_not_called()
        assert actions == []


# ---------------------------------------------------------------------------
# 3. Noop: state already matches desired
# ---------------------------------------------------------------------------


class TestSyncResendSegmentsNoop:

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_noop_when_state_matches(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, {"seg-morning", "seg-weekly", "seg-evening"})

        actions = svc.sync_resend_segments(
            TEST_EMAIL,
            _paid_sub(["morning_report_email", "weekly_report_email"]),
        )

        mock_resend.ContactSegments.add.assert_not_called()
        mock_resend.ContactSegments.remove.assert_not_called()
        assert actions == []

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_noop_empty_entitlements_empty_segments(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        actions = svc.sync_resend_segments(TEST_EMAIL, _free_sub())

        mock_resend.ContactSegments.add.assert_not_called()
        mock_resend.ContactSegments.remove.assert_not_called()
        assert actions == []


# ---------------------------------------------------------------------------
# 4. Evening (daily_report) is not touched by sync
# ---------------------------------------------------------------------------


class TestSyncResendSegmentsEvening:

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_evening_not_added_by_sync(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        svc.sync_resend_segments(TEST_EMAIL, _free_sub())

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls} if add_calls else set()
        assert "seg-evening" not in added

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_evening_not_removed_by_sync(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, {"seg-evening"})

        svc.sync_resend_segments(
            TEST_EMAIL,
            _paid_sub(["morning_report_email", "weekly_report_email"]),
        )

        remove_calls = mock_resend.ContactSegments.remove.call_args_list
        removed = {c[0][0]["segment_id"] for c in remove_calls} if remove_calls else set()
        assert "seg-evening" not in removed


# ---------------------------------------------------------------------------
# 5. Error handling: individual failures don't crash the whole sync
# ---------------------------------------------------------------------------


class TestSyncResendSegmentsErrors:

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_add_failure_continues_to_next(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        mock_resend.ContactSegments.add.side_effect = [
            Exception("API error"),
            None,
        ]

        actions = svc.sync_resend_segments(
            TEST_EMAIL,
            _paid_sub(["morning_report_email", "weekly_report_email"]),
        )

        assert mock_resend.ContactSegments.add.call_count == 2
        assert "added to weekly_report" in actions


# ---------------------------------------------------------------------------
# 6. Entitlement-to-segment mapping correctness
# ---------------------------------------------------------------------------


class TestSyncResendSegmentsMapping:

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_morning_report_email_maps_to_morning_report(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        svc.sync_resend_segments(TEST_EMAIL, _paid_sub(["morning_report_email"]))

        add_calls = mock_resend.ContactSegments.add.call_args_list
        assert len(add_calls) == 1
        assert add_calls[0][0][0]["segment_id"] == "seg-morning"

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_weekly_report_email_maps_to_weekly_report(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        svc.sync_resend_segments(TEST_EMAIL, _paid_sub(["weekly_report_email"]))

        add_calls = mock_resend.ContactSegments.add.call_args_list
        assert len(add_calls) == 1
        assert add_calls[0][0][0]["segment_id"] == "seg-weekly"

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_unrelated_entitlement_ignored(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        actions = svc.sync_resend_segments(
            TEST_EMAIL, _paid_sub(["stock_research", "ai_research_engine"])
        )

        mock_resend.ContactSegments.add.assert_not_called()
        # Note: actions may include daily CTA changes since paid sub triggers
        # paid CTA add. We assert the morning/weekly are untouched, which is
        # the actual contract of this test.


# ---------------------------------------------------------------------------
# 7. Daily CTA tier routing — derived from sub, not whitelist
# ---------------------------------------------------------------------------


class TestSyncDailyCtaSegments:
    """Daily CTA sending lists follow is_real_paid_sub(sub), not entitlements."""

    def _make_cta_service(self):
        svc = _make_service()
        svc.DAILY_CTA_SEGMENT_IDS = {
            "free": "seg-daily-free-cta",
            "paid": "seg-daily-paid-cta",
        }
        return svc

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_trial_or_grant_user_moves_to_free_cta(self, _wait, mock_resend):
        """Trial/grant users may have entitlements, but are not real paid."""
        svc = self._make_cta_service()
        _mock_current_segments(mock_resend, {"seg-evening", "seg-daily-paid-cta"})

        actions = svc.sync_resend_segments(
            "trial@example.com",
            _trial_sub(["morning_report_email", "weekly_report_email"]),
        )

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        remove_calls = mock_resend.ContactSegments.remove.call_args_list
        removed = {c[0][0]["segment_id"] for c in remove_calls}
        assert "seg-daily-free-cta" in added
        assert "seg-daily-paid-cta" in removed
        assert "added to daily_free_cta" in actions
        assert "removed from daily_paid_cta" in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_real_paid_user_moves_to_paid_cta(self, _wait, mock_resend):
        """Real paid sub (entitlements + access_expires_at=None) -> paid CTA."""
        svc = self._make_cta_service()
        _mock_current_segments(mock_resend, {"seg-evening", "seg-daily-free-cta"})

        actions = svc.sync_resend_segments(
            "paid@example.com",
            _paid_sub(["morning_report_email", "for_you_website"]),
        )

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        remove_calls = mock_resend.ContactSegments.remove.call_args_list
        removed = {c[0][0]["segment_id"] for c in remove_calls}
        assert "seg-daily-paid-cta" in added
        assert "seg-daily-free-cta" in removed
        assert "added to daily_paid_cta" in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_lifetime_user_routed_to_paid_cta(self, _wait, mock_resend):
        """is_lifetime=True short-circuits to paid CTA regardless of other fields."""
        svc = self._make_cta_service()
        _mock_current_segments(mock_resend, {"seg-evening"})

        actions = svc.sync_resend_segments(
            "lifetime@example.com",
            {
                "is_lifetime": True,
                "entitlements": [],
                "access_expires_at": None,
                "status": "active",
                "stripe_subscription_id": None,
            },
        )

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        assert "seg-daily-paid-cta" in added
        assert "added to daily_paid_cta" in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_daily_disabled_removes_both_cta_segments(self, _wait, mock_resend):
        """When user is not subscribed to daily, both CTA segments are cleaned."""
        svc = self._make_cta_service()
        _mock_current_segments(mock_resend, set())

        actions = svc.sync_resend_segments("free@example.com", _free_sub())

        remove_calls = mock_resend.ContactSegments.remove.call_args_list
        removed = {c[0][0]["segment_id"] for c in remove_calls}
        assert removed == {"seg-daily-free-cta", "seg-daily-paid-cta"}
        assert "removed from daily_free_cta" in actions
        assert "removed from daily_paid_cta" in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_none_sub_treated_as_free(self, _wait, mock_resend):
        """When sub is None (anonymous signup), user is treated as free."""
        svc = self._make_cta_service()
        _mock_current_segments(mock_resend, {"seg-evening"})

        actions = svc.sync_resend_segments("anon@example.com", None)

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        assert "seg-daily-free-cta" in added
        assert "seg-daily-paid-cta" not in added
