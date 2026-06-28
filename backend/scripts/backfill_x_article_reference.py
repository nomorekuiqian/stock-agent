"""Backfill one X Article as a KOL persona reference.

This script is for long-form interview/reference posts where the source tweet
may be authored by a partner account, but the content should become part of a
persona corpus such as qinbafrank.

Usage:
    cd backend
    PYTHONPATH=. python3 scripts/backfill_x_article_reference.py \
      --tweet-url https://x.com/168X_Fortune/status/2062463349573718318 \
      --persona qinbafrank \
      --dry-run

    PYTHONPATH=. python3 scripts/backfill_x_article_reference.py \
      --tweet-id 2062463349573718318 \
      --persona qinbafrank \
      --index
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import httpx
from dotenv import load_dotenv


def _bootstrap() -> Path:
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    load_dotenv(root / ".env", override=False)
    return root


_bootstrap()

from app.core.config import TWITTER_API_KEY  # noqa: E402
from app.core.logging import get_logger, setup_logging  # noqa: E402
from app.features.twitter import db as twitter_db  # noqa: E402


logger = get_logger(__name__)

_BASE_URL = "https://api.twitterapi.io/twitter"
_TWEET_ID_RE = re.compile(r"(?:status/|^)(\d{8,})")
_ARTICLE_ID_RE = re.compile(r"/i/article/(\d+)")

_DEFAULT_KEY_CLAIM = (
    "板块框架: Frank 访谈系统拆解 AI 商业化、光互联、宏观调整和加密新常态"
)
_DEFAULT_SECTORS = [
    "AI_infra",
    "CPO",
    "photonics",
    "optical_transceiver",
    "neocloud",
    "macro",
    "crypto",
    "stablecoin",
    "rwa",
    "space",
]
_DEFAULT_TICKERS = [
    "NVDA",
    "MRVL",
    "NOK",
    "LITE",
    "MU",
    "AMD",
    "INTC",
    "ARM",
    "MSFT",
    "GOOGL",
    "AMZN",
    "ORCL",
    "SNOW",
    "NET",
    "BB",
    "TSLA",
]


StorageAuthorMode = Literal["persona", "source"]


def _parse_tweet_id(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        raise ValueError("tweet id or URL is required")
    if raw.isdigit():
        return raw
    match = _TWEET_ID_RE.search(raw)
    if not match:
        raise ValueError(f"could not parse tweet id from {raw!r}")
    return match.group(1)


def _split_csv(value: str | None) -> list[str]:
    if value is None:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for part in value.split(","):
        item = part.strip()
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _article_id_from_tweet(tweet: dict[str, Any]) -> str | None:
    urls = (tweet.get("entities") or {}).get("urls") or []
    for url in urls:
        expanded = str(url.get("expanded_url") or "")
        match = _ARTICLE_ID_RE.search(expanded)
        if match:
            return match.group(1)
    return None


def _classify_tweet_type(tweet: dict[str, Any], *, has_article: bool) -> str:
    if has_article:
        return "article"
    if tweet.get("retweeted_tweet") and not (tweet.get("text") or "").strip():
        return "retweet"
    if tweet.get("quoted_tweet"):
        return "quote"
    if tweet.get("isReply"):
        return "reply"
    return "original"


def _parse_created_at_to_iso(value: Any) -> Any:
    if not isinstance(value, str) or not value.strip():
        return value
    if len(value) >= 10 and value[4:5] == "-" and value[7:8] == "-":
        return value
    try:
        return datetime.strptime(
            value,
            "%a %b %d %H:%M:%S %z %Y",
        ).astimezone(timezone.utc).isoformat(timespec="seconds")
    except (TypeError, ValueError):
        return value


def _storage_author(
    *,
    mode: StorageAuthorMode,
    persona: str,
    source_author: str,
) -> str:
    return persona if mode == "persona" else source_author


def _build_symbols(
    *,
    persona: str,
    source_author: str,
    source_kind: str,
    source_tweet_id: str,
    source_url: str | None,
    article_id: str | None,
    article_title: str | None,
    content_type: str,
    key_claim: str,
    sectors: list[str],
    tickers: list[str],
    stance: str,
) -> dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return {
        "quality": "keep",
        "content_type": content_type,
        "key_claim": key_claim,
        "sectors": sectors,
        "tickers": tickers,
        "stance": stance,
        "ticker_stances": [{"ticker": ticker, "stance": stance} for ticker in tickers],
        "persona_username": persona,
        "source_author_username": source_author,
        "source_kind": source_kind,
        "source_tweet_id": source_tweet_id,
        "source_url": source_url,
        "article_id": article_id,
        "article_title": article_title,
        "enriched_at": now_iso,
        "enriched_model": "twitterapi-reference-v1",
    }


def _build_storage_tweet(
    *,
    tweet: dict[str, Any],
    article_title: str | None,
    article_text: str | None,
    persona: str,
    source_kind: str,
    category: str,
    storage_author_mode: StorageAuthorMode,
    content_type: str,
    key_claim: str,
    sectors: list[str],
    tickers: list[str],
    stance: str,
) -> dict[str, Any]:
    tweet_id = str(tweet.get("id") or "")
    author = tweet.get("author") or {}
    source_author = str(author.get("userName") or "").strip()
    if not tweet_id:
        raise ValueError("TwitterAPI payload is missing tweet id")
    if not source_author:
        raise ValueError("TwitterAPI payload is missing author userName")

    text = (article_text or str(tweet.get("text") or "")).strip()
    if not text:
        raise ValueError("TwitterAPI payload did not include tweet or article text")

    article_id = _article_id_from_tweet(tweet)
    source_url = tweet.get("url")
    has_article = bool(article_text)
    quoted_tweet = tweet.get("quoted_tweet")
    quoted_text = quoted_tweet.get("text") if isinstance(quoted_tweet, dict) else None
    storage_author = _storage_author(
        mode=storage_author_mode,
        persona=persona,
        source_author=source_author,
    )

    return {
        "id": tweet_id,
        "author_username": storage_author,
        "text": text,
        "tweet_type": _classify_tweet_type(tweet, has_article=has_article),
        "conversation_id": tweet.get("conversationId"),
        "quoted_tweet_text": quoted_text,
        "in_reply_to_username": tweet.get("inReplyToUsername"),
        "created_at": _parse_created_at_to_iso(tweet.get("createdAt")),
        "url": source_url,
        "like_count": tweet.get("likeCount") or 0,
        "retweet_count": tweet.get("retweetCount") or 0,
        "reply_count": tweet.get("replyCount") or 0,
        "view_count": tweet.get("viewCount") or 0,
        "category": category,
        "symbols": _build_symbols(
            persona=persona,
            source_author=source_author,
            source_kind=source_kind,
            source_tweet_id=tweet_id,
            source_url=source_url,
            article_id=article_id,
            article_title=article_title,
            content_type=content_type,
            key_claim=key_claim,
            sectors=sectors,
            tickers=tickers,
            stance=stance,
        ),
    }


async def _fetch_tweet(client: httpx.AsyncClient, tweet_id: str) -> dict[str, Any]:
    response = await client.get(
        f"{_BASE_URL}/tweets",
        headers={"X-API-Key": TWITTER_API_KEY},
        params={"tweet_ids": tweet_id},
        timeout=30.0,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") != "success":
        raise RuntimeError(
            "TwitterAPI tweets lookup failed: %s"
            % (payload.get("message") or payload)
        )
    tweets = payload.get("tweets") or []
    if not tweets:
        raise RuntimeError(f"tweet {tweet_id} not found")
    return tweets[0]


async def _fetch_article(
    client: httpx.AsyncClient,
    tweet_id: str,
) -> tuple[str | None, str | None]:
    response = await client.get(
        f"{_BASE_URL}/article",
        headers={"X-API-Key": TWITTER_API_KEY},
        params={"tweet_id": tweet_id},
        timeout=30.0,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") != "success":
        logger.warning(
            "article lookup failed for %s: %s",
            tweet_id,
            payload.get("message") or payload,
        )
        return None, None

    article = payload.get("article") or {}
    title = str(article.get("title") or "").strip() or None
    contents = [
        str(item.get("text") or "").strip()
        for item in article.get("contents") or []
        if str(item.get("text") or "").strip()
    ]
    parts = [part for part in [title, *contents] if part]
    return title, "\n\n".join(parts) if parts else None


async def _index_reference(tweet: dict[str, Any], *, force: bool) -> None:
    from app.features.vector.kol_tweets import index_kol_tweet_row
    from app.features.vector.service import delete_vector_source

    if force:
        deleted = await delete_vector_source("kol_tweet", str(tweet["id"]))
        logger.info(
            "deleted old vector source id=%s documents=%s chunks=%s",
            tweet["id"],
            deleted.deleted_documents,
            deleted.deleted_chunks,
        )

    result = await index_kol_tweet_row(tweet, force=force)
    logger.info(
        "indexed reference source_id=%s chunks=%s skipped=%s",
        result.source_id,
        result.chunk_count,
        result.skipped,
    )


async def backfill_reference(args: argparse.Namespace) -> dict[str, Any]:
    if not TWITTER_API_KEY:
        raise RuntimeError("TWITTER_API_KEY is not configured")

    tweet_id = _parse_tweet_id(args.tweet_id or args.tweet_url)
    sectors = _split_csv(args.sectors) or list(_DEFAULT_SECTORS)
    tickers = [item.upper() for item in (_split_csv(args.tickers) or _DEFAULT_TICKERS)]

    async with httpx.AsyncClient(timeout=30.0) as client:
        raw_tweet = await _fetch_tweet(client, tweet_id)
        article_title, article_text = await _fetch_article(client, tweet_id)

    storage_tweet = _build_storage_tweet(
        tweet=raw_tweet,
        article_title=article_title,
        article_text=article_text,
        persona=args.persona,
        source_kind=args.source_kind,
        category=args.category,
        storage_author_mode=args.storage_author,
        content_type=args.content_type,
        key_claim=args.key_claim,
        sectors=sectors,
        tickers=tickers,
        stance=args.stance,
    )

    source_author = storage_tweet["symbols"].get("source_author_username")
    logger.info(
        "reference ready id=%s storage_author=%s source_author=%s type=%s text_len=%d title=%s",
        storage_tweet.get("id"),
        storage_tweet.get("author_username"),
        source_author,
        storage_tweet.get("tweet_type"),
        len(storage_tweet.get("text") or ""),
        article_title or "",
    )

    if args.dry_run:
        return {"tweet": storage_tweet, "stored": 0, "indexed": False}

    stored = await twitter_db.upsert_tweets_batch([storage_tweet])
    if stored != 1:
        raise RuntimeError(f"upsert_tweets_batch returned {stored}, expected 1")

    if args.index:
        await _index_reference(storage_tweet, force=args.force_index)

    return {"tweet": storage_tweet, "stored": stored, "indexed": bool(args.index)}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill one X Article reference")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--tweet-id", help="Tweet/status id")
    source.add_argument("--tweet-url", help="Tweet/status URL")
    parser.add_argument("--persona", default="qinbafrank", help="Persona username")
    parser.add_argument(
        "--storage-author",
        choices=["persona", "source"],
        default="persona",
        help=(
            "Store row under the persona username so current cockpit pages can "
            "consume it, or under the literal source author."
        ),
    )
    parser.add_argument("--source-kind", default="interview_reference")
    parser.add_argument("--category", default="frank_interview_reference")
    parser.add_argument(
        "--content-type",
        default="sector_framework",
        choices=[
            "thesis",
            "trade_action",
            "catalyst",
            "sector_framework",
            "risk_flag",
            "macro_view",
            "noise",
        ],
    )
    parser.add_argument("--key-claim", default=_DEFAULT_KEY_CLAIM)
    parser.add_argument("--sectors", help="Comma-separated enrichment sector slugs")
    parser.add_argument("--tickers", help="Comma-separated tickers")
    parser.add_argument(
        "--stance",
        choices=["bull", "bear", "neutral"],
        default="neutral",
    )
    parser.add_argument("--index", action="store_true", help="Index into vector store after upsert")
    parser.add_argument("--force-index", action="store_true", help="Force vector reindex")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and parse without writing")
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = _parse_args()
    asyncio.run(backfill_reference(args))


if __name__ == "__main__":
    main()
