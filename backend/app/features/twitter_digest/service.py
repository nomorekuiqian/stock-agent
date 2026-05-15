"""
Twitter KOL Digest — aggregation pipeline.

    pull_candidate_tweets(24h)              # only quality=keep
        -> curate_tweets (single pro LLM call)
            -> CuratedDigestOutput (ticker_theses + macro_threads + watchpoints)
    -> generate_daily_digest -> DailyDigest
        -> persisted in kol_daily_digests via db.save_digest

Quality judgment is done by the daily enrichment cron (Step 1); this pipeline
trusts `kol_tweets.symbols.quality` and never re-judges.
"""

import asyncio
import json
from datetime import datetime, timezone, timedelta
from typing import Type, TypeVar

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
    CuratedDigestOutput,
    DailyDigest,
    HotItem,
    OtherTickerMention,
    TickerThesis,
)

logger = get_logger(__name__)

_REPLY_MIN_ENGAGEMENT = 5
_LIST_BATCH_LIMIT = 5000
_LIST_BATCH_SLICE_HOURS = 1
_LIST_BATCH_SPLIT_THRESHOLD = 900
_MIN_LIST_BATCH_SLICE = timedelta(minutes=15)
_LIST_BATCH_MAX_ATTEMPTS = 3
_LIST_BATCH_RETRY_DELAY_SECONDS = 1.0

T = TypeVar("T", bound=BaseModel)


# ---------------------------------------------------------------------------
# Data pull — already-enriched tweets only
# ---------------------------------------------------------------------------

def _enrichment_of(tweet: dict) -> dict:
    """Extract the enrichment payload from a `kol_tweets` row's `symbols` column.

    Returns {} when symbols is absent or not the expected dict shape (e.g. legacy
    array form). Callers treat empty enrichment as "skip" / unenriched.
    """
    symbols = tweet.get("symbols")
    if isinstance(symbols, dict):
        return symbols
    return {}


def _quality_of(tweet: dict) -> str:
    """Return 'keep' | 'drop' | '' (unenriched).

    Maps legacy {high, medium, low} to {keep, drop} for backwards compatibility
    with rows enriched before the schema change.
    """
    enrich = _enrichment_of(tweet)
    q = enrich.get("quality")
    if q in ("keep", "drop"):
        return q
    if q in ("high", "medium"):
        return "keep"
    if q == "low":
        return "drop"
    return ""  # unenriched


def _ticker_stances_of(tweet: dict) -> list[dict]:
    """Return per-ticker stance objects, normalized for downstream code.

    New schema rows store `ticker_stances: [{ticker, stance}]`.
    Legacy rows have a bare `tickers: [str]`; for those, fabricate
    `stance='neutral'` so the rest of the pipeline still works.
    """
    enrich = _enrichment_of(tweet)
    raw = enrich.get("ticker_stances")
    if isinstance(raw, list) and raw:
        out: list[dict] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            ticker = item.get("ticker")
            if not isinstance(ticker, str):
                continue
            tk = ticker.strip().upper().lstrip("$")
            if not tk:
                continue
            stance = item.get("stance") or "neutral"
            if stance not in ("bull", "bear", "neutral"):
                stance = "neutral"
            out.append({"ticker": tk, "stance": stance})
        return out
    # Legacy fallback: bare tickers list, default stance = neutral
    legacy = enrich.get("tickers") or []
    out_legacy: list[dict] = []
    for tk in legacy:
        if not isinstance(tk, str):
            continue
        ut = tk.strip().upper().lstrip("$")
        if ut:
            out_legacy.append({"ticker": ut, "stance": "neutral"})
    return out_legacy


def _tickers_of(tweet: dict) -> list[str]:
    """Just the ticker symbols, for code that doesn't care about stance."""
    return [ts["ticker"] for ts in _ticker_stances_of(tweet)]


def _internal_headers() -> dict | None:
    if not EDGE_FUNCTION_SECRET:
        return None
    return {"X-Internal-Secret": EDGE_FUNCTION_SECRET}


async def _list_batch_window(
    db_client,
    body_base: dict,
    since: datetime,
    until: datetime,
) -> list[dict]:
    """Fetch one half-open created_at window via the kol-tweets edge function."""
    body = {
        **body_base,
        "since": since.isoformat(),
        "until": until.isoformat(),
    }
    # Retry only for transient transport errors (timeout, network drop). HTTP
    # status >= 400 and payload-level errors are upstream's deliberate "no"
    # and won't recover by retrying — surface them immediately.
    for attempt in range(1, _LIST_BATCH_MAX_ATTEMPTS + 1):
        try:
            result = await db_client.call_function(
                "kol-tweets",
                method="POST",
                params={"action": "list_batch"},
                json_body=body,
                timeout=30.0,
                extra_headers=_internal_headers(),
            )
        except (asyncio.TimeoutError, ConnectionError, OSError) as exc:
            if attempt >= _LIST_BATCH_MAX_ATTEMPTS:
                raise
            logger.warning(
                "list_batch window %s to %s transient failure on attempt %d/%d: %s",
                since.isoformat(), until.isoformat(), attempt,
                _LIST_BATCH_MAX_ATTEMPTS, exc,
            )
            await asyncio.sleep(_LIST_BATCH_RETRY_DELAY_SECONDS * attempt)
            continue

        if result["status_code"] != 200:
            raise RuntimeError(
                f"list_batch failed: HTTP {result['status_code']} "
                f"{result.get('text', '')[:200]}"
            )
        payload = result.get("data") or {}
        if not payload.get("success"):
            raise RuntimeError(
                f"list_batch returned error: {payload.get('error')}"
            )
        return payload.get("data", []) or []

    # Unreachable: the loop either returns, raises an HTTP/payload error,
    # or re-raises the final transient exception when attempts exhaust.
    raise RuntimeError("list_batch retry loop exited without result")


async def _list_batch_window_split(
    db_client,
    body_base: dict,
    since: datetime,
    until: datetime,
) -> list[dict]:
    """Fetch a window, recursively splitting near the row-limit boundary.

    Insforge/PostgREST can truncate large scans at around 1000 rows even when
    the edge function asks for a higher range. Splitting by created_at keeps
    each query below that cap and preserves the full digest window.
    """
    rows = await _list_batch_window(db_client, body_base, since, until)
    duration = until - since
    if len(rows) < _LIST_BATCH_SPLIT_THRESHOLD:
        return rows
    if duration <= _MIN_LIST_BATCH_SLICE:
        logger.warning(
            "list_batch window still returned %d rows at min slice %s to %s; "
            "results may be truncated",
            len(rows), since.isoformat(), until.isoformat(),
        )
        return rows

    midpoint = since + duration / 2
    logger.info(
        "list_batch window %s to %s returned %d rows; splitting",
        since.isoformat(), until.isoformat(), len(rows),
    )
    left = await _list_batch_window_split(db_client, body_base, since, midpoint)
    right = await _list_batch_window_split(db_client, body_base, midpoint, until)
    return left + right


async def _list_batch_time_sliced(
    db_client,
    body_base: dict,
    since: datetime,
    until: datetime,
) -> list[dict]:
    """Fetch a full digest window in hour-sized half-open slices."""
    by_id: dict[str, dict] = {}
    slice_count = 0
    cursor = since
    slice_delta = timedelta(hours=_LIST_BATCH_SLICE_HOURS)

    while cursor < until:
        chunk_until = min(cursor + slice_delta, until)
        slice_count += 1
        rows = await _list_batch_window_split(
            db_client, body_base, cursor, chunk_until,
        )
        for row in rows:
            tweet_id = row.get("id")
            if tweet_id:
                by_id[str(tweet_id)] = row
        cursor = chunk_until

    raw = sorted(
        by_id.values(),
        key=lambda t: t.get("created_at") or "",
        reverse=True,
    )
    logger.info(
        "list_batch_time_sliced: window=%s to %s slices=%d rows=%d",
        since.isoformat(), until.isoformat(), slice_count, len(raw),
    )
    return raw


async def pull_candidate_tweets(
    window_hours: int = 24,
) -> tuple[list[dict], list[str], int]:
    """
    Pull tweets from all enabled KOLs in the last `window_hours`.

    Returns (tweets, kol_usernames, raw_count). `raw_count` is the total
    tweets in the window before any quality / reply filtering — used as
    the user-facing "original tweet count" on web + email (the post-filter
    count is too small to be motivating).

    Filters:
      1. Drop low-engagement replies (likes+rt < threshold).
      2. Drop unenriched tweets (no `symbols.quality`) — defensive, the cron
         normally pre-runs enrichment, but if it lagged we don't feed garbage
         to the pro model.
      3. Drop `quality="drop"` tweets — never reach the digest stage.

    Logs scanning ratio so ops can monitor enrichment coverage.
    """
    catalog = await get_enabled_kols()
    usernames = [k["username"] for k in catalog]
    if not usernames:
        return [], [], 0

    # PostgREST .in() with hundreds of values blows past URL length (502 from
    # the proxy). Once the catalog is "big", skip the server-side username
    # filter and rely on the time window + client-side filter against the
    # enabled set. Small catalogs keep the server-side filter for efficiency.
    enabled_set = {u.lower() for u in usernames}
    use_server_filter = len(usernames) <= 60

    until = datetime.now(timezone.utc)
    since = until - timedelta(hours=window_hours)
    db_ = get_insforge_service()
    body_base: dict = {"limit": _LIST_BATCH_LIMIT}
    if use_server_filter:
        body_base["usernames"] = usernames
    else:
        # Edge function requires non-empty usernames; pass a sentinel that
        # matches nothing on its side, OR — simpler — extend the function to
        # treat omission as "no filter". We pick the latter via a flag.
        body_base["all_kols"] = True

    raw = await _list_batch_time_sliced(db_, body_base, since, until)

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
        if q == "drop":
            dropped_low += 1
            continue
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
        "(dropped=%d, unenriched=%d, low_engage_replies=%d)",
        window_hours, len(usernames), len(raw), len(kept),
        dropped_low, unenriched, dropped_lowengage,
    )
    return kept, usernames, len(raw)


# ---------------------------------------------------------------------------
# Single LLM agent runner
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
            "ticker_stances": _ticker_stances_of(t),
            "sectors": list(enrich.get("sectors") or []),
        },
    }


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------


def _enforce_provenance(
    output: CuratedDigestOutput,
    raw_by_id: dict[str, dict],
) -> None:
    """Drop arguments whose tweet_url isn't in the input tweets.

    Provenance is the bedrock — every argument must trace back to a real
    source tweet. The LLM can hallucinate URLs/usernames; we hard-drop any
    that don't match.
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

    # Same provenance check on watchpoint evidence + recompute kols_watching
    for wp in output.watchpoints:
        wp.evidence = _filter_args(wp.evidence)
        derived_kols = {(a.kol or "").lower() for a in wp.evidence if a.kol}
        # If LLM provided kols_watching, take union (LLM may have flagged KOLs
        # whose tweet didn't survive provenance — keep them as a hint).
        listed = {k.lower() for k in wp.kols_watching if isinstance(k, str)}
        wp.kols_watching = sorted(derived_kols | listed)


_TICKER_THESIS_CAP = 8  # hard upper bound on ticker theses shown
_OTHER_TICKER_MIN_KOLS = 3  # only show "其他热议" tickers with this many distinct KOL
_MACRO_KEY_POINTS_CAP = 12  # per macro topic, keep broad filtered-tweet coverage


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
    output: CuratedDigestOutput,
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
            tweet_tickers = {tk for tk in _tickers_of(tweet)}

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
            text = (t.get("text") or "").replace("\n", " ").strip()
            if not text or not t.get("url"):
                continue
            point = text if len(text) <= 280 else text[:279].rstrip() + "…"
            wp.evidence.append(Argument(
                kol=author,
                point_zh=point,
                direction="observation",
                tweet_url=t.get("url") or "",
            ))
            seen_authors.add(author)

        if wp.evidence:
            logger.info(
                "_backfill_watchpoint_evidence: '%s' filled %d evidence",
                wp.title, len(wp.evidence),
            )


_SIDE_DISPUTED_MIN = 2  # both sides must have ≥ this many arguments to be disputed
_SIDE_DOMINANCE_MARGIN = 2  # one side must lead by ≥ this many for clear bull/bear


def _compute_thesis_side(thesis) -> str:
    """Classify a thesis as disputed / bull / bear from surviving arguments.

    - disputed: both buy ≥ N AND sell ≥ N (N = _SIDE_DISPUTED_MIN)
    - bull:     buy - sell ≥ margin, OR sell == 0 with buy > 0
    - bear:     sell - buy ≥ margin, OR buy == 0 with sell > 0
    - else:     fall back to majority direction; tie → bull (rare).
    """
    buy = len(thesis.buy_arguments)
    sell = len(thesis.sell_arguments)
    if buy >= _SIDE_DISPUTED_MIN and sell >= _SIDE_DISPUTED_MIN:
        return "disputed"
    if buy > 0 and sell == 0:
        return "bull"
    if sell > 0 and buy == 0:
        return "bear"
    if buy - sell >= _SIDE_DOMINANCE_MARGIN:
        return "bull"
    if sell - buy >= _SIDE_DOMINANCE_MARGIN:
        return "bear"
    # Mixed but not enough volume on the smaller side → take the majority.
    return "bull" if buy >= sell else "bear"


_SIDE_RANK = {"disputed": 0, "bull": 1, "bear": 2}


def _fallback_stance_summary(thesis) -> str:
    """Generate a stance_summary when the LLM leaves it blank.

    Counts-based, deliberately bland — the LLM is supposed to produce
    nuanced multi-axis descriptions ("多空在估值上打架, 长线派坚守"),
    but if it doesn't, we don't want the UI showing an empty header.
    """
    buy = len(thesis.buy_arguments)
    sell = len(thesis.sell_arguments)
    obs = len(thesis.observation_arguments)
    kols = len(thesis.primary_kols)
    if buy > 0 and sell > 0:
        return f"{buy} 位看多 · {sell} 位看空, 双方都有支撑"
    if buy > 0 and sell == 0:
        return f"{kols} 位博主一致看多"
    if sell > 0 and buy == 0:
        return f"{kols} 位博主一致看空"
    if obs > 0:
        return f"{kols} 位博主在跟踪进展, 暂无明确方向"
    return f"{kols} 位博主在讨论"


def _enforce_caps(output: CuratedDigestOutput) -> None:
    """Apply defensive caps + classify ticker side + sort layout-friendly."""
    # Drop empty theses (all arguments filtered)
    output.ticker_theses = [
        t for t in output.ticker_theses if t.tweet_count > 0
    ]
    # Drop theses that only contain observation arguments — readers cannot
    # tell what direction the crowd is leaning, so the card has no decision
    # value. Ticker still surfaces in other_tickers via post-processing.
    before_directional = len(output.ticker_theses)
    output.ticker_theses = [
        t for t in output.ticker_theses
        if len(t.buy_arguments) + len(t.sell_arguments) >= 1
    ]
    dropped_obs_only = before_directional - len(output.ticker_theses)
    if dropped_obs_only:
        logger.info(
            "_enforce_caps: dropped %d ticker_theses with no buy/sell arguments",
            dropped_obs_only,
        )
    # Classify side from surviving arguments
    for thesis in output.ticker_theses:
        thesis.side = _compute_thesis_side(thesis)  # type: ignore[assignment]
        if not thesis.stance_summary.strip():
            thesis.stance_summary = _fallback_stance_summary(thesis)

    # Sort: disputed first (engagement bait), then bull, then bear.
    # Within each side, more KOL discussion comes first.
    output.ticker_theses.sort(
        key=lambda t: (_SIDE_RANK.get(t.side, 9), -len(t.primary_kols), -t.tweet_count)
    )
    output.ticker_theses = output.ticker_theses[:_TICKER_THESIS_CAP]

    # Frontend doesn't render intro anymore — clear any LLM bleed.
    output.intro = ""

    # Macro threads — short list, 0-5. Each thread can carry many key_points:
    # those are the filtered tweets/users readers expand on the web, so don't
    # collapse a multi-KOL topic down to a single representative quote.
    for thread in output.macro_threads:
        if len(thread.key_points) > _MACRO_KEY_POINTS_CAP:
            thread.key_points = thread.key_points[:_MACRO_KEY_POINTS_CAP]
        kols = {(a.kol or "").lower() for a in thread.key_points if a.kol}
        thread.primary_kols = sorted(kols)
    output.macro_threads = output.macro_threads[:5]

    # Watchpoints — drop bogus, cap at 5
    raw_count = len(output.watchpoints)
    output.watchpoints = [
        w for w in output.watchpoints
        if w.title and w.why_it_matters_zh and len(w.kols_watching) >= 1
    ]
    no_evidence = [w.title for w in output.watchpoints if len(w.evidence) == 0]
    output.watchpoints = [w for w in output.watchpoints if len(w.evidence) > 0]
    if no_evidence:
        logger.warning(
            "_enforce_caps: dropped %d watchpoints with empty evidence: %s",
            len(no_evidence), no_evidence,
        )
    output.watchpoints.sort(key=lambda w: -len(w.kols_watching))
    output.watchpoints = output.watchpoints[:5]
    if raw_count != len(output.watchpoints):
        logger.info(
            "_enforce_caps: watchpoints %d → %d after filters",
            raw_count, len(output.watchpoints),
        )


def _compute_top_tickers_priors(
    tweets: list[dict], top_n: int = 5,
) -> list[tuple[str, int, int]]:
    """Compute the top tickers by distinct KOL count from enriched tweets.

    Returns [(ticker, mentions, kols)] sorted by KOL count desc. The top of
    this list is fed into the curate prompt as `must_include_tickers` so
    the LLM cannot drop the most-discussed ticker (e.g., NVDA) — solving the
    non-determinism issue where NVDA had thesis on one run, none on another.
    """
    from collections import Counter
    mention_count: Counter[str] = Counter()
    kol_set: dict[str, set[str]] = {}
    for t in tweets:
        author = (t.get("author_username") or "").lower()
        for tk in _tickers_of(t):
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
        for tk in _tickers_of(t):
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


# ---------------------------------------------------------------------------
# Curation — ticker-as-topic + 论据指向
# ---------------------------------------------------------------------------


# Hard ceiling on tweets fed to the pro model in a single call. Each slim
# tweet is roughly 200 tokens; 400 gives us ~80k input tokens — enough to
# cover a busy day after widened keep, well within Gemini Pro's window,
# and bounded enough that JSON output stays schema-compliant. We trim by
# (1) covering must_include tickers, (2) engagement + KOL diversity, then
# (3) recency fallback.
_CURATE_MAX_TWEETS = 400
_CURATE_PER_KOL_SOFT_CAP = 25  # diversity nudge in the engagement pass


def _budget_curate_tweets(
    tweets: list[dict],
    must_include: list[str],
) -> list[dict]:
    """Cap input to the pro model with priority preservation.

    Goal: never silently drop a must-include ticker's evidence due to volume.
    Priority order:
      1. All tweets that mention any must_include ticker (preserves coverage).
      2. Remaining slots filled by engagement-ranked tweets with a per-KOL
         soft cap so no single KOL eats the budget.
      3. Recency tie-break if engagement matches.

    Returns the original tweet dicts (not slimmed) — slimming happens later.
    """
    if len(tweets) <= _CURATE_MAX_TWEETS:
        return tweets

    must_set = {tk.upper() for tk in must_include}

    def _tweet_tickers(t: dict) -> set[str]:
        return {tk.upper() for tk in _tickers_of(t)}

    def _engagement(t: dict) -> int:
        return (
            (t.get("like_count") or 0)
            + 2 * (t.get("retweet_count") or 0)
            + 5 * (t.get("reply_count") or 0)
        )

    must_cover = [t for t in tweets if _tweet_tickers(t) & must_set]
    rest = [t for t in tweets if not (_tweet_tickers(t) & must_set)]

    # Cap must_cover too — a single hot ticker shouldn't eat 100% of budget.
    must_cap = min(len(must_cover), int(_CURATE_MAX_TWEETS * 0.6))
    must_cover.sort(key=lambda t: (-_engagement(t), t.get("created_at") or ""))
    chosen: list[dict] = must_cover[:must_cap]

    remaining_budget = _CURATE_MAX_TWEETS - len(chosen)
    if remaining_budget <= 0:
        return chosen

    # Engagement pass with per-KOL soft cap. Walk tweets in engagement order;
    # skip once a KOL has already contributed _CURATE_PER_KOL_SOFT_CAP items.
    rest.sort(key=lambda t: (-_engagement(t), t.get("created_at") or ""))
    per_kol: dict[str, int] = {}
    for t in rest:
        if len(chosen) - must_cap >= remaining_budget:
            break
        author = (t.get("author_username") or "").lower()
        if per_kol.get(author, 0) >= _CURATE_PER_KOL_SOFT_CAP:
            continue
        chosen.append(t)
        per_kol[author] = per_kol.get(author, 0) + 1

    logger.info(
        "_budget_curate_tweets: trimmed %d → %d (must_cover=%d, rest_picked=%d)",
        len(tweets), len(chosen), must_cap, len(chosen) - must_cap,
    )
    return chosen


def _fallback_thesis_for_missing(
    ticker: str,
    tweets: list[dict],
) -> TickerThesis | None:
    """Build a minimal grounded TickerThesis when the LLM dropped a must_include.

    Returns None when the ticker only has neutral mentions in the source pool —
    the hard floor in `_enforce_caps` requires at least one bull or bear take,
    so a fallback with only observation would be discarded again. Falling
    back to other_tickers tail is the correct behavior in that case.
    """
    target = ticker.upper().lstrip("$")
    bulls: list[dict] = []
    bears: list[dict] = []
    neutrals: list[dict] = []
    for t in tweets:
        for ts in _ticker_stances_of(t):
            if ts["ticker"].upper() != target:
                continue
            stance = ts["stance"]
            if stance == "bull":
                bulls.append(t)
            elif stance == "bear":
                bears.append(t)
            else:
                neutrals.append(t)
            break

    if not bulls and not bears:
        return None

    def engagement(t: dict) -> int:
        return (
            (t.get("like_count") or 0)
            + 2 * (t.get("retweet_count") or 0)
            + 5 * (t.get("reply_count") or 0)
        )

    bulls.sort(key=engagement, reverse=True)
    bears.sort(key=engagement, reverse=True)
    neutrals.sort(key=engagement, reverse=True)

    def make_arg(t: dict, direction: str) -> Argument:
        text = (t.get("text") or "").replace("\n", " ").strip()
        snippet = text if len(text) <= 140 else text[:139].rstrip() + "…"
        return Argument(
            kol=(t.get("author_username") or "").lower(),
            point_zh=snippet,
            direction=direction,  # type: ignore[arg-type]
            tweet_url=t.get("url") or "",
        )

    buy_args = [make_arg(t, "buy") for t in bulls[:2]]
    sell_args = [make_arg(t, "sell") for t in bears[:2]]
    obs_args = [make_arg(t, "observation") for t in neutrals[:2]]

    primary_kols: list[str] = []
    seen: set[str] = set()
    for a in buy_args + sell_args + obs_args:
        if a.kol and a.kol not in seen:
            seen.add(a.kol)
            primary_kols.append(a.kol)

    return TickerThesis(
        ticker=target,
        primary_kols=primary_kols,
        tweet_count=len(bulls) + len(bears) + len(neutrals),
        stance_summary="",  # _enforce_caps fills via _fallback_stance_summary
        synthesis_zh="",  # left empty — we won't fabricate prose the LLM didn't write
        buy_arguments=buy_args,
        sell_arguments=sell_args,
        observation_arguments=obs_args,
    )


async def curate_tweets(
    tweets: list[dict], usernames: list[str],
) -> CuratedDigestOutput:
    """Cluster by ticker, classify each argument by direction (buy/sell/observation).

    Computes top-N tickers by distinct KOL count BEFORE the LLM call and
    injects them as `must_include_tickers` into the payload — this stops the
    LLM from non-deterministically dropping the most-discussed ticker
    (e.g., NVDA). The cap (8) is enforced post-curate.

    Input is budget-capped via `_budget_curate_tweets` so the widened keep
    standard doesn't blow up pro context or cost.
    """
    catalog = await get_enabled_kols()
    kol_profiles = [
        {"username": k["username"], "display_name": k["display_name"]}
        for k in catalog if k["username"] in usernames
    ]

    # Force top-5 tickers (by distinct KOL count) into the LLM output. The
    # final cap is 6, so 1 slot is left for editorial judgment.
    top_priors = _compute_top_tickers_priors(tweets, top_n=5)
    must_include = [tk for tk, _, _ in top_priors]

    budgeted_tweets = _budget_curate_tweets(tweets, must_include)

    payload = {
        "kols": kol_profiles,
        "must_include_tickers": must_include,
        "tweets": [_slim_tweet_for_curate(t) for t in budgeted_tweets],
    }
    output = await _run_agent(curate_agent, payload, CuratedDigestOutput)

    raw_by_id = {t["id"]: t for t in tweets}
    _enforce_provenance(output, raw_by_id)
    # Backfill watchpoint evidence if LLM forgot. Run BEFORE caps so the
    # "no evidence -> drop" rule catches only watchpoints we truly can't ground.
    _backfill_watchpoint_evidence(output, raw_by_id)
    _enforce_caps(output)

    # Audit + rescue: did the LLM honor the must-include constraint? If not,
    # try to construct a minimal grounded TickerThesis from raw tweets so the
    # most-discussed ticker doesn't silently disappear from the user-facing
    # cards. Tickers with only neutral mentions remain dropped — the
    # buy/sell-required hard floor in _enforce_caps is intentional and a
    # neutral-only "card" carries no decision signal.
    final_set = {t.ticker.upper() for t in output.ticker_theses}
    missing_required = [tk for tk in must_include if tk not in final_set]
    if missing_required:
        logger.warning(
            "curate_tweets: LLM dropped required tickers (despite prompt): %s",
            missing_required,
        )
        rescued: list[str] = []
        for tk in missing_required:
            fallback = _fallback_thesis_for_missing(tk, tweets)
            if fallback is not None:
                output.ticker_theses.append(fallback)
                rescued.append(tk)
        if rescued:
            # Re-classify side + apply caps so rescued theses sort correctly
            # and stance_summary fallbacks fill in.
            _enforce_caps(output)
            logger.info(
                "curate_tweets: rescued missing required tickers from raw tweets: %s",
                rescued,
            )
        still_missing = [tk for tk in missing_required if tk not in rescued]
        if still_missing:
            logger.info(
                "curate_tweets: required tickers with only neutral mentions, "
                "left to other_tickers tail: %s",
                still_missing,
            )

    logger.info(
        "curate_tweets: ticker_theses=%d macro_threads=%d "
        "(input=%d, required=%s)",
        len(output.ticker_theses), len(output.macro_threads),
        len(tweets), must_include,
    )
    return output


# ---------------------------------------------------------------------------
# Hot lists — backend-computed frequency tallies over the kept candidate tweets
# ---------------------------------------------------------------------------


_HOT_SECTORS_TOP_N = 6
_HOT_TICKERS_TOP_N = 8
_HOT_MIN_COUNT = 2  # an item must be cited by >=2 tweets to make the list


def _norm_tag(s: str) -> str:
    """Strip all internal whitespace + casefold for grouping near-duplicates.

    Example: 'AI 算力' and 'AI算力' both → 'ai算力'. The original first-seen
    literal is kept as the display label.
    """
    return "".join(s.split()).casefold()


def _tally_with_kols(
    pairs: list[tuple[str, str]],
) -> list[tuple[str, int, int]]:
    """Variant of _tally that also counts distinct KOL authors per label.

    Input: list of (raw_label, author_username) tuples.
    Output: [(display, mention_count, distinct_kol_count)] sorted by mentions desc.
    Near-duplicate labels are collapsed using the same _norm_tag rule.
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


def _compute_hot_lists(
    tweets: list[dict],
) -> tuple[list[HotItem], list[HotItem], list[HotItem]]:
    """Count tickers + sectors across kept candidate tweets.

    Each HotItem reports:
      - `count`: total mentions in tweets (a KOL tweeting NVDA twice = 2)
      - `kols`: distinct KOL authors (always <= count)

    Items below `_HOT_MIN_COUNT` are dropped so single-mention noise does not
    surface. Near-duplicate labels (e.g. 'AI 算力' vs 'AI算力') are merged.

    `hot_events` is preserved in the return signature for schema compatibility
    but always empty — the events tag was dropped from enrichment.
    """
    sector_pairs: list[tuple[str, str]] = []
    ticker_pairs: list[tuple[str, str]] = []

    for t in tweets:
        author = (t.get("author_username") or "").lower()
        e = _enrichment_of(t)
        for s in (e.get("sectors") or []):
            sector_pairs.append((s, author))
        for tk in _tickers_of(t):
            ticker_pairs.append((tk, author))

    def _to_items(
        triples: list[tuple[str, int, int]],
        top_n: int,
    ) -> list[HotItem]:
        out: list[HotItem] = []
        for label, count, kols in triples[:top_n]:
            if count < _HOT_MIN_COUNT:
                continue
            out.append(HotItem(label=label, count=count, kols=kols))
        return out

    return (
        _to_items(_tally_with_kols(sector_pairs), _HOT_SECTORS_TOP_N),
        _to_items(_tally_with_kols(ticker_pairs), _HOT_TICKERS_TOP_N),
        [],
    )


# ---------------------------------------------------------------------------
# Top-level orchestration
# ---------------------------------------------------------------------------


def _digest_is_empty(d: DailyDigest) -> bool:
    return len(d.ticker_theses) == 0 and len(d.macro_threads) == 0


def _business_date_bjt(dt_utc: datetime) -> str:
    """Business date for this digest in Beijing timezone (UTC+8).

    The pipeline runs at 06:00 BJT (UTC 22:00 of the previous day). Using the
    raw UTC date would file the digest under yesterday's calendar date, which
    breaks broadcast deep-links and `/twitter-digest/{date}` routing. Pin the
    digest to the BJT calendar day so cron, persistence, and email URLs agree.
    """
    return (dt_utc + timedelta(hours=8)).date().isoformat()


async def generate_daily_digest(
    window_hours: int = 24,
    persist: bool = True,
) -> DailyDigest:
    """Run the full pipeline end-to-end and return a DailyDigest."""
    started_at = datetime.now(timezone.utc)
    tweets, usernames, raw_count = await pull_candidate_tweets(window_hours=window_hours)
    if not tweets:
        raise RuntimeError(
            f"No high/medium-quality tweets in last {window_hours}h. "
            f"Either ingestion is broken, enrichment cron failed, or the day is "
            f"genuinely silent."
        )

    curated = await curate_tweets(tweets, usernames)
    hot_sectors, hot_tickers, hot_events = _compute_hot_lists(tweets)

    # Transparency tail: tickers we noticed but didn't surface as theses.
    final_thesis_tickers = {t.ticker.upper() for t in curated.ticker_theses}
    other_tickers = _compute_other_tickers(tweets, final_thesis_tickers)

    business_date = _business_date_bjt(started_at)

    digest = DailyDigest(
        date=business_date,
        generated_at=started_at.isoformat(),
        window_hours=window_hours,
        # Show the window-wide raw count (pre-filter) on web/email; this is
        # what the user-facing "N 条原始推文" string is for. The post-filter
        # count is too small to convey the breadth of the KOL ingestion.
        input_tweet_count=raw_count,
        tracked_kols=sorted(set(usernames)),
        model_version=f"enrich={ENRICH_MODEL}/digest={CURATE_MODEL}",
        headline=curated.headline,
        intro=curated.intro,
        ticker_theses=curated.ticker_theses,
        macro_threads=curated.macro_threads,
        watchpoints=curated.watchpoints,
        other_tickers=other_tickers,
        # Hot lists (frontend uses tickers; sectors/events kept for shape)
        hot_sectors=hot_sectors,
        hot_tickers=hot_tickers,
        hot_events=hot_events,
    )
    logger.info(
        "generate_daily_digest: ticker_theses=%d macro_threads=%d",
        len(digest.ticker_theses), len(digest.macro_threads),
    )

    if persist:
        digest_date = business_date
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
