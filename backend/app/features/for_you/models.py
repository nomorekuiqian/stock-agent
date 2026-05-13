"""
Action Bar models — signal, chip, bar, and drag result.

LLD: docs/plans/for-you/ §U0-B.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Signal(BaseModel):
    kind: Literal["drawdown", "health", "event", "staleness", "stable"]
    severity: Literal["green", "yellow", "red"]
    data: dict = Field(default_factory=dict)


class ActionChip(BaseModel):
    label: str
    target: str = Field(
        default="",
        description="Site-internal routing target (e.g. thesis:NVDA, section:notes, digest:<uuid>)",
    )
    # `link` kept for forward compatibility with any legacy rendering paths;
    # new code must read `target`. Server always populates both (link = resolved URL
    # or legacy hash for targets without a URL; target = original token).
    link: str = Field(default="")
    kind: Literal[
        "event", "health", "drawdown", "stable", "research", "guide",
        "thesis", "recap", "section",
    ]


class ActionBar(BaseModel):
    severity: Literal["green", "yellow", "red"]
    headline: str
    chips: list[ActionChip] = Field(default_factory=list, max_length=3)
    source: Literal["template", "llm", "llm_fallback", "agent"]
    visibility: Literal["visible", "hidden"] = "visible"
    generated_at: datetime


class DragResult(BaseModel):
    overall: float = 0.0
    worst_single: float = 0.0
    culprit: str | None = None
    value: float = 0.0
