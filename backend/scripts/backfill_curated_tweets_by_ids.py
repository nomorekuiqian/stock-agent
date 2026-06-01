"""Backfill specific curated tweet IDs into kol_tweets.

This is for one-off evidence gaps where the cockpit already knows the tweet ID
but the local KOL index either missed the tweet or only stored an X article URL.

Usage:
    cd backend
    PYTHONPATH=. python3 scripts/backfill_curated_tweets_by_ids.py \
      --ids 1798953514837610894,1887674164867440965,2023597321368547520
"""

from __future__ import annotations

import argparse
import asyncio
from typing import Any

import httpx

from app.core.config import TWITTER_API_KEY
from app.core.logging import get_logger
from app.features.twitter import db as twitter_db

logger = get_logger(__name__)

_BASE_URL = "https://api.twitterapi.io/twitter"


def _classify_tweet_type(tweet: dict[str, Any]) -> str:
    if tweet.get("retweeted_tweet") and not (tweet.get("text") or "").strip():
        return "retweet"
    if tweet.get("quoted_tweet"):
        return "quote"
    if tweet.get("isReply"):
        return "reply"
    return "original"


def _article_tweet_id(tweet: dict[str, Any]) -> str | None:
    for url in (tweet.get("entities") or {}).get("urls") or []:
        expanded = str(url.get("expanded_url") or "")
        if "/i/article/" in expanded:
            return str(tweet.get("id") or "")
    return None


async def _fetch_tweets(client: httpx.AsyncClient, ids: list[str]) -> list[dict[str, Any]]:
    response = await client.get(
        f"{_BASE_URL}/tweets",
        headers={"X-API-Key": TWITTER_API_KEY},
        params={"tweet_ids": ",".join(ids)},
        timeout=30.0,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") != "success":
        raise RuntimeError(f"TwitterAPI tweets lookup failed: {payload.get('message') or payload}")
    return payload.get("tweets") or []


async def _fetch_article_text(client: httpx.AsyncClient, tweet_id: str) -> str | None:
    response = await client.get(
        f"{_BASE_URL}/article",
        headers={"X-API-Key": TWITTER_API_KEY},
        params={"tweet_id": tweet_id},
        timeout=30.0,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") != "success":
        logger.warning("article lookup failed for %s: %s", tweet_id, payload.get("message") or payload)
        return None

    article = payload.get("article") or {}
    title = str(article.get("title") or "").strip()
    contents = [
        str(item.get("text") or "").strip()
        for item in article.get("contents") or []
        if str(item.get("text") or "").strip()
    ]
    parts = [part for part in [title, *contents] if part]
    return "\n\n".join(parts) if parts else None


async def _to_storage_tweet(client: httpx.AsyncClient, tweet: dict[str, Any]) -> dict[str, Any] | None:
    tweet_type = _classify_tweet_type(tweet)
    if tweet_type == "retweet":
        return None

    text = str(tweet.get("text") or "")
    article_id = _article_tweet_id(tweet)
    if article_id:
        article_text = await _fetch_article_text(client, article_id)
        if article_text:
            text = article_text

    quoted_text = None
    quoted_tweet = tweet.get("quoted_tweet")
    if isinstance(quoted_tweet, dict):
        quoted_text = quoted_tweet.get("text")

    author = tweet.get("author") or {}
    return {
        "id": str(tweet.get("id") or ""),
        "author_username": str(author.get("userName") or ""),
        "text": text,
        "tweet_type": tweet_type,
        "conversation_id": tweet.get("conversationId"),
        "quoted_tweet_text": quoted_text,
        "in_reply_to_username": tweet.get("inReplyToUsername"),
        "created_at": tweet.get("createdAt"),
        "url": tweet.get("url"),
        "like_count": tweet.get("likeCount") or 0,
        "retweet_count": tweet.get("retweetCount") or 0,
        "reply_count": tweet.get("replyCount") or 0,
        "view_count": tweet.get("viewCount") or 0,
    }


async def backfill(ids: list[str], dry_run: bool) -> None:
    if not TWITTER_API_KEY:
        raise RuntimeError("TWITTER_API_KEY is not configured")
    if not ids:
        raise RuntimeError("at least one tweet id is required")

    async with httpx.AsyncClient() as client:
        raw_tweets = await _fetch_tweets(client, ids)
        storage_tweets: list[dict[str, Any]] = []
        for tweet in raw_tweets:
            parsed = await _to_storage_tweet(client, tweet)
            if parsed and parsed.get("id") and parsed.get("author_username"):
                storage_tweets.append(parsed)

    found_ids = {str(tweet.get("id")) for tweet in storage_tweets}
    missing = [tweet_id for tweet_id in ids if tweet_id not in found_ids]
    logger.info(
        "curated tweet backfill fetched=%d parsed=%d missing=%s dry_run=%s",
        len(raw_tweets),
        len(storage_tweets),
        missing,
        dry_run,
    )

    for tweet in storage_tweets:
        logger.info(
            "tweet ready id=%s user=%s created_at=%s text_len=%d",
            tweet.get("id"),
            tweet.get("author_username"),
            tweet.get("created_at"),
            len(tweet.get("text") or ""),
        )

    if dry_run:
        return

    stored = await twitter_db.upsert_tweets_batch(storage_tweets)
    logger.info("curated tweet backfill upserted=%d", stored)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill curated tweet ids")
    parser.add_argument("--ids", required=True, help="Comma-separated tweet ids")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and parse without writing")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    ids = [item.strip() for item in args.ids.split(",") if item.strip()]
    asyncio.run(backfill(ids, args.dry_run))


if __name__ == "__main__":
    main()
