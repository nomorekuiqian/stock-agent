"""
KOL methodology extraction schemas.

The output is intentionally evidence-heavy: every reusable method claim should
point back to source tweet IDs and verbatim quotes.
"""

from typing import Literal

from pydantic import BaseModel, Field


MethodologyCategory = Literal[
    "stock_analysis",
    "sector_analysis",
    "macro_analysis",
    "trading_strategy",
    "risk_management",
    "methodology",
]

Frequency = Literal["high", "medium", "low"]
Direction = Literal["bullish", "bearish", "neutral"]
Weight = Literal["high", "medium", "low", "veto"]
CommunicationContext = Literal[
    "high_conviction",
    "low_conviction",
    "risk_warning",
    "hedge",
]


class EvidenceCitation(BaseModel):
    tweet_id: str
    quote: str = Field(
        max_length=300,
        description="Verbatim contiguous source quote, max 300 chars.",
    )


class DataIndicator(BaseModel):
    name: str = Field(description="Metric, data source, or signal name.")
    frequency: Frequency = Field(description="Observed recurrence in source tweets.")
    description: str = Field(description="How the analyst uses this signal.")
    evidence: list[EvidenceCitation] = Field(min_length=2, max_length=5)


class AnalyticalStep(BaseModel):
    order: int
    description: str
    evidence: list[EvidenceCitation] = Field(min_length=1, max_length=3)


class DecisionCriterion(BaseModel):
    condition: str = Field(description="Signal or condition that triggers judgment.")
    direction: Direction
    weight: Weight
    evidence: list[EvidenceCitation] = Field(min_length=1, max_length=3)


class CommunicationPattern(BaseModel):
    context: CommunicationContext
    typical_phrases: list[str] = Field(min_length=2, max_length=8)
    evidence: list[EvidenceCitation] = Field(min_length=2, max_length=5)


class VetoRule(BaseModel):
    rule: str
    rationale: str
    evidence: list[EvidenceCitation] = Field(min_length=1, max_length=3)


class FalsifiabilityRule(BaseModel):
    thesis: str
    falsifier: str
    evidence: list[EvidenceCitation] = Field(min_length=1, max_length=3)


class CategoryMethodology(BaseModel):
    analyst: str
    category: MethodologyCategory
    source_tweet_count: int
    methodology_version: str
    prompt_version: str
    data_preferences: list[DataIndicator] = Field(default_factory=list)
    analytical_process: list[AnalyticalStep] = Field(default_factory=list)
    decision_criteria: list[DecisionCriterion] = Field(default_factory=list)
    communication_patterns: list[CommunicationPattern] = Field(default_factory=list)
    veto_rules: list[VetoRule] = Field(default_factory=list)
    falsifiability_rules: list[FalsifiabilityRule] = Field(default_factory=list)
    insufficient_evidence_notes: list[str] = Field(default_factory=list)
