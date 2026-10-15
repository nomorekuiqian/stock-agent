"""
Unit tests for tier-based routing in brew/agent.PersonalDigest.

Verifies that _resolve_runner_for_user() picks paid runner when the user has
the personal_digest_email entitlement and falls back to free in all other
conditions (no user, missing entitlement, exception, lifetime). The paid/free
runners are intentionally separate even while both tiers temporarily use the
same Flash model.

No real LLM calls; we just check which runner is returned.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_brew_model_routing_unit.py -v
"""

from __future__ import annotations

from unittest.mock import patch, AsyncMock

import pytest

from app.features.brew.agent import (
    PersonalDigest,
    FREE_TIER_MODEL,
    PAID_TIER_MODEL,
    PAID_ENTITLEMENT,
)


@pytest.fixture
def digest():
    return PersonalDigest()


@pytest.mark.asyncio
class TestResolveRunnerForUser:
    async def test_no_user_id_returns_free(self, digest):
        runner, tier, model = await digest._resolve_runner_for_user(None)
        assert runner is digest._runner_free
        assert tier == "free"
        assert model == FREE_TIER_MODEL

    async def test_empty_user_id_returns_free(self, digest):
        runner, tier, model = await digest._resolve_runner_for_user("")
        assert runner is digest._runner_free
        assert tier == "free"

    async def test_paid_entitlement_returns_paid_runner(self, digest):
        with patch(
            "app.features.payment.entitlements.has_entitlement",
            new=AsyncMock(return_value=True),
        ) as mock_check:
            runner, tier, model = await digest._resolve_runner_for_user("user-123")
        assert runner is digest._runner_paid
        assert tier == "paid"
        assert model == PAID_TIER_MODEL
        # Make sure we asked about the right feature
        mock_check.assert_awaited_once_with("user-123", PAID_ENTITLEMENT)

    async def test_no_entitlement_returns_free_runner(self, digest):
        with patch(
            "app.features.payment.entitlements.has_entitlement",
            new=AsyncMock(return_value=False),
        ):
            runner, tier, model = await digest._resolve_runner_for_user("user-456")
        assert runner is digest._runner_free
        assert tier == "free"
        assert model == FREE_TIER_MODEL

    async def test_entitlement_check_exception_falls_back_to_free(self, digest):
        with patch(
            "app.features.payment.entitlements.has_entitlement",
            new=AsyncMock(side_effect=RuntimeError("insforge unreachable")),
        ):
            runner, tier, model = await digest._resolve_runner_for_user("user-789")
        # Must NOT crash digest generation just because entitlement check broke
        assert runner is digest._runner_free
        assert tier == "free"


class TestModuleConstants:
    def test_paid_and_free_models_unified(self):
        assert FREE_TIER_MODEL == PAID_TIER_MODEL == "gemini-3.8-flash"

    def test_paid_entitlement_is_pro_feature(self):
        from app.features.payment.entitlements import PRO_FEATURES
        assert PAID_ENTITLEMENT in PRO_FEATURES

    def test_paid_runner_uses_paid_model(self):
        from app.features.brew.agent import personal_digest_agent_paid
        assert personal_digest_agent_paid.model == PAID_TIER_MODEL

    def test_free_runner_uses_free_model(self):
        from app.features.brew.agent import personal_digest_agent_free
        assert personal_digest_agent_free.model == FREE_TIER_MODEL

    def test_legacy_alias_points_to_free(self):
        from app.features.brew.agent import (
            personal_digest_agent,
            personal_digest_agent_free,
        )
        assert personal_digest_agent is personal_digest_agent_free
