"""
Unit tests for the Entitlements Gateway.

Tests has_entitlement() and get_user_entitlements() from
app.features.payment.entitlements. No fallback — entitlements column
is the sole source of truth.
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.features.payment.entitlements import (
    PRO_FEATURES,
    MAX_FEATURES,
    MAX_ONLY_FEATURES,
    has_entitlement,
    get_user_entitlements,
)

MOCK_UID = "test-user-0000-1111-2222"


# ---------------------------------------------------------------------------
# has_entitlement — entitlements column check
# ---------------------------------------------------------------------------

class TestHasEntitlement:
    """has_entitlement checks the entitlements JSONB column only."""

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_feature_present_returns_true(self, mock_get_sub):
        mock_get_sub.return_value = {
            "entitlements": ["morning_report_email", "weekly_report_email"],
        }
        assert await has_entitlement(MOCK_UID, "morning_report_email") is True

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_feature_absent_returns_false(self, mock_get_sub):
        mock_get_sub.return_value = {
            "entitlements": ["morning_report_email", "weekly_report_email"],
        }
        assert await has_entitlement(MOCK_UID, "stock_research") is False

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_empty_entitlements_returns_false(self, mock_get_sub):
        mock_get_sub.return_value = {
            "entitlements": [],
            "plan": "pro",
            "status": "active",
        }
        # No fallback — empty entitlements means no access, regardless of plan
        assert await has_entitlement(MOCK_UID, "morning_report_email") is False

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_null_entitlements_returns_false(self, mock_get_sub):
        mock_get_sub.return_value = {
            "entitlements": None,
            "plan": "max",
            "status": "active",
        }
        assert await has_entitlement(MOCK_UID, "stock_research") is False

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_no_subscription_returns_false(self, mock_get_sub):
        mock_get_sub.return_value = None
        assert await has_entitlement(MOCK_UID, "morning_report_email") is False

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_all_max_features_present(self, mock_get_sub):
        mock_get_sub.return_value = {"entitlements": sorted(MAX_FEATURES)}
        for feat in MAX_FEATURES:
            assert await has_entitlement(MOCK_UID, feat) is True

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_pro_features_deny_max_only(self, mock_get_sub):
        mock_get_sub.return_value = {"entitlements": sorted(PRO_FEATURES)}
        for feat in MAX_ONLY_FEATURES:
            assert await has_entitlement(MOCK_UID, feat) is False

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_unknown_feature_returns_false(self, mock_get_sub):
        mock_get_sub.return_value = {"entitlements": sorted(MAX_FEATURES)}
        assert await has_entitlement(MOCK_UID, "nonexistent_feature") is False


# ---------------------------------------------------------------------------
# get_user_entitlements
# ---------------------------------------------------------------------------

class TestGetUserEntitlements:
    """get_user_entitlements returns the set from the entitlements column."""

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_returns_set_from_column(self, mock_get_sub):
        mock_get_sub.return_value = {
            "entitlements": ["morning_report_email", "weekly_report_email"],
        }
        result = await get_user_entitlements(MOCK_UID)
        assert result == {"morning_report_email", "weekly_report_email"}
        assert isinstance(result, set)

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_no_subscription_returns_empty(self, mock_get_sub):
        mock_get_sub.return_value = None
        assert await get_user_entitlements(MOCK_UID) == set()

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_empty_entitlements_returns_empty(self, mock_get_sub):
        """No fallback — empty column returns empty set regardless of plan."""
        mock_get_sub.return_value = {
            "entitlements": [],
            "plan": "max",
            "status": "active",
        }
        assert await get_user_entitlements(MOCK_UID) == set()

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_null_entitlements_returns_empty(self, mock_get_sub):
        mock_get_sub.return_value = {"entitlements": None}
        assert await get_user_entitlements(MOCK_UID) == set()

    @pytest.mark.asyncio
    @patch("app.features.payment.db.get_subscription", new_callable=AsyncMock)
    async def test_full_max_returns_all_features(self, mock_get_sub):
        mock_get_sub.return_value = {"entitlements": sorted(MAX_FEATURES)}
        result = await get_user_entitlements(MOCK_UID)
        assert result == MAX_FEATURES
        # Pro (7) + Max-only (3: watchlist_extended, screener_access, portfolio_management) = 10
        assert len(result) == 10
