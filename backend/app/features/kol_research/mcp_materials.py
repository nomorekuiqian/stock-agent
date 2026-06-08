"""Market Lens distilled material index.

This module is deliberately filesystem-backed and persona-neutral. A persona is
available to MCP material tools when it has a directory under
`features/twitter/methodologies/{persona}` with the standard lens layers:
core, framework, macro, sector, and ticker.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Literal

import yaml

from app.core.logging import get_logger

logger = get_logger(__name__)

LENS_TYPES = ("core", "framework", "macro", "sector", "ticker")
LensType = Literal["core", "framework", "macro", "sector", "ticker"]

_ROOT = Path(__file__).resolve().parents[1] / "twitter" / "methodologies"
_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_TWEET_ID_RE = re.compile(r"`(\d{15,})`")


def list_material_personas() -> list[dict[str, Any]]:
    """Return persona directories that contain at least one lens markdown file."""
    if not _ROOT.is_dir():
        return []

    personas: list[dict[str, Any]] = []
    for path in sorted(item for item in _ROOT.iterdir() if item.is_dir()):
        counts = _lens_counts(path)
        if not any(counts.values()):
            continue
        personas.append(
            {
                "username": path.name,
                "display_name": path.name,
                "material_root": str(path.relative_to(_ROOT.parent.parent.parent)),
                "lens_counts": counts,
                "lens_types": [lens_type for lens_type, count in counts.items() if count],
                "supported_context": [
                    "list_lenses",
                    "get_lens",
                    "search_lenses",
                    "search_evidence",
                    "get_evidence_by_ids",
                ],
                "supported_workflows": _supported_workflows(path.name),
            }
        )
    return personas


def material_persona_exists(username: str) -> bool:
    return _persona_root(username).is_dir()


def list_lenses(username: str, lens_type: str | None = None) -> dict[str, Any]:
    """List all distilled material lenses for a persona.

    The response is an index only: it includes IDs, descriptions, coverage, and
    evidence counts but not full lens bodies. Use `get_lens` for full content.
    """
    root = _require_persona_root(username)
    allowed_types = _normalize_lens_types([lens_type] if lens_type else [])
    lenses = [_lens_index_item(path, root) for path in _iter_lens_paths(root, allowed_types)]
    return {
        "persona_username": username,
        "lens_types": allowed_types or list(LENS_TYPES),
        "count": len(lenses),
        "lenses": lenses,
        "call_guidance": {
            "when_to_call": (
                "Call this before choosing a lens ID, when the user asks what a persona covers, "
                "or when routing a broad question to the right material layer."
            ),
            "returns_context": "Index metadata only; no full distilled markdown body.",
        },
    }


def get_lens(username: str, lens_type: str, lens_id: str) -> dict[str, Any]:
    """Return one full distilled lens body plus parsed sections and evidence IDs."""
    root = _require_persona_root(username)
    normalized_type = _normalize_lens_type(lens_type)
    normalized_id = _normalize_lens_id(lens_id)
    path = _resolve_lens_path(root, normalized_type, normalized_id)
    if path is None:
        raise KeyError(f"lens_not_found:{normalized_type}/{normalized_id}")

    raw = path.read_text(encoding="utf-8")
    metadata, body = _split_frontmatter(raw)
    title = _extract_title(body) or normalized_id
    sections = _split_h2(body)
    evidence_ids = _extract_tweet_ids(_section_by_name(sections, "Evidence Map", "Evidence"))
    return {
        "persona_username": username,
        "lens_type": normalized_type,
        "lens_id": path.stem,
        "title": title,
        "description": _description_from_body(body),
        "metadata": metadata,
        "sections": sections,
        "evidence_tweet_ids": evidence_ids,
        "full_body": body.strip(),
        "call_guidance": _call_guidance_for_lens(normalized_type),
    }


def search_lenses(
    username: str,
    query: str,
    lens_types: list[str] | None = None,
    limit: int = 8,
    include_body: bool = False,
) -> dict[str, Any]:
    """Simple lexical search across all distilled material markdown files."""
    root = _require_persona_root(username)
    normalized_query = query.strip()
    if not normalized_query:
        raise ValueError("query is required")

    allowed_types = _normalize_lens_types(lens_types or [])
    terms = _query_terms(normalized_query)
    scored: list[tuple[int, dict[str, Any]]] = []
    for path in _iter_lens_paths(root, allowed_types):
        raw = path.read_text(encoding="utf-8")
        metadata, body = _split_frontmatter(raw)
        title = _extract_title(body) or path.stem
        description = _description_from_body(body)
        haystack = " ".join([title, description, body]).lower()
        score = sum(haystack.count(term.lower()) for term in terms)
        if normalized_query.lower() in haystack:
            score += 5
        if score <= 0:
            continue
        lens_type = path.parent.name
        item = {
            "persona_username": username,
            "lens_type": lens_type,
            "lens_id": path.stem,
            "title": title,
            "description": description,
            "metadata": metadata,
            "score": score,
            "snippet": _snippet(body, terms),
            "evidence_tweet_ids": _extract_tweet_ids(_section_by_name(_split_h2(body), "Evidence Map", "Evidence")),
            "call_guidance": _call_guidance_for_lens(lens_type),
        }
        if include_body:
            item["full_body"] = body.strip()
        scored.append((score, item))

    scored.sort(key=lambda pair: (-pair[0], pair[1]["lens_type"], pair[1]["lens_id"]))
    results = [item for _, item in scored[: max(1, min(limit, 30))]]
    return {
        "persona_username": username,
        "query": normalized_query,
        "lens_types": allowed_types or list(LENS_TYPES),
        "count": len(results),
        "results": results,
        "call_guidance": {
            "when_to_call": (
                "Call this when the user asks about a topic, rule, pattern, or term and you do not "
                "already know the exact ticker/sector/framework lens ID."
            ),
            "returns_context": (
                "Ranked distilled material matches. Use get_lens for complete context before making "
                "strong claims from a specific lens."
            ),
        },
    }


def _lens_counts(root: Path) -> dict[str, int]:
    return {
        lens_type: len(list((root / lens_type).glob("*.md"))) if (root / lens_type).is_dir() else 0
        for lens_type in LENS_TYPES
    }


def _supported_workflows(username: str) -> list[str]:
    if username == "qinbafrank":
        return ["stock_diagnosis", "market_regime", "compare", "research_memo"]
    return []


def _persona_root(username: str) -> Path:
    return _ROOT / username.strip()


def _require_persona_root(username: str) -> Path:
    root = _persona_root(username)
    if not root.is_dir():
        raise FileNotFoundError(f"persona_not_found:{username}")
    return root


def _iter_lens_paths(root: Path, lens_types: list[str] | None = None):
    selected = lens_types or list(LENS_TYPES)
    for lens_type in selected:
        layer = root / lens_type
        if not layer.is_dir():
            continue
        yield from sorted(layer.glob("*.md"))


def _resolve_lens_path(root: Path, lens_type: str, lens_id: str) -> Path | None:
    layer = root / lens_type
    for path in layer.glob("*.md"):
        if path.stem == lens_id:
            return path
    lowered = lens_id.lower()
    for path in layer.glob("*.md"):
        if path.stem.lower() == lowered:
            return path
    return None


def _lens_index_item(path: Path, root: Path) -> dict[str, Any]:
    raw = path.read_text(encoding="utf-8")
    metadata, body = _split_frontmatter(raw)
    sections = _split_h2(body)
    evidence_ids = _extract_tweet_ids(_section_by_name(sections, "Evidence Map", "Evidence"))
    lens_type = path.parent.name
    return {
        "lens_type": lens_type,
        "lens_id": path.stem,
        "title": _extract_title(body) or path.stem,
        "description": _description_from_body(body),
        "metadata": metadata,
        "coverage": metadata.get("coverage"),
        "parent_sector": metadata.get("parent_sector"),
        "direct_mention_count": metadata.get("direct_mention_count"),
        "relative_path": str(path.relative_to(root)),
        "line_count": len(body.splitlines()),
        "has_evidence_map": bool(evidence_ids),
        "evidence_tweet_id_count": len(evidence_ids),
        "call_guidance": _call_guidance_for_lens(lens_type),
    }


def _split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    body = text[match.end() :].lstrip("\n")
    try:
        metadata = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        logger.warning("invalid lens frontmatter")
        metadata = {}
    return metadata if isinstance(metadata, dict) else {}, body


def _split_h2(body: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    current: str | None = None
    buffer: list[str] = []
    for line in body.splitlines():
        if line.startswith("## ") and not line.startswith("### "):
            if current is not None:
                sections[current] = "\n".join(buffer).strip()
            current = line[3:].strip()
            buffer = []
        elif current is not None:
            buffer.append(line)
    if current is not None:
        sections[current] = "\n".join(buffer).strip()
    return sections


def _section_by_name(sections: dict[str, str], *needles: str) -> str:
    for title, body in sections.items():
        if any(needle.lower() in title.lower() for needle in needles):
            return body
    return ""


def _extract_title(body: str) -> str:
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def _description_from_body(body: str, max_len: int = 600) -> str:
    sections = _split_h2(body)
    applicable = _section_by_name(sections, "适用问题")
    source = applicable or body
    lines: list[str] = []
    for line in source.splitlines():
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        text = re.sub(r"^[-*]\s+", "", text)
        lines.append(text)
        if len(" ".join(lines)) >= max_len:
            break
    return " ".join(lines)[:max_len].strip()


def _extract_tweet_ids(text: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for match in _TWEET_ID_RE.finditer(text):
        tweet_id = match.group(1)
        if tweet_id not in seen:
            seen.add(tweet_id)
            out.append(tweet_id)
    return out


def _normalize_lens_type(lens_type: str) -> str:
    normalized = lens_type.strip().lower().replace("_", "-")
    if normalized not in LENS_TYPES:
        raise ValueError(f"unsupported_lens_type:{lens_type}")
    return normalized


def _normalize_lens_types(lens_types: list[str]) -> list[str]:
    out: list[str] = []
    for lens_type in lens_types:
        if not lens_type:
            continue
        normalized = _normalize_lens_type(lens_type)
        if normalized not in out:
            out.append(normalized)
    return out


def _normalize_lens_id(lens_id: str) -> str:
    return lens_id.strip().replace("/", "").replace("\\", "")


def _query_terms(query: str) -> list[str]:
    terms = [term for term in re.split(r"\s+", query.strip()) if term]
    return terms or [query.strip()]


def _snippet(body: str, terms: list[str], radius: int = 180) -> str:
    lowered = body.lower()
    first = -1
    for term in terms:
        idx = lowered.find(term.lower())
        if idx >= 0 and (first < 0 or idx < first):
            first = idx
    if first < 0:
        return body[: radius * 2].strip()
    start = max(0, first - radius)
    end = min(len(body), first + radius)
    return body[start:end].strip()


def _call_guidance_for_lens(lens_type: str) -> dict[str, str]:
    if lens_type == "core":
        when = "Call for broad questions about the persona's operating system, boundaries, veto rules, or market worldview."
        returns = "Full core methodology context and safety boundaries."
    elif lens_type == "framework":
        when = "Call when routing a user question shape, such as stock, sector, macro, comparison, method, or veto questions."
        returns = "Answer-shape instructions and required evidence/data actions for that question class."
    elif lens_type == "macro":
        when = "Call for market-regime, liquidity, policy, risk-level, or broad market pattern questions."
        returns = "Macro regime playbook, variables watched, falsifiers, and evidence map IDs."
    elif lens_type == "sector":
        when = "Call for industry-chain, sector, theme, or basket questions."
        returns = "Sector playbook with core questions, signals, bull/bear triggers, vetoes, falsifiers, and evidence map IDs."
    else:
        when = "Call for a specific stock, ticker, or company-level historical thesis question."
        returns = "Ticker playbook with coverage level, thesis, signals watched, triggers, falsifiers, misreadings, and evidence map IDs."
    return {"when_to_call": when, "returns_context": returns}
