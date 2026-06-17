"""Pydantic models for the AI watchlist monitor V0."""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.shared.llm_output import CoerceNoneToDefaultsMixin


TickerStatus = Literal["needs_attention", "watch", "quiet", "stale"]
SignalType = Literal[
    "news",
    "social",
    "event",
    "technical",
    "fundamental",
    "macro_sector",
]
SignalSeverity = Literal["low", "medium", "high"]
WatchpointType = Literal["dated_event", "open_watchpoint"]
Confidence = Literal["low", "medium", "high"]
EventType = Literal[
    "earnings",
    "macro",
    "corporate_action",
    "filing",
    "investor_event",
    "product_business",
    "regulatory_legal",
    "conference",
    "industry_event",
    "media_report",
    "social_watchpoint",
    "technical_trigger",
    "other_company_event",
]
EventStatus = Literal["scheduled", "tentative", "rumored", "completed"]
DatePrecision = Literal["exact", "week", "month", "unknown"]
TechnicalSignalCategory = Literal[
    "price",
    "moving_average",
    "volume",
    "momentum",
    "volatility",
    "structure",
]
TechnicalRegime = Literal[
    "breakout_confirmation",
    "uptrend",
    "range_bound",
    "pullback",
    "downtrend",
    "breakdown",
    "overextended",
    "insufficient_data",
]


class SourceRef(BaseModel):
    id: str = Field(..., max_length=40)
    type: str = Field(..., max_length=40)
    title: str = Field(..., max_length=220)
    title_zh: str = Field(default="", max_length=220)
    url: str = ""
    published_at: str = ""


class SignalBlock(CoerceNoneToDefaultsMixin, BaseModel):
    type: SignalType
    severity: SignalSeverity = "medium"
    title: str = Field(..., max_length=80)
    summary: str = Field(..., max_length=260)
    why_it_matters: str = Field(..., max_length=260)
    source_ref_ids: list[str] = Field(default_factory=list, max_length=6)
    observed_at: str = ""


class Watchpoint(CoerceNoneToDefaultsMixin, BaseModel):
    type: WatchpointType = "open_watchpoint"
    date: str | None = Field(default=None, description="YYYY-MM-DD for dated events")
    title: str = Field(..., max_length=90)
    what_to_watch: str = Field(..., max_length=260)
    why_it_matters: str = Field(default="", max_length=260)
    confidence: Confidence = "medium"
    source_ref_ids: list[str] = Field(default_factory=list, max_length=6)


class EventCandidate(BaseModel):
    """A future event or monitoring trigger relevant to one ticker."""

    id: str = Field(default="", max_length=80)
    symbol: str = ""
    event_type: EventType = "other_company_event"
    event_date: str | None = Field(default=None, description="YYYY-MM-DD when known")
    date_precision: DatePrecision = "unknown"
    title: str = Field(..., max_length=120)
    summary: str = Field(default="", max_length=360)
    why_it_matters: str = Field(default="", max_length=360)
    status: EventStatus = "scheduled"
    confidence: Confidence = "medium"
    source_ref_ids: list[str] = Field(default_factory=list, max_length=8)
    source_type: str = Field(default="", max_length=40)
    dedupe_key: str = Field(default="", max_length=160)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return (value or "").strip().upper()


class NewsEventCandidate(CoerceNoneToDefaultsMixin, BaseModel):
    """LLM-extracted future event candidate without free-form dict fields."""

    event_type: EventType = "other_company_event"
    event_date: str | None = Field(default=None, description="YYYY-MM-DD when known")
    date_precision: DatePrecision = "unknown"
    title: str = Field(..., max_length=120)
    summary: str = Field(default="", max_length=360)
    why_it_matters: str = Field(default="", max_length=360)
    status: EventStatus = "scheduled"
    confidence: Confidence = "medium"
    source_ref_ids: list[str] = Field(default_factory=list, max_length=8)
    source_type: str = Field(default="", max_length=40)


class TranslatedSourceTitle(CoerceNoneToDefaultsMixin, BaseModel):
    source_ref_id: str = Field(..., max_length=40)
    title_zh: str = Field(..., max_length=220)


class NewsSummaryOutput(CoerceNoneToDefaultsMixin, BaseModel):
    """Small output for summarizing the recent news flow."""

    news_summary: str = Field(default="", max_length=1200)
    key_themes: list[str] = Field(default_factory=list, max_length=6)
    source_ref_ids: list[str] = Field(default_factory=list, max_length=8)


class FutureEventExtractionOutput(CoerceNoneToDefaultsMixin, BaseModel):
    """Small output for company-specific future event extraction."""

    news_event_candidates: list[NewsEventCandidate] = Field(default_factory=list, max_length=6)


class NewsEventsSynthesisOutput(CoerceNoneToDefaultsMixin, BaseModel):
    """Single output for news summarization and future-event watchpoint synthesis."""

    news_summary: str = Field(default="", max_length=1200)
    key_themes: list[str] = Field(default_factory=list, max_length=6)
    source_ref_ids: list[str] = Field(default_factory=list, max_length=8)
    translated_news_titles: list[TranslatedSourceTitle] = Field(default_factory=list, max_length=15)
    news_event_candidates: list[NewsEventCandidate] = Field(default_factory=list, max_length=6)
    watchpoints: list[Watchpoint] = Field(default_factory=list, max_length=3)
    debug_notes: list[str] = Field(default_factory=list, max_length=6)


class TechnicalInterpretationOutput(CoerceNoneToDefaultsMixin, BaseModel):
    """Small output for explaining deterministic technical monitor inputs."""

    technical_take: str = Field(default="", max_length=650)
    signals: list[SignalBlock] = Field(default_factory=list, max_length=2)


class MarketDiscussionOutput(CoerceNoneToDefaultsMixin, BaseModel):
    """Small output for explaining cached social/KOL discussion."""

    discussion_summary: str = Field(default="", max_length=650)
    signals: list[SignalBlock] = Field(default_factory=list, max_length=2)


class BriefCompositionOutput(CoerceNoneToDefaultsMixin, BaseModel):
    """Small output for the final ticker-level monitor judgment."""

    status: TickerStatus
    headline: str = Field(..., max_length=80)
    ai_take: str = Field(..., min_length=40, max_length=650)
    signals: list[SignalBlock] = Field(default_factory=list, max_length=4)


class TechnicalMonitorSignal(BaseModel):
    id: str = Field(..., max_length=60)
    category: TechnicalSignalCategory
    title: str = Field(..., max_length=80)
    detail: str = Field(..., max_length=260)
    price: float | None = None
    reference: float | None = None


class TechnicalViewDimension(BaseModel):
    label: str = Field(default="", max_length=40)
    state: str = Field(default="", max_length=40)
    explanation: str = Field(default="", max_length=360)


class TechnicalView(BaseModel):
    regime: TechnicalRegime = "insufficient_data"
    verdict: str = Field(default="", max_length=650)
    trend: TechnicalViewDimension = Field(default_factory=TechnicalViewDimension)
    momentum: TechnicalViewDimension = Field(default_factory=TechnicalViewDimension)
    location: TechnicalViewDimension = Field(default_factory=TechnicalViewDimension)
    volatility: TechnicalViewDimension = Field(default_factory=TechnicalViewDimension)


class TechnicalMonitor(BaseModel):
    summary: str = Field(default="", max_length=500)
    technical_view: TechnicalView = Field(default_factory=TechnicalView)
    signals: list[TechnicalMonitorSignal] = Field(default_factory=list, max_length=12)
    key_levels: dict[str, float | None] = Field(default_factory=dict)
    updated_at: str = ""


class TickerBriefAgentOutput(CoerceNoneToDefaultsMixin, BaseModel):
    """Structured output produced by the ticker brief LLM."""

    status: TickerStatus
    headline: str = Field(..., max_length=80)
    ai_take: str = Field(..., min_length=40, max_length=650)
    news_summary: str = Field(default="", max_length=1200)
    translated_news_titles: list[TranslatedSourceTitle] = Field(default_factory=list, max_length=15)
    signals: list[SignalBlock] = Field(default_factory=list, max_length=4)
    watchpoints: list[Watchpoint] = Field(default_factory=list, max_length=3)
    news_event_candidates: list[NewsEventCandidate] = Field(default_factory=list, max_length=6)


class TickerDailyBrief(BaseModel):
    symbol: str
    brief_date: str
    model_version: str = "watchlist-monitor-v0"
    status: TickerStatus
    headline: str
    ai_take: str
    news_summary: str = ""
    technical_monitor: TechnicalMonitor = Field(default_factory=TechnicalMonitor)
    priority_score: int = Field(default=0, ge=0, le=100)
    signals: list[SignalBlock] = Field(default_factory=list)
    watchpoints: list[Watchpoint] = Field(default_factory=list)
    event_candidates: list[EventCandidate] = Field(default_factory=list)
    source_refs: list[SourceRef] = Field(default_factory=list)
    generated_at: str
    created_at: str | None = None
    updated_at: str | None = None

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return (value or "").strip().upper()


class Freshness(BaseModel):
    ai_generated_at: str | None = None
    quotes_updated_at: str | None = None
    social_updated_at: str | None = None
    events_updated_at: str | None = None


class MonitorSummary(BaseModel):
    needs_attention: int = 0
    new_signals: int = 0
    next_7d_watchpoints: int = 0
    quiet_tickers: int = 0
    stale_tickers: int = 0


class PriorityItem(BaseModel):
    symbol: str
    status: TickerStatus
    priority_score: int
    headline: str
    reason: str
    next_watchpoint: str = ""
    generated_at: str | None = None


class TickerRow(BaseModel):
    symbol: str
    status: TickerStatus
    priority_score: int
    headline: str
    ai_take: str
    news_summary: str = ""
    technical_monitor: TechnicalMonitor = Field(default_factory=TechnicalMonitor)
    signal_types: list[SignalType] = Field(default_factory=list)
    signals: list[SignalBlock] = Field(default_factory=list)
    watchpoints: list[Watchpoint] = Field(default_factory=list)
    event_candidates: list[EventCandidate] = Field(default_factory=list)
    source_refs: list[SourceRef] = Field(default_factory=list)
    top_signal: SignalBlock | None = None
    next_watchpoint: Watchpoint | None = None
    generated_at: str | None = None
    is_stale: bool = False


class WatchlistMonitorResponse(BaseModel):
    success: bool = True
    as_of: str
    symbols: list[str] = Field(default_factory=list)
    summary: MonitorSummary
    priority_items: list[PriorityItem] = Field(default_factory=list)
    ticker_rows: list[TickerRow] = Field(default_factory=list)
    future_watchpoints: list[Watchpoint] = Field(default_factory=list)
    future_event_candidates: list[EventCandidate] = Field(default_factory=list)
    freshness: Freshness = Field(default_factory=Freshness)
    missing_symbols: list[str] = Field(default_factory=list)


class GenerateRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list, max_length=25)
    user_id: str | None = None
    limit: int = Field(default=5, ge=1, le=25)
    force: bool = False

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for raw in value:
            symbol = (raw or "").strip().upper()
            if not symbol or symbol in seen:
                continue
            seen.add(symbol)
            out.append(symbol)
        return out


class TestUniverseUser(BaseModel):
    user_id: str
    symbols: list[str] = Field(default_factory=list)


class GenerateTestUniverseRequest(BaseModel):
    user_ids: list[str] = Field(default_factory=list, max_length=10)
    limit_per_user: int = Field(default=25, ge=1, le=50)
    max_symbols: int = Field(default=50, ge=1, le=50)
    force: bool = False
    dry_run: bool = False

    @field_validator("user_ids")
    @classmethod
    def normalize_user_ids(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for raw in value:
            user_id = (raw or "").strip()
            if not user_id or user_id in seen:
                continue
            seen.add(user_id)
            out.append(user_id)
        return out


class GenerateTickerResult(BaseModel):
    symbol: str
    success: bool
    status: TickerStatus | None = None
    headline: str = ""
    priority_score: int | None = None
    error: str = ""


class GenerateResponse(BaseModel):
    success: bool
    requested_symbols: list[str]
    generated: list[GenerateTickerResult]
    failed: list[GenerateTickerResult]


class GenerateTestUniverseResponse(BaseModel):
    success: bool
    dry_run: bool = False
    user_ids: list[str] = Field(default_factory=list)
    user_watchlists: list[TestUniverseUser] = Field(default_factory=list)
    failed_user_ids: list[str] = Field(default_factory=list)
    skipped_user_ids: list[str] = Field(default_factory=list)
    requested_symbols: list[str] = Field(default_factory=list)
    symbol_count: int = 0
    generated_count: int = 0
    failed_count: int = 0
    failed_user_count: int = 0
    skipped_user_count: int = 0
    generated: list[GenerateTickerResult] = Field(default_factory=list)
    failed: list[GenerateTickerResult] = Field(default_factory=list)
