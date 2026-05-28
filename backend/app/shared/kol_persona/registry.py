"""Persona registry — loads .md files from `methodologies/<username>/` into memory.

Layered loading (v1, default):
  - _orchestrator.md     -> always-on (Agent.instruction)
  - overview.md          -> always-on (Agent.instruction)
  - principles-*.md      -> always-on, cross-cutting (Agent.instruction)
  - lens-*.md            -> trigger-based (ADK SkillToolset)
  - *.yaml               -> not loaded here; accessed lazily by audit / eval tools

Layered loading (v3 draft, opt-in via env `KOL_PERSONA_VERSION=v3`):
  - core/operating-system.md       -> always-on (orchestrator slot)
  - macro/macro-regime.md          -> always-on (cross-cutting slot)
  - sector/*.md                    -> trigger-based (SkillToolset)
  - ticker/*.md                    -> trigger-based (SkillToolset)
  - evidence/, eval/               -> not loaded

`get_persona()` is cached. Tests can call `clear_persona_cache()` to reset.
"""

from __future__ import annotations

import os
import re
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

# Opt-in v3 testing mode: set KOL_PERSONA_VERSION=v3 to load the v3 skill draft
# instead of the v1 methodologies. Defaults to v1.
PERSONA_VERSION = os.getenv("KOL_PERSONA_VERSION", "v1").lower()


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

    Returns None if persona dir does not exist. Routes to v3 loader when
    `KOL_PERSONA_VERSION=v3` env var is set.
    """
    if PERSONA_VERSION == "v3":
        return _load_persona_v3_uncached(username)
    return _load_persona_uncached(username)


# ---------------------------------------------------------------------------
# v3 draft loader (opt-in via KOL_PERSONA_VERSION=v3)
# ---------------------------------------------------------------------------

_V3_BASE_DIR = METHODOLOGIES_DIR / "_drafts" / "qinbafrank-skill-v3"

# Frontmatter on v3 files uses different keys (skill, layer, coverage) than v1.
# The v1 `name`/`when_to_use` fields are absent, so we derive them here.


def _v3_extract_applicable_section(body: str) -> str:
    """Pull the '## 适用问题' section as the skill description."""
    marker = "## 适用问题"
    if marker not in body:
        return ""
    tail = body.split(marker, 1)[1]
    next_h2 = re.search(r"\n##\s", tail)
    if next_h2:
        tail = tail[: next_h2.start()]
    return tail.strip()


def _v3_md_to_skill_doc(path: Path, layer: str) -> SkillDoc:
    fm, body = _parse_md(path)

    # name: layer-prefixed, lowercase, hyphen-only (ADK Skill spec)
    raw_stem = path.stem.replace("_", "-").replace(" ", "-")
    # Ticker files use uppercase stems (NVDA.md); keep them readable but normalize for ADK
    name = f"{layer}-{raw_stem.lower()}"

    # description: prefer "## 适用问题" section content; fall back to first
    # non-heading paragraph; clamp to 1000 chars
    raw_desc = _v3_extract_applicable_section(body)
    if not raw_desc:
        for para in body.split("\n\n"):
            chunk = para.strip()
            if chunk and not chunk.startswith("#"):
                raw_desc = chunk
                break
    description = " ".join(raw_desc.split())
    if len(description) > 1000:
        description = description[:1000].rstrip() + "..."
    if not description:
        description = f"v3 {layer} skill: {raw_stem}"

    return SkillDoc(
        name=name,
        description=description,
        type=f"v3-{layer}",
        body=body.strip(),
        extra=fm,
    )


def _load_persona_v3_uncached(username: str) -> Optional[Persona]:
    """Load the v3-draft skill structure. Currently only `qinbafrank` is supported."""
    if username != "qinbafrank":
        logger.warning("v3 mode only supports qinbafrank; got %r", username)
        return None

    v3_dir = _V3_BASE_DIR
    if not v3_dir.is_dir():
        logger.warning("v3 draft dir not found: %s", v3_dir)
        return None

    orchestrator: Optional[SkillDoc] = None
    cross_cutting: List[SkillDoc] = []
    lenses: Dict[str, SkillDoc] = {}

    # core/operating-system.md -> always-on (orchestrator slot)
    core_file = v3_dir / "core" / "operating-system.md"
    if core_file.exists():
        orchestrator = _v3_md_to_skill_doc(core_file, "core")
    else:
        logger.warning("v3 core/operating-system.md missing")

    # macro/macro-regime.md -> always-on (cross-cutting slot)
    macro_file = v3_dir / "macro" / "macro-regime.md"
    if macro_file.exists():
        cross_cutting.append(_v3_md_to_skill_doc(macro_file, "macro"))

    # framework/*.md + sector/*.md + ticker/*.md -> trigger-based skills
    # framework files describe HOW to answer a class of question (the answer
    # skeleton). sector/ticker files describe WHAT qinbafrank thinks about a
    # given topic/stock. LLM typically loads 1 framework + 0-2 sector/ticker
    # per turn.
    for layer in ("framework", "sector", "ticker"):
        layer_dir = v3_dir / layer
        if not layer_dir.is_dir():
            continue
        for md_path in sorted(layer_dir.glob("*.md")):
            doc = _v3_md_to_skill_doc(md_path, layer)
            lenses[doc.name] = doc

    if not orchestrator and not lenses:
        logger.warning("v3 dir %s yielded no skill docs.", v3_dir)
        return None

    logger.info(
        "Loaded v3 persona %r: 1 core + %d macro + %d sector/ticker lenses",
        username,
        len(cross_cutting),
        len(lenses),
    )

    return Persona(
        username=username,
        display_name=username,
        description=(
            "qinbafrank v3-draft skill distillation "
            "(4-layer: core / macro / sector / ticker)"
        ),
        lenses_available=sorted(lenses.keys()),
        persona_dir=str(v3_dir),
        orchestrator=orchestrator,
        overview=None,
        cross_cutting=cross_cutting,
        lenses=lenses,
        last_indexed_at=None,
    )


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
