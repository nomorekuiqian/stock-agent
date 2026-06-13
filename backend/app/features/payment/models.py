"""
Payment module Pydantic models.
"""

from typing import Optional
from pydantic import BaseModel


class CreateCheckoutRequest(BaseModel):
    user_id: str
    email: str
    return_path: Optional[str] = None
    tier: str = "pro"  # "pro" ($4.99) or "max" ($9.99)


class CheckoutSessionResponse(BaseModel):
    checkout_url: str


class SubscriptionStatusResponse(BaseModel):
    plan: str
    status: str
    current_period_end: Optional[str] = None
    access_expires_at: Optional[str] = None
    cancel_at_period_end: bool = False
    cancel_at: Optional[str] = None
    canceled_at: Optional[str] = None


class PortalSessionResponse(BaseModel):
    portal_url: str
