"""
Twitter KOL Digest - Pydantic schemas (V2 + V3).

V3 design (2026-05-04):
  - Enrichment stage (flash-lite, daily) populates per-tweet metadata into
    `kol_tweets.symbols` JSONB. See `EnrichmentOutput`.
  - Digest stage (pro, daily) reads enriched tweets and outputs an aggregation
    schema with topics / briefs / solo_voices instead of per-tweet picks.
    See `Topic`, `Brief`, `SoloVoice`, `CuratedDigestOutput`.
  - V2 fields (macro_picks / industry_picks / stock_picks) are preserved on
    `DailyDigest` for backward read compatibility with rows written before
    V3 cutover. New V3 rows leave V2 fields empty and vice versa; the
    `schema_version` field on `DailyDigest` selects the rendering path.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ============================================================================
# Enrichment (Step 1) — flash-lite per-tweet metadata
# ============================================================================

QualityBand = Literal["high", "medium", "low"]
QualityFeature = Literal["data", "reasoning", "catalyst", "comparison", "risk"]


class EnrichmentOutput(BaseModel):
    """LLM structured output for one-tweet enrichment.

    Maps to a single object stored under `kol_tweets.symbols` JSONB.
    Backend adds `enriched_at` / `enriched_model` after the LLM call.
    """

    quality: QualityBand = Field(
        description="'high' if the tweet hits >=2 of the 5 quality features; "
                    "'medium' if exactly 1; 'low' if 0. The same 5 features as "
                    "the V2 quality bar: data, reasoning, catalyst, comparison, risk."
    )
    quality_features: list[QualityFeature] = Field(
        default_factory=list,
        description="Which features the tweet hit. Empty when quality='low'.",
    )
    content_summary_zh: str = Field(
        default="",
        max_length=80,
        description="Single Chinese sentence (~15-40 chars) describing what the "
                    "tweet is about. Not a translation — a editorial gist. Reused "
                    "downstream as brief one-liners.",
    )
    tickers: list[str] = Field(
        default_factory=list,
        description="Stock tickers discussed. Uppercase 2-5 chars or all-digit "
                    "A-share codes (6 digits). Excludes Twitter usernames.",
    )
    sectors: list[str] = Field(
        default_factory=list,
        description="Chinese sector / theme labels (e.g. '加密资产', 'AI 算力').",
    )
    events: list[str] = Field(
        default_factory=list,
        description="Short event labels in Chinese or English (e.g. 'Clarity Act', "
                    "'Q2 财报前瞻'). Drift is allowed — pro digest stage does the "
                    "final canonical naming.",
    )


# ============================================================================
# V2 (legacy) — single-tweet picks. Kept for backward read compatibility.
# ============================================================================

CuratedCategory = Literal["macro", "industry", "stock"]
CuratedDepth = Literal["deep", "flash"]


class CuratedTweet(BaseModel):
    """V2: one curated KOL tweet with bilingual content + AI interpretation.

    No longer the primary output unit in V3, but kept on `DailyDigest` so that
    digests written before the V3 cutover continue to render. New V3 digests
    leave the V2 buckets empty.
    """

    tweet_id: str
    username: str
    display_name: str
    created_at: str
    tweet_type: str
    url: str

    category: CuratedCategory
    primary_ticker: str = ""
    sector: str = ""

    depth: CuratedDepth = "flash"
    interpretation_zh: str
    tldr_zh: str = ""
    translation_zh: str = ""

    text_en: str = ""
    text_zh: str = ""

    like_count: int = 0
    retweet_count: int = 0
    view_count: int = 0
    reply_count: int = 0
    quality_score: float = 0.0


# ============================================================================
# V3 — aggregation output: topics / briefs / solo_voices
# ============================================================================

TopicLayer = Literal["macro", "industry", "stock"]
ArgStance = Literal["bullish", "bearish", "neutral"]


class KeyArgument(BaseModel):
    """One KOL's contribution to a Topic — a single argument distilled.

    `tweet_url` is the source-of-truth link; `tweet_id` lets the frontend cross-
    reference. Engagement counts are not duplicated here — Topic carries
    aggregate signal (participating_kols count); per-argument detail can be
    pulled from the source row when needed.
    """

    tweet_id: str
    username: str
    display_name: str
    stance: ArgStance
    tldr_zh: str = Field(
        max_length=200,
        description="One-sentence Chinese distillation of this KOL's argument. "
                    "Should preserve the data / claim / catalyst / comparison "
                    "that earned this tweet a place.",
    )
    tweet_url: str


class Topic(BaseModel):
    """A multi-tweet aggregated view on one event / ticker / sector.

    Triggered when >=2 high-quality tweets cluster under the same event/ticker/
    sector, OR when a single high-quality thread/article has enough substance.
    """

    title: str = Field(
        description="Card title in the form '$TICKER · 事件' or '行业 · 主题' or "
                    "'宏观 · 主题'. ~10-30 Chinese chars.",
    )
    layer: TopicLayer
    primary_ticker: str = Field(
        default="",
        description="Required when layer='stock'. Empty otherwise.",
    )
    sector: str = Field(
        default="",
        description="Required when layer='industry'. Empty otherwise.",
    )
    event: str = Field(
        default="",
        description="Canonical event label after pro-stage merging. Optional.",
    )
    participating_kols: list[str] = Field(
        default_factory=list,
        description="Distinct KOL usernames in this topic (LLM-emitted; "
                    "post-processed to match key_arguments).",
    )
    stance_distribution: str = Field(
        default="",
        description="Backend-filled. e.g. '5 位博主 · 4 看多 / 1 谨慎'.",
    )
    synthesis_zh: str = Field(
        description="Editorial synthesis of the multi-KOL view, 3-5 Chinese "
                    "sentences. Must mention divergence when stances differ.",
    )
    key_arguments: list[KeyArgument] = Field(
        default_factory=list,
        description="2-5 distilled KOL arguments under this topic.",
    )


class Brief(BaseModel):
    """A single high/medium-quality tweet that didn't aggregate.

    `one_liner_zh` is backend-filled from the source's `content_summary_zh`
    (enrichment output), not LLM-rewritten in the digest stage.
    """

    layer: TopicLayer
    label: str = Field(
        description="Brief tag — e.g. '$TSLA' or '半导体' or 'Fed 5月会议'.",
    )
    one_liner_zh: str = Field(
        default="",
        max_length=120,
        description="Backend-filled gist of the tweet. <=120 chars.",
    )
    why_it_matters_zh: str = Field(
        default="",
        max_length=120,
        description="LLM-emitted: 1 short Chinese sentence (~30-60 chars) on "
                    "why this single tweet is worth knowing — sector "
                    "implication, beneficiary, risk signal, or read-across. "
                    "Empty string allowed when there is no clear secondary read.",
    )
    username: str
    display_name: str
    tweet_id: str
    tweet_url: str


SoloTweetType = Literal["thread", "article"]


class SoloVoice(BaseModel):
    """A single high-quality thread/article with no peer discussion.

    Triggered when a KOL writes a long-form deep dive that nobody else discusses.
    """

    title: str = Field(
        description="Editorial title in Chinese, ~15-30 chars.",
    )
    username: str
    display_name: str
    primary_ticker: str = ""
    tweet_type: SoloTweetType = Field(
        description="'thread' or 'article'. LLM occasionally emits 'original' — "
                    "Literal forces a validation error before the bad row reaches DB.",
    )
    tldr_zh: str = Field(
        description="3-5 Chinese sentences distilling the long-form argument.",
    )
    interpretation_zh: str = Field(
        description="Why this is worth reading — 1 sentence.",
    )
    tweet_id: str
    tweet_url: str


class CuratedDigestOutput(BaseModel):
    """V3 LLM structured output. The pro model produces this.

    V2 buckets (macro_picks/industry_picks/stock_picks) are NOT in this schema —
    they're stripped from the LLM output and only live on the persisted
    DailyDigest for backward read compat.
    """

    headline: str = Field(
        max_length=60,
        description="Single-sentence main thread of today's KOL discourse. "
                    "15-25 Chinese chars ideal; <=60 cap.",
    )
    intro: str = Field(
        max_length=200,
        description="Lede paragraph, ~20-50 Chinese chars. Editorial voice — what "
                    "is everyone arguing about today?",
    )
    takeaway: list[str] = Field(
        default_factory=list,
        description="3-5 short Chinese bullet lines (~30 chars each). Each line "
                    "should anchor to a topic via the topic title.",
    )
    topics: list[Topic] = Field(
        default_factory=list,
        description="5-15 aggregated topic cards. Empty allowed for sparse days.",
    )
    briefs: list[Brief] = Field(
        default_factory=list,
        description="10-25 single-tweet briefs. Empty allowed.",
    )
    solo_voices: list[SoloVoice] = Field(
        default_factory=list,
        description="0-5 single-KOL deep dives. Empty allowed.",
    )
    crosscut: str = Field(
        default="",
        max_length=400,
        description="Cross-topic synthesis — echoes / divergence / connections. "
                    "2-3 Chinese sentences. Empty allowed.",
    )
    watch_next: list[str] = Field(
        default_factory=list,
        description="1-3 things to watch for tomorrow (catalysts, data, earnings). "
                    "Empty allowed.",
    )


# ============================================================================
# V4 LLM output — ticker-as-topic + 论据指向
# ============================================================================


class CuratedDigestOutputV4(BaseModel):
    """V4 LLM structured output. Ticker-clustered, direction-driven.

    Forward-looking schema: replaces V3's topics+briefs with ticker_theses+
    macro_threads. The LLM no longer judges KOL stance; it classifies the
    direction of arguments (buy/sell/observation) as decision input.
    """

    headline: str = Field(
        max_length=60,
        description="主线一句, 15-25 字, <=60 cap.",
    )
    intro: str = Field(
        max_length=240,
        description="导言段, 30-80 字. 编辑话术 — 今天最值得注意的事.",
    )
    takeaway: list[str] = Field(
        default_factory=list,
        description="3-5 条要点, 每条 15-30 字. 锚到下方 ticker_thesis 或 macro_thread.",
    )
    ticker_theses: list["TickerThesis"] = Field(
        default_factory=list,
        description="≥2 KOL 提到同一 ticker 即聚合. 5-15 个/天典型.",
    )
    macro_threads: list["MacroThread"] = Field(
        default_factory=list,
        description="非个股讨论 (Fed/CPI/地缘/监管). 0-5 个/天.",
    )
    crosscut: str = Field(
        default="",
        max_length=400,
        description="(deprecated in V4.2) 跨主题观察, 不再渲染.",
    )
    watch_next: list[str] = Field(
        default_factory=list,
        description="(deprecated in V4.2) plain string watchpoints, 不再渲染. 请用 watchpoints.",
    )
    watchpoints: list["WatchpointItem"] = Field(
        default_factory=list,
        description="V4.2: 4-7 条结构化短期未来注意点.",
    )


# ============================================================================
# DailyDigest — top-level read model used by API + DB
# ============================================================================


class DailyDigest(BaseModel):
    """The full digest persisted in `kol_daily_digests` and returned by the API.

    Combines V2 fields (legacy reads) and V3 fields (new). `schema_version`
    selects which fields are populated:
      - schema_version='v2': macro/industry/stock_picks + takeaway populated;
        V3 fields empty.
      - schema_version='v3': headline/intro/topics/briefs/solo_voices/crosscut/
        watch_next populated; V2 buckets empty.
    """

    # Meta
    generated_at: str
    window_hours: int
    input_tweet_count: int
    tracked_kols: list[str]
    model_version: str
    schema_version: Literal["v2", "v3", "v4"] = Field(
        default="v2",
        description="Selects rendering path: v2=legacy buckets, v3=topics+briefs, "
                    "v4=ticker_theses+macro_threads (论据指向 driven).",
    )

    # Shared
    takeaway: list[str] = Field(default_factory=list)

    # V2 (legacy)
    macro_picks: list[CuratedTweet] = Field(default_factory=list)
    industry_picks: list[CuratedTweet] = Field(default_factory=list)
    stock_picks: list[CuratedTweet] = Field(default_factory=list)

    # V3
    headline: str = ""
    intro: str = ""
    topics: list[Topic] = Field(default_factory=list)
    briefs: list[Brief] = Field(default_factory=list)
    solo_voices: list[SoloVoice] = Field(default_factory=list)
    crosscut: str = ""
    watch_next: list[str] = Field(default_factory=list)

    # V3.1 — backend-computed frequency tallies. Each item is {label, count}.
    # Counted across the kept (high+medium quality) candidate tweets via the
    # enrichment-stage `tickers / sectors / events` tags. Not LLM-emitted.
    hot_sectors: list["HotItem"] = Field(default_factory=list)
    hot_tickers: list["HotItem"] = Field(default_factory=list)
    hot_events: list["HotItem"] = Field(default_factory=list)

    # V4 — ticker-as-topic + 论据指向 (buy/sell/observation)
    # Replaces V3 `topics` for stock-level discussions. Macro/industry topics
    # move to `macro_threads`. V2/V3 fields preserved for backward compat.
    ticker_theses: list["TickerThesis"] = Field(default_factory=list)
    macro_threads: list["MacroThread"] = Field(default_factory=list)

    # V4.1 — 其他热议 (transparency tail)
    other_tickers: list["OtherTickerMention"] = Field(default_factory=list)
    notable_tweets: list["NotableTweet"] = Field(default_factory=list)

    # V4.2 — 短期未来注意点 (replaces watch_next plain strings)
    watchpoints: list["WatchpointItem"] = Field(default_factory=list)


class StanceCounts(BaseModel):
    """Bullish / bearish / neutral counts for ticker-level stance display."""
    bullish: int = 0
    bearish: int = 0
    neutral: int = 0


class HotItem(BaseModel):
    """One row in a hot-list ranking.

    `count` is mention count across kept tweets. `kols` is the count of
    distinct KOL authors (always <= count). `stance` is populated only for
    tickers that appear as a topic's primary_ticker — projected from
    `key_arguments[].stance`. None means we have mention data but no stance
    signal (so the UI hides the bar).
    """
    label: str
    count: int
    kols: int = 0
    stance: Optional[StanceCounts] = None


# ============================================================================
# V4 — ticker-as-topic + 论据指向
# ============================================================================


class Argument(BaseModel):
    """One argument in a TickerThesis or MacroThread.

    `direction` is the LOGICAL DIRECTION of the argument as decision input —
    not the author's emotional stance. `buy` = supports buying, `sell` =
    supports selling/avoiding, `observation` = data/research/news without
    a clear directional claim. The reframing avoids LLM having to interpret
    KOL intent; it only classifies what the argument supports.
    """
    kol: str = Field(..., description="KOL username (lowercase)")
    point_zh: str = Field(
        ..., max_length=400,
        description="60-150 字中文论据 — 必须含具体数据/事件/对比/catalyst,"
                    "不接受'强劲''看好'这类空形容词",
    )
    direction: Literal["buy", "sell", "observation"]
    tweet_url: str = Field(..., description="Source tweet URL for provenance")


class TickerThesis(BaseModel):
    """A ticker-centric section.

    Triggered when ≥2 distinct KOLs mentioned the same ticker in the window.
    Aggregates all relevant arguments under buy / sell / observation, with
    a 1-sentence synthesis. NOT clustered by event — all NVDA discussion
    goes here regardless of underlying event.
    """
    ticker: str = Field(..., description="Ticker symbol, no $ prefix, e.g. 'NVDA'")
    primary_kols: list[str] = Field(default_factory=list)
    tweet_count: int = 0
    synthesis_zh: str = Field(
        default="", max_length=900,
        description="150-300 字综述,三段式:焦点 + 共识 + 分歧/风险点。"
                    "前端默认只显示 synthesis,论据折叠,所以这段必须自给自足、有信息密度。",
    )
    buy_arguments: list[Argument] = Field(default_factory=list)
    sell_arguments: list[Argument] = Field(default_factory=list)
    observation_arguments: list[Argument] = Field(default_factory=list)


class MacroThread(BaseModel):
    """Non-ticker discussion: Fed, CPI, geopolitics, regulation, sector-wide."""
    title: str = Field(..., description="标题, 例: '美联储 5 月议息预期', 'Clarity Act 立法投票'")
    layer: Literal["macro", "industry"] = "macro"
    primary_kols: list[str] = Field(default_factory=list)
    synthesis_zh: str = Field(
        default="", max_length=1200,
        description="200-400 字综述,三段式:焦点 + 共识 + 分歧/影响。"
                    "前端默认只显示 synthesis,key_points 折叠,所以这段必须自给自足。",
    )
    key_points: list[Argument] = Field(
        default_factory=list,
        description="Key points; direction may be 'observation' for most macro.",
    )


# ============================================================================
# V4.1 — 其他热议 (transparency tail)
# ============================================================================


class OtherTickerMention(BaseModel):
    """A ticker that was mentioned by ≥N KOLs but didn't make the main 6 theses."""
    ticker: str
    mentions: int
    kols: int


class NotableTweet(BaseModel):
    """A high-engagement quality tweet not cited in any thesis or macro thread."""
    kol: str
    summary_zh: str  # from enrichment.content_summary_zh
    tweet_url: str
    engagement: int  # likes + 2*retweets + 5*replies
    tickers: list[str] = Field(default_factory=list)  # for context chips


# ============================================================================
# V4.2 — 短期未来注意点 (forward-looking aggregation, replaces watch_next)
# ============================================================================


class WatchpointItem(BaseModel):
    """A forward-looking event multiple KOLs are watching.

    Replaces the single-line `watch_next`. Aggregates structured signal:
    - title: concrete event with subject (NOT generic '财报' / 'CPI')
    - date_hint: when it lands ('6/24', '下周三', '本月底', or '' if vague)
    - why_it_matters_zh: 100-200 字 explaining stakes + key debate
    - related_tickers: tickers directly affected (for jump links)
    - evidence: source tweets — 2-5 KOL quotes that flagged this event
    """
    title: str = Field(
        ..., max_length=80,
        description="具体事件名,必须含主体. 例: 'NVDA Q1 财报', '美国 4 月 CPI'.",
    )
    date_hint: str = Field(
        default="", max_length=40,
        description="时间锚, 例: '6/24', '下周三', '本月底'. 不知道留空.",
    )
    why_it_matters_zh: str = Field(
        ..., max_length=500,
        description="100-200 字: 焦点 + 关键看点 + 多空分歧 (如有).",
    )
    related_tickers: list[str] = Field(default_factory=list)
    evidence: list["Argument"] = Field(
        default_factory=list,
        description="2-5 条原推引用,每条 kol + point_zh + tweet_url. "
                    "direction 通常是 observation(在等事件,还没发生).",
    )
    # kols_watching kept as derived/summary field — frontend can compute from evidence
    kols_watching: list[str] = Field(default_factory=list)


DailyDigest.model_rebuild()
