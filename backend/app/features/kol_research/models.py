"""Request / response models for /api/kol_research/*.

Mirrors the shape of /api/research/* with two extras:
- `persona_username`: which KOL methodology is active (currently only "qinbafrank")
- `kol_chunks`: search_kol_tweets hits, populated by the agent run loop
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.shared.kol_persona.models import PersonaChunkResult


class KolResearchMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'.")
    content: str = Field(..., min_length=1, max_length=8000)


class KolResearchRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: List[KolResearchMessage] = Field(default_factory=list, max_length=20)
    persona_username: str = Field(default="qinbafrank", min_length=1, max_length=80)
    content_context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Right-panel context (stock / daily_report / morning_report / twitter_digest / macro / brew).",
    )
    session_id: Optional[str] = Field(
        default=None,
        max_length=80,
        description=(
            "Durable agent runtime session id. Phase 1 keeps this equal to "
            "conversation_id; conversation_id remains a compatibility alias."
        ),
    )
    conversation_id: Optional[str] = Field(
        default=None,
        max_length=80,
        description=(
            "Compatibility alias for session_id. Optional: when omitted, "
            "tool dedup falls back to per-turn."
        ),
    )
    turn_id: Optional[str] = Field(
        default=None,
        max_length=120,
        description="Client-generated idempotency key for this user turn.",
    )


class KolToolCallSummary(BaseModel):
    name: str
    args_summary: Optional[str] = None
    duration_ms: Optional[int] = None
    ok: bool = True
    result_preview: Optional[str] = Field(
        default=None,
        description=(
            "Truncated string preview of the tool response, capped at "
            "AGENT_RUNTIME_TOOL_RESULT_MAX_CHARS. Lets restore / replay see "
            "what each tool returned without storing megabytes of payload."
        ),
    )
    result_hash: Optional[str] = Field(
        default=None,
        description=(
            "sha256 hex digest of the full tool response. Lets future audits "
            "detect whether what was rendered matches what was originally returned."
        ),
    )
    result_truncated: bool = Field(
        default=False,
        description="True if result_preview was cut to fit the configured cap.",
    )


class KolResearchResponse(BaseModel):
    """Markdown-first response from the KOL research agent.

    Unlike the neutral research agent which uses a strict output schema,
    this one returns markdown text + structured metadata pulled from
    tool calls (kol_chunks, activated_skills, tool_calls).
    """

    persona_username: str
    message: str = Field(..., description="Markdown answer for the user.")
    kol_chunks: List[PersonaChunkResult] = Field(default_factory=list)
    activated_skills: List[str] = Field(
        default_factory=list,
        description="Lens skill names the agent loaded during this turn.",
    )
    tool_calls: List[KolToolCallSummary] = Field(default_factory=list)
    navigate: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Right-panel navigation hint. Derived from tool calls "
            "(e.g. get_stock_quote -> {type:'stock', params:{symbol:...}})."
        ),
    )
