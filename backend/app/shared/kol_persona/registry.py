"""Persona registry — loads KOL skill markdown files into memory.

Layered loading (current qinbafrank skill):
  - core/operating-system.md       -> always-on (orchestrator slot)
  - macro/macro-regime.md          -> always-on (cross-cutting slot)
  - framework/*.md                 -> trigger-based answer-shape skills
  - sector/*.md                    -> trigger-based topic playbooks
  - ticker/*.md                    -> trigger-based ticker playbooks
  - evidence/                      -> not loaded

`get_persona()` is cached. Tests can call `clear_persona_cache()` to reset.
"""

from __future__ import annotations

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


@lru_cache(maxsize=8)
def get_persona(username: str) -> Optional[Persona]:
    """Load a persona by username. Cached.

    Returns None if the selected persona source does not exist.
    """
    return _load_persona_skill_uncached(username)


# ---------------------------------------------------------------------------
# Current skill loader
# ---------------------------------------------------------------------------

_SKILL_BASE_DIR = METHODOLOGIES_DIR / "qinbafrank"
_DRAFTS_DIR = METHODOLOGIES_DIR / "_drafts"

_QINBAFRANK_PUBLIC_BIO = (
    "Investor in AI、Crypto、TMT，跟踪最前沿科技趋势、野生宏观政经观察、研究全球资本流动性、"
    "周期趋势投资。记录个人学习和思考，经常出错常态掉坑爬坑。Runner\U0001f3c3"
)

_SERENITY_PUBLIC_BIO = (
    "AI / 半导体供应链分析师 · 工程师视角 · 沿 AI capex 漏斗找上游瓶颈 · "
    "重仓小盘 niche (SIVE / AXTI / AAOI / LITE) · 几乎只做多但会轮动"
)

# Per-persona skill loader config. Each entry declares where the bundle lives
# and which files act as the always-on core / macro layer.
_PERSONA_CONFIG: Dict[str, Dict[str, Any]] = {
    "qinbafrank": {
        "display_name": "qinbafrank",
        "description": _QINBAFRANK_PUBLIC_BIO,
        "skill_dir": _SKILL_BASE_DIR,
        "core_file": "operating-system.md",
        "macro_file": "macro-regime.md",
    },
    "aleabitoreddit": {
        "display_name": "Serenity",
        "description": _SERENITY_PUBLIC_BIO,
        "skill_dir": _DRAFTS_DIR / "serenity-skill-v1",
        "core_file": "bottleneck-operating-system.md",
        "macro_file": "ai-capex-cycle.md",
    },
}

# Skill files use frontmatter keys such as skill/layer/coverage, so we derive
# ADK-compatible name/description fields here.


def _extract_applicable_section(body: str) -> str:
    """Pull the '## 适用问题' section as the skill description."""
    marker = "## 适用问题"
    if marker not in body:
        return ""
    tail = body.split(marker, 1)[1]
    next_h2 = re.search(r"\n##\s", tail)
    if next_h2:
        tail = tail[: next_h2.start()]
    return tail.strip()


_COVERAGE_WORDS = {
    "high": "博主讨论很多",
    "medium": "博主有过多次讨论",
    "low": "博主很少提到",
    "none": "博主未直接讨论",
}


def _sanitize_skill_body(body: str) -> str:
    """Keep internal metadata from leaking verbatim into user answers."""
    def _replace_coverage(match: re.Match) -> str:
        return _COVERAGE_WORDS.get(match.group(1).lower(), "博主覆盖度待确认")

    return re.sub(
        r"`?coverage\s*:\s*(high|medium|low|none)`?",
        _replace_coverage,
        body,
        flags=re.IGNORECASE,
    )


def _skill_md_to_skill_doc(path: Path, layer: str) -> SkillDoc:
    fm, body = _parse_md(path)
    body = _sanitize_skill_body(body)

    # name: layer-prefixed, lowercase, hyphen-only (ADK Skill spec)
    raw_stem = path.stem.replace("_", "-").replace(" ", "-")
    # Ticker files use uppercase stems (NVDA.md); keep them readable but normalize
    # for ADK. Any char outside [a-z0-9] (e.g. the dot in cross-class tickers like
    # HPS.A / BRK.B) becomes a hyphen, with runs collapsed and ends trimmed, so the
    # ADK Frontmatter name validator (lowercase kebab-case) accepts it.
    safe_stem = re.sub(r"[^a-z0-9]+", "-", raw_stem.lower()).strip("-")
    name = f"{layer}-{safe_stem}"

    # description: prefer "## 适用问题" section content; fall back to first
    # non-heading paragraph; clamp to 1000 chars
    raw_desc = _extract_applicable_section(body)
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
        description = f"{layer} skill: {raw_stem}"

    return SkillDoc(
        name=name,
        description=description,
        type=layer,
        body=body.strip(),
        extra=fm,
    )


def _load_persona_skill_uncached(username: str) -> Optional[Persona]:
    """Load the per-persona skill bundle from `_PERSONA_CONFIG`."""
    cfg = _PERSONA_CONFIG.get(username)
    if cfg is None:
        logger.warning("skill persona loader: unknown username %r", username)
        return None

    skill_dir: Path = cfg["skill_dir"]
    if not skill_dir.is_dir():
        logger.warning("skill dir not found: %s", skill_dir)
        return None

    orchestrator: Optional[SkillDoc] = None
    cross_cutting: List[SkillDoc] = []
    lenses: Dict[str, SkillDoc] = {}

    # core/<file> -> always-on (orchestrator slot)
    core_file = skill_dir / "core" / cfg["core_file"]
    if core_file.exists():
        orchestrator = _skill_md_to_skill_doc(core_file, "core")
    else:
        logger.warning("core file missing: %s", core_file)

    # macro/<file> -> always-on (cross-cutting slot)
    macro_file = skill_dir / "macro" / cfg["macro_file"]
    if macro_file.exists():
        cross_cutting.append(_skill_md_to_skill_doc(macro_file, "macro"))

    # framework/*.md + sector/*.md + ticker/*.md -> trigger-based skills
    # framework files describe HOW to answer a class of question (the answer
    # skeleton). sector/ticker files describe WHAT qinbafrank thinks about a
    # given topic/stock. LLM typically loads 1 framework + 0-2 sector/ticker
    # per turn.
    for layer in ("framework", "sector", "ticker"):
        layer_dir = skill_dir / layer
        if not layer_dir.is_dir():
            continue
        for md_path in sorted(layer_dir.glob("*.md")):
            doc = _skill_md_to_skill_doc(md_path, layer)
            lenses[doc.name] = doc

    if not orchestrator and not lenses:
        logger.warning("skill dir %s yielded no skill docs.", skill_dir)
        return None

    logger.info(
        "Loaded persona %r: 1 core + %d macro + %d sector/ticker lenses",
        username,
        len(cross_cutting),
        len(lenses),
    )

    return Persona(
        username=username,
        display_name=cfg["display_name"],
        description=cfg["description"],
        lenses_available=sorted(lenses.keys()),
        persona_dir=str(skill_dir),
        orchestrator=orchestrator,
        overview=None,
        cross_cutting=cross_cutting,
        lenses=lenses,
        last_indexed_at=None,
    )


def list_personas() -> List[PersonaSummary]:
    """Enumerate available personas."""
    out: List[PersonaSummary] = []
    for username in _PERSONA_CONFIG:
        persona = get_persona(username)
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
