"""Business logic for the AI watchlist monitor V0."""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from typing import Any

from app.core.config import WATCHLIST_MONITOR_MODEL_VERSION
from app.core.logging import get_logger
from app.features.brew.db import get_user_watchlist
from app.features.flags import db as flags_db
from app.features.twitter_digest import db as twitter_digest_db
from app.features.watchlist_monitor import db as monitor_db
from app.features.watchlist_monitor.models import (
    EventCandidate,
    Freshness,
    GenerateTestUniverseResponse,
    GenerateTickerResult,
    MonitorSummary,
    PriorityItem,
    SignalBlock,
    SourceRef,
    TestUniverseUser,
    TechnicalMonitor,
    TickerBriefAgentOutput,
    TickerDailyBrief,
    TickerRow,
    WatchlistMonitorResponse,
    Watchpoint,
)
from app.features.watchlist_monitor.signal_builder import MARKET_CONTEXT_SYMBOLS
from app.features.watchlist_monitor.signal_builder import build_ticker_context
from app.features.watchlist_monitor.signal_builder import merge_event_candidates
from app.features.watchlist_monitor.ticker_brief_agent import generate_ticker_brief
from app.shared.data_tools.calendar import get_economic_calendar
from app.shared.data_tools.earnings import get_earnings_calendar
from app.shared.data_tools.quotes import get_batch_quotes
from app.shared.fmp_service import get_fmp_service
from app.utils.timezone import market_today_str, utc_now_iso

logger = get_logger(__name__)

MODEL_VERSION = WATCHLIST_MONITOR_MODEL_VERSION
_TEST_UNIVERSE_FLAG = "watchlist_monitor_test_universe"
_DEFAULT_TEST_UNIVERSE_USER_IDS = (
    "fa726347-f49a-4fee-973e-a3b69fdcbdd4",  # voya.technologies@gmail.com
    "d00a6201-646a-489f-95a2-aff8f90fe669",  # kedengpan@gmail.com
)

_ADVICE_PATTERNS = (
    "建议买入",
    "建议卖出",
    "建议持有",
    "建议加仓",
    "建议减仓",
    "可以考虑买入",
    "可以考虑卖出",
    "可以考虑加仓",
    "可以考虑减仓",
    "适合买入",
    "适合卖出",
    "应买入",
    "应卖出",
    "应加仓",
    "应减仓",
    "应该买入",
    "应该卖出",
    "应该加仓",
    "应该减仓",
    "不要买入",
    "不要卖出",
    "追高",
    "抄底",
    "止盈",
    "止损",
    "不宜",
    "建议投资者",
)

_NEXT_WATCH_TERMS = (
    "接下来",
    "后续",
    "未来",
    "重点看",
    "重点关注",
    "观察",
    "关注",
)

_IMPACT_TERMS = (
    "影响",
    "意味着",
    "说明",
    "反映",
    "因为",
    "为什么",
)


def _normalize_symbols(symbols: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in symbols:
        symbol = (raw or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        out.append(symbol)
    return out


def _severity_points(signal: SignalBlock) -> int:
    base = {"low": 8, "medium": 16, "high": 28}.get(signal.severity, 10)
    type_bonus = {
        "event": 8,
        "news": 6,
        "technical": 4,
        "social": 4,
        "fundamental": 6,
        "macro_sector": 3,
    }.get(signal.type, 0)
    return base + type_bonus


def _event_candidate_points(candidate: EventCandidate) -> int:
    if candidate.status == "completed":
        return 0
    score = 10 if candidate.event_date and candidate.date_precision == "exact" else 4
    if candidate.confidence == "high":
        score += 4
    type_bonus = {
        "earnings": 8,
        "investor_event": 6,
        "corporate_action": 6,
        "regulatory_legal": 6,
        "conference": 4,
        "product_business": 4,
        "macro": 3,
        "social_watchpoint": 3,
    }.get(candidate.event_type, 2)
    return score + type_bonus


def _compute_priority(
    output: TickerBriefAgentOutput,
    event_candidates: list[EventCandidate] | None = None,
) -> int:
    status_base = {
        "needs_attention": 48,
        "watch": 28,
        "quiet": 8,
        "stale": 0,
    }[output.status]
    signal_score = sum(_severity_points(s) for s in output.signals[:4])
    watchpoint_score = 0
    for item in output.watchpoints[:3]:
        watchpoint_score += 12 if item.type == "dated_event" else 6
        if item.confidence == "high":
            watchpoint_score += 4
    event_score = min(
        24,
        sum(_event_candidate_points(candidate) for candidate in (event_candidates or [])[:3]),
    )
    return max(0, min(100, status_base + signal_score + watchpoint_score + event_score))


def _contains_action_advice(text: str) -> str | None:
    normalized = (text or "").strip()
    for pattern in _ADVICE_PATTERNS:
        if pattern in normalized:
            return pattern
    return None


def _answers_monitor_questions(ai_take: str) -> bool:
    text = (ai_take or "").strip()
    if not text:
        return False
    has_today_signal = "今日" in text or "今天" in text or "当前" in text
    has_impact = any(term in text for term in _IMPACT_TERMS)
    has_next_watch = any(term in text for term in _NEXT_WATCH_TERMS)
    return has_today_signal and has_impact and has_next_watch


def _has_news_sources(source_refs: list[SourceRef]) -> bool:
    return any(ref.type == "news" or ref.id.startswith("news_") for ref in source_refs)


def _has_technical_sources(source_refs: list[SourceRef]) -> bool:
    return any(ref.type == "technical" or ref.id.startswith("technical_") for ref in source_refs)


def _technical_monitor_quality_error(
    technical_monitor: dict[str, Any] | None,
    *,
    has_technical_sources: bool,
) -> str | None:
    if not has_technical_sources:
        return None
    monitor = technical_monitor or {}
    if not monitor:
        return "technical_monitor missing despite technical source"
    if not str(monitor.get("summary") or "").strip():
        return "technical_monitor.summary is empty"
    view = monitor.get("technical_view") or {}
    if not str(view.get("verdict") or "").strip():
        return "technical_monitor.technical_view.verdict is empty"
    return None


def _validate_quality(
    symbol: str,
    output: TickerBriefAgentOutput,
    source_refs: list[SourceRef],
    technical_monitor: dict[str, Any] | None = None,
) -> str | None:
    if not output.headline.strip():
        return "headline is empty"
    if not output.ai_take.strip():
        return "ai_take is empty"
    if not _answers_monitor_questions(output.ai_take):
        return "ai_take does not clearly answer signal, impact, and next watch"
    advice_pattern = _contains_action_advice(output.ai_take)
    if advice_pattern:
        return "ai_take contains action-advice phrase: %s" % advice_pattern
    if _has_news_sources(source_refs) and not output.news_summary.strip():
        return "news_summary is empty despite news sources"
    technical_error = _technical_monitor_quality_error(
        technical_monitor,
        has_technical_sources=_has_technical_sources(source_refs),
    )
    if technical_error:
        return technical_error
    if output.status == "needs_attention" and not output.signals and not output.news_summary.strip() and not output.watchpoints:
        return "needs_attention requires at least one signal, news summary, or watchpoint"

    source_ids = {s.id for s in source_refs}
    for signal in output.signals:
        missing = [sid for sid in signal.source_ref_ids if sid not in source_ids]
        if missing:
            return "signal references unknown source ids for %s: %s" % (
                symbol,
                ",".join(missing),
            )

    for watchpoint in output.watchpoints:
        if watchpoint.type == "dated_event":
            if not watchpoint.date:
                return "dated watchpoint missing date"
            if not watchpoint.source_ref_ids:
                return "dated watchpoint missing source_ref_ids"
        missing = [sid for sid in watchpoint.source_ref_ids if sid not in source_ids]
        if missing:
            return "watchpoint references unknown source ids for %s: %s" % (
                symbol,
                ",".join(missing),
            )

    for candidate in output.news_event_candidates:
        missing = [sid for sid in candidate.source_ref_ids if sid not in source_ids]
        if missing:
            return "event candidate references unknown source ids for %s: %s" % (
                symbol,
                ",".join(missing),
            )
    return None


def _apply_translated_news_titles(
    source_refs: list[SourceRef],
    output: TickerBriefAgentOutput,
) -> list[SourceRef]:
    translations = {
        item.source_ref_id: item.title_zh.strip()
        for item in output.translated_news_titles
        if item.source_ref_id.startswith("news_") and item.title_zh.strip()
    }
    if not translations:
        return source_refs

    return [
        ref.model_copy(update={"title_zh": translations[ref.id]})
        if ref.id in translations and ref.type == "news"
        else ref
        for ref in source_refs
    ]


def _quote_map(quotes_result: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(q.get("symbol", "")).upper(): q
        for q in quotes_result.get("quotes", [])
        if q.get("symbol")
    }


async def _load_common_inputs(symbols: list[str]) -> dict[str, Any]:
    quote_symbols = list(dict.fromkeys([*symbols, *MARKET_CONTEXT_SYMBOLS]))
    quotes_task = asyncio.to_thread(get_batch_quotes, quote_symbols)
    earnings_task = asyncio.to_thread(get_earnings_calendar, 14)
    macro_task = asyncio.to_thread(get_economic_calendar, 14)
    sector_task = asyncio.to_thread(lambda: get_fmp_service().get_sector_performance_snapshot())
    twitter_task = twitter_digest_db.get_latest_digest()

    quotes_result, earnings_result, macro_result, sector_result, twitter_digest = await asyncio.gather(
        quotes_task,
        earnings_task,
        macro_task,
        sector_task,
        twitter_task,
        return_exceptions=True,
    )

    if isinstance(quotes_result, Exception):
        logger.warning("watchlist monitor quote fetch failed: %s", quotes_result)
        quotes_result = {"quotes": []}
    if isinstance(earnings_result, Exception):
        logger.warning("watchlist monitor earnings fetch failed: %s", earnings_result)
        earnings_result = {"earnings": []}
    if isinstance(macro_result, Exception):
        logger.warning("watchlist monitor macro calendar fetch failed: %s", macro_result)
        macro_result = {"events": []}
    if isinstance(sector_result, Exception):
        logger.warning("watchlist monitor sector snapshot fetch failed: %s", sector_result)
        sector_result = {"sectors": []}
    if isinstance(twitter_digest, Exception):
        logger.warning("watchlist monitor twitter digest fetch failed: %s", twitter_digest)
        twitter_digest = None

    return {
        "quotes": _quote_map(quotes_result if isinstance(quotes_result, dict) else {}),
        "earnings": (earnings_result or {}).get("earnings", []) if isinstance(earnings_result, dict) else [],
        "macro_events": (macro_result or {}).get("events", []) if isinstance(macro_result, dict) else [],
        "sector_performance": sector_result if isinstance(sector_result, dict) else {},
        "twitter_digest": twitter_digest,
    }


async def resolve_symbols_for_generation(
    symbols: list[str] | None = None,
    user_id: str | None = None,
    limit: int = 5,
) -> list[str]:
    """Resolve explicit symbols or the requested user's watchlist."""
    resolved = _normalize_symbols(symbols or [])
    if not resolved and user_id:
        watchlist = await get_user_watchlist(user_id)
        if watchlist is None:
            raise RuntimeError("failed to load user watchlist")
        resolved = _normalize_symbols(watchlist.get("symbols") or [])
    return resolved[:limit]


async def generate_for_symbols(symbols: list[str], *, force: bool = False) -> tuple[list[GenerateTickerResult], list[GenerateTickerResult]]:
    """Generate and persist ticker briefs for the provided symbols."""
    normalized = _normalize_symbols(symbols)
    if not normalized:
        return [], []

    report_date = market_today_str()
    if not force:
        existing = await monitor_db.get_latest_briefs(normalized)
        missing_today = [
            symbol
            for symbol in normalized
            if not existing.get(symbol) or existing[symbol].brief_date != report_date
        ]
        if not missing_today:
            return [
                GenerateTickerResult(
                    symbol=symbol,
                    success=True,
                    status=existing[symbol].status,
                    headline=existing[symbol].headline,
                    priority_score=existing[symbol].priority_score,
                )
                for symbol in normalized
            ], []
        normalized = missing_today

    common = await _load_common_inputs(normalized)
    generated: list[GenerateTickerResult] = []
    failed: list[GenerateTickerResult] = []

    for symbol in normalized:
        try:
            context = await asyncio.to_thread(
                build_ticker_context,
                symbol,
                quote=common["quotes"].get(symbol),
                market_quotes=common["quotes"],
                sector_performance=common["sector_performance"],
                earnings=common["earnings"],
                macro_events=common["macro_events"],
                twitter_digest=common["twitter_digest"],
                report_date=report_date,
            )
            source_refs = [
                SourceRef.model_validate(item)
                for item in context.get("source_refs", [])
                if isinstance(item, dict)
            ]

            output = await generate_ticker_brief(context)
            quality_error = _validate_quality(
                symbol,
                output,
                source_refs,
                context.get("technical_monitor") if isinstance(context.get("technical_monitor"), dict) else None,
            )
            if quality_error:
                raise RuntimeError("quality gate failed: %s" % quality_error)
            source_refs = _apply_translated_news_titles(source_refs, output)

            deterministic_candidates = [
                EventCandidate.model_validate(item)
                for item in context.get("event_candidates", [])
                if isinstance(item, dict)
            ]
            extracted_candidates = [
                EventCandidate(
                    symbol=symbol,
                    event_type=candidate.event_type,
                    event_date=candidate.event_date,
                    date_precision=candidate.date_precision,
                    title=candidate.title,
                    summary=candidate.summary,
                    why_it_matters=candidate.why_it_matters,
                    status=candidate.status,
                    confidence=candidate.confidence,
                    source_ref_ids=candidate.source_ref_ids,
                    source_type=candidate.source_type or "llm_extracted",
                )
                for candidate in output.news_event_candidates
                if candidate.event_type != "macro"
                and candidate.status != "completed"
                and candidate.source_ref_ids
                and all(sid.startswith("news_") for sid in candidate.source_ref_ids)
            ]
            event_candidates = merge_event_candidates(
                [*deterministic_candidates, *extracted_candidates],
                symbol=symbol,
                report_date=report_date,
            )

            brief = TickerDailyBrief(
                symbol=symbol,
                brief_date=report_date,
                model_version=MODEL_VERSION,
                status=output.status,
                headline=output.headline,
                ai_take=output.ai_take,
                news_summary=output.news_summary,
                technical_monitor=TechnicalMonitor.model_validate(context.get("technical_monitor") or {}),
                priority_score=_compute_priority(output, event_candidates),
                signals=output.signals,
                watchpoints=output.watchpoints,
                event_candidates=event_candidates,
                source_refs=source_refs,
                generated_at=utc_now_iso(),
            )
            saved = await monitor_db.upsert_ticker_brief(brief)
            generated.append(
                GenerateTickerResult(
                    symbol=symbol,
                    success=True,
                    status=saved.status,
                    headline=saved.headline,
                    priority_score=saved.priority_score,
                )
            )
            logger.info("Generated watchlist brief for %s", symbol)
        except Exception as exc:
            logger.exception("Failed to generate watchlist brief for %s", symbol)
            failed.append(
                GenerateTickerResult(
                    symbol=symbol,
                    success=False,
                    error=str(exc),
                )
            )

    return generated, failed


async def generate_test_user_universe(
    *,
    user_ids: list[str] | None = None,
    limit_per_user: int = 25,
    max_symbols: int = 50,
    force: bool = False,
    dry_run: bool = False,
) -> GenerateTestUniverseResponse:
    """Generate the monitor for the limited dry-run test-user universe."""
    target_user_ids = [
        user_id
        for user_id in dict.fromkeys(user_ids or list(_DEFAULT_TEST_UNIVERSE_USER_IDS))
        if user_id
    ]
    assignments = await flags_db.list_all_assignments(flag=_TEST_UNIVERSE_FLAG)
    allowed_user_ids = {
        str(item.get("user_id") or "").strip()
        for item in assignments
        if item.get("enabled") is True and item.get("user_id")
    }

    user_watchlists: list[TestUniverseUser] = []
    failed_user_ids: list[str] = []
    skipped_user_ids: list[str] = []
    universe: list[str] = []

    for user_id in target_user_ids:
        if user_id not in allowed_user_ids:
            skipped_user_ids.append(user_id)
            continue

        watchlist = await get_user_watchlist(user_id)
        if watchlist is None:
            failed_user_ids.append(user_id)
            logger.warning("watchlist monitor test universe failed to load user=%s", user_id[:8])
            continue

        symbols = _normalize_symbols(watchlist.get("symbols") or [])[:limit_per_user]
        user_watchlists.append(TestUniverseUser(user_id=user_id, symbols=symbols))
        universe.extend(symbols)

    requested_symbols = _normalize_symbols(universe)[:max_symbols]
    generated: list[GenerateTickerResult] = []
    failed: list[GenerateTickerResult] = []

    if requested_symbols and not dry_run:
        generated, failed = await generate_for_symbols(requested_symbols, force=force)

    return GenerateTestUniverseResponse(
        success=not failed_user_ids and not skipped_user_ids and not failed,
        dry_run=dry_run,
        user_ids=target_user_ids,
        user_watchlists=user_watchlists,
        failed_user_ids=failed_user_ids,
        skipped_user_ids=skipped_user_ids,
        requested_symbols=requested_symbols,
        symbol_count=len(requested_symbols),
        generated_count=len(generated),
        failed_count=len(failed),
        failed_user_count=len(failed_user_ids),
        skipped_user_count=len(skipped_user_ids),
        generated=generated,
        failed=failed,
    )


def _top_signal(brief: TickerDailyBrief) -> SignalBlock | None:
    severity_rank = {"high": 3, "medium": 2, "low": 1}
    signals = sorted(
        brief.signals,
        key=lambda s: (severity_rank.get(s.severity, 0), _severity_points(s)),
        reverse=True,
    )
    return signals[0] if signals else None


def _next_watchpoint(brief: TickerDailyBrief) -> Watchpoint | None:
    dated = [w for w in brief.watchpoints if w.type == "dated_event"]
    if dated:
        return sorted(dated, key=lambda w: w.date or "9999-99-99")[0]
    return brief.watchpoints[0] if brief.watchpoints else None


def _priority_reason(brief: TickerDailyBrief) -> str:
    top_signal = _top_signal(brief)
    if top_signal:
        return top_signal.title
    next_watch = _next_watchpoint(brief)
    if next_watch:
        return next_watch.title
    return brief.headline


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _is_within_next_7d(value: str | None, report_date: str) -> bool:
    event_date = _parse_date(value)
    anchor = _parse_date(report_date)
    if not event_date or not anchor:
        return False
    return anchor <= event_date <= anchor + timedelta(days=7)


def _next_7d_watchpoint_count(
    *,
    event_candidates: list[EventCandidate],
    watchpoints: list[Watchpoint],
    report_date: str,
) -> int:
    return sum(
        1
        for candidate in event_candidates
        if candidate.date_precision == "exact"
        and _is_within_next_7d(candidate.event_date, report_date)
    ) + sum(
        1
        for watchpoint in watchpoints
        if watchpoint.type == "dated_event"
        and _is_within_next_7d(watchpoint.date, report_date)
    )


def _is_current_brief(brief: TickerDailyBrief, report_date: str) -> bool:
    return brief.brief_date == report_date and brief.status != "stale"


def _row_from_brief(brief: TickerDailyBrief, report_date: str) -> TickerRow:
    is_current = _is_current_brief(brief, report_date)
    signal_types = list(dict.fromkeys(signal.type for signal in brief.signals))
    if brief.technical_monitor.signals and "technical" not in signal_types:
        signal_types.append("technical")
    return TickerRow(
        symbol=brief.symbol,
        status=brief.status if is_current else "stale",
        priority_score=brief.priority_score if is_current else 0,
        headline=brief.headline,
        ai_take=brief.ai_take,
        news_summary=brief.news_summary,
        technical_monitor=brief.technical_monitor,
        signal_types=signal_types,
        signals=brief.signals,
        watchpoints=brief.watchpoints,
        event_candidates=brief.event_candidates,
        source_refs=brief.source_refs,
        top_signal=_top_signal(brief),
        next_watchpoint=_next_watchpoint(brief),
        generated_at=brief.generated_at,
        is_stale=not is_current,
    )


def _stale_row(symbol: str) -> TickerRow:
    return TickerRow(
        symbol=symbol,
        status="stale",
        priority_score=0,
        headline="今日监控尚未生成",
        ai_take="这只股票今天还没有可用的 AI 监控结果。后台生成完成后，这里会显示新闻、社交讨论、事件和技术面的综合判断。",
        news_summary="",
        signal_types=[],
        generated_at=None,
        is_stale=True,
    )


async def compose_monitor_for_user(user_id: str) -> WatchlistMonitorResponse:
    """Build the user monitor response from cached ticker briefs."""
    watchlist = await get_user_watchlist(user_id)
    if watchlist is None:
        raise RuntimeError("failed to load user watchlist")

    symbols = _normalize_symbols(watchlist.get("symbols") or [])
    briefs = await monitor_db.get_latest_briefs(symbols) if symbols else {}
    report_date = market_today_str()

    rows: list[TickerRow] = []
    missing: list[str] = []
    future_watchpoints: list[Watchpoint] = []
    future_event_candidates: list[EventCandidate] = []
    generated_times: list[str] = []
    current_briefs: list[TickerDailyBrief] = []

    for symbol in symbols:
        brief = briefs.get(symbol)
        if not brief:
            missing.append(symbol)
            rows.append(_stale_row(symbol))
            continue
        rows.append(_row_from_brief(brief, report_date))
        if not _is_current_brief(brief, report_date):
            continue
        current_briefs.append(brief)
        future_watchpoints.extend(brief.watchpoints)
        future_event_candidates.extend(brief.event_candidates)
        generated_times.append(brief.generated_at)

    rows.sort(key=lambda r: (r.priority_score, 0 if r.status == "stale" else 1), reverse=True)

    priority_items = [
        PriorityItem(
            symbol=row.symbol,
            status=row.status,
            priority_score=row.priority_score,
            headline=row.headline,
            reason=_priority_reason(briefs[row.symbol]) if row.symbol in briefs else row.headline,
            next_watchpoint=row.next_watchpoint.title if row.next_watchpoint else "",
            generated_at=row.generated_at,
        )
        for row in rows
        if row.status in ("needs_attention", "watch")
    ][:5]

    summary = MonitorSummary(
        needs_attention=sum(1 for r in rows if r.status == "needs_attention"),
        new_signals=sum(
            len(brief.signals) + len(brief.technical_monitor.signals)
            for brief in current_briefs
        ),
        next_7d_watchpoints=_next_7d_watchpoint_count(
            event_candidates=future_event_candidates,
            watchpoints=future_watchpoints,
            report_date=report_date,
        ),
        quiet_tickers=sum(1 for r in rows if r.status == "quiet"),
        stale_tickers=sum(1 for r in rows if r.status == "stale"),
    )

    return WatchlistMonitorResponse(
        as_of=utc_now_iso(),
        symbols=symbols,
        summary=summary,
        priority_items=priority_items,
        ticker_rows=rows,
        future_watchpoints=future_watchpoints[:10],
        future_event_candidates=future_event_candidates[:20],
        freshness=Freshness(
            ai_generated_at=max(generated_times) if generated_times else None,
        ),
        missing_symbols=missing,
    )
