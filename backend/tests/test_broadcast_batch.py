"""
Unit tests for broadcast_personal_digests batch send architecture.

Verifies the two-phase flow:
  Phase 1: parallel generation (digest + HTML + DB save)
  Phase 2: batch send via resend.Batch.send()

All external dependencies are mocked - no emails sent, no AI calls, no DB writes.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_broadcast_batch.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def email_svc():
    """Create an EmailService with a fake API key (no real Resend calls)."""
    from app.features.subscription.email_service import EmailService

    svc = EmailService.__new__(EmailService)
    svc.api_key = "test-key"
    svc.from_email = "test@themarketbrew.com"
    svc.from_email_morning = "TheMarketBrew Morning <morning@themarketbrew.com>"
    svc.frontend_url = "https://themarketbrew.com"
    svc.logo_url = "https://themarketbrew.com/logo-avatar.png"
    svc.is_production = True
    return svc


def _make_subscribers(n: int) -> list[dict]:
    """Generate n fake subscriber dicts."""
    return [
        {
            "email": f"user{i}@example.com",
            "metadata": {
                "first_name": f"User{i}",
                "user_id": f"uid-{i}",
            },
        }
        for i in range(n)
    ]


def _mock_digest_result(success: bool = True) -> dict:
    """Return a fake digest generation result."""
    if not success:
        return {"success": False, "error": "Generation failed"}
    return {
        "success": True,
        "timestamp": "2025-01-24T23:00:00Z",
        "symbols_used": ["AAPL"],
        "greeting": "Hello",
        "one_line_summary": "AAPL up 2%",
        "stocks": [{"symbol": "AAPL", "price": 192.5}],
        "news": {},
        "events": [],
        "summary": {},
    }


class TestBroadcastBatchFlow:
    """Test the two-phase broadcast_personal_digests flow."""

    @pytest.mark.asyncio
    async def test_batch_send_called_instead_of_individual(self, email_svc):
        """
        With 3 subscribers, resend.Batch.send should be called once (not 3 individual sends).
        resend.Emails.send should NOT be called at all.
        """
        subscribers = _make_subscribers(3)

        mock_digest_agent = MagicMock()
        mock_digest_agent.generate = AsyncMock(return_value=_mock_digest_result())

        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": subscribers,
        }

        with (
            patch(
                "app.features.subscription.email_service.get_subscription_service",
                return_value=mock_sub_service,
            ),
            patch(
                "app.features.brew.agent.get_personal_digest",
                return_value=mock_digest_agent,
            ),
            patch(
                "app.features.subscription.email_service.get_user_watchlist",
                new_callable=AsyncMock,
                return_value={"symbols": ["AAPL"]},
            ),
            patch("app.features.subscription.email_service.resend") as mock_resend,
        ):
            mock_resend.Batch.send.return_value = {
                "data": [{"id": f"email-{i}"} for i in range(3)],
            }

            result = await email_svc.broadcast_personal_digests(max_concurrent=5)

        assert result["success"] is True
        assert result["sent"] == 3
        assert result["failed"] == 0

        # Batch.send called exactly once (3 emails < 100 batch size)
        mock_resend.Batch.send.assert_called_once()

        # Emails.send should NOT have been called
        mock_resend.Emails.send.assert_not_called()

        # Verify the batch payload has 3 email params
        batch_args = mock_resend.Batch.send.call_args[0][0]
        assert len(batch_args) == 3
        for params in batch_args:
            assert params["from"] == "test@themarketbrew.com"
            assert len(params["to"]) == 1
            assert "html" in params
            assert "subject" in params

    @pytest.mark.asyncio
    async def test_generation_failure_recovered_by_internal_retry(self, email_svc):
        """
        If digest generation fails on first attempt but succeeds on internal retry
        within process_subscriber, the subscriber is included in the batch send.
        """
        subscribers = _make_subscribers(3)

        call_count = 0

        async def generate_side_effect(symbols):
            nonlocal call_count
            call_count += 1
            # Fail on calls 2 and 4 (first attempts for subscriber 1 and 2)
            # Internal retry (calls 3 and 5) succeeds
            if call_count in (2, 4):
                return _mock_digest_result(success=False)
            return _mock_digest_result()

        mock_digest_agent = MagicMock()
        mock_digest_agent.generate = AsyncMock(side_effect=generate_side_effect)

        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": subscribers,
        }

        with (
            patch(
                "app.features.subscription.email_service.get_subscription_service",
                return_value=mock_sub_service,
            ),
            patch(
                "app.features.brew.agent.get_personal_digest",
                return_value=mock_digest_agent,
            ),
            patch(
                "app.features.subscription.email_service.get_user_watchlist",
                new_callable=AsyncMock,
                return_value={"symbols": ["AAPL"]},
            ),
            patch("app.features.subscription.email_service.resend") as mock_resend,
            patch(
                "app.features.subscription.email_service.asyncio.sleep",
                new_callable=AsyncMock,
            ),
        ):
            mock_resend.Batch.send.return_value = {
                "data": [{"id": "email-0"}],
            }

            result = await email_svc.broadcast_personal_digests(max_concurrent=5)

        assert result["success"] is True
        # Internal retry recovers both failed subscribers, all 3 sent
        assert result["sent"] == 3
        assert result["failed"] == 0

    @pytest.mark.asyncio
    async def test_phase3_retries_persistent_failures(self, email_svc):
        """
        Phase 3 auto-retry: if a subscriber fails BOTH Phase 1 attempts,
        Phase 3 retries after delay and recovers them.
        Uses 1 subscriber to ensure deterministic call ordering.
        """
        subscribers = _make_subscribers(1)

        call_count = 0

        async def generate_side_effect(symbols):
            nonlocal call_count
            call_count += 1
            # Fail first 2 calls (Phase 1: first attempt + internal retry)
            # Succeed on call 3 (Phase 3 retry)
            if call_count <= 2:
                return _mock_digest_result(success=False)
            return _mock_digest_result()

        mock_digest_agent = MagicMock()
        mock_digest_agent.generate = AsyncMock(side_effect=generate_side_effect)

        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": subscribers,
        }

        with (
            patch(
                "app.features.subscription.email_service.get_subscription_service",
                return_value=mock_sub_service,
            ),
            patch(
                "app.features.brew.agent.get_personal_digest",
                return_value=mock_digest_agent,
            ),
            patch(
                "app.features.subscription.email_service.get_user_watchlist",
                new_callable=AsyncMock,
                return_value={"symbols": ["AAPL"]},
            ),
            patch("app.features.subscription.email_service.resend") as mock_resend,
            patch(
                "app.features.subscription.email_service.asyncio.sleep",
                new_callable=AsyncMock,
            ),
        ):
            mock_resend.Batch.send.return_value = {
                "data": [{"id": "email-0"}],
            }

            result = await email_svc.broadcast_personal_digests(max_concurrent=5)

        assert result["success"] is True
        # Phase 3 recovered the subscriber
        assert result["sent"] == 1
        assert result["failed"] == 0
        # Batch.send called twice: Phase 2 (0 emails, skipped) + Phase 3 (1 recovered)
        # Actually Phase 2 with 0 emails doesn't call Batch.send, so only 1 call from Phase 3
        assert mock_resend.Batch.send.call_count == 1

    @pytest.mark.asyncio
    async def test_no_symbols_skipped(self, email_svc):
        """Subscribers with no watchlist symbols are skipped (not sent)."""
        subscribers = _make_subscribers(2)

        mock_digest_agent = MagicMock()
        mock_digest_agent.generate = AsyncMock(return_value=_mock_digest_result())

        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": subscribers,
        }

        async def watchlist_side_effect(user_id):
            # Only first user has symbols
            if user_id == "uid-0":
                return {"symbols": ["AAPL"]}
            return None

        with (
            patch(
                "app.features.subscription.email_service.get_subscription_service",
                return_value=mock_sub_service,
            ),
            patch(
                "app.features.brew.agent.get_personal_digest",
                return_value=mock_digest_agent,
            ),
            patch(
                "app.features.subscription.email_service.get_user_watchlist",
                new_callable=AsyncMock,
                side_effect=watchlist_side_effect,
            ),
            patch("app.features.subscription.email_service.resend") as mock_resend,
        ):
            mock_resend.Batch.send.return_value = {
                "data": [{"id": "email-0"}],
            }

            result = await email_svc.broadcast_personal_digests(max_concurrent=5)

        assert result["success"] is True
        assert result["sent"] == 1
        assert result["failed"] == 1  # uid-1 has no symbols

        batch_args = mock_resend.Batch.send.call_args[0][0]
        assert len(batch_args) == 1
        assert batch_args[0]["to"] == ["user0@example.com"]

    @pytest.mark.asyncio
    async def test_batch_chunking_over_100(self, email_svc):
        """
        With 150 subscribers, resend.Batch.send should be called twice:
        first chunk of 100, second chunk of 50.
        """
        subscribers = _make_subscribers(150)

        mock_digest_agent = MagicMock()
        mock_digest_agent.generate = AsyncMock(return_value=_mock_digest_result())

        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": subscribers,
        }

        with (
            patch(
                "app.features.subscription.email_service.get_subscription_service",
                return_value=mock_sub_service,
            ),
            patch(
                "app.features.brew.agent.get_personal_digest",
                return_value=mock_digest_agent,
            ),
            patch(
                "app.features.subscription.email_service.get_user_watchlist",
                new_callable=AsyncMock,
                return_value={"symbols": ["AAPL"]},
            ),
            patch("app.features.subscription.email_service.resend") as mock_resend,
            patch("time.sleep"),
        ):
            # Return matching number of IDs for each batch
            mock_resend.Batch.send.side_effect = [
                {"data": [{"id": f"e-{i}"} for i in range(100)]},
                {"data": [{"id": f"e-{i}"} for i in range(50)]},
            ]

            result = await email_svc.broadcast_personal_digests(max_concurrent=10)

        assert result["success"] is True
        assert result["sent"] == 150
        assert result["failed"] == 0

        # Batch.send called twice
        assert mock_resend.Batch.send.call_count == 2

        # First chunk: 100, second chunk: 50
        first_batch = mock_resend.Batch.send.call_args_list[0][0][0]
        second_batch = mock_resend.Batch.send.call_args_list[1][0][0]
        assert len(first_batch) == 100
        assert len(second_batch) == 50

    @pytest.mark.asyncio
    async def test_batch_send_rate_limit_retry(self, email_svc):
        """
        If resend.Batch.send hits rate limit, it retries with backoff.
        """
        subscribers = _make_subscribers(2)

        mock_digest_agent = MagicMock()
        mock_digest_agent.generate = AsyncMock(return_value=_mock_digest_result())

        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": subscribers,
        }

        with (
            patch(
                "app.features.subscription.email_service.get_subscription_service",
                return_value=mock_sub_service,
            ),
            patch(
                "app.features.brew.agent.get_personal_digest",
                return_value=mock_digest_agent,
            ),
            patch(
                "app.features.subscription.email_service.get_user_watchlist",
                new_callable=AsyncMock,
                return_value={"symbols": ["AAPL"]},
            ),
            patch("app.features.subscription.email_service.resend") as mock_resend,
            patch("time.sleep"),
        ):
            # First call raises rate limit, second succeeds
            mock_resend.Batch.send.side_effect = [
                Exception("Too many requests"),
                {"data": [{"id": "e-0"}, {"id": "e-1"}]},
            ]

            result = await email_svc.broadcast_personal_digests(max_concurrent=5)

        assert result["success"] is True
        assert result["sent"] == 2
        assert mock_resend.Batch.send.call_count == 2

    @pytest.mark.asyncio
    async def test_batch_send_permanent_failure(self, email_svc):
        """
        If batch send fails with non-rate-limit error, all emails in chunk are failed.
        """
        subscribers = _make_subscribers(2)

        mock_digest_agent = MagicMock()
        mock_digest_agent.generate = AsyncMock(return_value=_mock_digest_result())

        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": subscribers,
        }

        with (
            patch(
                "app.features.subscription.email_service.get_subscription_service",
                return_value=mock_sub_service,
            ),
            patch(
                "app.features.brew.agent.get_personal_digest",
                return_value=mock_digest_agent,
            ),
            patch(
                "app.features.subscription.email_service.get_user_watchlist",
                new_callable=AsyncMock,
                return_value={"symbols": ["AAPL"]},
            ),
            patch("app.features.subscription.email_service.resend") as mock_resend,
        ):
            mock_resend.Batch.send.side_effect = Exception("Server error")

            result = await email_svc.broadcast_personal_digests(max_concurrent=5)

        assert result["success"] is True
        assert result["sent"] == 0
        assert result["failed"] == 2
        assert any("Server error" in e.get("error", "") for e in result["errors"])

    @pytest.mark.asyncio
    async def test_empty_subscribers(self, email_svc):
        """No subscribers returns early with zero counts."""
        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": [],
        }

        with patch(
            "app.features.subscription.email_service.get_subscription_service",
            return_value=mock_sub_service,
        ):
            result = await email_svc.broadcast_personal_digests()

        assert result["success"] is True
        assert result["total"] == 0
        assert result["sent"] == 0

    @pytest.mark.asyncio
    async def test_email_params_format(self, email_svc):
        """Verify email params contain correct from/to/subject/html fields."""
        subscribers = _make_subscribers(1)

        mock_digest_agent = MagicMock()
        mock_digest_agent.generate = AsyncMock(return_value=_mock_digest_result())

        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": subscribers,
        }

        with (
            patch(
                "app.features.subscription.email_service.get_subscription_service",
                return_value=mock_sub_service,
            ),
            patch(
                "app.features.brew.agent.get_personal_digest",
                return_value=mock_digest_agent,
            ),
            patch(
                "app.features.subscription.email_service.get_user_watchlist",
                new_callable=AsyncMock,
                return_value={"symbols": ["AAPL"]},
            ),
            patch("app.features.subscription.email_service.resend") as mock_resend,
        ):
            mock_resend.Batch.send.return_value = {"data": [{"id": "e-0"}]}

            await email_svc.broadcast_personal_digests(max_concurrent=5)

        params = mock_resend.Batch.send.call_args[0][0][0]
        assert params["from"] == "test@themarketbrew.com"
        assert params["to"] == ["user0@example.com"]
        assert "TheMarketBrew" in params["subject"]
        assert "AAPL up 2%" in params["subject"]
        assert "<html" in params["html"]
        # {{{email}}} template variable should be replaced
        assert "{{{email}}}" not in params["html"]

    @pytest.mark.asyncio
    async def test_db_save_called_for_each_subscriber(self, email_svc):
        """DB save is called for each successful generation (before batch send)."""
        subscribers = _make_subscribers(2)

        mock_digest_agent = MagicMock()
        mock_digest_agent.generate = AsyncMock(return_value=_mock_digest_result())

        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": subscribers,
        }

        with (
            patch(
                "app.features.subscription.email_service.get_subscription_service",
                return_value=mock_sub_service,
            ),
            patch(
                "app.features.brew.agent.get_personal_digest",
                return_value=mock_digest_agent,
            ),
            patch(
                "app.features.subscription.email_service.get_user_watchlist",
                new_callable=AsyncMock,
                return_value={"symbols": ["AAPL"]},
            ),
            patch(
                "app.features.subscription.email_service.save_user_digest",
                new_callable=AsyncMock,
            ) as mock_save,
            patch("app.features.subscription.email_service.resend") as mock_resend,
        ):
            mock_resend.Batch.send.return_value = {
                "data": [{"id": "e-0"}, {"id": "e-1"}],
            }

            await email_svc.broadcast_personal_digests(max_concurrent=5)

        # save_user_digest called once per subscriber
        assert mock_save.call_count == 2


class TestBroadcastBatchEdgeCases:
    """Edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_no_api_key(self):
        """Missing API key returns error immediately."""
        from app.features.subscription.email_service import EmailService

        svc = EmailService.__new__(EmailService)
        svc.api_key = None

        result = await svc.broadcast_personal_digests()
        assert result["success"] is False
        assert "RESEND_API_KEY" in result["error"]

    @pytest.mark.asyncio
    async def test_subscriber_list_failure(self, email_svc):
        """Subscriber listing failure returns error."""
        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": False,
            "error": "DB connection failed",
        }

        with patch(
            "app.features.subscription.email_service.get_subscription_service",
            return_value=mock_sub_service,
        ):
            result = await email_svc.broadcast_personal_digests()

        assert result["success"] is False
        assert "DB connection failed" in result["error"]

    @pytest.mark.asyncio
    async def test_batch_validation_errors_counted(self, email_svc):
        """Batch validation errors from Resend are counted as failures."""
        subscribers = _make_subscribers(3)

        mock_digest_agent = MagicMock()
        mock_digest_agent.generate = AsyncMock(return_value=_mock_digest_result())

        mock_sub_service = MagicMock()
        mock_sub_service.list_subscribers.return_value = {
            "success": True,
            "subscribers": subscribers,
        }

        with (
            patch(
                "app.features.subscription.email_service.get_subscription_service",
                return_value=mock_sub_service,
            ),
            patch(
                "app.features.brew.agent.get_personal_digest",
                return_value=mock_digest_agent,
            ),
            patch(
                "app.features.subscription.email_service.get_user_watchlist",
                new_callable=AsyncMock,
                return_value={"symbols": ["AAPL"]},
            ),
            patch("app.features.subscription.email_service.resend") as mock_resend,
        ):
            # 2 succeed, 1 has validation error
            mock_resend.Batch.send.return_value = {
                "data": [{"id": "e-0"}, {"id": "e-2"}],
                "errors": [{"index": 1, "message": "Invalid email address"}],
            }

            result = await email_svc.broadcast_personal_digests(max_concurrent=5)

        assert result["sent"] == 2
        assert result["failed"] == 1
        assert any("Invalid email" in e.get("error", "") for e in result["errors"])
