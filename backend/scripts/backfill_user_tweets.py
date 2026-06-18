"""
Backfill historical tweets for a single Twitter account into kol_tweets.

Usage:
    cd backend
    source venv/bin/activate

    # Dry run first (no writes):
    python scripts/backfill_user_tweets.py --username aleabitoreddit --months 8 --dry-run

    # Real run:
    python scripts/backfill_user_tweets.py --username aleabitoreddit --months 8

Options:
    --username    Twitter handle without @ (default: aleabitoreddit)
    --months      How many months back to fetch (default: 8)
    --dry-run     Fetch and parse but do not write to DB
    --delay       Seconds between page requests (default: 0.5)

Tweet format matches the hourly kol-tweets cron exactly:
  id, author_username, text, tweet_type, conversation_id, quoted_tweet_text,
  in_reply_to_username, created_at, url, like_count, retweet_count,
  reply_count, view_count, media
  (category and symbols are left null — enrich afterward if needed)
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv


# ---------------------------------------------------------------------------
# Bootstrap: add backend/ to sys.path so app.* imports work
# ---------------------------------------------------------------------------

def _load_env() -> Path:
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    load_dotenv(root / "env", override=True)
    load_dotenv(root / ".env", override=False)
    return root


_BASE_URL = "https://api.twitterapi.io/twitter"
_BATCH_FLUSH_SIZE = 50


# ---------------------------------------------------------------------------
# Tweet parsing — mirrors service.py exactly so DB rows are identical
# ---------------------------------------------------------------------------

def _classify_tweet_type(tweet: dict) -> str:
    if tweet.get("retweeted_tweet") and not tweet.get("text", "").strip():
        return "retweet"
    if tweet.get("quoted_tweet"):
        return "quote"
    if tweet.get("isReply"):
        return "reply"
    return "original"


def _extract_media(tweet: dict) -> list[dict]:
    """Extract compact media metadata from a raw TwitterAPI.io tweet object."""
    raw_media = (
        (tweet.get("extendedEntities") or {}).get("media")
        or (tweet.get("entities") or {}).get("media")
        or []
    )
    if not isinstance(raw_media, list):
        return []

    media: list[dict] = []
    seen: set[str] = set()
    for item in raw_media:
        if not isinstance(item, dict):
            continue
        media_key = str(item.get("media_key") or item.get("id_str") or "").strip()
        source_url = str(item.get("media_url_https") or "").strip()
        media_type = str(item.get("type") or "").strip()
        dedupe_key = media_key or source_url
        if not dedupe_key or dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        original_info = item.get("original_info") if isinstance(item.get("original_info"), dict) else {}
        row = {
            "type": media_type or None,
            "media_key": media_key or None,
            "source_url": source_url or None,
            "expanded_url": item.get("expanded_url"),
            "width": original_info.get("width"),
            "height": original_info.get("height"),
        }
        media.append({key: value for key, value in row.items() if value not in (None, "")})
    return media


def _parse_tweet(tweet: dict) -> Optional[dict]:
    """Parse raw TwitterAPI.io tweet. Returns None for pure retweets."""
    tweet_type = _classify_tweet_type(tweet)
    if tweet_type == "retweet":
        return None

    quoted_text = None
    qt = tweet.get("quoted_tweet")
    if qt and isinstance(qt, dict):
        quoted_text = qt.get("text")

    return {
        "id": tweet.get("id", ""),
        "author_username": tweet.get("author", {}).get("userName", ""),
        "text": tweet.get("text", ""),
        "tweet_type": tweet_type,
        "conversation_id": tweet.get("conversationId"),
        "quoted_tweet_text": quoted_text,
        "in_reply_to_username": tweet.get("inReplyToUsername"),
        "created_at": tweet.get("createdAt"),
        "like_count": tweet.get("likeCount", 0) or 0,
        "retweet_count": tweet.get("retweetCount", 0) or 0,
        "reply_count": tweet.get("replyCount", 0) or 0,
        "view_count": tweet.get("viewCount", 0) or 0,
        "url": tweet.get("url"),
        "media": _extract_media(tweet),
    }


def _parse_created_at(value: Optional[str]) -> Optional[datetime]:
    """Parse TwitterAPI.io createdAt ('Mon Apr 21 12:00:00 +0000 2025') to UTC datetime."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%a %b %d %H:%M:%S %z %Y").astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# API client
# ---------------------------------------------------------------------------

async def _fetch_page(
    client: httpx.AsyncClient,
    username: str,
    cursor: Optional[str],
    api_key: str,
    delay: float,
) -> Optional[dict]:
    headers = {"x-api-key": api_key, "Content-Type": "application/json"}
    params: dict = {"userName": username}
    if cursor:
        params["cursor"] = cursor

    try:
        resp = await client.get(
            f"{_BASE_URL}/user/last_tweets",
            headers=headers,
            params=params,
            timeout=30.0,
        )
    except httpx.TimeoutException:
        print(f"WARN  timeout on page for @{username}")
        return None

    if resp.status_code == 429:
        wait = delay * 2
        print(f"WARN  rate limited — waiting {wait:.0f}s")
        await asyncio.sleep(wait)
        try:
            resp = await client.get(
                f"{_BASE_URL}/user/last_tweets",
                headers=headers,
                params=params,
                timeout=30.0,
            )
        except httpx.TimeoutException:
            return None

    if resp.status_code != 200:
        print(f"ERROR HTTP {resp.status_code}: {resp.text[:300]}")
        return None

    return resp.json()


# ---------------------------------------------------------------------------
# Core backfill
# ---------------------------------------------------------------------------

async def backfill(
    username: str,
    months: int,
    dry_run: bool,
    delay: float,
    limit: Optional[int] = None,
) -> None:
    from app.core.config import TWITTER_API_KEY
    from app.features.twitter import db as twitter_db

    if not TWITTER_API_KEY:
        print("ERROR TWITTER_API_KEY not set — aborting")
        sys.exit(1)

    cutoff = datetime.now(timezone.utc) - timedelta(days=months * 30)
    run_id = uuid.uuid4().hex

    print(
        f"INFO  backfill start\n"
        f"      username=@{username}\n"
        f"      months={months}  cutoff={cutoff.date()}\n"
        f"      dry_run={dry_run}  page_delay={delay}s  limit={limit or 'none'}\n"
        f"      run_id={run_id}"
    )

    row_id: Optional[str] = None
    if not dry_run:
        row_id = await twitter_db.start_fetch_run(run_id=run_id, username=username)

    total_fetched = 0
    total_stored = 0
    total_skipped_retweets = 0
    total_skipped_old = 0
    total_accepted = 0
    pages_fetched = 0
    cursor: Optional[str] = None
    stopped_reason = "cutoff_reached"
    pending: list[dict] = []

    async def _flush(force: bool = False) -> None:
        nonlocal total_stored, pending
        if not pending:
            return
        if not force and len(pending) < _BATCH_FLUSH_SIZE:
            return
        if dry_run:
            print(f"DRY   would upsert {len(pending)} tweets (not flushed)")
            pending = []
            return
        stored = await twitter_db.upsert_tweets_batch(pending)
        total_stored += stored
        pending = []

    async with httpx.AsyncClient() as client:
        while True:
            resp = await _fetch_page(client, username, cursor, TWITTER_API_KEY, delay)
            if not resp:
                stopped_reason = "api_error"
                break
            if resp.get("status") == "error":
                print(f"ERROR API: {resp.get('msg', resp)}")
                stopped_reason = "api_error"
                break

            raw_tweets: list[dict] = resp.get("data", {}).get("tweets", [])
            pages_fetched += 1
            total_fetched += len(raw_tweets)

            page_oldest: Optional[datetime] = None
            reached_cutoff = False
            reached_limit = False

            for raw in raw_tweets:
                parsed = _parse_tweet(raw)
                if not parsed:
                    total_skipped_retweets += 1
                    continue

                ca = _parse_created_at(parsed.get("created_at"))
                if ca is not None:
                    if page_oldest is None or ca < page_oldest:
                        page_oldest = ca
                    if ca < cutoff:
                        total_skipped_old += 1
                        reached_cutoff = True
                        continue

                if parsed.get("id") and parsed.get("author_username"):
                    if limit is not None and total_accepted >= limit:
                        reached_limit = True
                        break
                    pending.append(parsed)
                    total_accepted += 1

            await _flush()

            print(
                f"PAGE  {pages_fetched:3d}  raw={len(raw_tweets):3d}  "
                f"pending={len(pending):3d}  stored={total_stored:4d}  "
                f"accepted={total_accepted:4d}  "
                f"oldest={str(page_oldest.date()) if page_oldest else '?':<10}  "
                f"{'<LIMIT' if reached_limit else '<CUTOFF' if reached_cutoff else ''}"
            )

            if reached_limit:
                stopped_reason = "limit_reached"
                break

            if reached_cutoff:
                stopped_reason = "cutoff_reached"
                break

            if not resp.get("has_next_page"):
                stopped_reason = "timeline_end"
                break

            cursor = resp.get("next_cursor")
            if not cursor:
                stopped_reason = "timeline_end"
                break

            await asyncio.sleep(delay)

    # Final flush
    await _flush(force=True)

    if not dry_run and row_id:
        await twitter_db.finish_fetch_run(
            row_id,
            status="success" if stopped_reason != "api_error" else "failed",
            pages_fetched=pages_fetched,
            tweets_fetched=total_fetched,
            tweets_stored=total_stored,
            tweets_skipped=total_skipped_retweets,
            reached_safety_window=(stopped_reason == "cutoff_reached"),
        )

    if dry_run and pending:
        print(f"\nDRY   sample of last {min(3, len(pending))} unpersisted tweets:")
        for t in pending[:3]:
            print(f"  id={t['id']}  type={t['tweet_type']}  created={t['created_at']}")

    print(
        f"\nSUMMARY  @{username}  run_id={run_id}\n"
        f"  pages_fetched          = {pages_fetched}\n"
        f"  total_fetched          = {total_fetched}\n"
        f"  accepted               = {total_accepted}\n"
        f"  skipped_retweets       = {total_skipped_retweets}\n"
        f"  skipped_before_cutoff  = {total_skipped_old}\n"
        f"  stored                 = {'(dry-run)' if dry_run else total_stored}\n"
        f"  stopped_reason         = {stopped_reason}"
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Backfill historical tweets for one Twitter account into kol_tweets."
    )
    p.add_argument(
        "--username", default="aleabitoreddit",
        help="Twitter handle without @ (default: aleabitoreddit)",
    )
    p.add_argument(
        "--months", type=int, default=8,
        help="How many months back to fetch (default: 8)",
    )
    p.add_argument(
        "--dry-run", action="store_true",
        help="Fetch and parse but do not write to DB",
    )
    p.add_argument(
        "--delay", type=float, default=0.5,
        help="Seconds between page requests (default: 0.5)",
    )
    p.add_argument(
        "--limit", type=int, default=None,
        help="Stop after this many parsed tweets have been accepted (default: no limit)",
    )
    return p.parse_args()


if __name__ == "__main__":
    _load_env()
    args = _parse_args()
    asyncio.run(backfill(args.username, args.months, args.dry_run, args.delay, args.limit))
