"""
Unit tests for SubscriptionService.sync_resend_segments().

Tests the idempotent Resend segment reconciliation logic. Instead of mocking
get_email_preferences directly, we mock the underlying resend.ContactSegments
API so the real preference-reading and diffing logic executes.
"""

from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# Helper
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
        }
        svc.DAILY_CTA_SEGMENT_IDS = {
            "free": "",
            "paid": "",
        }
        return svc


TEST_EMAIL = "user@example.com"


def _mock_current_segments(mock_resend, segment_ids: set):
    """Configure mock so get_email_preferences sees the user in these segments.

    get_email_preferences calls resend.ContactSegments.list({"email": ...})
    and checks which segment IDs are in the response.
    """
    mock_resend.ContactSegments.list.return_value = {
        "data": [{"id": sid} for sid in segment_ids]
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
        _mock_current_segments(mock_resend, set())  # not in any segment

        actions = svc.sync_resend_segments(TEST_EMAIL, {"morning_report_email"})

        # get_email_preferences should have been called (reads from resend API)
        mock_resend.ContactSegments.list.assert_called_once()

        # Should add to morning segment
        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        assert "seg-morning" in added
        assert "added to morning_report" in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_weekly_entitlement_adds_to_weekly_segment(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, {"seg-evening"})  # only in daily

        actions = svc.sync_resend_segments(
            TEST_EMAIL, {"morning_report_email", "weekly_report_email"}
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
        # User is currently in morning + weekly segments
        _mock_current_segments(mock_resend, {"seg-morning", "seg-weekly", "seg-evening"})

        actions = svc.sync_resend_segments(TEST_EMAIL, set())  # no entitlements

        remove_calls = mock_resend.ContactSegments.remove.call_args_list
        removed = {c[0][0]["segment_id"] for c in remove_calls}
        assert "seg-morning" in removed
        assert "seg-weekly" in removed
        # Daily should NOT be removed (not managed by sync)
        assert "seg-evening" not in removed

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_daily_never_removed_even_if_absent(self, _wait, mock_resend):
        """Even with empty entitlements, daily_report is not touched by sync."""
        svc = _make_service()
        _mock_current_segments(mock_resend, {"seg-evening"})  # only daily

        actions = svc.sync_resend_segments(TEST_EMAIL, set())

        # No adds, no removes — daily is user-preference only
        mock_resend.ContactSegments.add.assert_not_called()
        mock_resend.ContactSegments.remove.assert_not_called()
        assert actions == []


# ---------------------------------------------------------------------------
# 3. Noop: state already matches desired
# ---------------------------------------------------------------------------

class TestSyncResendSegmentsNoop:
    """No change when current state matches desired state."""

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_noop_when_state_matches(self, _wait, mock_resend):
        svc = _make_service()
        # User has morning+weekly entitlements and is already in those segments
        _mock_current_segments(mock_resend, {"seg-morning", "seg-weekly", "seg-evening"})

        actions = svc.sync_resend_segments(
            TEST_EMAIL, {"morning_report_email", "weekly_report_email"}
        )

        mock_resend.ContactSegments.add.assert_not_called()
        mock_resend.ContactSegments.remove.assert_not_called()
        assert actions == []

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_noop_empty_entitlements_empty_segments(self, _wait, mock_resend):
        svc = _make_service()
        _mock_current_segments(mock_resend, set())  # not in any segment

        actions = svc.sync_resend_segments(TEST_EMAIL, set())

        mock_resend.ContactSegments.add.assert_not_called()
        mock_resend.ContactSegments.remove.assert_not_called()
        assert actions == []


# ---------------------------------------------------------------------------
# 4. Evening (daily_report) is not touched by sync
# ---------------------------------------------------------------------------

class TestSyncResendSegmentsEvening:
    """daily_report (evening) is user-preference only, not synced by entitlements."""

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_evening_not_added_by_sync(self, _wait, mock_resend):
        """sync should NOT add daily_report even if user is not in it."""
        svc = _make_service()
        _mock_current_segments(mock_resend, set())  # not in any segment

        actions = svc.sync_resend_segments(TEST_EMAIL, set())

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls} if add_calls else set()
        assert "seg-evening" not in added

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_evening_not_removed_by_sync(self, _wait, mock_resend):
        """daily_report stays untouched even when user has pro entitlements."""
        svc = _make_service()
        _mock_current_segments(mock_resend, {"seg-evening"})

        actions = svc.sync_resend_segments(
            TEST_EMAIL, {"morning_report_email", "weekly_report_email"}
        )

        remove_calls = mock_resend.ContactSegments.remove.call_args_list
        removed = {c[0][0]["segment_id"] for c in remove_calls} if remove_calls else set()
        assert "seg-evening" not in removed


# ---------------------------------------------------------------------------
# 5. Error handling: individual failures don't crash the whole sync
# ---------------------------------------------------------------------------

class TestSyncResendSegmentsErrors:
    """Errors in individual segment operations don't crash the whole sync."""

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_add_failure_continues_to_next(self, _wait, mock_resend):
        """If adding to morning fails, weekly should still be attempted."""
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        # First add fails, second succeeds
        mock_resend.ContactSegments.add.side_effect = [
            Exception("API error"),
            None,
        ]

        actions = svc.sync_resend_segments(
            TEST_EMAIL, {"morning_report_email", "weekly_report_email"}
        )

        # Both were attempted despite first failure
        assert mock_resend.ContactSegments.add.call_count == 2
        # Only the successful one appears in actions
        assert "added to weekly_report" in actions


# ---------------------------------------------------------------------------
# 6. Entitlement-to-segment mapping correctness
# ---------------------------------------------------------------------------

class TestSyncResendSegmentsMapping:
    """Verify the entitlement-to-segment name mapping is correct."""

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_morning_report_email_maps_to_morning_report(self, _wait, mock_resend):
        """morning_report_email entitlement -> morning_report segment."""
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        svc.sync_resend_segments(TEST_EMAIL, {"morning_report_email"})

        add_calls = mock_resend.ContactSegments.add.call_args_list
        assert len(add_calls) == 1
        assert add_calls[0][0][0]["segment_id"] == "seg-morning"

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_weekly_report_email_maps_to_weekly_report(self, _wait, mock_resend):
        """weekly_report_email entitlement -> weekly_report segment."""
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        svc.sync_resend_segments(TEST_EMAIL, {"weekly_report_email"})

        add_calls = mock_resend.ContactSegments.add.call_args_list
        assert len(add_calls) == 1
        assert add_calls[0][0][0]["segment_id"] == "seg-weekly"

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_unrelated_entitlement_ignored(self, _wait, mock_resend):
        """Max-only entitlements like stock_research don't affect email segments."""
        svc = _make_service()
        _mock_current_segments(mock_resend, set())

        actions = svc.sync_resend_segments(
            TEST_EMAIL, {"stock_research", "ai_research_engine"}
        )

        mock_resend.ContactSegments.add.assert_not_called()
        assert actions == []


class TestSyncDailyCtaSegments:
    """Daily CTA sending lists follow paid-email truth, not entitlements."""

    def _make_cta_service(self):
        svc = _make_service()
        svc.DAILY_CTA_SEGMENT_IDS = {
            "free": "seg-daily-free-cta",
            "paid": "seg-daily-paid-cta",
        }
        return svc

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_trial_entitlements_stay_in_free_cta(self, _wait, mock_resend):
        svc = self._make_cta_service()
        _mock_current_segments(mock_resend, {"seg-evening"})

        actions = svc.sync_resend_segments(
            "trial@example.com",
            {"morning_report_email", "weekly_report_email"},
        )

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        assert "seg-daily-free-cta" in added
        assert "seg-daily-paid-cta" not in added
        assert "added to daily_free_cta" in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_curated_paid_email_moves_to_paid_cta(self, _wait, mock_resend):
        svc = self._make_cta_service()
        _mock_current_segments(mock_resend, {"seg-evening"})

        actions = svc.sync_resend_segments("kedengpan@gmail.com", set())

        add_calls = mock_resend.ContactSegments.add.call_args_list
        added = {c[0][0]["segment_id"] for c in add_calls}
        remove_calls = mock_resend.ContactSegments.remove.call_args_list
        removed = {c[0][0]["segment_id"] for c in remove_calls}
        assert "seg-daily-paid-cta" in added
        assert "seg-daily-free-cta" in removed
        assert "added to daily_paid_cta" in actions

    @patch("app.features.subscription.service.resend")
    @patch("app.features.subscription.service._rate_limit_wait")
    def test_daily_disabled_removes_both_cta_segments(self, _wait, mock_resend):
        svc = self._make_cta_service()
        _mock_current_segments(mock_resend, set())

        actions = svc.sync_resend_segments("trial@example.com", set())

        remove_calls = mock_resend.ContactSegments.remove.call_args_list
        removed = {c[0][0]["segment_id"] for c in remove_calls}
        assert removed == {"seg-daily-free-cta", "seg-daily-paid-cta"}
        assert "removed from daily_free_cta" in actions
        assert "removed from daily_paid_cta" in actions
