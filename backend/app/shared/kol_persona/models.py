"""KOL Persona models — shared across kol_research agent and (future) other consumers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SkillDoc(BaseModel):
    """A parsed .md skill file (frontmatter + body).

    Used both for "always-on" docs (orchestrator / overview / principles)
    that get concatenated into Agent.instruction, and for "lens" docs that
    are wrapped into ADK Skills via the SkillToolset.
    """

    name: str = Field(..., description="Skill identifier, lowercase + hyphens.")
    description: str = Field(
        ...,
        description="When to use this skill. Maps to ADK Skill frontmatter.description.",
    )
    type: Optional[str] = Field(
        default=None,
        description="One of master-router / identity-anchor / cross-cutting / lens.",
    )
    body: str = Field(..., description="Markdown body, frontmatter stripped.")
    extra: Dict[str, Any] = Field(
        default_factory=dict,
        description="Other frontmatter fields preserved verbatim.",
    )


class PersonaSummary(BaseModel):
    """Lightweight persona descriptor for listing endpoints / UI selectors."""

    username: str
    display_name: str
    description: str = Field(
        ...,
        description="Short tagline derived from overview.md (one-line picture).",
    )
    lenses_available: List[str] = Field(
        default_factory=list,
        description="Lens skill names (e.g. ['qinbafrank-on-stocks', ...]).",
    )
    last_indexed_at: Optional[str] = Field(
        default=None,
        description="ISO timestamp of latest vector backfill, if known.",
    )


class Persona(PersonaSummary):
    """Full persona payload: always-on docs + lens skills + yaml evidence handle."""

    persona_dir: str = Field(..., description="Filesystem path to persona dir.")
    orchestrator: Optional[SkillDoc] = Field(
        default=None,
        description="_orchestrator.md — master router, always injected.",
    )
    overview: Optional[SkillDoc] = Field(
        default=None,
        description="overview.md — identity anchor, always injected.",
    )
    cross_cutting: List[SkillDoc] = Field(
        default_factory=list,
        description="principles-*.md — always injected.",
    )
    lenses: Dict[str, SkillDoc] = Field(
        default_factory=dict,
        description="lens-*.md — triggered via ADK SkillToolset.",
    )


class PersonaChunkResult(BaseModel):
    """A search_kol_tweets hit, reshaped for transport to the frontend.

    Source is VectorChunkResult; we expose a stable subset + a [#N] index
    so frontend can render citations without knowing vector internals.
    """

    citation_index: int = Field(..., description="1-based [#N] citation number.")
    source_id: str
    title: Optional[str] = None
    url: Optional[str] = None
    content: str
    similarity: float
    author_username: Optional[str] = None
    created_at: Optional[str] = None
    tickers: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
