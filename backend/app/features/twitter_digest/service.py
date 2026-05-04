"""
Twitter KOL Digest - V1 single-stage pipeline.

    pull_candidate_tweets(36h)
        -> curate_tweets (single LLM call)
    -> DailyDigest (returned to caller; not persisted in V1)

V1 deliberate omissions (see plan):
- No DB persistence (no kol_daily_digests table writes)
- No cron orchestration; manual trigger only
- No silent fallback — failures bubble up so we can iterate
"""

import json
from datetime import datetime, timezone, timedelta
from typing import Type, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.shared.twitter_kol_config import enabled_kols
from app.features.twitter_digest import db
from app.features.twitter_digest.agents import (
    APP_NAME,
    MODEL,
    curate_agent,
    get_runner,
)
from app.features.twitter_digest.models import (
    CuratedDigestOutput,
    DailyDigest,
)

logger = get_logger(__name__)

# Reply tweets with extremely low engagement are noise; drop them before LLM cost
_REPLY_MIN_ENGAGEMENT = 5  # likes + retweets

T = TypeVar("T", bound=BaseModel)


# ---------------------------------------------------------------------------
# Data pull (calls kol-tweets edge function list_batch action directly)
# ---------------------------------------------------------------------------

async def pull_candidate_tweets(window_hours: int = 36) -> tuple[list[dict], list[str]]:
    """
    Pull tweets from all enabled KOLs in the last `window_hours` hours.
    Returns (tweets, kol_usernames). Filters out very-low-engagement replies.
    """
    catalog = enabled_kols()
    usernames = [k["username"] for k in catalog]
    if not usernames:
        return [], []

    since = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
    db = get_insforge_service()
    result = await db.call_function(
        "kol-tweets",
        method="POST",
        params={"action": "list_batch"},
        json_body={
            "usernames": usernames,
            "since": since,
            "limit": 5000,
        },
        timeout=30.0,
        extra_headers=(
            {"X-Internal-Secret": EDGE_FUNCTION_SECRET}
            if EDGE_FUNCTION_SECRET else None
        ),
    )

    if result["status_code"] != 200:
        raise RuntimeError(f"list_batch failed: HTTP {result['status_code']} {result.get('text', '')[:200]}")
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(f"list_batch returned error: {payload.get('error')}")

    tweets = payload.get("data", []) or []

    filtered: list[dict] = []
    for t in tweets:
        if t.get("tweet_type") == "reply":
            engagement = (t.get("like_count") or 0) + (t.get("retweet_count") or 0)
            if engagement < _REPLY_MIN_ENGAGEMENT:
                continue
        filtered.append(t)

    logger.info(
        "pull_candidate_tweets: window=%dh kols=%d raw=%d filtered=%d",
        window_hours, len(usernames), len(tweets), len(filtered),
    )
    return filtered, usernames


# ---------------------------------------------------------------------------
# Single LLM agent runner
# ---------------------------------------------------------------------------

async def _run_agent(agent, input_payload: dict, output_schema: Type[T]) -> T:
    """
    Run a single LlmAgent with `input_payload` as the user message; return its
    structured output parsed into `output_schema`.
    """
    # Local import keeps the heavy ADK types out of the module's import graph for tests
    from google.genai.types import Content, Part

    runner = get_runner(agent)
    user_id = f"{agent.name}_caller"
    session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id=user_id,
    )

    payload_text = json.dumps(input_payload, ensure_ascii=False, default=str)
    message = Content(parts=[Part(text=payload_text)], role="user")

    async for _ in runner.run_async(
        user_id=user_id, session_id=session.id, new_message=message,
    ):
        pass

    session_data = await runner.session_service.get_session(
        app_name=APP_NAME, user_id=user_id, session_id=session.id,
    )
    state = (session_data.state if session_data else {}) or {}
    raw = state.get(agent.output_key)

    if raw is None:
        raise RuntimeError(f"{agent.name} produced no output for key '{agent.output_key}'")

    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"{agent.name} output was not valid JSON: {raw[:200]}") from exc

    try:
        return output_schema.model_validate(raw)
    except ValidationError as exc:
        raise RuntimeError(f"{agent.name} output did not match schema: {exc}") from exc


# ---------------------------------------------------------------------------
# Curation (single stage)
# ---------------------------------------------------------------------------

def _slim_tweet(t: dict) -> dict:
    """Reduce a stored tweet to the fields the curating LLM needs."""
    return {
        "id": t["id"],
        "author_username": t.get("author_username"),
        "text": t.get("text"),
        "tweet_type": t.get("tweet_type"),
        "created_at": t.get("created_at"),
        "like_count": t.get("like_count", 0),
        "retweet_count": t.get("retweet_count", 0),
        "reply_count": t.get("reply_count", 0),
        "view_count": t.get("view_count", 0),
        "quoted_tweet_text": t.get("quoted_tweet_text"),
        "in_reply_to_username": t.get("in_reply_to_username"),
        "url": t.get("url"),
    }


def _is_mostly_chinese(text: str) -> bool:
    """True if >40% of letters in text are CJK ideographs."""
    if not text:
        return False
    cjk = sum(1 for c in text if "\u4e00" <= c <= "\u9fff")
    return cjk * 100 // max(len(text), 1) >= 40


def _clean_text_en_for_chinese_sources(picks: list, raw_by_id: dict[str, dict]) -> None:
    """
    LLM occasionally fails to leave text_en empty for Chinese-source tweets.
    Detect and force-empty so the frontend doesn't double-render the same content.
    """
    for p in picks:
        src = raw_by_id.get(p.tweet_id) or {}
        if _is_mostly_chinese(src.get("text") or "") and _is_mostly_chinese(p.text_en):
            p.text_en = ""


def _enrich_engagement(
    picks: list,  # list[CuratedTweet], avoid forward-import cycle
    raw_by_id: dict[str, dict],
) -> None:
    """
    Overwrite engagement counts on each curated tweet from the source row.

    The LLM cannot be trusted to copy these reliably (and structured-output
    schema treats them as int, so it would otherwise fill zeros). We always
    take ground truth from the original tweet dict, indexed by tweet_id.
    """
    for p in picks:
        src = raw_by_id.get(p.tweet_id) or {}
        p.like_count = int(src.get("like_count") or 0)
        p.retweet_count = int(src.get("retweet_count") or 0)
        p.view_count = int(src.get("view_count") or 0)


def _dedupe_same_kol_same_subject(picks: list, subject_attr: str) -> list:
    """
    Belt-and-braces dedup: prompt asks for it but we enforce again here.
    Group by (username, <subject>), keep highest engagement only.

    `subject_attr` selects what counts as "same subject":
      - 'primary_ticker' for stock_picks
      - 'sector'         for industry_picks
      - ''               for macro_picks (collapse to one per username)
    """
    by_key: dict[tuple[str, str], object] = {}
    for p in picks:
        subject = getattr(p, subject_attr, "") if subject_attr else ""
        key = (p.username, subject or "")
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = p
            continue
        score_new = p.like_count + p.retweet_count
        score_old = getattr(existing, "like_count", 0) + getattr(existing, "retweet_count", 0)
        if score_new > score_old:
            by_key[key] = p
    return list(by_key.values())


async def curate_tweets(
    tweets: list[dict],
    usernames: list[str],
) -> CuratedDigestOutput:
    """One LLM call: pick + categorize + translate + interpret + takeaway."""
    catalog = enabled_kols()
    kol_profiles = [
        {"username": k["username"], "display_name": k["display_name"]}
        for k in catalog if k["username"] in usernames
    ]
    payload = {
        "kols": kol_profiles,
        "tweets": [_slim_tweet(t) for t in tweets],
    }
    output = await _run_agent(curate_agent, payload, CuratedDigestOutput)

    # Backfill engagement from source tweets (LLM does not fill these reliably)
    raw_by_id = {t["id"]: t for t in tweets}
    for bucket in (output.macro_picks, output.industry_picks, output.stock_picks):
        _enrich_engagement(bucket, raw_by_id)
        _clean_text_en_for_chinese_sources(bucket, raw_by_id)

    # Belt-and-braces dedup: even if prompt fails, collapse same-KOL same-subject
    output.macro_picks = _dedupe_same_kol_same_subject(output.macro_picks, "")
    output.industry_picks = _dedupe_same_kol_same_subject(output.industry_picks, "sector")
    output.stock_picks = _dedupe_same_kol_same_subject(output.stock_picks, "primary_ticker")

    # Defensive caps (Gemini schema cannot enforce maxItems, so we trim here)
    if len(output.macro_picks) > 4:
        logger.warning("Trimming macro_picks from %d to 4", len(output.macro_picks))
        output.macro_picks = output.macro_picks[:4]
    if len(output.industry_picks) > 8:
        logger.warning("Trimming industry_picks from %d to 8", len(output.industry_picks))
        output.industry_picks = output.industry_picks[:8]
    if len(output.stock_picks) > 10:
        logger.warning("Trimming stock_picks from %d to 10", len(output.stock_picks))
        output.stock_picks = output.stock_picks[:10]

    if len(output.takeaway) > 5:
        output.takeaway = output.takeaway[:5]

    logger.info(
        "curate_tweets: macro=%d industry=%d stock=%d takeaway=%d (input=%d)",
        len(output.macro_picks), len(output.industry_picks),
        len(output.stock_picks), len(output.takeaway), len(tweets),
    )
    return output


# ---------------------------------------------------------------------------
# Top-level orchestration
# ---------------------------------------------------------------------------

async def generate_daily_digest(
    window_hours: int = 36,
    persist: bool = True,
) -> DailyDigest:
    """
    Run the full V2 pipeline end-to-end and return a DailyDigest.

    When `persist=True` (default), the result is upserted into `kol_daily_digests`
    keyed by the started_at date so re-runs the same day overwrite. Persistence
    failure is logged as a warning but does NOT raise — the caller still receives
    the generated digest in the response.

    Other failures (no tweets, LLM error, etc.) bubble up — V2 still surfaces
    those rather than silently degrading.
    """
    started_at = datetime.now(timezone.utc)
    tweets, usernames = await pull_candidate_tweets(window_hours=window_hours)
    if not tweets:
        raise RuntimeError(
            f"No candidate tweets in last {window_hours}h. "
            f"Either ingestion is broken or the KOL catalog is silent."
        )

    curated = await curate_tweets(tweets, usernames)

    digest = DailyDigest(
        generated_at=started_at.isoformat(),
        window_hours=window_hours,
        input_tweet_count=len(tweets),
        tracked_kols=sorted(set(usernames)),
        takeaway=list(curated.takeaway),
        macro_picks=curated.macro_picks,
        industry_picks=curated.industry_picks,
        stock_picks=curated.stock_picks,
        model_version=MODEL,
    )
    logger.info(
        "generate_daily_digest: macro=%d industry=%d stock=%d",
        len(digest.macro_picks), len(digest.industry_picks),
        len(digest.stock_picks),
    )

    if persist:
        digest_date = started_at.date().isoformat()
        try:
            await db.save_digest(digest, digest_date)
        except Exception as exc:  # noqa: BLE001 - persistence must not lose the result
            logger.warning(
                "Persisting digest for date=%s failed (returning anyway): %s",
                digest_date, exc,
            )

    return digest
