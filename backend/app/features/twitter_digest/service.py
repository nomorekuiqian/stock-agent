"""
Twitter KOL Digest - V3 aggregation pipeline.

    pull_candidate_tweets(24h)              # only quality in {high, medium}
        -> curate_tweets (single pro LLM call)
            -> CuratedDigestOutput (V3 schema: topics + briefs + solo_voices + ...)
    -> generate_daily_digest -> DailyDigest (schema_version="v3")
        -> persisted in kol_daily_digests via db.save_digest

Quality judgment was moved to the daily enrichment cron (Step 1) — this
pipeline trusts `kol_tweets.symbols.quality` and never re-judges.
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
    CURATE_MODEL,
    ENRICH_MODEL,
    curate_agent,
    get_runner,
)
from app.features.twitter_digest.models import (
    Brief,
    CuratedDigestOutput,
    DailyDigest,
    HotItem,
    SoloVoice,
    Topic,
)

logger = get_logger(__name__)

_REPLY_MIN_ENGAGEMENT = 5

T = TypeVar("T", bound=BaseModel)


# ---------------------------------------------------------------------------
# Data pull — already-enriched tweets only
# ---------------------------------------------------------------------------

def _enrichment_of(tweet: dict) -> dict:
    """Extract the enrichment payload from a `kol_tweets` row's `symbols` column.

    Returns {} when symbols is absent or not the V3 dict shape (e.g. legacy
    array form). Callers treat empty enrichment as "skip" / "low".
    """
    symbols = tweet.get("symbols")
    if isinstance(symbols, dict):
        return symbols
    return {}


def _quality_of(tweet: dict) -> str:
    enrich = _enrichment_of(tweet)
    q = enrich.get("quality")
    if q in ("high", "medium", "low"):
        return q
    return ""  # unenriched


async def pull_candidate_tweets(window_hours: int = 24) -> tuple[list[dict], list[str]]:
    """
    Pull tweets from all enabled KOLs in the last `window_hours`.

    Returns (tweets, kol_usernames). Filters:
      1. Drop low-engagement replies (likes+rt < threshold).
      2. Drop unenriched tweets (no `symbols.quality`) — defensive, the cron
         normally pre-runs enrichment, but if it lagged we don't feed garbage
         to the pro model.
      3. Drop `quality="low"` tweets — never reach the digest stage.

    Logs scanning ratio so ops can monitor enrichment coverage.
    """
    catalog = enabled_kols()
    usernames = [k["username"] for k in catalog]
    if not usernames:
        return [], []

    since = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
    db_ = get_insforge_service()
    result = await db_.call_function(
        "kol-tweets",
        method="POST",
        params={"action": "list_batch"},
        json_body={"usernames": usernames, "since": since, "limit": 5000},
        timeout=30.0,
        extra_headers=(
            {"X-Internal-Secret": EDGE_FUNCTION_SECRET}
            if EDGE_FUNCTION_SECRET else None
        ),
    )

    if result["status_code"] != 200:
        raise RuntimeError(
            f"list_batch failed: HTTP {result['status_code']} "
            f"{result.get('text', '')[:200]}"
        )
    payload = result.get("data") or {}
    if not payload.get("success"):
        raise RuntimeError(f"list_batch returned error: {payload.get('error')}")

    raw = payload.get("data", []) or []

    kept: list[dict] = []
    dropped_lowengage = 0
    unenriched = 0
    dropped_low = 0
    by_quality = {"high": 0, "medium": 0}

    for t in raw:
        if t.get("tweet_type") == "reply":
            engagement = (t.get("like_count") or 0) + (t.get("retweet_count") or 0)
            if engagement < _REPLY_MIN_ENGAGEMENT:
                dropped_lowengage += 1
                continue
        q = _quality_of(t)
        if q == "":
            unenriched += 1
            continue
        if q == "low":
            dropped_low += 1
            continue
        by_quality[q] = by_quality.get(q, 0) + 1
        kept.append(t)

    if unenriched and (unenriched / max(len(raw), 1)) > 0.5:
        # > 50% unenriched means enrichment cron is broken or hasn't caught up.
        # We still proceed (digest > nothing) but log loudly.
        logger.warning(
            "pull_candidate_tweets: %d/%d tweets unenriched (>%d%%) — "
            "enrichment cron may be lagging",
            unenriched, len(raw),
            int(unenriched * 100 / max(len(raw), 1)),
        )

    logger.info(
        "pull_candidate_tweets: window=%dh kols=%d raw=%d kept=%d "
        "(low=%d, unenriched=%d, low_engage_replies=%d) by_quality=%s",
        window_hours, len(usernames), len(raw), len(kept),
        dropped_low, unenriched, dropped_lowengage, by_quality,
    )
    return kept, usernames


# ---------------------------------------------------------------------------
# Single LLM agent runner (shared with V2 path; same agent name)
# ---------------------------------------------------------------------------


async def _run_agent(agent, input_payload: dict, output_schema: Type[T]) -> T:
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
        raise RuntimeError(f"{agent.name} produced no output")

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
# Build LLM input payload — slim down per-tweet and attach enrichment
# ---------------------------------------------------------------------------

def _slim_tweet_for_curate(t: dict) -> dict:
    """Reduce a stored tweet + its enrichment to fields the pro curator needs."""
    enrich = _enrichment_of(t)
    return {
        "id": t["id"],
        "author_username": t.get("author_username"),
        "text": t.get("text"),
        "tweet_type": t.get("tweet_type"),
        "created_at": t.get("created_at"),
        "url": t.get("url"),
        "quoted_tweet_text": t.get("quoted_tweet_text"),
        "in_reply_to_username": t.get("in_reply_to_username"),
        "like_count": t.get("like_count", 0),
        "retweet_count": t.get("retweet_count", 0),
        "reply_count": t.get("reply_count", 0),
        "enrichment": {
            "quality": enrich.get("quality"),
            "quality_features": list(enrich.get("quality_features") or []),
            "content_summary_zh": enrich.get("content_summary_zh") or "",
            "tickers": list(enrich.get("tickers") or []),
            "sectors": list(enrich.get("sectors") or []),
            "events": list(enrich.get("events") or []),
        },
    }


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------

def _stance_distribution_string(args) -> str:
    """Render '5 位博主 · 4 看多 / 1 谨慎' from a list of KeyArgument."""
    n_kol = len({a.username for a in args})
    counts = {"bullish": 0, "bearish": 0, "neutral": 0}
    for a in args:
        if a.stance in counts:
            counts[a.stance] += 1
    parts = []
    if counts["bullish"]:
        parts.append(f"{counts['bullish']} 看多")
    if counts["bearish"]:
        parts.append(f"{counts['bearish']} 看空")
    if counts["neutral"]:
        parts.append(f"{counts['neutral']} 谨慎")
    if not parts:
        return f"{n_kol} 位博主"
    return f"{n_kol} 位博主 · " + " / ".join(parts)


def _refresh_topic_post_processing(topics: list[Topic]) -> None:
    """Compute stance_distribution and reconcile participating_kols from key_arguments.

    The LLM is asked to emit `participating_kols`, but we ALWAYS recompute it
    from the actual `key_arguments` so the count is always honest, even if the
    LLM emitted a stale or wrong list.
    """
    for topic in topics:
        if not topic.key_arguments:
            topic.stance_distribution = ""
            topic.participating_kols = []
            continue
        topic.stance_distribution = _stance_distribution_string(topic.key_arguments)
        kols = []
        seen: set[str] = set()
        for a in topic.key_arguments:
            if a.username not in seen:
                seen.add(a.username)
                kols.append(a.username)
        topic.participating_kols = kols


def _fill_brief_one_liners(briefs: list[Brief], raw_by_id: dict[str, dict]) -> None:
    """Backend-fill `Brief.one_liner_zh` from the source enrichment summary.

    The LLM intentionally leaves `one_liner_zh` empty in V3 — the brief layer
    reuses `content_summary_zh` to save pro tokens and to keep one-liner
    quality consistent across the day.
    """
    for b in briefs:
        if b.one_liner_zh:
            continue
        src = raw_by_id.get(b.tweet_id)
        if not src:
            continue
        enrich = _enrichment_of(src)
        summary = (enrich.get("content_summary_zh") or "").strip()
        if summary:
            # Hard cap to schema ceiling
            b.one_liner_zh = summary[:120]


def _enforce_source_provenance(
    output: CuratedDigestOutput, raw_by_id: dict[str, dict],
) -> None:
    """Drop LLM-emitted items whose `tweet_id` was not in the input.

    The LLM occasionally hallucinates tweet_ids, mixes them between fields, or
    references already-filtered low-quality tweets. We require every tweet_id
    on a Topic.key_argument / Brief / SoloVoice to map back to the raw input.

    Solo voices additionally must satisfy the trigger condition the prompt
    promises: source `quality="high"` AND `tweet_type in {thread, article}`.
    Without this guard, a chatty LLM can put any high-engagement original
    tweet under solo_voices, defeating the "deep read" semantics.
    """
    # Topic key_arguments: keep only args whose tweet_id is in input.
    for topic in output.topics:
        topic.key_arguments = [
            a for a in topic.key_arguments if a.tweet_id in raw_by_id
        ]
    # Drop topics that ended up with zero valid key_arguments.
    output.topics = [t for t in output.topics if t.key_arguments]

    # SoloVoice: tweet_id in input AND source thread/article AND quality=high.
    valid_solos: list[SoloVoice] = []
    for s in output.solo_voices:
        src = raw_by_id.get(s.tweet_id)
        if not src:
            continue
        if src.get("tweet_type") not in ("thread", "article"):
            continue
        enrich = _enrichment_of(src)
        if enrich.get("quality") != "high":
            continue
        valid_solos.append(s)
    output.solo_voices = valid_solos

    # Briefs: tweet_id in input. (Quality + label-validity checked elsewhere.)
    output.briefs = [b for b in output.briefs if b.tweet_id in raw_by_id]


def _enforce_no_overlap(output: CuratedDigestOutput) -> None:
    """Guarantee a tweet appears in at most one of (topic args / briefs / solo voices).

    The prompt asks for this but the LLM occasionally double-counts. Order of
    precedence: topics > solo_voices > briefs. We strip duplicates from the
    later category.
    """
    tweet_ids_in_topics: set[str] = set()
    for topic in output.topics:
        for arg in topic.key_arguments:
            tweet_ids_in_topics.add(arg.tweet_id)

    output.solo_voices = [
        s for s in output.solo_voices if s.tweet_id not in tweet_ids_in_topics
    ]
    tweet_ids_in_solos = {s.tweet_id for s in output.solo_voices}

    output.briefs = [
        b for b in output.briefs
        if b.tweet_id not in tweet_ids_in_topics
        and b.tweet_id not in tweet_ids_in_solos
    ]


def _enforce_brief_validity(briefs: list[Brief], raw_by_id: dict[str, dict]) -> list[Brief]:
    """Drop briefs whose source tweet has neither tickers nor sectors.

    Quality is already filtered by pull_candidate_tweets (must be high/medium),
    so the only post-processing constraint is the "must carry a label dimension"
    rule from the design doc.
    """
    out: list[Brief] = []
    for b in briefs:
        src = raw_by_id.get(b.tweet_id)
        if not src:
            continue
        enrich = _enrichment_of(src)
        if not enrich.get("tickers") and not enrich.get("sectors"):
            continue
        out.append(b)
    return out


def _enforce_caps(output: CuratedDigestOutput) -> None:
    """Apply defensive caps so a chatty pro model can't blow up the page."""
    output.topics = output.topics[:15]
    output.briefs = output.briefs[:25]
    output.solo_voices = output.solo_voices[:5]
    output.takeaway = output.takeaway[:5]
    output.watch_next = output.watch_next[:3]


# ---------------------------------------------------------------------------
# Curation (V3 single-stage)
# ---------------------------------------------------------------------------


async def curate_tweets(tweets: list[dict], usernames: list[str]) -> CuratedDigestOutput:
    """One LLM call → cluster into topics/briefs/solo_voices + write editorial layer."""
    catalog = enabled_kols()
    kol_profiles = [
        {"username": k["username"], "display_name": k["display_name"]}
        for k in catalog if k["username"] in usernames
    ]
    payload = {
        "kols": kol_profiles,
        "tweets": [_slim_tweet_for_curate(t) for t in tweets],
    }
    output = await _run_agent(curate_agent, payload, CuratedDigestOutput)

    # Build a lookup for post-processing
    raw_by_id = {t["id"]: t for t in tweets}

    # 1. Drop hallucinated tweet_ids and items not satisfying trigger conditions
    _enforce_source_provenance(output, raw_by_id)

    # 2. Strip overlap (topics > solo_voices > briefs)
    _enforce_no_overlap(output)

    # 3. Recompute stance_distribution + participating_kols on topics
    _refresh_topic_post_processing(output.topics)

    # 4. Backend-fill brief one-liners from enrichment summaries
    _fill_brief_one_liners(output.briefs, raw_by_id)

    # 5. Drop briefs missing label dimension
    output.briefs = _enforce_brief_validity(output.briefs, raw_by_id)

    # 6. Defensive caps
    _enforce_caps(output)

    logger.info(
        "curate_tweets: topics=%d briefs=%d solo_voices=%d takeaway=%d (input=%d)",
        len(output.topics), len(output.briefs), len(output.solo_voices),
        len(output.takeaway), len(tweets),
    )
    return output


# ---------------------------------------------------------------------------
# Hot lists — backend-computed frequency tallies over the kept candidate tweets
# ---------------------------------------------------------------------------


_HOT_SECTORS_TOP_N = 6
_HOT_TICKERS_TOP_N = 8
_HOT_EVENTS_TOP_N = 6
_HOT_MIN_COUNT = 2  # an item must be cited by >=2 tweets to make the list


def _norm_tag(s: str) -> str:
    """Strip all internal whitespace + casefold for grouping near-duplicates.

    Example: 'AI 算力' and 'AI算力' both → 'ai算力'. The original first-seen
    literal is kept as the display label.
    """
    return "".join(s.split()).casefold()


def _tally(values: list[str]) -> list[tuple[str, int]]:
    """Count near-duplicate-collapsed labels. Returns [(display, count)]
    sorted by count desc, with duplicates merged under their first-seen
    display form (preserves the more-readable spacing if it appeared first).
    """
    counts: dict[str, int] = {}
    displays: dict[str, str] = {}
    for raw in values:
        if not isinstance(raw, str):
            continue
        s = raw.strip()
        if not s:
            continue
        key = _norm_tag(s)
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
        if key not in displays:
            displays[key] = s
    return sorted(
        ((displays[k], v) for k, v in counts.items()),
        key=lambda kv: kv[1],
        reverse=True,
    )


def _compute_hot_lists(
    tweets: list[dict],
) -> tuple[list[HotItem], list[HotItem], list[HotItem]]:
    """Count tickers/sectors/events across kept (high+medium) candidate tweets.

    Returns (hot_sectors, hot_tickers, hot_events). Items below `_HOT_MIN_COUNT`
    are dropped so the lists do not surface single-mention noise. Empty lists
    on a sparse day are fine — the frontend hides the section when all three
    are empty.

    Near-duplicate labels (e.g. 'AI 算力' vs 'AI算力') are merged under their
    first-seen display form; the count is the sum.
    """
    sectors_raw: list[str] = []
    tickers_raw: list[str] = []
    events_raw: list[str] = []

    for t in tweets:
        e = _enrichment_of(t)
        sectors_raw.extend(e.get("sectors") or [])
        tickers_raw.extend(
            k.upper() if isinstance(k, str) else "" for k in (e.get("tickers") or [])
        )
        events_raw.extend(e.get("events") or [])

    def _to_items(pairs: list[tuple[str, int]], top_n: int) -> list[HotItem]:
        return [
            HotItem(label=label, count=count)
            for label, count in pairs[:top_n]
            if count >= _HOT_MIN_COUNT
        ]

    return (
        _to_items(_tally(sectors_raw), _HOT_SECTORS_TOP_N),
        _to_items(_tally(tickers_raw), _HOT_TICKERS_TOP_N),
        _to_items(_tally(events_raw), _HOT_EVENTS_TOP_N),
    )


# ---------------------------------------------------------------------------
# Top-level orchestration
# ---------------------------------------------------------------------------


def _digest_is_empty(d: DailyDigest) -> bool:
    if d.schema_version == "v3":
        return (
            len(d.topics) == 0
            and len(d.briefs) == 0
            and len(d.solo_voices) == 0
        )
    return (
        len(d.macro_picks) == 0
        and len(d.industry_picks) == 0
        and len(d.stock_picks) == 0
    )


async def generate_daily_digest(
    window_hours: int = 24,
    persist: bool = True,
) -> DailyDigest:
    """Run the full V3 pipeline end-to-end and return a DailyDigest."""
    started_at = datetime.now(timezone.utc)
    tweets, usernames = await pull_candidate_tweets(window_hours=window_hours)
    if not tweets:
        raise RuntimeError(
            f"No high/medium-quality tweets in last {window_hours}h. "
            f"Either ingestion is broken, enrichment cron failed, or the day is "
            f"genuinely silent."
        )

    curated = await curate_tweets(tweets, usernames)
    hot_sectors, hot_tickers, hot_events = _compute_hot_lists(tweets)

    digest = DailyDigest(
        generated_at=started_at.isoformat(),
        window_hours=window_hours,
        input_tweet_count=len(tweets),
        tracked_kols=sorted(set(usernames)),
        model_version=f"v3:enrich={ENRICH_MODEL}/digest={CURATE_MODEL}",
        schema_version="v3",
        # V3 payload
        headline=curated.headline,
        intro=curated.intro,
        takeaway=list(curated.takeaway),
        topics=curated.topics,
        briefs=curated.briefs,
        solo_voices=curated.solo_voices,
        crosscut="",  # V3.1: deprecated, always empty going forward
        watch_next=[],  # V3.1: deprecated, always empty going forward
        # V3.1: hot lists computed from kept candidate tweets
        hot_sectors=hot_sectors,
        hot_tickers=hot_tickers,
        hot_events=hot_events,
    )
    logger.info(
        "generate_daily_digest: topics=%d briefs=%d solo=%d",
        len(digest.topics), len(digest.briefs), len(digest.solo_voices),
    )

    if persist:
        digest_date = started_at.date().isoformat()
        try:
            if _digest_is_empty(digest):
                existing = await db.get_digest_by_date(digest_date)
                if existing and not _digest_is_empty(existing):
                    logger.warning(
                        "Skipping empty digest persist for date=%s "
                        "(existing non-empty digest preserved)",
                        digest_date,
                    )
                else:
                    await db.save_digest(digest, digest_date)
            else:
                await db.save_digest(digest, digest_date)
        except Exception as exc:  # noqa: BLE001 — persistence must not lose the result
            logger.warning(
                "Persisting digest for date=%s failed (returning anyway): %s",
                digest_date, exc,
            )

    return digest
