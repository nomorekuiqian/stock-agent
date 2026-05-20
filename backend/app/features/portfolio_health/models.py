"""
Portfolio health check models — Pydantic schemas for scoring, diagnosis, and API responses.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class NextAction(BaseModel):
    type: Literal["rebalance", "research", "none"]
    text: str = Field(..., max_length=60)
    symbols: list[str] = Field(default_factory=list)


class HealthScore(BaseModel):
    """4-dimension health score (each 0-25, total 0-100)."""

    dispersion: int = Field(ge=0, le=25)
    performance: int = Field(ge=0, le=25)
    macro_fit: int = Field(ge=0, le=25)
    stability: int = Field(ge=0, le=25)
    total: int = Field(ge=0, le=100)


class DiagnosisOutput(BaseModel):
    """LLM agent structured output."""

    one_line: str = Field(..., description="60 chars summary")
    diagnosis_markdown: str = Field(
        ..., description="3-5 paragraphs with concrete numbers"
    )
    top_risk: str = Field(..., description="30 chars")
    sector_dna: str = Field(..., description="e.g. 'Tech-heavy Growth Tilt'")
    macro_sensitivity_tag: Literal["low", "mid", "high"]
    next_action: NextAction


class HealthReport(BaseModel):
    """Full health report as stored/returned."""

    id: Optional[str] = None
    user_id: str
    generated_at: Optional[datetime] = None
    score: HealthScore
    diagnosis: Optional[DiagnosisOutput] = None
    cache_key: str
    is_first_report: bool = False


class HealthResponse(BaseModel):
    """API response for POST /health."""

    report_id: Optional[str] = None
    score: HealthScore
    diagnosis: Optional[DiagnosisOutput] = None
    generated_at: datetime
    from_cache: bool = False
    is_first_report: bool = False


class HealthLatestResponse(BaseModel):
    """API response for GET /health/latest -- lightweight for ActionBar."""

    health_score: Optional[int] = None
    top_risk: Optional[str] = None
    next_action: Optional[NextAction] = None
    generated_at: Optional[datetime] = None
    stale: bool = False  # updated_at > 14d
