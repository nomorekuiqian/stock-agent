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
from typing import Optional, Type, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.config import EDGE_FUNCTION_SECRET
from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.features.twitter.service import get_enabled_kols
from app.features.twitter_digest import db
from app.features.twitter_digest.agents import (
    APP_NAME,
    CURATE_MODEL,
    ENRICH_MODEL,
    curate_agent,
    get_runner,
)
from app.features.twitter_digest.models import (
    Argument,
    Brief,
    CuratedDigestOutput,
    CuratedDigestOutputV4,
    DailyDigest,
    HotItem,
    NotableTweet,
    OtherTickerMention,
    SoloVoice,
    Topic,
    WatchpointItem,
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
    catalog = await get_enabled_kols()
    usernames = [k["username"] for k in catalog]
    if not usernames:
        return [], []

    # PostgREST .in() with hundreds of values blows past URL length (502 from
    # the proxy). Once the catalog is "big", skip the server-side username
    # filter and rely on the time window + client-side filter against the
    # enabled set. Small catalogs keep the server-side filter for efficiency.
    enabled_set = {u.lower() for u in usernames}
    use_server_filter = len(usernames) <= 60

    since = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
    db_ = get_insforge_service()
    body: dict = {"since": since, "limit": 5000}
    if use_server_filter:
        body["usernames"] = usernames
    else:
        # Edge function requires non-empty usernames; pass a sentinel that
        # matches nothing on its side, OR — simpler — extend the function to
        # treat omission as "no filter". We pick the latter via a flag.
        body["all_kols"] = True
    result = await db_.call_function(
        "kol-tweets",
        method="POST",
        params={"action": "list_batch"},
        json_body=body,
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

    # When server didn't filter by usernames (large catalog path), apply the
    # enabled-set filter client-side. Tweets from authors who have since been
    # disabled are dropped silently.
    if not use_server_filter:
        before = len(raw)
        raw = [
            t for t in raw
            if (t.get("author_username") or "").lower() in enabled_set
        ]
        if before != len(raw):
            logger.info(
                "pull_candidate_tweets: client-side enabled filter dropped %d/%d",
                before - len(raw), before,
            )

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


def _enforce_v4_provenance(
    output: CuratedDigestOutputV4,
    raw_by_id: dict[str, dict],
) -> None:
    """Drop arguments whose tweet_url isn't in the input tweets.

    Provenance is the bedrock of V4 — every argument must trace back to a
    real source tweet. The LLM can hallucinate URLs/usernames; we hard-drop
    any that don't match.
    """
    valid_urls = {t.get("url") for t in raw_by_id.values() if t.get("url")}
    valid_authors = {(t.get("author_username") or "").lower() for t in raw_by_id.values()}

    def _filter_args(args: list) -> list:
        kept = []
        for a in args:
            if a.tweet_url not in valid_urls:
                continue
            if (a.kol or "").lower() not in valid_authors:
                continue
            kept.append(a)
        return kept

    for thesis in output.ticker_theses:
        thesis.buy_arguments = _filter_args(thesis.buy_arguments)
        thesis.sell_arguments = _filter_args(thesis.sell_arguments)
        thesis.observation_arguments = _filter_args(thesis.observation_arguments)
        # Recompute primary_kols from surviving arguments
        kols = set()
        for a in (thesis.buy_arguments + thesis.sell_arguments
                  + thesis.observation_arguments):
            if a.kol:
                kols.add(a.kol.lower())
        thesis.primary_kols = sorted(kols)
        thesis.tweet_count = (
            len(thesis.buy_arguments)
            + len(thesis.sell_arguments)
            + len(thesis.observation_arguments)
        )

    for thread in output.macro_threads:
        thread.key_points = _filter_args(thread.key_points)
        kols = {(a.kol or "").lower() for a in thread.key_points if a.kol}
        thread.primary_kols = sorted(kols)

    # V4.2: same provenance check on watchpoint evidence + recompute kols_watching
    for wp in output.watchpoints:
        wp.evidence = _filter_args(wp.evidence)
        derived_kols = {(a.kol or "").lower() for a in wp.evidence if a.kol}
        # If LLM provided kols_watching, take union (LLM may have flagged KOLs
        # whose tweet didn't survive provenance — keep them as a hint).
        listed = {k.lower() for k in wp.kols_watching if isinstance(k, str)}
        wp.kols_watching = sorted(derived_kols | listed)


_TICKER_THESIS_CAP = 8  # hard upper bound on ticker theses shown
_OTHER_TICKER_MIN_KOLS = 3  # only show "其他热议" tickers with this many distinct KOL


def _watchpoint_keywords(title: str) -> list[str]:
    """Extract searchable keywords from a watchpoint title.

    Examples:
      'MU Q3 财报' → ['MU', 'Q3', '财报']
      'Clarity Act 参议院投票' → ['Clarity', 'Act', '参议院投票']
      'SpaceX IPO 与合并 xAI 动向' → ['SpaceX', 'IPO', '合并', 'xAI', '动向']
    """
    import re
    # split on whitespace + common punctuation
    tokens = re.split(r"[\s/(),、。·:：;!?]+", title)
    return [t for t in tokens if t and len(t) >= 2]


def _backfill_watchpoint_evidence(
    output: CuratedDigestOutputV4,
    raw_by_id: dict[str, dict],
) -> None:
    """If LLM forgot to fill evidence, synthesize 2-3 evidence Arguments from
    raw tweets that match the watchpoint's KOLs + tickers + keywords.

    Without backfill, the 'evidence required' filter would drop most watchpoints
    because the LLM tends to omit evidence even when explicitly asked.
    """
    for wp in output.watchpoints:
        if wp.evidence:
            continue  # LLM provided — keep as-is

        keywords = _watchpoint_keywords(wp.title)
        ticker_set = {t.upper() for t in wp.related_tickers}
        kol_set = {k.lower() for k in wp.kols_watching}

        candidates: list[tuple[int, dict]] = []
        for tweet in raw_by_id.values():
            author = (tweet.get("author_username") or "").lower()
            text = (tweet.get("text") or "")
            quoted = (tweet.get("quoted_tweet_text") or "")
            full = (text + " " + quoted).lower()
            symbols = tweet.get("symbols") or {}
            tweet_tickers = {
                str(t).upper() for t in (symbols.get("tickers") or [])
            }

            # Strict: only consider tweets from KOLs the LLM flagged as watching.
            # The watchpoint claims these KOLs care; evidence must be theirs.
            if kol_set and author not in kol_set:
                continue

            # Among kol-matching tweets, score by topical relevance.
            score = 0
            if ticker_set and (tweet_tickers & ticker_set):
                score += 2
            kw_hits = sum(1 for kw in keywords if kw.lower() in full)
            score += kw_hits

            # If kol_set is empty (LLM forgot kols_watching too), fall back to
            # topical scoring across all tweets.
            if not kol_set and score < 2:
                continue
            engagement = (
                (tweet.get("like_count") or 0)
                + 2 * (tweet.get("retweet_count") or 0)
            )
            candidates.append((score * 1000 + engagement, tweet))

        candidates.sort(key=lambda x: -x[0])
        seen_authors: set[str] = set()
        for _, t in candidates:
            if len(wp.evidence) >= 3:
                break
            author = (t.get("author_username") or "").lower()
            if author in seen_authors:
                continue  # diversify by author
            symbols = t.get("symbols") or {}
            summary = (symbols.get("content_summary_zh") or "").strip()
            if not summary or not t.get("url"):
                continue
            wp.evidence.append(Argument(
                kol=author,
                point_zh=summary,
                direction="observation",
                tweet_url=t.get("url"),
            ))
            seen_authors.add(author)

        if wp.evidence:
            logger.info(
                "_backfill_watchpoint_evidence: '%s' filled %d evidence",
                wp.title, len(wp.evidence),
            )


def _enforce_caps_v4(output: CuratedDigestOutputV4) -> None:
    """V4 caps."""
    # Drop empty theses (all arguments filtered)
    output.ticker_theses = [
        t for t in output.ticker_theses if t.tweet_count > 0
    ]
    # Sort: most discussed ticker first
    output.ticker_theses.sort(key=lambda t: (-len(t.primary_kols), -t.tweet_count))
    output.ticker_theses = output.ticker_theses[:_TICKER_THESIS_CAP]
    output.macro_threads = output.macro_threads[:6]
    output.takeaway = output.takeaway[:5]
    output.watch_next = output.watch_next[:3]
    # V4.2: cap watchpoints, drop bogus ones, sort by KOL count
    # V4.3: also drop watchpoints without evidence — empty evidence means LLM
    # didn't actually find supporting tweets, so the watchpoint is unverifiable.
    raw_count = len(output.watchpoints)
    output.watchpoints = [
        w for w in output.watchpoints
        if w.title and w.why_it_matters_zh and len(w.kols_watching) >= 1
    ]
    no_evidence = [w.title for w in output.watchpoints if len(w.evidence) == 0]
    output.watchpoints = [w for w in output.watchpoints if len(w.evidence) > 0]
    if no_evidence:
        logger.warning(
            "_enforce_caps_v4: dropped %d watchpoints with empty evidence: %s",
            len(no_evidence), no_evidence,
        )
    output.watchpoints.sort(key=lambda w: -len(w.kols_watching))
    output.watchpoints = output.watchpoints[:7]
    if raw_count != len(output.watchpoints):
        logger.info(
            "_enforce_caps_v4: watchpoints %d → %d after filters",
            raw_count, len(output.watchpoints),
        )


def _compute_top_tickers_priors(
    tweets: list[dict], top_n: int = 5,
) -> list[tuple[str, int, int]]:
    """Compute the top tickers by distinct KOL count from enriched tweets.

    Returns [(ticker, mentions, kols)] sorted by KOL count desc. The top of
    this list is fed into the V4 curate prompt as `must_include_tickers` so
    the LLM cannot drop the most-discussed ticker (e.g., NVDA) — solving the
    non-determinism issue where NVDA had thesis on one run, none on another.
    """
    from collections import Counter
    mention_count: Counter[str] = Counter()
    kol_set: dict[str, set[str]] = {}
    for t in tweets:
        author = (t.get("author_username") or "").lower()
        e = _enrichment_of(t)
        for tk in (e.get("tickers") or []):
            if not isinstance(tk, str):
                continue
            tk = tk.upper().lstrip("$")
            if not tk:
                continue
            mention_count[tk] += 1
            kol_set.setdefault(tk, set()).add(author)
    rows = [
        (tk, mention_count[tk], len(kol_set[tk]))
        for tk in mention_count
    ]
    rows.sort(key=lambda r: (-r[2], -r[1]))
    return rows[:top_n]


def _compute_other_tickers(
    tweets: list[dict],
    final_theses_tickers: set[str],
) -> list[OtherTickerMention]:
    """Tickers with ≥N KOL mentions but NOT in the main 6 theses."""
    from collections import Counter
    mention_count: Counter[str] = Counter()
    kol_set: dict[str, set[str]] = {}
    for t in tweets:
        author = (t.get("author_username") or "").lower()
        e = _enrichment_of(t)
        for tk in (e.get("tickers") or []):
            if not isinstance(tk, str):
                continue
            tk = tk.upper().lstrip("$")
            if not tk:
                continue
            mention_count[tk] += 1
            kol_set.setdefault(tk, set()).add(author)
    rows: list[OtherTickerMention] = []
    for tk, count in sorted(mention_count.items(), key=lambda x: -x[1]):
        if tk in final_theses_tickers:
            continue
        kols = len(kol_set[tk])
        if kols < _OTHER_TICKER_MIN_KOLS:
            continue
        rows.append(OtherTickerMention(ticker=tk, mentions=count, kols=kols))
    return rows[:12]


def _compute_notable_missed_tweets(
    tweets: list[dict],
    cited_urls: set[str],
    limit: int = 8,
) -> list[NotableTweet]:
    """High-engagement quality tweets not cited in any thesis/macro_thread."""
    def engagement(t: dict) -> int:
        return (
            (t.get("like_count") or 0)
            + 2 * (t.get("retweet_count") or 0)
            + 5 * (t.get("reply_count") or 0)
        )

    notable: list[NotableTweet] = []
    candidates = [t for t in tweets if (t.get("url") or "") not in cited_urls]
    candidates.sort(key=engagement, reverse=True)
    for t in candidates:
        eng = engagement(t)
        if eng < 100:  # hard floor — really must have moved the room
            break
        e = _enrichment_of(t)
        summary = (e.get("content_summary_zh") or "").strip()
        if not summary:
            continue
        notable.append(NotableTweet(
            kol=(t.get("author_username") or "").lower(),
            summary_zh=summary,
            tweet_url=t.get("url") or "",
            engagement=eng,
            tickers=[
                tk.upper().lstrip("$")
                for tk in (e.get("tickers") or [])
                if isinstance(tk, str) and tk
            ][:5],
        ))
        if len(notable) >= limit:
            break
    return notable


# ---------------------------------------------------------------------------
# Curation (V3 single-stage)
# ---------------------------------------------------------------------------


async def curate_tweets(tweets: list[dict], usernames: list[str]) -> CuratedDigestOutput:
    """One LLM call → cluster into topics/briefs/solo_voices + write editorial layer."""
    catalog = await get_enabled_kols()
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
# V4 Curation — ticker-as-topic + 论据指向
# ---------------------------------------------------------------------------


async def curate_tweets_v4(
    tweets: list[dict], usernames: list[str],
) -> CuratedDigestOutputV4:
    """V4 curate: cluster by ticker, classify by direction (buy/sell/observation).

    Computes top-N tickers by distinct KOL count BEFORE the LLM call and
    injects them as `must_include_tickers` into the payload — this stops the
    LLM from non-deterministically dropping the most-discussed ticker
    (e.g., NVDA). The cap (6) is enforced post-curate.
    """
    from app.features.twitter_digest.agents import curate_agent_v4

    catalog = await get_enabled_kols()
    kol_profiles = [
        {"username": k["username"], "display_name": k["display_name"]}
        for k in catalog if k["username"] in usernames
    ]

    # Force top-5 tickers (by distinct KOL count) into the LLM output. The
    # final cap is 6, so 1 slot is left for editorial judgment.
    top_priors = _compute_top_tickers_priors(tweets, top_n=5)
    must_include = [tk for tk, _, _ in top_priors]

    payload = {
        "kols": kol_profiles,
        "must_include_tickers": must_include,
        "tweets": [_slim_tweet_for_curate(t) for t in tweets],
    }
    output = await _run_agent(curate_agent_v4, payload, CuratedDigestOutputV4)

    raw_by_id = {t["id"]: t for t in tweets}
    _enforce_v4_provenance(output, raw_by_id)
    # V4.3: backfill watchpoint evidence if LLM forgot. Run BEFORE caps so the
    # "no evidence -> drop" rule catches only watchpoints we truly can't ground.
    _backfill_watchpoint_evidence(output, raw_by_id)
    _enforce_caps_v4(output)

    # Audit: did the LLM honor the must-include constraint?
    final_set = {t.ticker.upper() for t in output.ticker_theses}
    missing_required = [tk for tk in must_include if tk not in final_set]
    if missing_required:
        logger.warning(
            "curate_tweets_v4: LLM dropped required tickers (despite prompt): %s",
            missing_required,
        )

    logger.info(
        "curate_tweets_v4: ticker_theses=%d macro_threads=%d takeaway=%d "
        "(input=%d, required=%s)",
        len(output.ticker_theses), len(output.macro_threads),
        len(output.takeaway), len(tweets), must_include,
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


def _tally_with_kols(
    pairs: list[tuple[str, str]],
) -> list[tuple[str, int, int]]:
    """Variant of _tally that also counts distinct KOL authors per label.

    Input: list of (raw_label, author_username) tuples.
    Output: [(display, mention_count, distinct_kol_count)] sorted by mentions desc.
    Near-duplicate labels are collapsed using the same _norm_tag rule as _tally.
    """
    counts: dict[str, int] = {}
    kol_sets: dict[str, set[str]] = {}
    displays: dict[str, str] = {}
    for raw, author in pairs:
        if not isinstance(raw, str):
            continue
        s = raw.strip()
        if not s:
            continue
        key = _norm_tag(s)
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
        kol_sets.setdefault(key, set())
        if author:
            kol_sets[key].add(author)
        if key not in displays:
            displays[key] = s
    return sorted(
        ((displays[k], v, len(kol_sets[k])) for k, v in counts.items()),
        key=lambda kv: (kv[1], kv[2]),
        reverse=True,
    )


def _ticker_stance_index(topics: list) -> dict[str, dict]:
    """Project topic-level key_arguments stance onto tickers.

    Walks each topic with a primary_ticker and tallies its key_arguments
    stances (bullish / bearish / neutral). Only tickers that appear as a
    topic's primary_ticker get a stance signal; tickers that show up only in
    enrichment tags get no stance bar in the UI (signal would be misleading).
    """
    out: dict[str, dict] = {}
    for t in topics or []:
        ticker = (getattr(t, "primary_ticker", None) or "").upper().lstrip("$")
        if not ticker:
            continue
        bucket = out.setdefault(ticker, {"bullish": 0, "bearish": 0, "neutral": 0})
        for arg in getattr(t, "key_arguments", None) or []:
            stance = getattr(arg, "stance", None)
            if stance in bucket:
                bucket[stance] += 1
    return out


def _compute_hot_lists(
    tweets: list[dict],
    topics: Optional[list] = None,
) -> tuple[list[HotItem], list[HotItem], list[HotItem]]:
    """Count tickers/sectors/events across kept (high+medium) candidate tweets.

    Each HotItem reports:
      - `count`: total mentions in tweets (a KOL tweeting NVDA twice = 2)
      - `kols`: distinct KOL authors (always <= count)
      - `stance` (tickers only): projected from topics whose primary_ticker
         matches; None for tickers without a topic-level stance signal

    Items below `_HOT_MIN_COUNT` are dropped so single-mention noise does not
    surface. Near-duplicate labels (e.g. 'AI 算力' vs 'AI算力') are merged.
    """
    from app.features.twitter_digest.models import StanceCounts

    sector_pairs: list[tuple[str, str]] = []
    ticker_pairs: list[tuple[str, str]] = []
    event_pairs: list[tuple[str, str]] = []

    for t in tweets:
        author = (t.get("author_username") or "").lower()
        e = _enrichment_of(t)
        for s in (e.get("sectors") or []):
            sector_pairs.append((s, author))
        for k in (e.get("tickers") or []):
            if isinstance(k, str):
                ticker_pairs.append((k.upper(), author))
        for ev in (e.get("events") or []):
            event_pairs.append((ev, author))

    stance_idx = _ticker_stance_index(topics or [])

    def _to_items(
        triples: list[tuple[str, int, int]],
        top_n: int,
        attach_stance: bool = False,
    ) -> list[HotItem]:
        out: list[HotItem] = []
        for label, count, kols in triples[:top_n]:
            if count < _HOT_MIN_COUNT:
                continue
            stance = None
            if attach_stance:
                key = label.upper().lstrip("$")
                raw = stance_idx.get(key)
                if raw and (raw["bullish"] + raw["bearish"] + raw["neutral"]) > 0:
                    stance = StanceCounts(**raw)
            out.append(HotItem(label=label, count=count, kols=kols, stance=stance))
        return out

    return (
        _to_items(_tally_with_kols(sector_pairs), _HOT_SECTORS_TOP_N),
        _to_items(_tally_with_kols(ticker_pairs), _HOT_TICKERS_TOP_N, attach_stance=True),
        _to_items(_tally_with_kols(event_pairs), _HOT_EVENTS_TOP_N),
    )


# ---------------------------------------------------------------------------
# Top-level orchestration
# ---------------------------------------------------------------------------


def _digest_is_empty(d: DailyDigest) -> bool:
    if d.schema_version == "v4":
        return (
            len(d.ticker_theses) == 0
            and len(d.macro_threads) == 0
        )
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
    """Run the full V4 pipeline end-to-end and return a DailyDigest.

    V4 = ticker-as-topic + 论据指向 (buy/sell/observation). V3 fields are
    NOT populated on new generations; they remain on historical rows for
    backward-compatible reads.
    """
    started_at = datetime.now(timezone.utc)
    tweets, usernames = await pull_candidate_tweets(window_hours=window_hours)
    if not tweets:
        raise RuntimeError(
            f"No high/medium-quality tweets in last {window_hours}h. "
            f"Either ingestion is broken, enrichment cron failed, or the day is "
            f"genuinely silent."
        )

    curated_v4 = await curate_tweets_v4(tweets, usernames)
    # Hot lists: V4 leaderboard only renders tickers; sectors/events kept in
    # the model for backward compat but UI hides them. No stance projection
    # (V4 dropped the stance bar).
    hot_sectors, hot_tickers, hot_events = _compute_hot_lists(tweets, topics=[])

    # V4.1 — transparency tail: tickers/tweets we noticed but didn't surface.
    final_thesis_tickers = {
        t.ticker.upper() for t in curated_v4.ticker_theses
    }
    other_tickers = _compute_other_tickers(tweets, final_thesis_tickers)

    cited_urls: set[str] = set()
    for t in curated_v4.ticker_theses:
        for arg in (t.buy_arguments + t.sell_arguments + t.observation_arguments):
            if arg.tweet_url:
                cited_urls.add(arg.tweet_url)
    for m in curated_v4.macro_threads:
        for p in m.key_points:
            if p.tweet_url:
                cited_urls.add(p.tweet_url)
    notable_tweets = _compute_notable_missed_tweets(tweets, cited_urls, limit=8)

    digest = DailyDigest(
        generated_at=started_at.isoformat(),
        window_hours=window_hours,
        input_tweet_count=len(tweets),
        tracked_kols=sorted(set(usernames)),
        model_version=f"v4:enrich={ENRICH_MODEL}/digest={CURATE_MODEL}",
        schema_version="v4",
        # V4 payload
        headline=curated_v4.headline,
        intro=curated_v4.intro,
        takeaway=list(curated_v4.takeaway),
        ticker_theses=curated_v4.ticker_theses,
        macro_threads=curated_v4.macro_threads,
        # crosscut + watch_next deprecated in V4.2 — left empty for backward compat
        crosscut="",
        watch_next=[],
        # V4.1 transparency tail
        other_tickers=other_tickers,
        notable_tweets=notable_tweets,
        # V4.2 structured forward-looking watchpoints (replaces watch_next)
        watchpoints=curated_v4.watchpoints,
        # Hot lists (V4 frontend uses tickers; sectors/events kept for shape)
        hot_sectors=hot_sectors,
        hot_tickers=hot_tickers,
        hot_events=hot_events,
    )
    logger.info(
        "generate_daily_digest: ticker_theses=%d macro_threads=%d",
        len(digest.ticker_theses), len(digest.macro_threads),
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
