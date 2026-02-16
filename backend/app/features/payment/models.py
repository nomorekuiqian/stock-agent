"""
Payment module Pydantic models.
"""

from typing import Optional
from pydantic import BaseModel


class CreateCheckoutRequest(BaseModel):
    user_id: str
    email: str
    return_path: Optional[str] = None


class CheckoutSessionResponse(BaseModel):
    checkout_url: str


class SubscriptionStatusResponse(BaseModel):
    plan: str
    status: str
    current_period_end: Optional[str] = None


class PortalSessionResponse(BaseModel):
    portal_url: str
