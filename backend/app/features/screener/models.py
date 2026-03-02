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


class AskRequest(BaseModel):
    message: str = Field(
        description="User's natural language screener query",
        max_length=500,
    )
    current_filters: list[dict] = Field(
        default_factory=list,
        description="Currently applied filter conditions [{field, op, value}]",
        max_length=20,
    )
    history: list[dict] = Field(
        default_factory=list,
        description="Conversation history [{role, content/summary}], max 5 rounds",
        max_length=10,
    )


class AskResult(BaseModel):
    success: bool
    filter_used: dict = Field(
        default_factory=dict,
        description="The filter parameters that were actually executed",
    )
    candidates: list[dict] = Field(default_factory=list)
    candidate_count: int = 0
    universe_size: int = 0
    suggestions: list[dict] = Field(default_factory=list)
    summary: str = ""
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
