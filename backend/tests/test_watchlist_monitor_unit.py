import pytest

from app.features.watchlist_monitor import service
from app.features.watchlist_monitor import signal_builder
from app.features.watchlist_monitor import ticker_brief_agent
from app.features.watchlist_monitor.models import (
    BriefCompositionOutput,
    EventCandidate,
    MarketDiscussionOutput,
    NewsEventCandidate,
    NewsEventsSynthesisOutput,
    SignalBlock,
    SourceRef,
    TechnicalMonitor,
    TechnicalInterpretationOutput,
    TechnicalMonitorSignal,
    TickerBriefAgentOutput,
    TickerDailyBrief,
    TranslatedSourceTitle,
    Watchpoint,
)


def _brief(
    symbol: str,
    status="watch",
    priority=50,
    brief_date="2026-06-15",
) -> TickerDailyBrief:
    return TickerDailyBrief(
        symbol=symbol,
        brief_date=brief_date,
        model_version="watchlist-monitor-v0",
        status=status,
        headline=f"{symbol} headline",
        ai_take=f"{symbol} has a cached monitor brief with enough detail for the UI.",
        news_summary="Recent English news focused on one product update and market reaction.",
        technical_monitor=TechnicalMonitor(
            summary="技术面整体偏强：价格与主要均线呈多头排列。",
            signals=[
                TechnicalMonitorSignal(
                    id="price_breakout_20d",
                    category="price",
                    title="20 日高点突破",
                    detail="收盘价站上前 20 日高点。",
                    price=120.0,
                    reference=112.0,
                )
            ],
            key_levels={"current_price": 120.0, "support_1": 112.0, "resistance_1": 125.0},
            updated_at="2026-06-15",
        ),
        priority_score=priority,
        signals=[
            SignalBlock(
                type="news",
                severity="medium",
                title="News signal",
                summary="A relevant company update appeared.",
                why_it_matters="It changes today's monitoring priority.",
                source_ref_ids=["news_1"],
            )
        ],
        watchpoints=[
            Watchpoint(
                type="open_watchpoint",
                title="Watch follow-through",
                what_to_watch="Watch whether the news changes market expectations.",
                source_ref_ids=["news_1"],
            )
        ],
        event_candidates=[
            EventCandidate(
                symbol=symbol,
                event_type="investor_event",
                event_date="2026-06-22",
                date_precision="exact",
                title="Investor webcast",
                summary="The company has a scheduled investor webcast.",
                why_it_matters="Management commentary may reset investor expectations.",
                confidence="high",
                source_ref_ids=["news_1"],
                source_type="news",
            )
        ],
        source_refs=[SourceRef(id="news_1", type="news", title="News")],
        generated_at="2026-06-15T20:00:00Z",
    )


def test_priority_score_caps_at_100_for_strong_brief():
    output = TickerBriefAgentOutput(
        status="needs_attention",
        headline="High priority",
        ai_take=(
            "这只股票今天需要关注，因为新闻、事件和技术面都出现了新的监控信号。"
            "短线重点不是单日涨跌，而是这些信号是否继续互相强化。"
        ),
        signals=[
            SignalBlock(
                type="news",
                severity="high",
                title="Major news",
                summary="A major event happened.",
                why_it_matters="It changes the near-term setup.",
                source_ref_ids=["news_1"],
            ),
            SignalBlock(
                type="event",
                severity="high",
                title="Upcoming event",
                summary="A dated catalyst is coming.",
                why_it_matters="The event can reset expectations.",
                source_ref_ids=["event_1"],
            ),
        ],
        watchpoints=[
            Watchpoint(
                type="dated_event",
                date="2026-06-17",
                title="FOMC decision",
                what_to_watch="Watch rate guidance.",
                confidence="high",
                source_ref_ids=["event_1"],
            )
        ],
    )

    assert service._compute_priority(output) == 100


def test_quality_gate_rejects_unknown_source_ref():
    output = TickerBriefAgentOutput(
        status="watch",
        headline="Watch",
        ai_take=(
            "这只股票今天有一个需要观察的信号，但还不到紧急处理的程度。"
            "后续需要看新闻是否继续发酵，以及价格是否确认方向。"
        ),
        signals=[
            SignalBlock(
                type="news",
                severity="medium",
                title="News",
                summary="Summary",
                why_it_matters="Reason",
                source_ref_ids=["missing"],
            )
        ],
    )

    assert service._validate_quality("AAPL", output, []) is not None


def test_quality_gate_rejects_missing_news_summary_when_news_exists():
    output = TickerBriefAgentOutput(
        status="watch",
        headline="Watch",
        ai_take=(
            "今日信号是公司新闻流出现新的产品更新；影响在于市场会重新评估短期收入动能；"
            "接下来重点看管理层是否给出更多采用率数据。"
        ),
        news_summary="",
        signals=[],
        watchpoints=[
            Watchpoint(
                type="open_watchpoint",
                title="产品数据验证",
                what_to_watch="观察后续是否披露采用率和客户反馈。",
                source_ref_ids=["news_1"],
            )
        ],
    )

    assert (
        service._validate_quality(
            "AAPL",
            output,
            [SourceRef(id="news_1", type="news", title="Product update")],
        )
        == "news_summary is empty despite news sources"
    )


def test_quality_gate_rejects_action_advice_copy():
    output = TickerBriefAgentOutput(
        status="watch",
        headline="Watch",
        ai_take=(
            "今日信号是股价接近关键阻力；影响在于短线资金可能继续博弈方向；"
            "接下来重点看量能确认，但不宜盲目追高。"
        ),
        news_summary="新闻流显示市场正在讨论该阻力位。",
    )

    assert service._validate_quality("AAPL", output, []) == (
        "ai_take contains action-advice phrase: 追高"
    )


def test_quality_gate_rejects_incomplete_technical_monitor():
    output = TickerBriefAgentOutput(
        status="watch",
        headline="Watch",
        ai_take=(
            "今日信号是价格仍在关键均线下方；影响在于反弹确认度不足；"
            "接下来重点看能否重新站回短期均线。"
        ),
        news_summary="",
    )

    assert service._validate_quality(
        "AAPL",
        output,
        [SourceRef(id="technical_1", type="technical", title="Technical snapshot")],
        {"summary": "", "technical_view": {"verdict": ""}},
    ) == "technical_monitor.summary is empty"


def test_ticker_brief_output_coerces_null_defaults():
    output = TickerBriefAgentOutput.model_validate(
        {
            "status": "quiet",
            "headline": "暂无明显新增信号",
            "ai_take": (
                "这只股票今天没有明显新增的公司级催化，当前更适合继续观察新闻流、"
                "技术面和后续事件是否出现新的确认信号。"
            ),
            "news_summary": None,
            "signals": None,
            "watchpoints": None,
            "news_event_candidates": None,
        }
    )

    assert output.news_summary == ""
    assert output.signals == []
    assert output.watchpoints == []
    assert output.news_event_candidates == []


def test_compact_news_uses_7d_window_and_filters_team_keyword(monkeypatch):
    calls = []

    def fake_get_fmp_news(days: int, symbols: list[str]):
        calls.append(days)
        assert days == 7
        return {
            "status": "success",
            "news": [
                {
                    "title": "Atlassian's Bullish Setup Has Real Numbers Behind It",
                    "text": "TEAM subscription revenue improved.",
                    "source": "Seeking Alpha",
                    "publishedDate": "2026-06-15 23:13:28",
                    "url": "https://example.com/1",
                },
                {
                    "title": "Touchstone Mid Cap Growth Fund Q1 2026 Portfolio Review",
                    "text": "Atlassian was a contributor.",
                    "source": "Seeking Alpha",
                    "publishedDate": "2026-06-12 09:55:00",
                    "url": "https://example.com/2",
                },
                {
                    "title": "Atlassian Corporation (TEAM) Presents at Mizuho Technology Conference 2026 Transcript",
                    "text": "Atlassian Corporation TEAM transcript.",
                    "source": "Seeking Alpha",
                    "publishedDate": "2026-06-10 12:32:14",
                    "url": "https://example.com/3",
                },
                {
                    "title": "SPECTRUM REACH AND ANOKI AI TEAM UP",
                    "text": "Unrelated press release.",
                    "source": "PRNewsWire",
                    "publishedDate": "2026-06-10 10:00:00",
                    "url": "https://example.com/4",
                },
            ],
        }

    monkeypatch.setattr(signal_builder, "get_fmp_news", fake_get_fmp_news)
    monkeypatch.setattr(
        signal_builder,
        "get_tavily_ticker_news",
        lambda symbol, profile=None: {"status": "success", "news": []},
    )
    source_refs = []
    news = signal_builder._compact_news(
        "TEAM",
        source_refs,
        {"company_name": "Atlassian Corporation"},
    )

    assert calls == [7]
    assert [item["title"] for item in news] == [
        "Atlassian's Bullish Setup Has Real Numbers Behind It",
        "Touchstone Mid Cap Growth Fund Q1 2026 Portfolio Review",
        "Atlassian Corporation (TEAM) Presents at Mizuho Technology Conference 2026 Transcript",
    ]
    assert [item["id"] for item in news] == ["news_1", "news_2", "news_3"]
    assert len(source_refs) == 3


def test_compact_news_always_merges_tavily_and_filters_wrong_circle(monkeypatch):
    def fake_get_fmp_news(days: int, symbols: list[str]):
        assert days == 7
        assert symbols == ["CRCL"]
        return {
            "status": "success",
            "news": [
                {
                    "title": "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally %d" % index,
                    "text": "CRCL traded higher alongside crypto-linked equities.",
                    "source": "FXEmpire",
                    "publishedDate": "2026-06-15 10:10:17",
                    "url": "https://example.com/fmp-crcl-%d" % index,
                }
                for index in range(6)
            ],
        }

    def fake_get_tavily_ticker_news(symbol: str, profile=None):
        assert symbol == "CRCL"
        return {
            "status": "success",
            "news": [
                {
                    "title": "315,600 Shares in Circle Internet Group, Inc. $CRCL Bought by Alberta Investment Management Corp",
                    "text": "The filing article references Circle Internet Group and CRCL.",
                    "source": "marketbeat.com",
                    "publishedDate": "2026-06-16 10:41:00",
                    "url": "https://marketbeat.com/crcl-filing",
                    "_source": "tavily",
                },
                {
                    "title": "Circle Group Wins New Contracts to Upgrade MILOS Platform for Intermodal Logistics",
                    "text": "Circle Group won new contracts for an intermodal logistics platform.",
                    "source": "tipranks.com",
                    "publishedDate": "2026-06-16 11:00:00",
                    "url": "https://tipranks.com/circle-group-milos",
                    "_source": "tavily",
                },
                {
                    "title": "Circle Internet Group (CRCL) Stock Price, Quote, News & History",
                    "text": "A quote page for CRCL.",
                    "source": "benzinga.com",
                    "publishedDate": "",
                    "url": "https://www.benzinga.com/quote/CRCL",
                    "_source": "tavily",
                },
            ],
        }

    monkeypatch.setattr(signal_builder, "get_fmp_news", fake_get_fmp_news)
    monkeypatch.setattr(signal_builder, "get_tavily_ticker_news", fake_get_tavily_ticker_news)
    source_refs = []

    news = signal_builder._compact_news(
        "CRCL",
        source_refs,
        {"company_name": "Circle Internet Group, Inc."},
    )

    assert [item["title"] for item in news] == [
        "315,600 Shares in Circle Internet Group, Inc. $CRCL Bought by Alberta Investment Management Corp",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 0",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 1",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 2",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 3",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 4",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 5",
    ]
    assert [item["source"] for item in news] == [
        "marketbeat.com",
        "FXEmpire",
        "FXEmpire",
        "FXEmpire",
        "FXEmpire",
        "FXEmpire",
        "FXEmpire",
    ]
    assert [item["id"] for item in news] == [
        "news_1",
        "news_2",
        "news_3",
        "news_4",
        "news_5",
        "news_6",
        "news_7",
    ]
    assert [ref.title for ref in source_refs] == [
        "315,600 Shares in Circle Internet Group, Inc. $CRCL Bought by Alberta Investment Management Corp",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 0",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 1",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 2",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 3",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 4",
        "MSTR, COIN and CRCL Forecasts - Crypto Stocks Looking to Rally 5",
    ]


def test_compact_technical_includes_recent_price_path_for_rebound_giveback():
    compact = signal_builder._compact_technical(
        {
            "current": {"price": 94.15, "sma_20": 106.03, "sma_50": 94.86, "rsi_14": 47.34},
            "derived": {"ma_alignment": "mixed", "trend_direction": "down"},
            "support_resistance": {"support_1": 76, "resistance_1": 134},
            "trend_summary": {"price_change_5d": 10.4, "price_change_20d": -16.6},
            "ohlcv": [
                {"date": "2026-06-09", "high": 81.0, "low": 76.0, "close": 78.36},
                {"date": "2026-06-10", "high": 87.0, "low": 80.0, "close": 85.29},
                {"date": "2026-06-11", "high": 89.0, "low": 84.0, "close": 88.34},
                {"date": "2026-06-12", "high": 99.0, "low": 89.0, "close": 97.18},
                {"date": "2026-06-15", "high": 112.0, "low": 96.0, "close": 110.74},
                {"date": "2026-06-16", "high": 111.0, "low": 93.0, "close": 94.15},
            ],
        }
    )

    path = compact["recent_price_path"]

    assert compact["price_change_5d"] == 10.4
    assert path["available"] is True
    assert path["lookback_sessions"] == 6
    assert path["consecutive_down_days"] == 1
    assert path["consecutive_up_days"] == 0
    assert path["sessions"][-2]["daily_change_pct"] > 0
    assert path["sessions"][-1]["daily_change_pct"] < 0
    assert path["close_change_from_first_pct"] > 0
    assert path["close_change_from_recent_high_pct"] < 0


@pytest.mark.asyncio
async def test_generate_ticker_brief_uses_unified_news_events_pipeline(monkeypatch):
    calls = []

    async def fake_generate_structured_json(**kwargs):
        calls.append(kwargs)
        output_model = kwargs["output_model"]
        if output_model is NewsEventsSynthesisOutput:
            return NewsEventsSynthesisOutput(
                news_summary="HOOD 新闻主要围绕产品更新和交易活跃度展开。",
                key_themes=["产品更新"],
                source_ref_ids=["news_1"],
                translated_news_titles=[
                    TranslatedSourceTitle(
                        source_ref_id="news_1",
                        title_zh="HOOD 发布产品更新",
                    )
                ],
                news_event_candidates=[
                    NewsEventCandidate(
                        event_type="investor_event",
                        event_date=None,
                        date_precision="unknown",
                        title="产品更新后续观察",
                        summary="新闻提到后续更新仍需确认。",
                        why_it_matters="它可能影响用户增长预期。",
                        status="tentative",
                        confidence="medium",
                        source_ref_ids=["news_1"],
                        source_type="news",
                    )
                ],
                watchpoints=[
                    Watchpoint(
                        type="open_watchpoint",
                        title="产品更新后续验证",
                        what_to_watch="观察产品更新是否继续带来用户增长讨论。",
                        why_it_matters="这是新闻流里最直接的后续验证点。",
                        confidence="medium",
                        source_ref_ids=["news_1"],
                    )
                ],
                debug_notes=["合并新闻总结与未来事件抽取。"],
            )
        if output_model is TechnicalInterpretationOutput:
            return TechnicalInterpretationOutput(
                technical_take="技术面仍偏强，但需要确认突破后的承接。",
                signals=[
                    SignalBlock(
                        type="technical",
                        severity="medium",
                        title="技术结构偏强",
                        summary="价格仍在关键均线上方。",
                        why_it_matters="说明短线趋势尚未破坏。",
                        source_ref_ids=["technical_1"],
                    )
                ],
            )
        if output_model is MarketDiscussionOutput:
            return MarketDiscussionOutput(
                discussion_summary="社交讨论集中在产品动能。",
                signals=[
                    SignalBlock(
                        type="social",
                        severity="low",
                        title="讨论度升温",
                        summary="KOL 主要在观察产品动能。",
                        why_it_matters="这代表市场关注点，但不是事实来源。",
                        source_ref_ids=["social_1"],
                    )
                ],
            )
        assert output_model is BriefCompositionOutput
        return BriefCompositionOutput(
            status="watch",
            headline="HOOD 有待观察",
            ai_take=(
                "HOOD 今天有一些值得跟踪的监控信号，但还不到紧急级别。"
                "后续重点看新闻流和价格动能是否继续互相确认。"
            ),
            signals=[
                SignalBlock(
                    type="technical",
                    severity="medium",
                    title="技术结构偏强",
                    summary="价格仍在关键均线上方。",
                    why_it_matters="说明短线趋势尚未破坏。",
                    source_ref_ids=["technical_1"],
                )
            ],
        )

    monkeypatch.setattr(
        ticker_brief_agent,
        "generate_structured_json",
        fake_generate_structured_json,
    )

    output = await ticker_brief_agent.generate_ticker_brief(
        {
            "symbol": "HOOD",
            "report_date": "2026-06-16",
            "quote": {"symbol": "HOOD", "price": 100.0},
            "market_context": {"available": True, "market_tone": "mixed_or_muted"},
            "news_items": [{"id": "news_1", "title": "HOOD product update"}],
            "technical": {
                "available": True,
                "price": 100.0,
                "price_change_5d": 4.2,
                "recent_price_path": {
                    "available": True,
                    "sessions": [
                        {"date": "2026-06-15", "close": 105.0, "daily_change_pct": 5.0},
                        {"date": "2026-06-16", "close": 100.0, "daily_change_pct": -4.8},
                    ],
                    "consecutive_down_days": 1,
                    "consecutive_up_days": 0,
                },
            },
            "technical_monitor": {
                "summary": "技术面偏强。",
                "signals": [{"id": "price_breakout_20d", "title": "突破"}],
                "key_levels": {"current_price": 100.0},
            },
            "social": {
                "available": True,
                "synthesis_zh": "KOL 正在讨论产品动能。",
                "source_ref_id": "social_1",
            },
            "event_candidates": [],
            "event_window": {"start": "2026-06-16", "end": "2026-06-30", "days": 14},
            "source_refs": [
                {"id": "news_1", "type": "news", "title": "HOOD product update"},
                {"id": "technical_1", "type": "technical", "title": "HOOD technical snapshot"},
                {"id": "social_1", "type": "social", "title": "Twitter/KOL digest"},
            ],
        }
    )

    assert output.status == "watch"
    assert output.news_summary == "HOOD 新闻主要围绕产品更新和交易活跃度展开。"
    assert output.translated_news_titles[0].title_zh == "HOOD 发布产品更新"
    assert output.news_event_candidates[0].source_ref_ids == ["news_1"]
    assert output.watchpoints[0].title == "产品更新后续验证"
    assert output.signals[0].source_ref_ids == ["technical_1"]
    assert [call["feature"] for call in calls] == [
        "watchlist_monitor.news_events_synthesis",
        "watchlist_monitor.technical_interpretation",
        "watchlist_monitor.market_discussion",
        "watchlist_monitor.final_brief",
    ]
    assert all(call["model"] == ticker_brief_agent.MODEL for call in calls)
    assert calls[-1]["user_payload"]["news_events"]["news_summary"] == output.news_summary
    assert calls[-1]["user_payload"]["news_events"]["watchpoints"][0]["title"] == "产品更新后续验证"
    assert calls[1]["user_payload"]["technical"]["recent_price_path"]["consecutive_down_days"] == 1
    assert calls[-1]["user_payload"]["technical_context"]["recent_price_path"]["consecutive_down_days"] == 1


def test_apply_translated_news_titles_updates_only_news_sources():
    output = TickerBriefAgentOutput(
        status="watch",
        headline="Watch",
        ai_take=(
            "这只股票今天有一些新闻和事件值得继续观察，但暂时还不需要做出仓位层面的判断。"
            "后续重点看这些信号是否继续发酵。"
        ),
        translated_news_titles=[
            TranslatedSourceTitle(source_ref_id="news_1", title_zh="中文新闻标题"),
            TranslatedSourceTitle(source_ref_id="technical_1", title_zh="不应更新技术标题"),
        ],
    )
    source_refs = [
        SourceRef(id="news_1", type="news", title="English news title"),
        SourceRef(id="technical_1", type="technical", title="Technical snapshot"),
    ]

    updated = service._apply_translated_news_titles(source_refs, output)

    assert updated[0].title == "English news title"
    assert updated[0].title_zh == "中文新闻标题"
    assert updated[1].title_zh == ""


@pytest.mark.asyncio
async def test_compose_monitor_uses_cached_briefs(monkeypatch):
    monkeypatch.setattr(service, "market_today_str", lambda: "2026-06-15")

    async def fake_watchlist(user_id: str):
        assert user_id == "user-1"
        return {"user_id": user_id, "symbols": ["AAPL", "MSFT", "NVDA"]}

    async def fake_latest_briefs(symbols: list[str]):
        assert symbols == ["AAPL", "MSFT", "NVDA"]
        return {
            "AAPL": _brief("AAPL", status="needs_attention", priority=90),
            "MSFT": _brief("MSFT", status="quiet", priority=10),
        }

    monkeypatch.setattr(service, "get_user_watchlist", fake_watchlist)
    monkeypatch.setattr(service.monitor_db, "get_latest_briefs", fake_latest_briefs)

    monitor = await service.compose_monitor_for_user("user-1")

    assert monitor.symbols == ["AAPL", "MSFT", "NVDA"]
    assert monitor.summary.needs_attention == 1
    assert monitor.summary.quiet_tickers == 1
    assert monitor.summary.stale_tickers == 1
    assert monitor.missing_symbols == ["NVDA"]
    assert [row.symbol for row in monitor.ticker_rows] == ["AAPL", "MSFT", "NVDA"]
    assert monitor.ticker_rows[0].signals[0].title == "News signal"
    assert monitor.ticker_rows[0].news_summary == "Recent English news focused on one product update and market reaction."
    assert monitor.ticker_rows[0].technical_monitor.signals[0].id == "price_breakout_20d"
    assert "technical" in monitor.ticker_rows[0].signal_types
    assert monitor.ticker_rows[0].watchpoints[0].title == "Watch follow-through"
    assert monitor.ticker_rows[0].event_candidates[0].title == "Investor webcast"
    assert monitor.future_event_candidates[0].title == "Investor webcast"
    assert monitor.summary.next_7d_watchpoints == 2
    assert monitor.ticker_rows[0].source_refs[0].id == "news_1"


@pytest.mark.asyncio
async def test_compose_monitor_marks_previous_market_date_briefs_stale(monkeypatch):
    monkeypatch.setattr(service, "market_today_str", lambda: "2026-06-16")

    async def fake_watchlist(user_id: str):
        assert user_id == "user-1"
        return {"user_id": user_id, "symbols": ["AAPL", "MSFT"]}

    async def fake_latest_briefs(symbols: list[str]):
        assert symbols == ["AAPL", "MSFT"]
        return {
            "AAPL": _brief(
                "AAPL",
                status="needs_attention",
                priority=100,
                brief_date="2026-06-15",
            ),
            "MSFT": _brief(
                "MSFT",
                status="watch",
                priority=80,
                brief_date="2026-06-16",
            ),
        }

    monkeypatch.setattr(service, "get_user_watchlist", fake_watchlist)
    monkeypatch.setattr(service.monitor_db, "get_latest_briefs", fake_latest_briefs)

    monitor = await service.compose_monitor_for_user("user-1")

    assert monitor.summary.needs_attention == 0
    assert monitor.summary.stale_tickers == 1
    fresh = next(row for row in monitor.ticker_rows if row.symbol == "MSFT")
    assert monitor.summary.new_signals == len(fresh.signals) + len(fresh.technical_monitor.signals)
    assert monitor.priority_items[0].symbol == "MSFT"
    stale = next(row for row in monitor.ticker_rows if row.symbol == "AAPL")
    assert stale.status == "stale"
    assert stale.is_stale is True
    assert stale.priority_score == 0
    assert stale.headline == "AAPL headline"
    assert stale.ai_take == "AAPL has a cached monitor brief with enough detail for the UI."
    assert stale.news_summary == "Recent English news focused on one product update and market reaction."
    assert stale.signals[0].title == "News signal"
    assert stale.technical_monitor.signals[0].id == "price_breakout_20d"
    assert stale.watchpoints[0].title == "Watch follow-through"
    assert stale.event_candidates[0].title == "Investor webcast"
    assert stale.source_refs[0].id == "news_1"
    assert stale.generated_at == "2026-06-15T20:00:00Z"
    assert all(item.symbol != "AAPL" for item in monitor.future_event_candidates)


@pytest.mark.asyncio
async def test_generate_test_user_universe_dedupes_symbols(monkeypatch):
    async def fake_watchlist(user_id: str):
        data = {
            "user-1": {"symbols": ["AAPL", "MSFT", "AAPL"]},
            "user-2": {"symbols": ["MSFT", "NVDA"]},
        }
        return data[user_id]

    async def fake_assignments(flag: str | None = None):
        assert flag == "watchlist_monitor_test_universe"
        return [
            {"user_id": "user-1", "flag": flag, "enabled": True},
            {"user_id": "user-2", "flag": flag, "enabled": True},
        ]

    captured: dict[str, object] = {}

    async def fake_generate_for_symbols(symbols: list[str], *, force: bool = False):
        captured["symbols"] = symbols
        captured["force"] = force
        return [
            service.GenerateTickerResult(symbol=symbol, success=True)
            for symbol in symbols
        ], []

    monkeypatch.setattr(service, "get_user_watchlist", fake_watchlist)
    monkeypatch.setattr(service.flags_db, "list_all_assignments", fake_assignments)
    monkeypatch.setattr(service, "generate_for_symbols", fake_generate_for_symbols)

    result = await service.generate_test_user_universe(
        user_ids=["user-1", "user-2"],
        force=True,
    )

    assert result.success is True
    assert result.requested_symbols == ["AAPL", "MSFT", "NVDA"]
    assert captured == {"symbols": ["AAPL", "MSFT", "NVDA"], "force": True}
    assert result.skipped_user_ids == []
    assert [item.user_id for item in result.user_watchlists] == ["user-1", "user-2"]
    assert result.generated_count == 3
    assert result.failed_count == 0


@pytest.mark.asyncio
async def test_generate_test_user_universe_dry_run_skips_generation(monkeypatch):
    async def fake_watchlist(user_id: str):
        return {"symbols": ["AAPL", "MSFT"]}

    async def fake_assignments(flag: str | None = None):
        assert flag == "watchlist_monitor_test_universe"
        return [{"user_id": "user-1", "flag": flag, "enabled": True}]

    async def fail_generate_for_symbols(symbols: list[str], *, force: bool = False):
        raise AssertionError("dry run must not generate")

    monkeypatch.setattr(service, "get_user_watchlist", fake_watchlist)
    monkeypatch.setattr(service.flags_db, "list_all_assignments", fake_assignments)
    monkeypatch.setattr(service, "generate_for_symbols", fail_generate_for_symbols)

    result = await service.generate_test_user_universe(
        user_ids=["user-1"],
        dry_run=True,
    )

    assert result.success is True
    assert result.dry_run is True
    assert result.requested_symbols == ["AAPL", "MSFT"]
    assert result.generated_count == 0


@pytest.mark.asyncio
async def test_generate_test_user_universe_skips_users_without_flag(monkeypatch):
    async def fail_watchlist(user_id: str):
        raise AssertionError("unflagged users must not load watchlists")

    async def fake_assignments(flag: str | None = None):
        assert flag == "watchlist_monitor_test_universe"
        return []

    async def fail_generate_for_symbols(symbols: list[str], *, force: bool = False):
        raise AssertionError("empty flagged universe must not generate")

    monkeypatch.setattr(service, "get_user_watchlist", fail_watchlist)
    monkeypatch.setattr(service.flags_db, "list_all_assignments", fake_assignments)
    monkeypatch.setattr(service, "generate_for_symbols", fail_generate_for_symbols)

    result = await service.generate_test_user_universe(user_ids=["user-1"])

    assert result.success is False
    assert result.skipped_user_ids == ["user-1"]
    assert result.skipped_user_count == 1
    assert result.requested_symbols == []


def test_merge_event_candidates_filters_window_and_dedupes():
    candidates = [
        EventCandidate(
            symbol="AAPL",
            event_type="investor_event",
            event_date="2026-06-20",
            date_precision="exact",
            title="Investor event",
            summary="First source",
            why_it_matters="It can reset expectations.",
            confidence="medium",
            source_ref_ids=["news_1"],
        ),
        EventCandidate(
            symbol="AAPL",
            event_type="investor_event",
            event_date="2026-06-20",
            date_precision="exact",
            title="Investor event",
            summary="Better source",
            why_it_matters="It can reset expectations.",
            confidence="high",
            source_ref_ids=["news_1", "news_2"],
        ),
        EventCandidate(
            symbol="AAPL",
            event_type="conference",
            event_date="2026-07-10",
            date_precision="exact",
            title="Out of window conference",
            summary="Too far away",
            why_it_matters="Should not appear yet.",
            confidence="high",
            source_ref_ids=["news_3"],
        ),
    ]

    merged = signal_builder.merge_event_candidates(
        candidates,
        symbol="AAPL",
        report_date="2026-06-15",
    )

    assert len(merged) == 1
    assert merged[0].title == "Investor event"
    assert merged[0].confidence == "high"
    assert merged[0].id.startswith("aapl_")


def test_future_event_candidates_filter_low_relevance_macro():
    macro_candidates = signal_builder._macro_event_candidates(
        "AMD",
        [
            {"id": "macro_1", "date": "2026-06-16", "event": "Housing Starts (May)", "impact": "High"},
            {"id": "macro_2", "date": "2026-06-17", "event": "FOMC Economic Projections", "impact": "High"},
            {"id": "macro_3", "date": "2026-06-17", "event": "Fed Interest Rate Decision", "impact": "High"},
            {"id": "macro_4", "date": "2026-06-17", "event": "Fed Press Conference", "impact": "High"},
        ],
        "2026-06-15",
    )

    assert len(macro_candidates) == 1
    assert macro_candidates[0].title == "FOMC 利率决议与经济预测"
    assert macro_candidates[0].source_ref_ids == ["macro_2", "macro_3", "macro_4"]


def test_build_technical_monitor_detects_chart_and_hard_signals():
    ohlcv = []
    for index in range(24):
        close = 100 + index * 0.5
        ohlcv.append({
            "date": "2026-05-%02d" % (index + 1),
            "open": close - 0.4,
            "high": close + 1,
            "low": close - 1,
            "close": close,
            "volume": 1_000_000,
        })
    ohlcv.append({
        "date": "2026-06-15",
        "open": 114,
        "high": 121,
        "low": 113,
        "close": 120,
        "volume": 2_400_000,
    })

    technical = {
        "ohlcv": ohlcv,
        "current": {
            "price": 120,
            "sma_20": 110,
            "sma_50": 105,
            "sma_200": 95,
            "rsi_14": 52,
            "bb_upper": 118,
            "bb_lower": 100,
            "macd_level": 1.2,
            "macd_signal": 1.1,
        },
        "indicators": {
            "sma_20": [{"date": "2026-06-14", "value": 109}, {"date": "2026-06-15", "value": 110}],
            "sma_50": [{"date": "2026-06-14", "value": 104}, {"date": "2026-06-15", "value": 105}],
            "sma_200": [{"date": "2026-06-14", "value": 94}, {"date": "2026-06-15", "value": 95}],
            "rsi_14": [{"date": "2026-06-14", "value": 48}, {"date": "2026-06-15", "value": 52}],
            "macd": [
                {"date": "2026-06-14", "macd": -0.1, "signal": 0.0, "histogram": -0.1},
                {"date": "2026-06-15", "macd": 1.2, "signal": 1.1, "histogram": 0.1},
            ],
        },
        "derived": {
            "ma_alignment": "bullish",
            "volume_ratio": 2.4,
            "macd_cross": "bullish_cross",
            "bb_position": "above_upper",
        },
        "support_resistance": {
            "support_1": 112,
            "resistance_1": 125,
        },
        "trend_summary": {
            "price_change_5d": 9.5,
            "volume_vs_avg": 2.4,
        },
    }

    monitor = signal_builder._build_technical_monitor(technical)
    signal_ids = {signal.id for signal in monitor.signals}

    assert monitor.summary.startswith("技术面整体偏强")
    assert monitor.key_levels["current_price"] == 120
    assert "price_breakout_20d" in signal_ids
    assert "high_volume_up" in signal_ids
    assert "macd_bullish_cross" in signal_ids
    assert monitor.technical_view.regime == "breakout_confirmation"
    assert "当前技术面偏强" in monitor.technical_view.verdict
    assert "趋势上" in monitor.technical_view.verdict
    assert "动能上" in monitor.technical_view.verdict
    assert "位置上" in monitor.technical_view.verdict
    assert "波动上" in monitor.technical_view.verdict
    assert monitor.technical_view.trend.state == "偏强"
    assert "RSI 14" in monitor.technical_view.momentum.explanation
    assert "MACD" in monitor.technical_view.momentum.explanation


def test_compact_market_context_adds_background_without_frontend_field():
    context = signal_builder._compact_market_context(
        "META",
        quote={"symbol": "META", "daily_change": 4.67, "price": 593.48},
        profile={
            "company_name": "Meta Platforms",
            "classification": {
                "sector": "Communication Services",
                "industry": "Internet Content & Information",
            },
        },
        market_quotes={
            "SPY": {"symbol": "SPY", "daily_change": 1.7, "price": 755.43},
            "QQQ": {"symbol": "QQQ", "daily_change": 3.1, "price": 640.12},
            "XLC": {"symbol": "XLC", "daily_change": 2.2, "price": 112.34},
            "TLT": {"symbol": "TLT", "daily_change": -0.4, "price": 86.2},
            "USO": {"symbol": "USO", "daily_change": -4.8, "price": 72.1},
        },
        sector_performance={
            "date": "2026-06-15",
            "sectors": [
                {
                    "sector": "Communication Services",
                    "exchange": "NASDAQ",
                    "averageChange": 2.15,
                    "date": "2026-06-15",
                }
            ],
        },
    )

    assert context["available"] is True
    assert context["market_tone"] == "risk_on_tech_led"
    assert context["company_profile"]["sector_proxy"] == "XLC"
    assert context["relative_move"]["vs_qqq_pct"] == 1.57
    assert context["relative_move"]["vs_sector_proxy_pct"] == 2.47
    assert context["sector_snapshot"]["average_change_pct"] == 2.15
    assert "do not imply precise move attribution" in context["usage"]
