"""On-demand Twitter/KOL topic workflow.

This module turns a natural-language topic query into an evidence pack. It
does not generate final prose; the writing layer should consume the returned
writer_input and evidence lists.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.features.twitter_digest.service import pull_candidate_tweets
from app.shared.vector_retrieval import search_public_kol_tweet_chunks

logger = get_logger(__name__)


_KOL_TOPIC_SEARCH_THRESHOLD = 0.2
_MAX_EVIDENCE_EXCERPT = 420

_GENERIC_INTENT_TERMS = {
    "buy",
    "sell",
    "long",
    "short",
    "moon",
    "price",
    "target",
    "up",
    "down",
    "bullish",
    "bearish",
}

_TOPIC_EXPANSIONS: list[tuple[tuple[str, ...], tuple[str, ...]]] = [
    (
        ("spacex", "space x", "starship", "starlink", "space economy"),
        (
            "spacex",
            "space x",
            "starship",
            "starlink",
            "spcx",
            "rklb",
            "asts",
            "lunr",
            "rdw",
            "pl",
            "mda",
            "clps",
            "rocket lab",
            "space force",
            "nasa",
            "satellite",
            "rocket",
            "launch",
            "commercial space",
            "space economy",
            "太空",
            "航天",
            "商业航天",
            "太空经济",
            "火箭",
            "卫星",
            "星链",
        ),
    ),
    (
        ("太空", "航天", "商业航天", "太空经济", "火箭", "卫星", "星链"),
        (
            "spacex",
            "starship",
            "starlink",
            "spcx",
            "rklb",
            "asts",
            "lunr",
            "rdw",
            "rocket lab",
            "space force",
            "nasa",
            "commercial space",
            "space economy",
            "太空",
            "航天",
            "商业航天",
            "太空经济",
            "火箭",
            "卫星",
            "星链",
        ),
    ),
]


class TopicHotItem(BaseModel):
    label: str
    count: int


class TopicEvidence(BaseModel):
    source: Literal["recent", "historical"]
    source_id: str
    author_username: str | None = None
    created_at: str | None = None
    url: str | None = None
    tweet_type: str | None = None
    quality: str | None = None
    tickers: list[str] = Field(default_factory=list)
    sectors: list[str] = Field(default_factory=list)
    events: list[str] = Field(default_factory=list)
    score: float = 0.0
    similarity: float | None = None
    match_terms: list[str] = Field(default_factory=list)
    excerpt: str = ""


class TopicWriterInput(BaseModel):
    post_type: Literal["hot_event_deep_dive", "workflow_proof"] = "hot_event_deep_dive"
    query: str
    topic_terms: list[str]
    evidence_window: str
    current_heat: list[str] = Field(default_factory=list)
    historical_context: list[str] = Field(default_factory=list)
    affected_tickers: list[str] = Field(default_factory=list)
    affected_sectors: list[str] = Field(default_factory=list)
    watch_variables: list[str] = Field(default_factory=list)
    cautions: list[str] = Field(default_factory=list)


class TopicWorkflowResult(BaseModel):
    query: str
    expanded_terms: list[str]
    window_hours: int
    raw_recent_count: int
    candidate_recent_count: int
    recent_evidence: list[TopicEvidence]
    historical_evidence: list[TopicEvidence]
    hot_tickers: list[TopicHotItem]
    hot_sectors: list[TopicHotItem]
    hot_events: list[TopicHotItem]
    writer_input: TopicWriterInput


def _enrichment_of(tweet: dict[str, Any]) -> dict[str, Any]:
    symbols = tweet.get("symbols")
    return symbols if isinstance(symbols, dict) else {}


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple, set)):
        return " ".join(_as_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(_as_text(item) for item in value.values())
    return str(value)


def _compact_text(value: Any, *, limit: int = _MAX_EVIDENCE_EXCERPT) -> str:
    text = re.sub(r"\s+", " ", _as_text(value)).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "..."


def _normalize_token(value: str) -> str:
    return value.strip().lower().lstrip("$")


def _tokenize_query(query: str) -> list[str]:
    tokens = re.findall(r"[A-Za-z$][A-Za-z0-9_.-]{1,}|[\u4e00-\u9fff]{2,}", query)
    normalized: list[str] = []
    for token in tokens:
        item = _normalize_token(token)
        if not item:
            continue
        if item in _GENERIC_INTENT_TERMS:
            continue
        if any(ch in item for ch in ("涨", "跌", "买", "卖")):
            continue
        normalized.append(item)
    return normalized


def expand_query_terms(query: str) -> list[str]:
    """Return query terms plus conservative domain aliases."""
    terms = _tokenize_query(query)
    haystack = query.lower()
    for triggers, expansions in _TOPIC_EXPANSIONS:
        if any(trigger in haystack for trigger in triggers):
            terms.extend(expansions)
    seen: set[str] = set()
    deduped: list[str] = []
    for term in terms:
        item = _normalize_token(term)
        if item and item not in seen:
            seen.add(item)
            deduped.append(item)
    return deduped


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
    return out


def _tickers_from_enrichment(enrichment: dict[str, Any]) -> list[str]:
    tickers = [item.upper().lstrip("$") for item in _string_list(enrichment.get("tickers"))]
    stances = enrichment.get("ticker_stances")
    if isinstance(stances, list):
        for item in stances:
            if not isinstance(item, dict):
                continue
            ticker = item.get("ticker")
            if isinstance(ticker, str) and ticker.strip():
                tickers.append(ticker.strip().upper().lstrip("$"))
    seen: set[str] = set()
    out: list[str] = []
    for ticker in tickers:
        if ticker and ticker not in seen:
            seen.add(ticker)
            out.append(ticker)
    return out


def _tweet_fields(tweet: dict[str, Any]) -> tuple[str, str]:
    enrichment = _enrichment_of(tweet)
    tags = " ".join(
        [
            _as_text(_tickers_from_enrichment(enrichment)),
            _as_text(enrichment.get("sectors")),
            _as_text(enrichment.get("events")),
            _as_text(tweet.get("category")),
        ]
    )
    body = " ".join(
        [
            _as_text(tweet.get("text")),
            _as_text(tweet.get("quoted_tweet_text")),
            _as_text(enrichment.get("content_summary_zh")),
            _as_text(enrichment.get("key_claim")),
            _as_text(enrichment.get("content_type")),
            tags,
        ]
    )
    return body.lower(), tags.lower()


def _contains_topic_term(text: str, term: str) -> bool:
    if not text or not term:
        return False
    if re.search(r"[\u4e00-\u9fff]", term):
        return term in text
    pattern = r"(?<![a-z0-9_$])\$?%s(?![a-z0-9_.-])" % re.escape(term)
    return re.search(pattern, text) is not None


def score_tweet_for_topic(tweet: dict[str, Any], terms: list[str]) -> tuple[float, list[str]]:
    """Score one tweet against expanded topic terms."""
    body, tags = _tweet_fields(tweet)
    enrichment = _enrichment_of(tweet)
    tickers = {ticker.lower() for ticker in _tickers_from_enrichment(enrichment)}

    score = 0.0
    matches: list[str] = []
    for term in terms:
        normalized = _normalize_token(term)
        if not normalized:
            continue
        matched = False
        if normalized in tickers:
            score += 8.0
            matched = True
        if _contains_topic_term(tags, normalized):
            score += 5.0
            matched = True
        elif _contains_topic_term(body, normalized):
            score += 2.0
            matched = True
        if matched:
            matches.append(term)

    if not matches:
        return 0.0, []

    quality = str(enrichment.get("quality") or "").lower()
    if quality in ("keep", "high"):
        score += 1.5
    elif quality == "medium":
        score += 0.75

    engagement = (
        (tweet.get("like_count") or 0)
        + 2 * (tweet.get("retweet_count") or 0)
        + (tweet.get("reply_count") or 0)
    )
    if engagement > 0:
        score += min(math.log10(engagement + 1), 3.0)

    return score, sorted(set(matches), key=matches.index)


def _evidence_from_tweet(
    tweet: dict[str, Any],
    *,
    source: Literal["recent", "historical"],
    score: float,
    match_terms: list[str],
    similarity: float | None = None,
) -> TopicEvidence:
    enrichment = _enrichment_of(tweet)
    body = tweet.get("text") or tweet.get("quoted_tweet_text") or ""
    summary = enrichment.get("content_summary_zh") or enrichment.get("key_claim")
    excerpt = summary if summary else body
    return TopicEvidence(
        source=source,
        source_id=str(tweet.get("id") or tweet.get("source_id") or ""),
        author_username=tweet.get("author_username"),
        created_at=tweet.get("created_at"),
        url=tweet.get("url"),
        tweet_type=tweet.get("tweet_type"),
        quality=enrichment.get("quality"),
        tickers=_tickers_from_enrichment(enrichment),
        sectors=_string_list(enrichment.get("sectors")),
        events=_string_list(enrichment.get("events")),
        score=round(score, 4),
        similarity=similarity,
        match_terms=match_terms,
        excerpt=_compact_text(excerpt),
    )


def _tweet_from_vector_result(item: Any) -> dict[str, Any]:
    metadata = item.metadata or {}
    return {
        "id": item.source_id,
        "author_username": metadata.get("author_username"),
        "created_at": metadata.get("created_at") or item.report_date,
        "url": item.url,
        "tweet_type": metadata.get("tweet_type"),
        "text": item.content,
        "symbols": {
            "quality": metadata.get("quality"),
            "tickers": metadata.get("tickers") or [],
            "sectors": metadata.get("sectors") or [],
            "events": metadata.get("events") or [],
            "content_summary_zh": metadata.get("content_summary_zh") or metadata.get("key_claim") or "",
            "key_claim": metadata.get("key_claim") or "",
        },
    }


def _top_items(evidence: list[TopicEvidence], attr: str, *, limit: int = 8) -> list[TopicHotItem]:
    counter: Counter[str] = Counter()
    for item in evidence:
        for value in getattr(item, attr):
            if value:
                counter[value] += 1
    return [
        TopicHotItem(label=label, count=count)
        for label, count in counter.most_common(limit)
    ]


def _line_for_writer(item: TopicEvidence) -> str:
    author = ("@" + item.author_username) if item.author_username else "unknown"
    date = (item.created_at or "")[:10]
    tags = ", ".join(item.tickers + item.sectors + item.events)
    prefix = " ".join(part for part in (date, author) if part)
    suffix = (" [" + tags + "]") if tags else ""
    return _compact_text("%s%s: %s" % (prefix, suffix, item.excerpt), limit=260)


def _watch_variables_for(
    *,
    terms: list[str],
    hot_tickers: list[TopicHotItem],
    hot_sectors: list[TopicHotItem],
    hot_events: list[TopicHotItem],
) -> list[str]:
    joined = " ".join(terms)
    if "spacex" in joined or "spcx" in joined or "航天" in joined or "太空" in joined:
        return [
            "SPCX/SpaceX post-IPO flow and whether ETF/direct-exposure demand keeps broadening",
            "Follow-through in listed space peers such as RKLB, LUNR, ASTS, RDW, PL, and CLPS",
            "Government, defense, NASA, Space Force, launch, satellite, and Starlink/Starship catalyst cadence",
        ]

    variables: list[str] = []
    if hot_tickers:
        variables.append(
            "Whether discussion converts into follow-through for %s"
            % ", ".join(item.label for item in hot_tickers[:3])
        )
    if hot_sectors:
        variables.append(
            "Whether the theme broadens beyond %s"
            % ", ".join(item.label for item in hot_sectors[:2])
        )
    if hot_events:
        variables.append(
            "Whether the next concrete event validates %s"
            % ", ".join(item.label for item in hot_events[:2])
        )
    if not variables:
        variables.append("Whether more KOLs start discussing the same catalyst in the next 24-72 hours")
    return variables[:3]


def build_writer_input(
    *,
    query: str,
    terms: list[str],
    window_hours: int,
    recent_evidence: list[TopicEvidence],
    historical_evidence: list[TopicEvidence],
    hot_tickers: list[TopicHotItem],
    hot_sectors: list[TopicHotItem],
    hot_events: list[TopicHotItem],
) -> TopicWriterInput:
    return TopicWriterInput(
        query=query,
        topic_terms=terms[:24],
        evidence_window="%dh recent KOL tweets plus historical vector evidence" % window_hours,
        current_heat=[_line_for_writer(item) for item in recent_evidence[:8]],
        historical_context=[_line_for_writer(item) for item in historical_evidence[:5]],
        affected_tickers=[item.label for item in hot_tickers[:8]],
        affected_sectors=[item.label for item in hot_sectors[:5]],
        watch_variables=_watch_variables_for(
            terms=terms,
            hot_tickers=hot_tickers,
            hot_sectors=hot_sectors,
            hot_events=hot_events,
        ),
        cautions=[
            "This pack summarizes KOL discussion, not a price target or investment recommendation.",
            "Recent-window heat and historical background are separated; do not imply old evidence is today's consensus.",
        ],
    )


async def _historical_vector_evidence(
    *,
    query: str,
    terms: list[str],
    top_k: int,
) -> list[TopicEvidence]:
    expanded_query = "%s %s" % (query, " ".join(terms[:24]))
    response = await search_public_kol_tweet_chunks(
        query=expanded_query,
        top_k=max(top_k * 2, top_k),
        threshold=_KOL_TOPIC_SEARCH_THRESHOLD,
    )
    evidence: list[TopicEvidence] = []
    for item in response.results:
        tweet = _tweet_from_vector_result(item)
        score, matches = score_tweet_for_topic(tweet, terms)
        evidence.append(
            _evidence_from_tweet(
                tweet,
                source="historical",
                score=score,
                match_terms=matches,
                similarity=round(item.similarity, 4),
            )
        )
    evidence.sort(key=lambda item: (item.similarity or 0.0, item.score), reverse=True)
    return evidence[:top_k]


async def run_topic_workflow(
    query: str,
    *,
    window_hours: int = 72,
    top_k: int = 12,
    include_historical: bool = True,
) -> TopicWorkflowResult:
    """Build an evidence pack for one topic query."""
    terms = expand_query_terms(query)
    recent_tweets, _kol_usernames, raw_count = await pull_candidate_tweets(window_hours)

    scored: list[tuple[float, list[str], dict[str, Any]]] = []
    for tweet in recent_tweets:
        score, matches = score_tweet_for_topic(tweet, terms)
        if score <= 0:
            continue
        scored.append((score, matches, tweet))

    scored.sort(
        key=lambda item: (
            item[0],
            item[2].get("created_at") or "",
        ),
        reverse=True,
    )
    recent_evidence = [
        _evidence_from_tweet(
            tweet,
            source="recent",
            score=score,
            match_terms=matches,
        )
        for score, matches, tweet in scored[:top_k]
    ]

    historical_evidence: list[TopicEvidence] = []
    if include_historical:
        try:
            historical_evidence = await _historical_vector_evidence(
                query=query,
                terms=terms,
                top_k=top_k,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("topic workflow historical search failed for query=%s", query)
            historical_evidence = []

    recent_ids = {item.source_id for item in recent_evidence}
    historical_evidence = [
        item for item in historical_evidence
        if item.source_id not in recent_ids
    ][:top_k]

    hot_tickers = _top_items(recent_evidence, "tickers")
    hot_sectors = _top_items(recent_evidence, "sectors")
    hot_events = _top_items(recent_evidence, "events")
    writer_input = build_writer_input(
        query=query,
        terms=terms,
        window_hours=window_hours,
        recent_evidence=recent_evidence,
        historical_evidence=historical_evidence,
        hot_tickers=hot_tickers,
        hot_sectors=hot_sectors,
        hot_events=hot_events,
    )

    return TopicWorkflowResult(
        query=query,
        expanded_terms=terms,
        window_hours=window_hours,
        raw_recent_count=raw_count,
        candidate_recent_count=len(recent_tweets),
        recent_evidence=recent_evidence,
        historical_evidence=historical_evidence,
        hot_tickers=hot_tickers,
        hot_sectors=hot_sectors,
        hot_events=hot_events,
        writer_input=writer_input,
    )


def render_topic_workflow_markdown(result: TopicWorkflowResult) -> str:
    """Render the workflow result for local review."""
    lines: list[str] = [
        "# Twitter Topic Workflow",
        "",
        "Query: %s" % result.query,
        "Window: %dh" % result.window_hours,
        "Raw recent tweets: %d" % result.raw_recent_count,
        "Candidate recent tweets after quality filter: %d" % result.candidate_recent_count,
        "Expanded terms: %s" % ", ".join(result.expanded_terms[:40]),
        "",
        "## Hot Tags",
        "",
        "- Tickers: %s" % ", ".join("%s (%d)" % (i.label, i.count) for i in result.hot_tickers),
        "- Sectors: %s" % ", ".join("%s (%d)" % (i.label, i.count) for i in result.hot_sectors),
        "- Events: %s" % ", ".join("%s (%d)" % (i.label, i.count) for i in result.hot_events),
        "",
        "## Recent Evidence",
        "",
    ]
    for index, item in enumerate(result.recent_evidence, start=1):
        lines.extend(
            [
                "%d. %s" % (index, _line_for_writer(item)),
                "   score=%s quality=%s terms=%s url=%s"
                % (
                    item.score,
                    item.quality or "",
                    ", ".join(item.match_terms[:12]),
                    item.url or "",
                ),
            ]
        )

    lines.extend(["", "## Historical Evidence", ""])
    for index, item in enumerate(result.historical_evidence, start=1):
        lines.extend(
            [
                "%d. %s" % (index, _line_for_writer(item)),
                "   similarity=%s score=%s quality=%s url=%s"
                % (
                    item.similarity if item.similarity is not None else "",
                    item.score,
                    item.quality or "",
                    item.url or "",
                ),
            ]
        )

    writer = result.writer_input
    lines.extend(
        [
            "",
            "## Writer Input",
            "",
            "- Post type: %s" % writer.post_type,
            "- Evidence window: %s" % writer.evidence_window,
            "- Affected tickers: %s" % ", ".join(writer.affected_tickers),
            "- Affected sectors: %s" % ", ".join(writer.affected_sectors),
            "- Watch variables:",
        ]
    )
    for item in writer.watch_variables:
        lines.append("  - %s" % item)
    lines.extend(["- Cautions:"])
    for item in writer.cautions:
        lines.append("  - %s" % item)
    lines.append("")
    return "\n".join(lines)
