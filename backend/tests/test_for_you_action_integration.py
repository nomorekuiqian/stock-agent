"""Integration-ish test: digest dict in → action bar out, with DB calls mocked."""

import pytest
from unittest.mock import AsyncMock, patch

from app.features.portfolio.models import HoldingView, ProfileView


@pytest.mark.asyncio
async def test_end_to_end_agent_driven_bar_with_valid_action():
    from app.features.for_you.service import build_action_bar

    holdings = [
        HoldingView(
            symbol="NVDA",
            effective_weight_pct=60,
            weight_source="cost_basis",
        ),
        HoldingView(
            symbol="AAPL",
            effective_weight_pct=40,
            weight_source="cost_basis",
        ),
    ]
    # NVDA lacks thesis; AAPL has one
    holdings[0].thesis = None
    holdings[1].thesis = "Consumer cycle"

    digest_data = {
        "action_items": [
            {"label": "补 NVDA 论点", "target": "thesis:NVDA", "reason": "...", "priority": 1},
            {"label": "回看 4/21", "target": "digest:2026-04-21", "reason": "...", "priority": 2},
            {"label": "买入 NVDA", "target": "buy:NVDA", "reason": "junk", "priority": 1},
        ],
        "portfolio_summary": "组合涨 1.4%，NVDA 领涨",
    }

    async def fake_resolve(user_id, date):
        return "uuid-421" if date == "2026-04-21" else None

    # Round2 hardening: previous_digest_dates is no longer read from
    # digest_data (the field was never persisted). The whitelist is now
    # derived exclusively from list_user_digests, so the mock must surface
    # the digest date here.
    with patch(
        "app.features.portfolio.db.get_profile",
        new=AsyncMock(
            return_value=ProfileView(
                user_id="u",
                style="passive",
                horizon="long",
                risk_tolerance="moderate",
            )
        ),
    ), patch(
        "app.features.brew.db.get_user_watchlist",
        new=AsyncMock(return_value={"symbols": []}),
    ), patch(
        "app.features.brew.db.resolve_digest_id_by_date",
        new=fake_resolve,
    ), patch(
        "app.features.brew.db.list_user_digests",
        new=AsyncMock(return_value=[{"digest_date": "2026-04-21"}]),
    ):
        bar = await build_action_bar(
            "user-1",
            digest_data=digest_data,
            holdings=holdings,
        )

    assert bar.visibility == "visible"
    assert bar.headline == "组合涨 1.4%，NVDA 领涨"
    targets = [c.target for c in bar.chips]
    assert "thesis:NVDA" in targets
    assert "digest:uuid-421" in targets
    # buy:NVDA invalid → dropped
    assert all(not t.startswith("buy:") for t in targets)


@pytest.mark.asyncio
async def test_end_to_end_hidden_when_silent_day():
    from app.features.for_you.service import build_action_bar

    with patch(
        "app.features.portfolio.db.get_profile",
        new=AsyncMock(
            return_value=ProfileView(
                user_id="u",
                style="passive",
                horizon="long",
                risk_tolerance="moderate",
            )
        ),
    ), patch(
        "app.features.brew.db.get_user_watchlist",
        new=AsyncMock(return_value={"symbols": []}),
    ), patch(
        "app.features.brew.db.list_user_digests",
        new=AsyncMock(return_value=[]),
    ):
        bar = await build_action_bar(
            "user-1",
            digest_data={"action_items": [], "portfolio_summary": ""},
            holdings=[],
        )

    assert bar.visibility == "hidden"
