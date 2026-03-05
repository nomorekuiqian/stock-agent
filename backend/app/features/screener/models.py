"""
Screener Pydantic models.
"""

from pydantic import BaseModel, Field


class FilterRequest(BaseModel):
    strategy: str = Field(
        description=(
            "Filter strategy: hot_sectors / volume_surge / value_discovery / "
            "high_dividend / momentum / oversold_quality / by_sector / custom"
        ),
    )
    sector: str | None = Field(
        default=None,
        description="Optional: limit to a specific sector (e.g. 'Technology')",
    )
    params: dict | None = Field(
        default=None,
        description="Optional: override default strategy parameters",
    )


# ---------------------------------------------------------------------------
# Stock Picker Agent models
# ---------------------------------------------------------------------------


class PickRequest(BaseModel):
    message: str = Field(
        description="User message or selected option value",
        max_length=500,
    )
    history: list[dict] = Field(
        default_factory=list,
        description="Conversation history [{role, content}]",
        max_length=40,
    )
    accumulated_filters: list[dict] = Field(
        default_factory=list,
        description="Accumulated filter conditions from previous turns",
        max_length=30,
    )


class PickResult(BaseModel):
    success: bool
    message: str = Field(
        default="",
        description="Agent reply text (plain Chinese)",
    )
    options: list[str] = Field(
        default_factory=list,
        description="Dynamic option chips for user to click (plain Chinese strings)",
    )
    candidates: list[dict] = Field(
        default_factory=list,
        description="Filtered stock results (when filters are active)",
    )
    candidate_count: int = 0
    universe_size: int = 0
    pick_reasons: list[dict] = Field(
        default_factory=list,
        description="Per-stock recommendation reasons [{symbol, reason}]",
    )
    accumulated_filters: list[dict] = Field(
        default_factory=list,
        description="Current accumulated filter conditions",
    )
    reset_results: bool = Field(
        default=False,
        description="When true, frontend should clear all results (direction change)",
    )
    data_freshness: str | None = None
    is_stale: bool = False


class FilterResult(BaseModel):
    success: bool
    strategy: str
    candidates: list[dict]
    candidate_count: int
    universe_size: int
    data_freshness: str | None = None
    is_stale: bool = False
    suggestions: list[dict] = Field(
        default_factory=list,
        description="Smart narrowing suggestions based on result distribution",
    )
