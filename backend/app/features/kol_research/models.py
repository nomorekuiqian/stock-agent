"""Request / response models for /api/kol_research/*.

Mirrors the shape of /api/research/* with two extras:
- `persona_username`: which KOL methodology is active (currently only "qinbafrank")
- `kol_chunks`: search_kol_tweets hits, populated by the agent run loop
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

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


class KolMcpSearchRequest(BaseModel):
    """Live MCP vector search over one KOL's tweet corpus."""

    query: str = Field(..., min_length=1, max_length=1000)
    k: int = Field(default=6, ge=1, le=20)
    threshold: float = Field(default=0.45, ge=0.0, le=1.0)


class KolMcpMarketBriefRequest(BaseModel):
    """Live MCP market data bridge for the same brief tools used by KOL agent."""

    brief_type: Literal["stock", "peer", "macro", "industry"] = "stock"
    symbol: Optional[str] = Field(default=None, max_length=20)


class KolMcpContextRequest(BaseModel):
    """Build live MCP context from vector evidence and market brief data."""

    question: str = Field(..., min_length=1, max_length=2000)
    ticker: Optional[str] = Field(default=None, max_length=20)
    sector: Optional[str] = Field(default=None, max_length=120)
    evidence_limit: int = Field(default=6, ge=1, le=12)
    include_market_data: bool = True


class KolMcpLensSearchRequest(BaseModel):
    """Search distilled persona lens markdown across core/framework/macro/sector/ticker."""

    query: str = Field(..., min_length=1, max_length=1000)
    lens_types: List[Literal["core", "framework", "macro", "sector", "ticker"]] = Field(default_factory=list)
    limit: int = Field(default=8, ge=1, le=30)
    include_body: bool = False


class KolMcpEvidenceByIdsRequest(BaseModel):
    """Fetch historical evidence tweets referenced by lens Evidence Maps."""

    tweet_ids: List[str] = Field(..., min_length=1, max_length=30)


class KolMcpWorkflowRequest(BaseModel):
    """Beta-gated Market Lens MCP workflow request for a persona.

    The backend returns a context pack for the user's own agent to write the
    final answer. It does not expose local packaged methodology assets.
    """

    workflow: Literal["stock_diagnosis", "market_regime", "compare", "research_memo"]
    question: str = Field(..., min_length=1, max_length=2000)
    ticker: Optional[str] = Field(default=None, max_length=20)
    tickers: List[str] = Field(default_factory=list, max_length=8)
    sector: Optional[str] = Field(default=None, max_length=120)
    evidence_limit: int = Field(default=6, ge=1, le=12)
    include_market_data: bool = True
    share: bool = False


class KolMcpBetaInfo(BaseModel):
    invite_code_id: Optional[str] = None
    invite_label: Optional[str] = None
    access: Literal["missing", "valid", "invalid", "dev"] = "missing"
    remaining_quota: Optional[int] = None
    allowed_personas: List[str] = Field(default_factory=list)
    allowed_workflows: List[str] = Field(default_factory=list)


class KolMcpWorkflowResponse(BaseModel):
    """Context pack returned to the local MCP adapter."""

    persona_username: str
    workflow: str
    question: str
    ticker: Optional[str] = None
    tickers: List[str] = Field(default_factory=list)
    sector: Optional[str] = None
    retrieval_mode: str
    market_data_mode: str
    kol_chunks: List[dict] = Field(default_factory=list)
    market_context: List[dict] = Field(default_factory=list)
    methodology_context: dict = Field(default_factory=dict)
    answer_discipline: List[str] = Field(default_factory=list)
    suggested_answer_shape: List[str] = Field(default_factory=list)
    beta: KolMcpBetaInfo = Field(default_factory=KolMcpBetaInfo)
    share_url: Optional[str] = None
