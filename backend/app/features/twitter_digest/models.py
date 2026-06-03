"""
Twitter KOL Digest — Pydantic schemas.

Two stages:
  - Enrichment (flash-lite, daily): per-tweet metadata into `kol_tweets.symbols`
    JSONB. See `EnrichmentOutput`.
  - Digest (pro, daily): reads enriched tweets and emits ticker_theses +
    macro_threads + watchpoints. See `CuratedDigestOutput`, `DailyDigest`.

Ticker-clustered, direction-driven: the LLM classifies the *logical direction*
of each argument as decision input (buy / sell / observation) rather than the
author's emotional stance.
"""

from typing import Literal

from pydantic import BaseModel, Field


# ============================================================================
# Enrichment — flash-lite per-tweet metadata
# ============================================================================

QualityBand = Literal["keep", "drop"]
Stance = Literal["bull", "bear", "neutral"]


class TickerStance(BaseModel):
    """Per-ticker bull/bear/neutral stance extracted from one tweet.

    One tweet can express different stances on different tickers
    (e.g. "buy NVDA, sell AMD"), so stance is bound to the ticker, not the tweet.
    """

    ticker: str = Field(
        ...,
        description="Ticker symbol, uppercase 2-5 chars or 6-digit A-share code, "
                    "no $ prefix.",
    )
    stance: Stance = Field(
        ...,
        description="Author's directional view on THIS ticker. 'bull' supports "
                    "owning/adding, 'bear' supports selling/avoiding, 'neutral' "
                    "is data/news/factual with no clear directional claim.",
    )


class EnrichmentOutput(BaseModel):
    """LLM structured output for one-tweet enrichment.

    Maps to a single object stored under `kol_tweets.symbols` JSONB.
    Backend adds `enriched_at` / `enriched_model` after the LLM call.

    Minimal by design: only what the daily digest needs to (a) decide whether
    to keep the tweet and (b) cluster it by ticker × stance.
    """

    quality: QualityBand = Field(
        description="'keep' if the tweet has a falsifiable thesis / specific "
                    "data / reasoning / catalyst / comparison / risk callout. "
                    "'drop' for pure cheering, price reactions, ticker lists, "
                    "philosophy, or off-topic.",
    )
    ticker_stances: list[TickerStance] = Field(
        default_factory=list,
        description="Per-ticker stances explicitly expressed in the tweet. "
                    "Empty when quality='drop' or no tickers discussed.",
    )
    sectors: list[str] = Field(
        default_factory=list,
        description="Chinese sector / theme labels (e.g. '加密资产', 'AI 算力'). "
                    "1-3 labels; empty when no sector view.",
    )


# ============================================================================
# Argument — one KOL's contribution to a thesis / thread / watchpoint
# ============================================================================


class Argument(BaseModel):
    """One argument in a TickerThesis, MacroThread, or WatchpointItem.

    `direction` is the LOGICAL DIRECTION of the argument as decision input —
    not the author's emotional stance:
      - buy:         argument supports buying / adding
      - sell:        argument supports selling / avoiding
      - observation: objective info without a clear directional claim
    """
    kol: str = Field(..., description="KOL username (lowercase)")
    point_zh: str = Field(
        ..., max_length=400,
        description="60-150 字中文论据 — 必须含具体数据/事件/对比/catalyst,"
                    "不接受'强劲''看好'这类空形容词",
    )
    direction: Literal["buy", "sell", "observation"]
    tweet_url: str = Field(..., description="Source tweet URL for provenance")


# ============================================================================
# TickerThesis — per-ticker aggregation
# ============================================================================


TickerSide = Literal["disputed", "bull", "bear"]


class TickerThesis(BaseModel):
    """A ticker-centric section.

    Triggered when ≥2 distinct KOLs mentioned the same ticker in the window.
    Each thesis is classified by `side` (disputed / bull / bear) so the front
    end can group:
      ⚔️ disputed — both bulls and bears with material support
      🟢 bull     — bullish-leaning consensus
      🔴 bear     — bearish-leaning consensus

    `side` is computed by the backend (`_compute_thesis_side`) from the
    surviving buy/sell argument counts, not asked from the LLM.
    """
    ticker: str = Field(..., description="Ticker symbol, no $ prefix, e.g. 'NVDA'")
    side: TickerSide = Field(
        default="bull",
        description="Aggregate stance: 'disputed' when both bulls and bears "
                    "support meaningfully, otherwise the leaning side. "
                    "Computed by the backend post-LLM.",
    )
    primary_kols: list[str] = Field(default_factory=list)
    tweet_count: int = 0
    stance_summary: str = Field(
        default="", max_length=80,
        description="10-25 字一句话描述博主们对这只票的整体态度,"
                    "比 side 的 disputed/bull/bear 三档更具体、更多元。"
                    "例: '5 位博主一致押 AI 内存周期还远没顶', "
                    "'多空在估值上打架, 长线派坚守 2030 目标', "
                    "'唯一看空者警告高估值, 其余押 catalyst'.",
    )
    synthesis_zh: str = Field(
        default="", max_length=700,
        description="100-200 字成熟段落:把多方观点综合呈现 —— 多头在押什么、"
                    "空头在担心什么、共识点 / 分歧点 / 决定性变量分别是什么. "
                    "读者读完应该清楚'这只票的故事',无需再点进网页. "
                    "口语化,不要写'综合来看''总体而言'这类编辑腔.",
    )
    buy_arguments: list[Argument] = Field(default_factory=list)
    sell_arguments: list[Argument] = Field(default_factory=list)
    observation_arguments: list[Argument] = Field(default_factory=list)

    # Counts preserved when the arguments arrays are hidden behind the paywall.
    # Default to 0; backend populates them from the array lengths before locking.
    buy_count: int = 0
    sell_count: int = 0
    observation_count: int = 0


class MacroThread(BaseModel):
    """Non-ticker discussion: Fed, CPI, geopolitics, regulation, sector-wide.

    Rendered in a "💭 其他热议" catch-all section as short bullets. Keep it
    tight — readers want stock signal, macro is context not headline.
    """
    title: str = Field(
        ..., description="标题, 例: '美联储 5 月议息预期', 'Clarity Act 立法投票'"
    )
    layer: Literal["macro", "industry"] = "macro"
    primary_kols: list[str] = Field(default_factory=list)
    synthesis_zh: str = Field(
        default="", max_length=700,
        description="100-180 字成熟段落:博主圈在这个宏观/行业话题上的多方观点 —— "
                    "谁押什么、分歧在哪、决定性数据/事件是什么. "
                    "口语化,不要写'综合来看''总体而言'.",
    )
    key_points: list[Argument] = Field(
        default_factory=list,
        description="Topic 下被过滤保留下来的推文观点摘要; <=12 条尽量全收, "
                    ">12 条时保留最多 12 条代表性观点.",
    )
    # Count preserved when `key_points` is stripped for non-Max users.
    key_points_count: int = 0


# ============================================================================
# Transparency tail — other_tickers
# ============================================================================


class OtherTickerMention(BaseModel):
    """A ticker mentioned by ≥N KOLs but not surfaced as a TickerThesis."""
    ticker: str
    mentions: int
    kols: int


# ============================================================================
# Watchpoints — forward-looking aggregation
# ============================================================================


class WatchpointItem(BaseModel):
    """A forward-looking event multiple KOLs are watching.

    Rendered as a one-line agenda item (date · event · 一句话 why). The bulky
    why_it_matters write-up was removed — readers want a calendar, not analysis.
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
        ..., max_length=600,
        description="80-130 字多视角段落:博主们为什么在等这事 + 多头押什么结果 + "
                    "空头担心什么结果 + 关键观察指标(什么数据/言论决定方向). "
                    "口语化,群体视角(多头/空头/谨慎派),不点博主名.",
    )
    related_tickers: list[str] = Field(default_factory=list)
    evidence: list[Argument] = Field(
        default_factory=list,
        description="1-2 条原推引用作为可信度锚 (折叠展开).",
    )
    # Count preserved when `evidence` is stripped for non-Max users.
    evidence_count: int = 0
    kols_watching: list[str] = Field(default_factory=list)


# ============================================================================
# Hot lists — backend-computed frequency tallies
# ============================================================================


class HotItem(BaseModel):
    """One row in a hot-list ranking.

    `count` is mention count across kept tweets. `kols` is the count of
    distinct KOL authors (always <= count).
    """
    label: str
    count: int
    kols: int = 0


# ============================================================================
# CuratedDigestOutput — what the pro LLM returns
# ============================================================================


class CuratedDigestOutput(BaseModel):
    """LLM structured output for the digest stage.

    Ticker-clustered, direction-driven. The LLM doesn't judge KOL stance;
    it classifies the direction of each argument as a decision input.
    """

    headline: str = Field(
        max_length=60,
        description="一行结语 (15-30 字): 今天 KOL 圈最值得知道的一句. "
                    "侧重'今天谁的票被多空打架'而非'我们今天讨论了 X'. "
                    "例: '今天 MU 多空打架最激烈, NVDA 一边倒看多'.",
    )
    intro: str = Field(
        default="",
        max_length=500,
        description="已弃用: 前端不再渲染. 留空字符串.",
    )
    ticker_theses: list[TickerThesis] = Field(
        default_factory=list,
        description="≥2 KOL 提到同一 ticker 即聚合. 5-15 个/天典型. "
                    "side 字段后端算, 不要 LLM 填.",
    )
    macro_threads: list[MacroThread] = Field(
        default_factory=list,
        description="非个股讨论 (Fed/CPI/地缘/监管). 0-5 个/天, 短句呈现.",
    )
    watchpoints: list[WatchpointItem] = Field(
        default_factory=list,
        description="3-5 条短期关注事件 (日期 · 事件 · 一句话 why).",
    )


# ============================================================================
# DailyDigest — top-level read model used by API + DB
# ============================================================================


class DailyDigest(BaseModel):
    """The full digest persisted in `kol_daily_digests` and returned by the API."""

    # Meta
    date: str = ""  # ET market date the digest covers (YYYY-MM-DD); empty for legacy rows
    generated_at: str
    window_hours: int
    input_tweet_count: int
    tracked_kols: list[str]
    model_version: str

    # Editorial
    headline: str = ""
    intro: str = ""

    # Hot lists (backend-computed frequency tallies over kept candidate tweets,
    # via the enrichment-stage tickers / sectors / events tags)
    hot_sectors: list[HotItem] = Field(default_factory=list)
    hot_tickers: list[HotItem] = Field(default_factory=list)
    hot_events: list[HotItem] = Field(default_factory=list)

    # Main content
    ticker_theses: list[TickerThesis] = Field(default_factory=list)
    macro_threads: list[MacroThread] = Field(default_factory=list)
    watchpoints: list[WatchpointItem] = Field(default_factory=list)

    # Transparency tail
    other_tickers: list[OtherTickerMention] = Field(default_factory=list)

    # Paywall flag — True when arguments / synthesis / evidence have been
    # stripped because the caller lacks the `twitter_digest` entitlement.
    # Frontend uses this (plus the per-section *_count fields preserved on
    # TickerThesis / MacroThread / WatchpointItem) to render locked skeletons
    # in place of the actual paid content.
    is_locked: bool = False


class DailyDigestListItem(BaseModel):
    """Lightweight digest row for archive lists and public teaser surfaces."""

    date: str
    generated_at: str
    headline: str = ""
    input_tweet_count: int = 0
    tracked_kol_count: int = 0
    hot_tickers: list[HotItem] = Field(default_factory=list)
    hot_sectors: list[HotItem] = Field(default_factory=list)
    hot_events: list[HotItem] = Field(default_factory=list)
    intro_preview: str = ""


class DailyDigestArchiveResponse(BaseModel):
    """Paginated archive response."""

    data: list[DailyDigestListItem] = Field(default_factory=list)
    total: int = 0


class TwitterDigestTeaser(BaseModel):
    """Public, non-sensitive preview of a Max-only Twitter digest."""

    date: str
    generated_at: str
    headline: str = ""
    input_tweet_count: int = 0
    tracked_kol_count: int = 0
    hot_tickers: list[HotItem] = Field(default_factory=list)
    hot_sectors: list[HotItem] = Field(default_factory=list)
    hot_events: list[HotItem] = Field(default_factory=list)
    intro_preview: str = ""
