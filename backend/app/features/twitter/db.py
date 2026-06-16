"""
Twitter KOL - Database operations via Insforge Edge Functions.
"""

import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "kol-tweets"
_DISCUSSION_BATCH_LIMIT = 5000
_DISCUSSION_SPLIT_THRESHOLD = 900
_DISCUSSION_SLICE_HOURS = 1
_DISCUSSION_MIN_SLICE = timedelta(minutes=15)
_VALID_SYMBOL_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-]{0,15}$")
_DISCUSSION_THEME_RULES = [
    (
        "ai_demand",
        "AI 需求与芯片产品线",
        (
            "ai",
            "gpu",
            "accelerator",
            "instinct",
            "mi300",
            "mi350",
            "data center",
            "datacenter",
            "inference",
            "rack",
            "compute",
            "芯片",
            "算力",
        ),
    ),
    (
        "valuation_positioning",
        "估值与仓位分歧",
        (
            "valuation",
            "multiple",
            "expensive",
            "cheap",
            "position",
            "trim",
            "target",
            "upside",
            "downside",
            "估值",
            "仓位",
            "目标价",
        ),
    ),
    (
        "earnings_fundamentals",
        "财报、收入与基本面",
        (
            "earnings",
            "guidance",
            "revenue",
            "margin",
            "eps",
            "quarter",
            "fundamental",
            "profit",
            "财报",
            "指引",
            "收入",
            "利润率",
        ),
    ),
    (
        "technical_flow",
        "技术面与交易位置",
        (
            "chart",
            "technical",
            "support",
            "resistance",
            "breakout",
            "volume",
            "sma",
            "rsi",
            "price action",
            "技术",
            "突破",
            "支撑",
            "阻力",
            "成交量",
        ),
    ),
    (
        "sector_momentum",
        "半导体板块与市场情绪",
        (
            "semis",
            "semiconductor",
            "chip",
            "soxx",
            "nvda",
            "avgo",
            "rally",
            "risk-on",
            "beta",
            "sector",
            "rotation",
            "半导体",
            "板块",
            "反弹",
        ),
    ),
    (
        "news_catalyst",
        "新闻与催化",
        (
            "catalyst",
            "news",
            "launch",
            "announcement",
            "partnership",
            "event",
            "deal",
            "消息",
            "催化",
            "发布",
            "合作",
        ),
    ),
]
def _internal_headers() -> Optional[dict]:
    """
    Header set required to authenticate write actions on the kol-tweets edge
    function. The edge function rejects POSTs without this header to prevent
    the public internet from poisoning the tweet / digest tables.
    """
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


async def upsert_tweets_batch(tweets: list[dict]) -> int:
    """
    Bulk upsert tweets into the database.
    Returns the number of successfully upserted tweets.
    """
    if not tweets:
        return 0

    db = get_insforge_service()

    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "upsert_batch"},
        json_body={"tweets": tweets},
        timeout=60.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            count = data.get("count", 0)
            logger.info("Upserted %d tweets", count)
            return count

    logger.error("Failed to upsert tweets: %s", result.get("text", ""))
    return 0


async def get_tweets(
    username: str,
    category: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> list[dict]:
    """Get tweets for a username, optionally filtered by category."""
    db = get_insforge_service()
    params = {
        "action": "list",
        "username": username,
        "page": str(page),
        "limit": str(limit),
    }
    if category:
        params["category"] = category

    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params=params,
        timeout=15.0,
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return data.get("data", [])

    logger.error("Failed to get tweets: %s", result.get("text", ""))
    return []


async def list_tweets_by_category(
    username: str,
    category: str,
    limit: int = 2000,
) -> list[dict]:
    """List stored tweets for one KOL/category, newest first.

    The edge function caps one `list` call at 100 rows, so this helper pages
    until it reaches `limit` or the table has no more rows.
    """
    rows: list[dict] = []
    page = 1
    page_size = 100
    while len(rows) < limit:
        batch = await get_tweets(
            username=username,
            category=category,
            page=page,
            limit=min(page_size, limit - len(rows)),
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        page += 1
    return rows[:limit]


def normalize_ticker_symbol(symbol: str) -> str:
    """Normalize user-facing ticker strings before matching stored tweets."""
    return (symbol or "").strip().upper().lstrip("$")


def is_valid_ticker_symbol(symbol: str) -> bool:
    """Return whether a normalized ticker is safe to use in discussion lookup."""
    return bool(_VALID_SYMBOL_RE.fullmatch(normalize_ticker_symbol(symbol)))


def _enrichment_of(tweet: dict) -> dict:
    symbols = tweet.get("symbols")
    if isinstance(symbols, dict):
        return symbols
    return {}


def _normalize_ticker_value(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip().upper().lstrip("$")


def _ticker_stances_of(tweet: dict) -> list[dict]:
    """Normalize ticker mentions from both current and legacy `symbols` shapes."""
    symbols = tweet.get("symbols")
    out: list[dict] = []

    if isinstance(symbols, dict):
        raw_stances = symbols.get("ticker_stances")
        if isinstance(raw_stances, list):
            for item in raw_stances:
                if not isinstance(item, dict):
                    continue
                ticker = _normalize_ticker_value(item.get("ticker"))
                if not ticker:
                    continue
                stance = item.get("stance") or "neutral"
                if stance not in ("bull", "bear", "neutral"):
                    stance = "neutral"
                out.append({"ticker": ticker, "stance": stance})
            if out:
                return out

        legacy_tickers = symbols.get("tickers")
        if isinstance(legacy_tickers, list):
            for ticker_value in legacy_tickers:
                ticker = _normalize_ticker_value(ticker_value)
                if ticker:
                    out.append({"ticker": ticker, "stance": "neutral"})
            return out

    if isinstance(symbols, list):
        for ticker_value in symbols:
            ticker = _normalize_ticker_value(ticker_value)
            if ticker:
                out.append({"ticker": ticker, "stance": "neutral"})

    return out


def _tickers_of(tweet: dict) -> list[str]:
    seen: set[str] = set()
    tickers: list[str] = []
    for stance in _ticker_stances_of(tweet):
        ticker = stance["ticker"]
        if ticker in seen:
            continue
        seen.add(ticker)
        tickers.append(ticker)
    return tickers


def _cashtag_matches(tweet: dict, symbol: str) -> bool:
    """Fallback for unenriched rows; require a cashtag to avoid plain-word hits."""
    text = " ".join(
        str(tweet.get(field) or "")
        for field in ("text", "quoted_tweet_text")
    )
    if not text:
        return False
    pattern = re.compile(
        r"(?<![A-Za-z0-9_])\$%s(?![A-Za-z0-9_])" % re.escape(symbol),
        re.IGNORECASE,
    )
    return bool(pattern.search(text))


def _tweet_matches_symbol(tweet: dict, symbol: str) -> bool:
    stances = _ticker_stances_of(tweet)
    if stances:
        return any(stance["ticker"] == symbol for stance in stances)

    symbols = tweet.get("symbols")
    if symbols is None:
        return _cashtag_matches(tweet, symbol)
    if isinstance(symbols, dict) and not symbols:
        return _cashtag_matches(tweet, symbol)
    if not isinstance(symbols, (dict, list)):
        return _cashtag_matches(tweet, symbol)
    return False


def _coerce_int(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _engagement_score(tweet: dict) -> int:
    return (
        _coerce_int(tweet.get("like_count"))
        + 2 * _coerce_int(tweet.get("retweet_count"))
        + _coerce_int(tweet.get("reply_count"))
    )


def _tweet_discussion_text(tweet: dict) -> str:
    parts = [
        tweet.get("key_claim"),
        tweet.get("content_type"),
        tweet.get("text"),
        tweet.get("quoted_tweet_text"),
        " ".join(tweet.get("sectors") or []),
    ]
    return " ".join(str(part) for part in parts if part).lower()


def _representative_claim(tweet: dict) -> str:
    claim = str(tweet.get("key_claim") or "").strip()
    if claim:
        return claim
    text = str(tweet.get("text") or "").strip().replace("\n", " ")
    if len(text) > 180:
        return text[:177].rstrip() + "..."
    return text


def _theme_for_tweet(tweet: dict) -> tuple[str, str]:
    haystack = _tweet_discussion_text(tweet)
    for key, title, keywords in _DISCUSSION_THEME_RULES:
        if any(keyword in haystack for keyword in keywords):
            return key, title
    return "other_discussion", "其他值得关注的讨论"


def _stance_counts(tweets: list[dict]) -> dict[str, int]:
    counts = {"bull": 0, "bear": 0, "neutral": 0}
    for tweet in tweets:
        stance = tweet.get("stance")
        if stance not in counts:
            stance = "neutral"
        counts[stance] += 1
    return counts


def _dominant_stance(counts: dict[str, int]) -> str:
    bull = counts.get("bull", 0)
    bear = counts.get("bear", 0)
    neutral = counts.get("neutral", 0)
    if bull and bear and abs(bull - bear) <= max(1, (bull + bear) // 4):
        return "mixed"
    if bull > bear and bull >= neutral:
        return "bull"
    if bear > bull and bear >= neutral:
        return "bear"
    return "neutral"


def _stance_phrase(stance: str) -> str:
    return {
        "bull": "整体偏多",
        "bear": "整体偏空",
        "mixed": "多空分歧明显",
        "neutral": "整体偏中性",
    }.get(stance, "整体偏中性")


def _tweet_ids(tweets: list[dict], limit: int = 4) -> list[str]:
    return [str(tweet["id"]) for tweet in tweets[:limit] if tweet.get("id")]


def build_ticker_discussion_summary(
    symbol: str,
    tweets: list[dict],
    *,
    hours: int = 24,
) -> dict:
    """Build a compact discussion brief from normalized cached tweets."""
    counts = _stance_counts(tweets)
    author_count = len(
        {
            str(tweet.get("author_username") or "").lower()
            for tweet in tweets
            if tweet.get("author_username")
        }
    )
    dominant = _dominant_stance(counts)
    latest_at = tweets[0].get("created_at") if tweets else None

    grouped: dict[str, dict] = {}
    for tweet in tweets:
        theme_key, theme_title = _theme_for_tweet(tweet)
        bucket = grouped.setdefault(
            theme_key,
            {"key": theme_key, "title": theme_title, "tweets": []},
        )
        bucket["tweets"].append(tweet)

    theme_rows = []
    for bucket in grouped.values():
        bucket_tweets = sorted(
            bucket["tweets"],
            key=lambda row: (_engagement_score(row), row.get("created_at") or ""),
            reverse=True,
        )
        bucket_counts = _stance_counts(bucket_tweets)
        bucket_authors = {
            str(tweet.get("author_username") or "").lower()
            for tweet in bucket_tweets
            if tweet.get("author_username")
        }
        representative_claims = []
        seen_claims: set[str] = set()
        for tweet in bucket_tweets:
            claim = _representative_claim(tweet)
            if not claim or claim in seen_claims:
                continue
            representative_claims.append(claim)
            seen_claims.add(claim)
            if len(representative_claims) >= 2:
                break

        summary_bits = representative_claims[:2]
        summary = "；".join(summary_bits) if summary_bits else "相关讨论仍以原文为主，等待更多可归纳观点。"
        theme_rows.append(
            {
                "key": bucket["key"],
                "title": bucket["title"],
                "stance": _dominant_stance(bucket_counts),
                "summary": summary,
                "tweet_count": len(bucket_tweets),
                "author_count": len(bucket_authors),
                "representative_claims": representative_claims,
                "evidence_tweet_ids": _tweet_ids(bucket_tweets, 4),
            }
        )

    theme_rows.sort(
        key=lambda row: (
            row["tweet_count"],
            sum(_engagement_score(tweet) for tweet in grouped[row["key"]]["tweets"]),
        ),
        reverse=True,
    )
    theme_rows = theme_rows[:8]

    top_theme_titles = [theme["title"] for theme in theme_rows[:3]]
    if tweets:
        if top_theme_titles:
            one_line = (
                f"过去 {hours} 小时，{symbol} 相关讨论共 {len(tweets)} 条，"
                f"{author_count} 位作者参与，{_stance_phrase(dominant)}；"
                f"讨论主要集中在 {'、'.join(top_theme_titles)}。"
            )
        else:
            one_line = (
                f"过去 {hours} 小时，{symbol} 相关讨论共 {len(tweets)} 条，"
                f"{author_count} 位作者参与，{_stance_phrase(dominant)}。"
            )
    else:
        one_line = f"过去 {hours} 小时暂无结构化匹配的 {symbol} Twitter/KOL 讨论。"

    return {
        "overview": {
            "tweet_count": len(tweets),
            "author_count": author_count,
            "bull_count": counts["bull"],
            "bear_count": counts["bear"],
            "neutral_count": counts["neutral"],
            "dominant_stance": dominant,
            "latest_at": latest_at,
            "one_line_summary": one_line,
        },
        "themes": theme_rows,
    }


def _normalize_discussion_tweet(tweet: dict, symbol: str) -> Optional[dict]:
    tweet_id = tweet.get("id")
    if not tweet_id:
        return None

    enrichment = _enrichment_of(tweet)
    stances = _ticker_stances_of(tweet)
    matching_stance = next(
        (stance["stance"] for stance in stances if stance["ticker"] == symbol),
        None,
    )
    tickers = _tickers_of(tweet)
    if not tickers and _cashtag_matches(tweet, symbol):
        tickers = [symbol]
        matching_stance = matching_stance or "neutral"

    sectors = enrichment.get("sectors") or []
    if not isinstance(sectors, list):
        sectors = []

    return {
        "id": str(tweet_id),
        "author_username": tweet.get("author_username") or "",
        "text": tweet.get("text") or "",
        "tweet_type": tweet.get("tweet_type") or "",
        "conversation_id": tweet.get("conversation_id"),
        "quoted_tweet_text": tweet.get("quoted_tweet_text"),
        "in_reply_to_username": tweet.get("in_reply_to_username"),
        "created_at": tweet.get("created_at"),
        "url": tweet.get("url"),
        "like_count": _coerce_int(tweet.get("like_count")),
        "retweet_count": _coerce_int(tweet.get("retweet_count")),
        "reply_count": _coerce_int(tweet.get("reply_count")),
        "view_count": _coerce_int(tweet.get("view_count")),
        "category": tweet.get("category"),
        "quality": enrichment.get("quality"),
        "content_type": enrichment.get("content_type"),
        "key_claim": enrichment.get("key_claim"),
        "sectors": [sector for sector in sectors if isinstance(sector, str)],
        "tickers": tickers,
        "stance": matching_stance,
    }


async def _list_batch_window(
    db_client,
    body_base: dict,
    since: datetime,
    until: datetime,
) -> list[dict]:
    body = {
        **body_base,
        "since": since.isoformat(),
        "until": until.isoformat(),
    }
    result = await db_client.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "list_batch"},
        json_body=body,
        timeout=30.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] != 200:
        raise RuntimeError(
            "list_batch failed: HTTP %s %s"
            % (result["status_code"], result.get("text", "")[:200])
        )
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError("list_batch returned error: %s" % payload.get("error"))
    return payload.get("data", []) or []


async def _list_batch_window_split(
    db_client,
    body_base: dict,
    since: datetime,
    until: datetime,
) -> list[dict]:
    rows = await _list_batch_window(db_client, body_base, since, until)
    duration = until - since
    if len(rows) < _DISCUSSION_SPLIT_THRESHOLD:
        return rows
    if duration <= _DISCUSSION_MIN_SLICE:
        logger.warning(
            "ticker discussion window may be truncated: rows=%d since=%s until=%s",
            len(rows), since.isoformat(), until.isoformat(),
        )
        return rows

    midpoint = since + duration / 2
    left, right = await asyncio.gather(
        _list_batch_window_split(db_client, body_base, since, midpoint),
        _list_batch_window_split(db_client, body_base, midpoint, until),
    )
    return left + right


async def _list_batch_time_sliced(
    db_client,
    body_base: dict,
    since: datetime,
    until: datetime,
) -> list[dict]:
    by_id: dict[str, dict] = {}
    cursor = since
    slice_delta = timedelta(hours=_DISCUSSION_SLICE_HOURS)

    while cursor < until:
        chunk_until = min(cursor + slice_delta, until)
        rows = await _list_batch_window_split(db_client, body_base, cursor, chunk_until)
        for row in rows:
            tweet_id = row.get("id")
            if tweet_id:
                by_id[str(tweet_id)] = row
        cursor = chunk_until

    return sorted(
        by_id.values(),
        key=lambda row: row.get("created_at") or "",
        reverse=True,
    )


async def list_ticker_discussion(
    symbol: str,
    *,
    hours: int = 24,
    limit: int = 200,
) -> list[dict]:
    """List cached KOL tweets about a ticker in a recent time window."""
    normalized = normalize_ticker_symbol(symbol)
    if not is_valid_ticker_symbol(normalized):
        return []

    until = datetime.now(timezone.utc)
    since = until - timedelta(hours=hours)
    body_base = {
        "all_kols": True,
        "limit": _DISCUSSION_BATCH_LIMIT,
    }
    db_client = get_insforge_service()

    try:
        raw_rows = await _list_batch_time_sliced(db_client, body_base, since, until)
    except (asyncio.TimeoutError, ConnectionError, OSError, RuntimeError) as exc:
        logger.error(
            "Failed to list ticker discussion for %s over %dh: %s",
            normalized, hours, exc,
        )
        return []

    rows: list[dict] = []
    for tweet in raw_rows:
        if not _tweet_matches_symbol(tweet, normalized):
            continue
        normalized_tweet = _normalize_discussion_tweet(tweet, normalized)
        if normalized_tweet:
            rows.append(normalized_tweet)
        if len(rows) >= limit:
            break
    return rows


async def get_tweet_stats(username: str) -> Optional[dict]:
    """Get tweet statistics for a username."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "stats", "username": username},
        timeout=15.0,
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return data.get("data")

    logger.error("Failed to get tweet stats: %s", result.get("text", ""))
    return None


async def update_categories_batch(updates: list[dict]) -> dict:
    """
    Batch update tweet categories.
    updates: list of {"id": "...", "category": "..."}
    """
    if not updates:
        return {"updated": 0, "errors": 0}

    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "update_categories_batch"},
        json_body={"updates": updates},
        timeout=60.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return {"updated": data.get("updated", 0), "errors": data.get("errors", 0)}

    logger.error("Failed to update categories: %s", result.get("text", ""))
    return {"updated": 0, "errors": 0}


# ---------------------------------------------------------------------------
# Fetch run records (twitter_fetch_runs)
# ---------------------------------------------------------------------------

async def start_fetch_run(run_id: str, username: str) -> Optional[str]:
    """
    Record the start of a per-KOL fetch attempt.
    Returns the row id (UUID) on success, or None on failure.
    """
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "start_run"},
        json_body={"run_id": run_id, "username": username},
        timeout=15.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            row = data.get("data") or {}
            return row.get("id")

    logger.error("Failed to start fetch run for @%s: %s", username, result.get("text", ""))
    return None


async def finish_fetch_run(
    row_id: str,
    *,
    status: str,
    pages_fetched: int = 0,
    tweets_fetched: int = 0,
    tweets_stored: int = 0,
    tweets_skipped: int = 0,
    reached_safety_window: bool = False,
    error: Optional[str] = None,
) -> bool:
    """Update an in-flight run with final counts and status."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "finish_run"},
        json_body={
            "id": row_id,
            "status": status,
            "pages_fetched": pages_fetched,
            "tweets_fetched": tweets_fetched,
            "tweets_stored": tweets_stored,
            "tweets_skipped": tweets_skipped,
            "reached_safety_window": reached_safety_window,
            "error": error,
        },
        timeout=15.0,
        extra_headers=_internal_headers(),
    )

    if result["status_code"] == 200 and result.get("data", {}).get("success"):
        return True

    logger.error("Failed to finish fetch run %s: %s", row_id, result.get("text", ""))
    return False


async def list_fetch_runs(
    *,
    run_id: Optional[str] = None,
    username: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    """List recent fetch runs, optionally filtered by run_id or username."""
    db = get_insforge_service()
    params: dict[str, str] = {"action": "list_runs", "limit": str(limit)}
    if run_id:
        params["run_id"] = run_id
    if username:
        params["username"] = username

    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params=params,
        timeout=15.0,
    )

    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return data.get("data", [])

    logger.error("Failed to list fetch runs: %s", result.get("text", ""))
    return []
# ---------------------------------------------------------------------------
# KOL accounts catalog (kol_accounts) — single source of truth for who we ingest.
# ---------------------------------------------------------------------------

async def list_kol_accounts(*, enabled_only: bool = True) -> list[dict]:
    """All KOL accounts. Each row: {username, display_name, source, enabled, followers, bio, ...}."""
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={
            "action": "list_accounts",
            "enabled_only": "true" if enabled_only else "false",
        },
        timeout=15.0,
    )
    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return data.get("data", [])
    logger.error("Failed to list_kol_accounts: %s", result.get("text", ""))
    return []


async def upsert_kol_accounts(accounts: list[dict]) -> int:
    """
    Bulk upsert KOL accounts by username.
    accounts: list of {username, display_name, source, enabled?, followers?, bio?}
    """
    if not accounts:
        return 0
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "upsert_accounts"},
        json_body={"accounts": accounts},
        timeout=60.0,
        extra_headers=_internal_headers(),
    )
    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return int(data.get("upserted", 0))
    logger.error("Failed to upsert_kol_accounts: %s", result.get("text", ""))
    return 0


async def update_kol_account(username: str, **patch) -> bool:
    """Patch a single KOL account. Allowed keys: display_name, source, enabled, followers, bio."""
    if not username or not patch:
        return False
    db = get_insforge_service()
    body = {"username": username, **patch}
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "update_account"},
        json_body=body,
        timeout=15.0,
        extra_headers=_internal_headers(),
    )
    if result["status_code"] == 200 and result.get("data", {}).get("success"):
        return True
    logger.error("Failed to update_kol_account @%s: %s", username, result.get("text", ""))
    return False


async def disable_kol_accounts_missing_from(
    *, source: str, current_usernames: list[str]
) -> int:
    """
    Soft-delete: any account with the given `source` whose username is NOT in
    current_usernames gets enabled=false. Used after syncing a Twitter list.
    Returns count disabled.
    """
    db = get_insforge_service()
    result = await db.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "disable_missing"},
        json_body={"source": source, "current_usernames": current_usernames},
        timeout=30.0,
        extra_headers=_internal_headers(),
    )
    if result["status_code"] == 200:
        data = result.get("data", {})
        if data.get("success"):
            return int(data.get("disabled", 0))
    logger.error("Failed to disable_missing for source=%s: %s", source, result.get("text", ""))
    return 0
