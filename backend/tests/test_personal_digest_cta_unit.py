"""
Unit tests for personal digest email CTA + tier routing.

Verifies:
- get_personal_digest_cta_section returns empty for "paid", non-empty HTML for "upsell"
- Upsell HTML contains both Pro and Max subscribe buttons + price points
- format_digest_html injects the CTA only when cta_variant != "paid"
- Tier classification helper picks correct variant from sub state

No network. Pure HTML rendering checks.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_personal_digest_cta_unit.py -v
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.features.subscription.cta_tier import is_real_paid_sub
from app.features.subscription.email_templates import (
    format_digest_html,
    get_personal_digest_cta_section,
)


class TestGetPersonalDigestCtaSection:
    def test_paid_variant_renders_empty(self):
        assert get_personal_digest_cta_section("paid") == ""

    def test_upsell_variant_renders_html(self):
        html = get_personal_digest_cta_section("upsell")
        assert isinstance(html, str)
        assert len(html) > 500

    def test_upsell_contains_both_tier_upgrade_buttons(self):
        html = get_personal_digest_cta_section("upsell")
        assert "升级 Pro" in html
        assert "升级 Max" in html

    def test_upsell_contains_price_points(self):
        html = get_personal_digest_cta_section("upsell")
        assert "$4.99" in html
        assert "$9.99" in html

    def test_upsell_links_to_pricing_page(self):
        html = get_personal_digest_cta_section("upsell")
        assert "/pricing" in html
        assert html.count("/pricing") >= 2

    def test_upsell_avoids_negative_framing(self):
        """Aspirational framing — never tell the reader what they have is
        a degraded / simplified version. Negative framing tanks retention."""
        html = get_personal_digest_cta_section("upsell")
        for forbidden in ("简化版", "低质量", "粗糙"):
            assert forbidden not in html, f"negative framing leaked: {forbidden}"

    def test_upsell_lists_four_specific_upgrade_features(self):
        """The four upgrade benefits anchor the entire CTA — must show up."""
        html = get_personal_digest_cta_section("upsell")
        for feature in ("更高级的模型", "更深度的推理", "持仓监控", "事件提醒"):
            assert feature in html, f"missing required feature mention: {feature}"

    def test_upsell_does_not_name_specific_model(self):
        """Don't pin the upgrade promise to a specific provider/version
        (it changes faster than this template). Use generic '更高级的模型'."""
        html = get_personal_digest_cta_section("upsell")
        for forbidden in ("Gemini 3.1 Pro", "Gemini Pro", "GPT-", "Claude"):
            assert forbidden not in html, f"specific model name leaked: {forbidden}"

    def test_upsell_omits_non_differentiator_features(self):
        """Watchlist size is the same across tiers; 盘前早报 and 宏观周报 are
        separate products with their own CTAs. None of these belong here."""
        html = get_personal_digest_cta_section("upsell")
        assert "25 只" not in html
        assert "盘前早报" not in html
        assert "宏观周报" not in html

    def test_upsell_max_card_is_recommended(self):
        """Max is the recommended tier — that's the conversion target."""
        html = get_personal_digest_cta_section("upsell")
        recommended_idx = html.find("推荐")
        max_card_idx = html.find('<!-- Max card')
        pro_card_idx = html.find('<!-- Pro card')
        assert recommended_idx > 0
        assert max_card_idx > 0
        assert pro_card_idx > 0
        # 推荐 badge sits inside the Max card, which appears first in source.
        assert max_card_idx < recommended_idx < pro_card_idx


class TestFormatDigestHtmlCtaInjection:
    @pytest.fixture
    def minimal_data(self):
        return {
            "greeting": "2026-05-09 | 测试问候",
            "one_line_summary": "测试一句话总结",
            "stocks": [],
            "news": {"headlines": [], "briefs": []},
            "events": [],
            "summary": {},
        }

    def test_paid_default_omits_cta(self, minimal_data):
        html = format_digest_html(minimal_data, "测试用户")
        assert "订阅 Pro" not in html
        assert "订阅 Max" not in html

    def test_upsell_variant_includes_cta(self, minimal_data):
        html = format_digest_html(minimal_data, "测试用户", cta_variant="upsell")
        assert "升级 Pro" in html
        assert "升级 Max" in html

    def test_upsell_appends_around_6kb(self, minimal_data):
        """The upsell CTA block should add a meaningful chunk of HTML — sanity
        check that we're not silently dropping it (e.g. via stale early return)."""
        paid = format_digest_html(minimal_data, "测试用户", cta_variant="paid")
        upsell = format_digest_html(minimal_data, "测试用户", cta_variant="upsell")
        delta = len(upsell) - len(paid)
        assert delta > 4000, f"upsell only added {delta} chars; CTA likely missing"


@pytest.mark.asyncio
class TestFilterActiveSubscribersFailOpen:
    """Regression tests for the fail-open paths in `_filter_active_subscribers`.

    Codex flagged that an Insforge outage could cause real paying users to
    be marked `_is_real_paid=False` and therefore receive the upsell CTA.
    The fix defaults to `True` (no upsell) whenever classification fails.

    These tests pin that invariant so the bug cannot regress.
    """

    async def test_rpc_exception_defaults_users_to_paid(self):
        from app.features.subscription import email_service

        entitled = [{"user_id": "u1", "email": "a@x.com"}, {"user_id": "u2", "email": "b@x.com"}]
        with patch(
            "app.core.database.get_insforge_service",
            side_effect=RuntimeError("insforge down"),
        ):
            result = await email_service._filter_active_subscribers(entitled)

        assert len(result) == 2
        for u in result:
            assert u["_is_real_paid"] is True, (
                f"RPC failure must default to paid (no upsell), got {u}"
            )

    async def test_non_success_response_defaults_users_to_paid(self):
        from app.features.subscription import email_service

        entitled = [{"user_id": "u1", "email": "a@x.com"}]
        fake_service = MagicMock()
        fake_service.call_function = AsyncMock(
            return_value={"data": {"success": False, "error": "boom"}}
        )
        with patch("app.core.database.get_insforge_service", return_value=fake_service):
            result = await email_service._filter_active_subscribers(entitled)

        assert len(result) == 1
        assert result[0]["_is_real_paid"] is True

    async def test_user_missing_from_list_all_defaults_to_paid(self):
        """User is in entitled_users but list_all has no row for them.
        Don't upsell — they are entitled, so they paid for it."""
        from app.features.subscription import email_service

        entitled = [{"user_id": "ghost", "email": "ghost@x.com"}]
        # list_all returns success but no record for "ghost"
        fake_service = MagicMock()
        fake_service.call_function = AsyncMock(
            return_value={"data": {"success": True, "data": []}}
        )
        with patch("app.core.database.get_insforge_service", return_value=fake_service):
            result = await email_service._filter_active_subscribers(entitled)

        assert len(result) == 1
        assert result[0]["_is_real_paid"] is True

    async def test_annotate_default_paid_overrides_preexisting_false(self):
        """Defensive: even if upstream somehow set _is_real_paid=False, the
        fail-open helper must overwrite to True. Pins down that we use
        direct assignment, not setdefault."""
        from app.features.subscription import email_service

        # Pre-poison the input with False to simulate a bad upstream caller
        entitled = [{"user_id": "u1", "email": "a@x.com", "_is_real_paid": False}]
        with patch(
            "app.core.database.get_insforge_service",
            side_effect=RuntimeError("insforge down"),
        ):
            result = await email_service._filter_active_subscribers(entitled)

        assert result[0]["_is_real_paid"] is True

    async def test_real_paid_user_classified_correctly(self):
        """Sanity: when classification succeeds, real paid stays paid."""
        from app.features.subscription import email_service

        entitled = [{"user_id": "paid_user", "email": "p@x.com"}]
        fake_service = MagicMock()
        fake_service.call_function = AsyncMock(
            return_value={
                "data": {
                    "success": True,
                    "data": [{
                        "user_id": "paid_user",
                        "is_lifetime": False,
                        "entitlements": ["personal_digest_email"],
                        "access_expires_at": None,
                    }],
                }
            },
        )
        with patch("app.core.database.get_insforge_service", return_value=fake_service):
            result = await email_service._filter_active_subscribers(entitled)

        assert len(result) == 1
        assert result[0]["_is_real_paid"] is True

    async def test_trial_user_classified_correctly(self):
        """Sanity: trial users (with access_expires_at in the future) get
        `_is_real_paid=False`, which routes to upsell."""
        from app.features.subscription import email_service

        future = "2099-12-31T00:00:00Z"
        entitled = [{"user_id": "trial_user", "email": "t@x.com"}]
        fake_service = MagicMock()
        fake_service.call_function = AsyncMock(
            return_value={
                "data": {
                    "success": True,
                    "data": [{
                        "user_id": "trial_user",
                        "is_lifetime": False,
                        "entitlements": ["personal_digest_email"],
                        "access_expires_at": future,
                    }],
                }
            },
        )
        with patch("app.core.database.get_insforge_service", return_value=fake_service):
            result = await email_service._filter_active_subscribers(entitled)

        assert len(result) == 1
        assert result[0]["_is_real_paid"] is False


class TestTierClassification:
    """Verifies cta_tier.is_real_paid_sub matches our intended variant routing.

    The broadcast loop uses:
        cta_variant = "paid" if is_real_paid_sub(sub) else "upsell"
    so this test pins down the inverse expectation (trial / free -> upsell).
    """

    def test_lifetime_user_is_paid(self):
        assert is_real_paid_sub({"is_lifetime": True}) is True

    def test_paid_no_expiry_is_paid(self):
        sub = {"entitlements": ["personal_digest_email"], "access_expires_at": None}
        assert is_real_paid_sub(sub) is True

    def test_trial_with_expiry_is_not_paid_so_gets_upsell(self):
        sub = {
            "entitlements": ["personal_digest_email"],
            "access_expires_at": "2026-12-31T00:00:00Z",
        }
        assert is_real_paid_sub(sub) is False

    def test_no_entitlements_is_not_paid(self):
        assert is_real_paid_sub({"entitlements": []}) is False

    def test_none_sub_is_not_paid(self):
        assert is_real_paid_sub(None) is False
