"""
Twitter KOL Digest - Pydantic schemas (V2 structure).

V2 surfaces:
  - takeaway:        3-5 line summary of today's signals (top of page)
  - macro_picks:     KOL views on broad market / indices / cross-asset flow
  - industry_picks:  KOL views on a sector (AI, semi, lithium, crypto-as-asset-class, ...)
  - stock_picks:     KOL views on a single ticker

V2 deliberately drops bullish/bearish/neutral buckets — content TYPE is what
matches the retail mental model, not sentiment label. Sentiment lives inside
the AI interpretation prose, not as a structural axis.

Quality bar (enforced via prompt + manual review):
  Each pick must show clear REASONING — numbers, explicit inference chain,
  falsifiable claim, comparison, or self-acknowledged risk. Pure stance,
  price reactions, vague endorsements, and philosophy posts are dropped.
"""

from typing import Literal

from pydantic import BaseModel, Field


CuratedCategory = Literal["macro", "industry", "stock"]


class CuratedTweet(BaseModel):
    """One curated KOL tweet with bilingual content + a brief AI interpretation."""

    tweet_id: str
    username: str
    display_name: str = Field(description="KOL's human-readable name")
    text_en: str = Field(
        description="Original English tweet text (verbatim). Empty string '' "
                    "when the source tweet is already Chinese — do NOT translate "
                    "Chinese back into English.",
    )
    text_zh: str = Field(
        description="If source is English: faithful Chinese translation. "
                    "If source is already Chinese: copy original verbatim.",
    )
    created_at: str
    tweet_type: str = Field(description="original / quote / reply / thread / article")
    url: str = Field(description="Direct link to the tweet on X")
    category: CuratedCategory = Field(
        description="'macro' = broad market / index / cross-asset; "
                    "'industry' = sector-level (incl. crypto as asset class); "
                    "'stock' = single-ticker view.",
    )
    primary_ticker: str = Field(
        default="",
        description="Single ticker discussed (e.g. 'NVDA', '600519', 'SOL'). "
                    "Required when category='stock'; empty '' otherwise.",
    )
    sector: str = Field(
        default="",
        description="Sector name when category='industry' (e.g. 'AI 算力', "
                    "'加密', '锂电'). Empty '' otherwise. LLM is free to pick "
                    "the natural Chinese sector label.",
    )
    interpretation_zh: str = Field(
        description="HEADLINE — ≤2 Chinese sentences (≤120 chars) capturing the "
                    "NON-OBVIOUS angle of why this tweet matters right now. Punchy, "
                    "scannable. Must NOT paraphrase the post — must add a fresh "
                    "insight (counter-consensus take, contradiction with prior "
                    "thesis, what changes if true, key catalyst to watch). Never "
                    "start with '作者' or '@username'."
    )
    tldr_zh: str = Field(
        default="",
        description="TLDR — 3-5 Chinese sentences (200-400 chars) distilling the "
                    "tweet's actual content: the core argument, key data points, "
                    "thresholds, and conclusion. The reader gets the SUBSTANCE here "
                    "without opening the original. Should be denser than the headline "
                    "and structurally faithful to the tweet's reasoning."
    )
    # Engagement signals — populated by service.curate_tweets post-processing,
    # NOT by the LLM. Default 0 so structured output doesn't fail when the LLM
    # omits them. Frontend uses these to size cards and order groups.
    like_count: int = 0
    retweet_count: int = 0
    view_count: int = 0


class CuratedDigestOutput(BaseModel):
    """LLM structured output for the single curate_tweets call."""

    takeaway: list[str] = Field(
        default_factory=list,
        description="3-5 short Chinese bullet lines summarizing today's signal landscape. "
                    "Each line ≤30 chars, scannable in 30 seconds. Empty allowed when "
                    "nothing meaningful to summarize.",
    )
    macro_picks: list[CuratedTweet] = Field(
        description="Big-picture views — indices, rates, geopolitics, cross-asset flow. "
                    "Aim for 1-3 high-quality picks; max 4. Empty allowed.",
    )
    industry_picks: list[CuratedTweet] = Field(
        description="Sector-level views (AI / semi / lithium / crypto-as-asset / ...). "
                    "Aim for 3-6 across 2-4 sectors; max 8. Empty allowed.",
    )
    stock_picks: list[CuratedTweet] = Field(
        description="Single-ticker views. Aim for 3-6 across 3-5 tickers; max 10. "
                    "Empty allowed when no stock-specific reasoning passes the bar.",
    )


class DailyDigest(BaseModel):
    """The full digest returned by POST /api/twitter-digest/generate."""

    generated_at: str
    window_hours: int
    input_tweet_count: int
    tracked_kols: list[str] = Field(
        description="KOL usernames whose tweets fed this digest (transparency).",
    )
    takeaway: list[str] = Field(
        default_factory=list,
        description="3-5 line scan-in-30s summary of today's signals.",
    )
    macro_picks: list[CuratedTweet]
    industry_picks: list[CuratedTweet]
    stock_picks: list[CuratedTweet]
    model_version: str
