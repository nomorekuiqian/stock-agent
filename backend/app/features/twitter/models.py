"""
Twitter KOL - Pydantic models for tweet fetching and storage.
"""

from typing import Optional

from pydantic import BaseModel, Field


class FetchConfiguredKolsRequest(BaseModel):
    list_lookback_hours: float = Field(
        1.5, gt=0, le=48,
        description="Walk pages until the last tweet on the current page is older "
                    "than (now - lookback_hours). Default 1.5h gives the hourly cron "
                    "a 30min buffer for cron drift. Use 20+ for backfills.",
    )
    list_safety_max_pages: int = Field(
        50, ge=1, le=200,
        description="Belt-and-suspenders cap on list pagination to prevent runaway "
                    "loops if the upstream API misbehaves. Time window is the primary stop.",
    )


class TweetRecord(BaseModel):
    id: str
    author_username: str
    text: str
    tweet_type: str = Field(description="original / quote / reply / thread")
    conversation_id: Optional[str] = None
    quoted_tweet_text: Optional[str] = None
    in_reply_to_username: Optional[str] = None
    created_at: Optional[str] = None
    url: Optional[str] = None
    like_count: int = 0
    retweet_count: int = 0
    reply_count: int = 0
    view_count: int = 0
    media: list[dict] = Field(default_factory=list)
    content_parts: list[dict] = Field(default_factory=list)
    canonical_text: Optional[str] = None
    canonical_status: str = "raw_only"
    canonical_hash: Optional[str] = None
    canonical_extracted_at: Optional[str] = None
    canonical_extracted_model: Optional[str] = None
    category: Optional[str] = None
    symbols: Optional[list[str]] = Field(
        default=None,
        description="Phase 2: tickers this tweet discusses, e.g. ['NVDA']. "
                    "None = not yet labeled.",
    )


class TweetStats(BaseModel):
    total_tweets: int = 0
    by_type: dict = Field(default_factory=dict)
    by_category: dict = Field(default_factory=dict)
    date_range: dict = Field(default_factory=dict)
