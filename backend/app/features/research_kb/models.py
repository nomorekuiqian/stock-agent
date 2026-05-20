from typing import Optional
from pydantic import BaseModel, Field


class ResearchKBMessage(BaseModel):
    role: str
    content: str


class ResearchKBRequest(BaseModel):
    message: str
    history: list[ResearchKBMessage] = Field(default_factory=list)


class RetrievedChunk(BaseModel):
    content: str
    title: Optional[str] = None
    source_type: str
    source_id: str
    url: Optional[str] = None
    similarity: float


class ResearchKBResponse(BaseModel):
    answer: str
    chunks_used: list[RetrievedChunk]
