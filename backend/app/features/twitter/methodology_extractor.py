"""
KOL methodology extraction orchestration.

This module reads categorized KOL tweets, asks a structured LLM extractor for a
single category methodology, and writes the YAML plus audit artifacts under
`methodologies/<username>/`.
"""

import asyncio
import json
from difflib import SequenceMatcher
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import ValidationError

from app.core.logging import get_logger
from app.features.twitter import db
from app.features.twitter.methodology_models import (
    CategoryMethodology,
    MethodologyCategory,
)
from app.features.twitter.methodology_prompts import (
    CATEGORY_CHINESE,
    EXTRACT_INSTRUCTION_TEMPLATE,
    PROMPT_VERSION,
)

logger = get_logger(__name__)

MODEL = "gemini-3.1-pro-preview"
APP_NAME = "twitter_methodology"
EXTRACTOR_VERSION = "v1.0"

_BASE_DIR = Path(__file__).resolve().parent / "methodologies"
_MAX_TWEETS_PER_CATEGORY = 1000
_MIN_TWEETS_PER_CATEGORY = 20
_LLM_MAX_ATTEMPTS = 3
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def build_extract_agent(instruction: str) -> LlmAgent:
    return LlmAgent(
        name="kol_methodology_extractor",
        model=MODEL,
        description="Extract a reusable KOL methodology from categorized tweets",
        instruction=instruction,
        output_schema=CategoryMethodology,
        output_key="methodology",
    )


async def _run_extractor(instruction: str) -> CategoryMethodology:
    for attempt in range(1, _LLM_MAX_ATTEMPTS + 1):
        try:
            return await _run_extractor_once(instruction)
        except Exception as exc:
            if attempt >= _LLM_MAX_ATTEMPTS or not _is_retryable_llm_error(exc):
                raise
            delay = 30 * attempt
            logger.warning(
                "kol methodology extractor retrying after transient LLM error "
                "attempt=%s delay_seconds=%s error=%s",
                attempt,
                delay,
                exc,
            )
            await asyncio.sleep(delay)
    raise RuntimeError("kol_methodology_extractor exhausted retries")


async def _run_extractor_once(instruction: str) -> CategoryMethodology:
    agent = build_extract_agent(instruction)
    runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
    user_id = f"{agent.name}_caller"
    session = await runner.session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
    )
    message = Content(parts=[Part(text="Extract the methodology now.")], role="user")

    async for _ in runner.run_async(
        user_id=user_id,
        session_id=session.id,
        new_message=message,
    ):
        pass

    session_data = await runner.session_service.get_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session.id,
    )
    state = (session_data.state if session_data else {}) or {}
    raw = state.get(agent.output_key)
    if raw is None:
        raise RuntimeError("kol_methodology_extractor produced no output")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"kol_methodology_extractor output was not valid JSON: {raw[:200]}"
            ) from exc
    try:
        return CategoryMethodology.model_validate(raw)
    except ValidationError as exc:
        raise RuntimeError(
            f"kol_methodology_extractor output did not match schema: {exc}"
        ) from exc


def _is_retryable_llm_error(exc: Exception) -> bool:
    status_code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if status_code in _RETRYABLE_STATUS_CODES:
        return True
    return any(str(code) in str(exc) for code in _RETRYABLE_STATUS_CODES)


def _tweet_payload(tweets: list[dict]) -> list[dict]:
    return [
        {
            "tweet_id": t.get("id"),
            "text": t.get("text") or "",
            "quoted_tweet_text": t.get("quoted_tweet_text"),
            "tweet_type": t.get("tweet_type"),
            "created_at": t.get("created_at"),
            "url": t.get("url"),
            "like_count": t.get("like_count", 0),
            "retweet_count": t.get("retweet_count", 0),
            "reply_count": t.get("reply_count", 0),
            "view_count": t.get("view_count", 0),
            "symbols": t.get("symbols"),
        }
        for t in tweets
    ]


def _build_instruction(
    *,
    analyst: str,
    category: MethodologyCategory,
    tweets: list[dict],
    methodology_version: str,
) -> str:
    payload = _tweet_payload(tweets)
    return EXTRACT_INSTRUCTION_TEMPLATE.format(
        analyst=analyst,
        category=category,
        category_chinese=CATEGORY_CHINESE[category],
        tweets_json=json.dumps(payload, ensure_ascii=False, default=str),
        tweet_count=len(tweets),
        methodology_version=methodology_version,
        prompt_version=PROMPT_VERSION,
    )


def _quote_scalar(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _to_yaml(value: Any, indent: int = 0) -> str:
    spaces = " " * indent
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return _quote_scalar(value)
    if isinstance(value, list):
        if not value:
            return "[]"
        lines: list[str] = []
        for item in value:
            if isinstance(item, (dict, list)):
                nested = _to_yaml(item, indent + 2)
                lines.append(f"{spaces}- {nested.lstrip()}")
            else:
                lines.append(f"{spaces}- {_to_yaml(item, indent + 2)}")
        return "\n".join(lines)
    if isinstance(value, dict):
        if not value:
            return "{}"
        lines = []
        for key, item in value.items():
            if isinstance(item, (dict, list)):
                nested = _to_yaml(item, indent + 2)
                lines.append(f"{spaces}{key}:")
                lines.append(nested)
            else:
                lines.append(f"{spaces}{key}: {_to_yaml(item, indent + 2)}")
        return "\n".join(lines)
    return _quote_scalar(str(value))


def _write_yaml(path: Path, payload: dict) -> None:
    path.write_text(_to_yaml(payload) + "\n", encoding="utf-8")


def _source_by_id(tweets: list[dict]) -> dict[str, str]:
    return {
        str(t.get("id")): "\n".join(
            part for part in [
                t.get("text") or "",
                t.get("quoted_tweet_text") or "",
            ]
            if part
        )
        for t in tweets
    }


def _iter_evidence(methodology: CategoryMethodology):
    for item in methodology.data_preferences:
        yield from item.evidence
    for item in methodology.analytical_process:
        yield from item.evidence
    for item in methodology.decision_criteria:
        yield from item.evidence
    for item in methodology.communication_patterns:
        yield from item.evidence
    for item in methodology.veto_rules:
        yield from item.evidence
    for item in methodology.falsifiability_rules:
        yield from item.evidence


def validate_evidence(methodology: CategoryMethodology, tweets: list[dict]) -> list[str]:
    sources = _source_by_id(tweets)
    problems: list[str] = []
    for evidence in _iter_evidence(methodology):
        source = sources.get(str(evidence.tweet_id))
        if not source:
            problems.append(f"tweet_id not found: {evidence.tweet_id}")
            continue
        if evidence.quote not in source:
            problems.append(f"quote not found in tweet {evidence.tweet_id}")
    return problems


def _best_source_quote(source: str, quote: str) -> str | None:
    """Return an exact source substring close to a model-proposed quote.

    LLMs often add ellipses or lightly normalize punctuation. We do not invent
    evidence; this only shortens to a contiguous substring that already exists
    in the source tweet.
    """
    if not source or not quote:
        return None
    if quote in source:
        return quote

    parts = [
        part.strip()
        for part in quote.replace("...", "…").split("…")
        if len(part.strip()) >= 12
    ]
    for part in parts:
        if part in source:
            return part

    matcher = SequenceMatcher(None, source, quote, autojunk=False)
    match = matcher.find_longest_match(0, len(source), 0, len(quote))
    if match.size >= 12:
        candidate = source[match.a: match.a + match.size].strip()
        if len(candidate) >= 12:
            return candidate
    return None


def repair_evidence_quotes(methodology: CategoryMethodology, tweets: list[dict]) -> int:
    sources = _source_by_id(tweets)
    repaired = 0
    for evidence in _iter_evidence(methodology):
        source = sources.get(str(evidence.tweet_id))
        if not source or evidence.quote in source:
            continue
        replacement = _best_source_quote(source, evidence.quote)
        if replacement and replacement != evidence.quote:
            evidence.quote = replacement
            repaired += 1
    return repaired


def _review_report(
    methodology: CategoryMethodology,
    tweets: list[dict],
    evidence_problems: list[str],
    repaired_count: int,
) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [
        f"# {methodology.analyst} · {methodology.category} · {methodology.methodology_version} · {now}",
        "",
        f"Source tweets: {len(tweets)}",
        f"Model: {MODEL}",
        f"Prompt version: {methodology.prompt_version}",
        "",
        "## Counts",
        "",
        f"- data_preferences: {len(methodology.data_preferences)}",
        f"- analytical_process: {len(methodology.analytical_process)}",
        f"- decision_criteria: {len(methodology.decision_criteria)}",
        f"- communication_patterns: {len(methodology.communication_patterns)}",
        f"- veto_rules: {len(methodology.veto_rules)}",
        f"- falsifiability_rules: {len(methodology.falsifiability_rules)}",
        "",
        "## Evidence Validation",
        "",
        f"- auto_repaired_quotes: {repaired_count}",
        "",
    ]
    if evidence_problems:
        lines.extend(f"- {problem}" for problem in evidence_problems[:100])
    else:
        lines.append("- All cited quotes were found in the source tweet corpus.")

    lines.extend(["", "## Insufficient Evidence Notes", ""])
    if methodology.insufficient_evidence_notes:
        lines.extend(f"- {note}" for note in methodology.insufficient_evidence_notes)
    else:
        lines.append("- None.")

    lines.extend(["", "## Data Preferences", ""])
    for index, item in enumerate(methodology.data_preferences, 1):
        lines.extend([
            f"### {index}. {item.name} ({item.frequency})",
            item.description,
            "",
        ])
        for ev in item.evidence:
            lines.extend([f"> [tweet_id: {ev.tweet_id}]", f"> {ev.quote}", ""])

    lines.extend(["", "## Analytical Process", ""])
    for item in sorted(methodology.analytical_process, key=lambda x: x.order):
        lines.extend([f"### Step {item.order}", item.description, ""])
        for ev in item.evidence:
            lines.extend([f"> [tweet_id: {ev.tweet_id}]", f"> {ev.quote}", ""])

    lines.extend(["", "## Decision Criteria", ""])
    for item in methodology.decision_criteria:
        lines.extend([
            f"### {item.direction} · {item.weight}",
            item.condition,
            "",
        ])
        for ev in item.evidence:
            lines.extend([f"> [tweet_id: {ev.tweet_id}]", f"> {ev.quote}", ""])

    lines.extend(["", "## Falsifiability Rules", ""])
    for item in methodology.falsifiability_rules:
        lines.extend([f"### {item.thesis}", f"Falsifier: {item.falsifier}", ""])
        for ev in item.evidence:
            lines.extend([f"> [tweet_id: {ev.tweet_id}]", f"> {ev.quote}", ""])

    return "\n".join(lines).rstrip() + "\n"


def _holdout_report(category: str, tweets: list[dict]) -> str:
    candidates = [
        t for t in tweets
        if (t.get("symbols") or {}).get("quality") in {"high", "medium"}
    ][:5]
    lines = [
        f"# Holdout candidates · {category}",
        "",
        "Use these as manual holdout checks before approving the methodology.",
        "",
    ]
    for index, tweet in enumerate(candidates, 1):
        symbols = tweet.get("symbols") or {}
        summary = symbols.get("content_summary_zh") or ""
        lines.extend([
            f"## {index}. {tweet.get('id')}",
            "",
            f"- created_at: {tweet.get('created_at')}",
            f"- url: {tweet.get('url')}",
            f"- quality: {symbols.get('quality')}",
            f"- summary: {summary}",
            "",
            (tweet.get("text") or "")[:1000],
            "",
        ])
    return "\n".join(lines).rstrip() + "\n"


def _ensure_metadata(username: str, base: Path) -> None:
    metadata_path = base / "metadata.yaml"
    if metadata_path.exists():
        return
    _write_yaml(
        metadata_path,
        {
            "analyst": username,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "methodology_package": "v1",
            "source": "kol_tweets",
            "notes": [
                "Generated methodology files require human review before use.",
                "Do not claim to be the analyst; cite tweet_id evidence when available.",
            ],
        },
    )


def save_methodology_artifacts(
    username: str,
    category: MethodologyCategory,
    methodology: CategoryMethodology,
    tweets: list[dict],
    instruction: str,
) -> dict:
    base = _BASE_DIR / username
    log_dir = base / "extraction_log"
    log_dir.mkdir(parents=True, exist_ok=True)
    _ensure_metadata(username, base)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    version_slug = methodology.methodology_version.replace(".", "-")
    log_stem = f"{stamp}-{category}-{version_slug}"
    repaired_count = repair_evidence_quotes(methodology, tweets)
    evidence_problems = validate_evidence(methodology, tweets)

    yaml_path = base / f"{category}.yaml"
    json_path = log_dir / f"{log_stem}.json"
    report_path = log_dir / f"{log_stem}.md"
    prompt_path = log_dir / f"{log_stem}.prompt.md"
    holdout_path = log_dir / f"{log_stem}.holdout.md"

    payload = methodology.model_dump()
    _write_yaml(yaml_path, payload)
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    report_path.write_text(
        _review_report(methodology, tweets, evidence_problems, repaired_count),
        encoding="utf-8",
    )
    prompt_path.write_text(instruction, encoding="utf-8")
    holdout_path.write_text(_holdout_report(category, tweets), encoding="utf-8")

    return {
        "yaml_path": str(yaml_path),
        "json_path": str(json_path),
        "review_report": str(report_path),
        "prompt_path": str(prompt_path),
        "holdout_report": str(holdout_path),
        "repaired_evidence_count": repaired_count,
        "evidence_problem_count": len(evidence_problems),
    }


async def extract_methodology_for_category(
    username: str,
    category: MethodologyCategory,
    *,
    methodology_version: str = EXTRACTOR_VERSION,
    limit: int = 2000,
) -> tuple[CategoryMethodology, dict]:
    tweets = await db.list_tweets_by_category(
        username=username,
        category=category,
        limit=limit,
    )
    if len(tweets) > _MAX_TWEETS_PER_CATEGORY:
        tweets = tweets[:_MAX_TWEETS_PER_CATEGORY]
    if len(tweets) < _MIN_TWEETS_PER_CATEGORY:
        raise ValueError(
            f"Category {category} has only {len(tweets)} tweets, too few"
        )

    instruction = _build_instruction(
        analyst=username,
        category=category,
        tweets=tweets,
        methodology_version=methodology_version,
    )
    output = await _run_extractor(instruction)
    artifacts = save_methodology_artifacts(
        username=username,
        category=category,
        methodology=output,
        tweets=tweets,
        instruction=instruction,
    )
    logger.info(
        "extracted methodology username=%s category=%s tweets=%d artifacts=%s",
        username,
        category,
        len(tweets),
        artifacts,
    )
    return output, artifacts
