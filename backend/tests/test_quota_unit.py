"""
Quota Service Unit Tests -- generated from git diff

Tests for:
  - app.features.quota.service.check_quota
  - app.features.quota.service.consume_quota
  - app.features.quota.service._make_identifier
  - app.features.quota.service._is_max_user
  - app.core.deps.optional_user_token

No network, no database. All external calls mocked.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_quota_unit.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.features.quota.service import (
    check_quota,
    consume_quota,
    _make_identifier,
    DAILY_LIMIT,
)


class TestMakeIdentifier:
    """Tests for _make_identifier: build quota tracking key."""

    def test_logged_in_user_uses_user_id(self):
        """Logged-in user gets identifier based on user_id."""
        ident, ident_type = _make_identifier("user-123", "1.2.3.4")
        assert ident == "user-123"
        assert ident_type == "user"

    def test_anonymous_user_uses_ip(self):
        """Anonymous user gets identifier based on IP."""
        ident, ident_type = _make_identifier(None, "203.0.113.50")
        assert ident == "ip:203.0.113.50"
        assert ident_type == "ip"

    def test_anonymous_no_ip_uses_unknown(self):
        """Anonymous user with no IP gets 'ip:unknown'."""
        ident, ident_type = _make_identifier(None, None)
        assert ident == "ip:unknown"
        assert ident_type == "ip"

    def test_user_id_takes_precedence_over_ip(self):
        """When both user_id and IP are provided, user_id wins."""
        ident, _ = _make_identifier("user-abc", "10.0.0.1")
        assert ident == "user-abc"


class TestCheckQuota:
    """Tests for check_quota: read-only quota check."""

    @pytest.mark.asyncio
    @patch("app.features.quota.service._is_max_user", new_callable=AsyncMock, return_value=True)
    async def test_max_user_is_unlimited(self, mock_max):
        """Max subscriber gets unlimited access."""
        result = await check_quota("user-max", "1.2.3.4")
        assert result["unlimited"] is True
        assert result["allowed"] is True

    @pytest.mark.asyncio
    @patch("app.features.quota.service._is_max_user", new_callable=AsyncMock, return_value=False)
    @patch("app.features.quota.service.get_usage", new_callable=AsyncMock, return_value=0)
    async def test_fresh_user_has_full_quota(self, mock_usage, mock_max):
        """User with no usage today has full quota."""
        result = await check_quota("user-free", "1.2.3.4")
        assert result["allowed"] is True
        assert result["remaining"] == DAILY_LIMIT
        assert result["used"] == 0
        assert result["unlimited"] is False

    @pytest.mark.asyncio
    @patch("app.features.quota.service._is_max_user", new_callable=AsyncMock, return_value=False)
    @patch("app.features.quota.service.get_usage", new_callable=AsyncMock, return_value=DAILY_LIMIT)
    async def test_exhausted_quota_denied(self, mock_usage, mock_max):
        """User who hit the limit is denied."""
        result = await check_quota("user-free", "1.2.3.4")
        assert result["allowed"] is False
        assert result["remaining"] == 0

    @pytest.mark.asyncio
    @patch("app.features.quota.service.get_usage", new_callable=AsyncMock, return_value=3)
    async def test_anonymous_quota_check(self, mock_usage):
        """Anonymous user quota check uses IP-based identifier."""
        result = await check_quota(None, "203.0.113.50")
        assert result["allowed"] is True
        assert result["remaining"] == DAILY_LIMIT - 3
        mock_usage.assert_called_once()
        call_args = mock_usage.call_args[0]
        assert call_args[0] == "ip:203.0.113.50"


class TestConsumeQuota:
    """Tests for consume_quota: check and decrement."""

    @pytest.mark.asyncio
    @patch("app.features.quota.service._is_max_user", new_callable=AsyncMock, return_value=True)
    async def test_max_user_skips_tracking(self, mock_max):
        """Max user doesn't consume or check usage."""
        result = await consume_quota("user-max", "1.2.3.4")
        assert result["allowed"] is True
        assert result["unlimited"] is True

    @pytest.mark.asyncio
    @patch("app.features.quota.service._is_max_user", new_callable=AsyncMock, return_value=False)
    @patch("app.features.quota.service.get_usage", new_callable=AsyncMock, return_value=0)
    @patch("app.features.quota.service.increment_usage", new_callable=AsyncMock, return_value=1)
    async def test_consume_increments_count(self, mock_incr, mock_usage, mock_max):
        """Successful consume increments usage count."""
        result = await consume_quota("user-free", "1.2.3.4")
        assert result["allowed"] is True
        assert result["used"] == 1
        assert result["remaining"] == DAILY_LIMIT - 1
        mock_incr.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.features.quota.service._is_max_user", new_callable=AsyncMock, return_value=False)
    @patch("app.features.quota.service.get_usage", new_callable=AsyncMock, return_value=DAILY_LIMIT)
    async def test_consume_denied_when_exhausted(self, mock_usage, mock_max):
        """Consume is denied when daily limit is reached."""
        result = await consume_quota("user-free", "1.2.3.4")
        assert result["allowed"] is False
        assert result["remaining"] == 0

    @pytest.mark.asyncio
    @patch("app.features.quota.service._is_max_user", new_callable=AsyncMock, return_value=False)
    @patch("app.features.quota.service.get_usage", new_callable=AsyncMock, return_value=0)
    @patch("app.features.quota.service.increment_usage", new_callable=AsyncMock, return_value=-1)
    async def test_consume_fails_open_on_db_error(self, mock_incr, mock_usage, mock_max):
        """DB error during increment still allows the request (fail open)."""
        result = await consume_quota("user-free", "1.2.3.4")
        assert result["allowed"] is True


class TestOptionalUserToken:
    """Tests for optional_user_token dependency."""

    @pytest.mark.asyncio
    async def test_no_header_returns_none(self):
        """Missing Authorization header returns None."""
        from app.core.deps import optional_user_token
        result = await optional_user_token(None)
        assert result is None

    @pytest.mark.asyncio
    async def test_invalid_scheme_returns_none(self):
        """Non-Bearer scheme returns None."""
        from app.core.deps import optional_user_token
        result = await optional_user_token("Basic abc123")
        assert result is None

    @pytest.mark.asyncio
    @patch("app.core.deps.verify_user_token", new_callable=AsyncMock, return_value="user-valid")
    async def test_valid_token_returns_user_id(self, mock_verify):
        """Valid Bearer token returns user_id from verify_user_token."""
        from app.core.deps import optional_user_token
        result = await optional_user_token("Bearer valid-token")
        assert result == "user-valid"

    @pytest.mark.asyncio
    async def test_expired_token_returns_none(self):
        """Expired/invalid token returns None instead of raising."""
        from fastapi import HTTPException
        from app.core.deps import optional_user_token
        with patch(
            "app.core.deps.verify_user_token",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=401, detail="expired"),
        ):
            result = await optional_user_token("Bearer expired-token")
            assert result is None
