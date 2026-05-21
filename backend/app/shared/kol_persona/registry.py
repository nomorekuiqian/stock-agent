"""Persona registry — loads .md files from `methodologies/<username>/` into memory.

Layered loading:
  - _orchestrator.md     -> always-on (Agent.instruction)
  - overview.md          -> always-on (Agent.instruction)
  - principles-*.md      -> always-on, cross-cutting (Agent.instruction)
  - lens-*.md            -> trigger-based (ADK SkillToolset)
  - *.yaml               -> not loaded here; accessed lazily by audit / eval tools

`get_persona()` is cached. Tests can call `clear_persona_cache()` to reset.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from app.core.logging import get_logger
from app.shared.kol_persona.models import Persona, PersonaSummary, SkillDoc

logger = get_logger(__name__)

METHODOLOGIES_DIR = (
    Path(__file__).resolve().parents[2]
    / "features"
    / "twitter"
    / "methodologies"
)


def _parse_md(path: Path) -> tuple[Dict[str, Any], str]:
    """Split YAML frontmatter from markdown body.

    Returns (frontmatter_dict, body). If no frontmatter, returns ({}, full_text).
    """
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end < 0:
        return {}, text
    fm_text = text[3:end].strip()
    body = text[end + 4 :].lstrip("\n")
    try:
        fm = yaml.safe_load(fm_text) or {}
    except yaml.YAMLError:
        logger.warning("Failed to parse frontmatter in %s; treating as empty.", path)
        fm = {}
    if not isinstance(fm, dict):
        fm = {}
    return fm, body


def _md_to_skill_doc(path: Path) -> SkillDoc:
    fm, body = _parse_md(path)

    raw_name = str(fm.get("name") or path.stem).strip()
    # spec: lowercase alnum + hyphens only, no leading/trailing hyphen
    name = raw_name.lower().replace("_", "-").replace(" ", "-")

    raw_desc = fm.get("when_to_use") or fm.get("description") or ""
    description = " ".join(str(raw_desc).split())
    if len(description) > 1000:
        description = description[:1000].rstrip() + "..."
    if not description:
        description = f"Lens {name}"

    return SkillDoc(
        name=name,
        description=description,
        type=fm.get("type"),
        body=body.strip(),
        extra={k: v for k, v in fm.items() if k not in ("name", "when_to_use", "description", "type")},
    )


def _derive_display_name(username: str, overview: Optional[SkillDoc]) -> str:
    """Try to pull a friendly display label from overview.md, else username."""
    if not overview:
        return username
    return username


def _derive_summary(overview: Optional[SkillDoc]) -> str:
    """Take the "一句话画像" section if present, else first non-empty paragraph."""
    if not overview:
        return ""
    body = overview.body
    marker = "## 一句话画像"
    if marker in body:
        tail = body.split(marker, 1)[1]
        # First non-empty paragraph after the heading
        for para in tail.split("\n\n"):
            chunk = para.strip()
            if chunk and not chunk.startswith("#"):
                # Strip surrounding ** markers
                clean = chunk.replace("**", "").strip()
                if len(clean) > 280:
                    clean = clean[:280].rstrip() + "..."
                return clean
    # Fallback: first non-heading paragraph
    for para in body.split("\n\n"):
        chunk = para.strip()
        if chunk and not chunk.startswith("#"):
            clean = chunk.replace("**", "").strip()
            if len(clean) > 280:
                clean = clean[:280].rstrip() + "..."
            return clean
    return ""


def _load_persona_uncached(username: str) -> Optional[Persona]:
    persona_dir = METHODOLOGIES_DIR / username
    if not persona_dir.is_dir():
        logger.warning("Persona dir not found: %s", persona_dir)
        return None

    orchestrator: Optional[SkillDoc] = None
    overview: Optional[SkillDoc] = None
    cross_cutting: List[SkillDoc] = []
    lenses: Dict[str, SkillDoc] = {}

    for md_path in sorted(persona_dir.glob("*.md")):
        stem = md_path.stem
        if stem == "_orchestrator":
            orchestrator = _md_to_skill_doc(md_path)
        elif stem == "overview":
            overview = _md_to_skill_doc(md_path)
        elif stem.startswith("principles-"):
            cross_cutting.append(_md_to_skill_doc(md_path))
        elif stem.startswith("lens-"):
            doc = _md_to_skill_doc(md_path)
            lenses[doc.name] = doc

    if not lenses and not orchestrator and not overview:
        logger.warning("Persona dir %s has no recognized .md files.", persona_dir)
        return None

    description = _derive_summary(overview)

    return Persona(
        username=username,
        display_name=_derive_display_name(username, overview),
        description=description or f"@{username} methodology",
        lenses_available=sorted(lenses.keys()),
        persona_dir=str(persona_dir),
        orchestrator=orchestrator,
        overview=overview,
        cross_cutting=cross_cutting,
        lenses=lenses,
        last_indexed_at=None,
    )


@lru_cache(maxsize=8)
def get_persona(username: str) -> Optional[Persona]:
    """Load a persona by username. Cached.

    Returns None if persona dir does not exist.
    """
    return _load_persona_uncached(username)


def list_personas() -> List[PersonaSummary]:
    """Enumerate available personas under methodologies/."""
    if not METHODOLOGIES_DIR.is_dir():
        return []
    out: List[PersonaSummary] = []
    for child in sorted(METHODOLOGIES_DIR.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith("_") or child.name.startswith("."):
            continue
        persona = get_persona(child.name)
        if persona is None:
            continue
        out.append(
            PersonaSummary(
                username=persona.username,
                display_name=persona.display_name,
                description=persona.description,
                lenses_available=persona.lenses_available,
                last_indexed_at=persona.last_indexed_at,
            )
        )
    return out


def clear_persona_cache() -> None:
    """Reset the cached personas (used by tests)."""
    get_persona.cache_clear()


def build_always_on_instruction(persona: Persona) -> str:
    """Concatenate orchestrator + overview + cross-cutting docs into one block.

    Caller wraps this with a top-level persona heading + tool usage rules.
    """
    parts: List[str] = []
    if persona.orchestrator:
        parts.append(f"# {persona.orchestrator.name}\n\n{persona.orchestrator.body}")
    if persona.overview:
        parts.append(f"# {persona.overview.name}\n\n{persona.overview.body}")
    for principle in persona.cross_cutting:
        parts.append(f"# {principle.name}\n\n{principle.body}")
    return "\n\n---\n\n".join(parts)
