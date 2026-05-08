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

from typing import Literal

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
    schema_version: Literal["v2", "v3"] = Field(
        default="v2",
        description="Selects rendering path; v2 for legacy rows, v3 for new.",
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


class HotItem(BaseModel):
    """One row in a hot-list ranking — raw label + mention count."""
    label: str
    count: int


DailyDigest.model_rebuild()
