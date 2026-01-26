"""
Feedback models - Pydantic models for feedback endpoints.
"""

import re
from typing import Literal, Optional

from pydantic import BaseModel, field_validator


class UserFeedbackInput(BaseModel):
    """Input model for user feedback submission from contact page."""

    rating: Literal["helpful", "neutral", "not_helpful"]
    email: str
    message: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        """Validate email format."""
        email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(email_pattern, v):
            raise ValueError("Invalid email format")
        return v.lower().strip()
