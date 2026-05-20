"""
Memory models — Pydantic schemas for feedback + suggestion tracking.

Tables: ai_feedback, suggestion_tracking
Schema: backend/migrations/u1c_memory_schema.sql
"""

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# =============================================================================
# Feedback
# =============================================================================


class FeedbackInput(BaseModel):
    """User feedback on AI-generated content."""

    target_type: Literal[
        "digest_quick_take",
        "digest_headline",
        "health_diagnosis",
        "action_bar_headline",
        "action_bar_chip",
        "top_event",
    ]
    target_id: str = Field(..., min_length=1, max_length=200)
    sentiment: Literal[1, -1]
    reason: Optional[str] = Field(None, max_length=100)
    snapshot: Optional[dict] = None  # trimmed to <=1KB by frontend


class FeedbackRow(BaseModel):
    """A row from the ai_feedback table."""

    id: Optional[str] = None
    user_id: str
    target_type: str
    target_id: str
    sentiment: int
    reason: Optional[str] = None
    snapshot: Optional[dict] = None
    created_at: Optional[datetime] = None


# =============================================================================
# Suggestion tracking
# =============================================================================


class SuggestionInput(BaseModel):
    """Input for creating a suggestion tracking entry."""

    source: str  # health_check | action_bar | digest
    source_ref_id: Optional[str] = None
    suggestion_text: str
    symbols: list[str] = Field(default_factory=list)
    sectors: list[str] = Field(default_factory=list)
    follow_up_at: date


class SuggestionRow(BaseModel):
    """A row from the suggestion_tracking table."""

    id: Optional[str] = None
    user_id: str
    source: str
    source_ref_id: Optional[str] = None
    suggestion_text: str
    suggestion_date: Optional[date] = None
    symbols: list[str] = Field(default_factory=list)
    sectors: list[str] = Field(default_factory=list)
    follow_up_at: Optional[date] = None
    outcome: Optional[dict] = None
    created_at: Optional[datetime] = None
