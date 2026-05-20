"""Portfolio health service -- orchestrates scoring, diagnosis, and caching."""

import hashlib
import json
from datetime import datetime, timezone, timedelta

from app.core.logging import get_logger
from app.features.portfolio.models import HoldingView, ProfileView
from app.features.portfolio_health.models import (
    DiagnosisOutput,
    HealthLatestResponse,
    HealthResponse,
    HealthScore,
)
from app.features.portfolio_health import agent, db, scoring
from app.features.portfolio.exposure_parser import get_true_exposure
from app.shared.data_tools._cash_guard import without_cash

logger = get_logger(__name__)


def _compute_cache_key(
    user_id: str, holdings: list[HoldingView], profile_version: int
) -> str:
    """Daily cache key incorporating user, holdings fingerprint, and profile version."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    symbols = sorted(h.symbol for h in holdings)
    weights_hash = hashlib.md5(
        json.dumps(
            [
                round(h.effective_weight_pct * 20) / 20
                for h in sorted(holdings, key=lambda x: x.symbol)
            ]
        ).encode()
    ).hexdigest()[:8]
    return "%s:%s:%s:%s:v%s" % (
        user_id,
        today,
        ",".join(symbols),
        weights_hash,
        profile_version,
    )


async def generate_health_check(
    user_id: str,
    holdings: list[HoldingView],
    profile: ProfileView,
    *,
    force: bool = False,
) -> HealthResponse:
    """Generate or return cached health check."""
    cache_key = _compute_cache_key(user_id, holdings, profile.version)

    # Check cache (unless force)
    if not force:
        cached = await db.get_cached_report(user_id, cache_key)
        if cached:
            return _build_cached_response(cached)

    # Fetch market data
    returns_map, spy_returns, macro_risk, sector_lookup = (
        await _fetch_market_data(holdings)
    )

    # Compute scores
    score = scoring.compute_all(
        holdings,
        returns_map=returns_map,
        spy_returns=spy_returns,
        macro_risk=macro_risk,
        sector_lookup=sector_lookup,
    )

    # Check if first report
    is_first = await db.check_is_first_report(user_id)

    # Build exposure for agent
    exposure = get_true_exposure(holdings, sector_lookup)

    # Holdings summary for agent
    holdings_summary = [
        {
            "symbol": h.symbol,
            "weight": round(h.effective_weight_pct, 1),
            "thesis": h.thesis,
        }
        for h in sorted(
            holdings, key=lambda x: x.effective_weight_pct, reverse=True
        )
    ]

    thesis_map = {h.symbol: h.thesis for h in holdings if h.thesis}

    # Run diagnosis agent
    diagnosis = await agent.run_diagnosis(
        score=score,
        holdings_summary=holdings_summary,
        exposure=exposure,
        profile=profile,
        is_first_report=is_first,
        thesis_map=thesis_map if thesis_map else None,
    )

    generated_at = datetime.now(timezone.utc)

    # Save to DB (best effort)
    report_data = {
        "cache_key": cache_key,
        "generated_at": generated_at.isoformat(),
        "score_total": score.total,
        "score_dispersion": score.dispersion,
        "score_performance": score.performance,
        "score_macro_fit": score.macro_fit,
        "score_stability": score.stability,
        "holdings_snapshot": json.dumps(holdings_summary),
        "profile_snapshot": json.dumps(
            {
                "style": profile.style,
                "horizon": profile.horizon,
                "risk_tolerance": profile.risk_tolerance,
            }
        ),
    }
    if diagnosis:
        report_data.update(
            {
                "diagnosis_markdown": diagnosis.diagnosis_markdown,
                "one_line": diagnosis.one_line,
                "top_risk": diagnosis.top_risk,
                "sector_dna": diagnosis.sector_dna,
                "macro_sensitivity_tag": diagnosis.macro_sensitivity_tag,
                "next_action": json.dumps(diagnosis.next_action.model_dump()),
            }
        )

    report_id = await db.save_report(user_id, report_data)

    # Upsert insights (latest snapshot for brew injection)
    if diagnosis:
        await db.upsert_insights(
            user_id,
            {
                "health_score": score.total,
                "one_line": diagnosis.one_line,
                "top_risk": diagnosis.top_risk,
                "sector_dna": diagnosis.sector_dna,
                "macro_sensitivity_tag": diagnosis.macro_sensitivity_tag,
                "next_action": json.dumps(diagnosis.next_action.model_dump()),
                "source_report_id": report_id,
            },
        )

    return HealthResponse(
        report_id=report_id,
        score=score,
        diagnosis=diagnosis,
        generated_at=generated_at,
        from_cache=False,
        is_first_report=is_first,
    )


def _build_cached_response(cached: dict) -> HealthResponse:
    """Reconstruct HealthResponse from a cached DB row."""
    score = HealthScore(
        dispersion=cached.get("score_dispersion", 12),
        performance=cached.get("score_performance", 12),
        macro_fit=cached.get("score_macro_fit", 12),
        stability=cached.get("score_stability", 12),
        total=cached.get("score_total", 48),
    )
    diagnosis = None
    if cached.get("diagnosis_markdown"):
        try:
            na_raw = cached.get("next_action", {"type": "none", "text": "", "symbols": []})
            if isinstance(na_raw, str):
                na_raw = json.loads(na_raw)
            diagnosis = DiagnosisOutput(
                one_line=cached.get("one_line", ""),
                diagnosis_markdown=cached.get("diagnosis_markdown", ""),
                top_risk=cached.get("top_risk", ""),
                sector_dna=cached.get("sector_dna", ""),
                macro_sensitivity_tag=cached.get("macro_sensitivity_tag", "mid"),
                next_action=na_raw,
            )
        except Exception:
            pass
    generated_at_str = cached.get("generated_at")
    if generated_at_str:
        generated_at = datetime.fromisoformat(
            generated_at_str.replace("Z", "+00:00")
            if isinstance(generated_at_str, str)
            else generated_at_str
        )
    else:
        generated_at = datetime.now(timezone.utc)
    return HealthResponse(
        report_id=cached.get("id"),
        score=score,
        diagnosis=diagnosis,
        generated_at=generated_at,
        from_cache=True,
        is_first_report=False,
    )


async def get_latest(user_id: str) -> HealthLatestResponse:
    """Get latest insights for ActionBar consumption. Lightweight, no generation."""
    data = await db.get_latest_insights(user_id)
    if not data:
        return HealthLatestResponse()

    next_action = None
    na_raw = data.get("next_action")
    if na_raw:
        try:
            from app.features.portfolio_health.models import NextAction

            if isinstance(na_raw, str):
                na_raw = json.loads(na_raw)
            next_action = NextAction(**na_raw)
        except Exception:
            pass

    updated_at = data.get("updated_at")
    stale = False
    if updated_at:
        try:
            dt = (
                datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                if isinstance(updated_at, str)
                else updated_at
            )
            stale = (datetime.now(timezone.utc) - dt) > timedelta(days=14)
        except Exception:
            pass

    return HealthLatestResponse(
        health_score=data.get("health_score"),
        top_risk=data.get("top_risk"),
        next_action=next_action,
        generated_at=(
            datetime.fromisoformat(data["generated_at"].replace("Z", "+00:00"))
            if data.get("generated_at")
            else None
        ),
        stale=stale,
    )


async def _fetch_market_data(
    holdings: list[HoldingView],
) -> tuple[dict, list, dict, dict]:
    """Fetch market data needed for scoring.

    Returns (returns_map, spy_returns, macro_risk, sector_lookup).
    """
    import asyncio

    symbols = without_cash([h.symbol for h in holdings])

    returns_map: dict[str, list[float]] = {}
    spy_returns: list[float] = []
    macro_risk: dict = {}
    sector_lookup: dict[str, str] = {}

    async def fetch_returns():
        nonlocal returns_map, spy_returns
        try:
            from app.shared.data_tools.quotes import get_historical_returns_batch

            all_syms = symbols + ["SPY"]
            result = await asyncio.to_thread(
                get_historical_returns_batch, all_syms, 7
            )
            for sym, rets in result.items():
                if sym == "SPY":
                    spy_returns = rets
                else:
                    returns_map[sym] = rets
        except Exception:
            logger.warning("fetch_returns failed for health check")

    async def fetch_macro():
        nonlocal macro_risk
        try:
            from app.features.macro.risk import service as macro_service

            risk_data = await macro_service.get_macro_risk_dashboard()
            if risk_data and risk_data.get("success"):
                macro_risk = risk_data.get("data", {}).get(
                    "risk_summary", {}
                )
        except Exception:
            logger.warning("fetch_macro_risk failed")

    async def fetch_profiles():
        nonlocal sector_lookup
        try:
            from app.shared.data_tools.fundamentals import get_company_profile

            sem = asyncio.Semaphore(10)

            async def _get_one(sym):
                async with sem:
                    p = await asyncio.to_thread(get_company_profile, sym)
                if p and p.get("sector"):
                    sector_lookup[sym] = p["sector"]

            await asyncio.gather(*[_get_one(sym) for sym in symbols])
        except Exception:
            logger.warning("fetch_profiles failed")

    await asyncio.gather(
        fetch_returns(),
        fetch_macro(),
        fetch_profiles(),
        return_exceptions=True,
    )

    return returns_map, spy_returns, macro_risk, sector_lookup
