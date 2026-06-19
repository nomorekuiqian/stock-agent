"""
Payment module Pydantic models.
"""

from typing import Optional
from pydantic import BaseModel, Field


class CreateCheckoutRequest(BaseModel):
    user_id: str
    email: str
    return_path: Optional[str] = None
    tier: str = "pro"  # "pro" or "max"; legacy "ultra" aliases to "max"
    product: Optional[str] = None  # Backward-compatible alias, e.g. "creator_max_qinbafrank"
    billing_interval: str = "monthly"


class CheckoutSessionResponse(BaseModel):
    checkout_url: str


class CompleteCheckoutRequest(BaseModel):
    session_id: str


class CompleteCheckoutResponse(BaseModel):
    success: bool
    plan: str = "free"
    status: str = "none"
    entitlements: list[str] = Field(default_factory=list)


class SubscriptionStatusResponse(BaseModel):
    plan: str
    status: str
    current_period_end: Optional[str] = None
    access_expires_at: Optional[str] = None
    stripe_price_id: Optional[str] = None
    billing_amount_cents: Optional[int] = None
    billing_currency: Optional[str] = None
    billing_interval: Optional[str] = None
    billing_interval_count: Optional[int] = None
    stripe_account_ref: Optional[str] = None
    stripe_migration_state: Optional[str] = None
    cancel_at_period_end: bool = False
    cancel_at: Optional[str] = None
    canceled_at: Optional[str] = None


class CancelSubscriptionResponse(BaseModel):
    success: bool
    plan: str = "free"
    status: str = "none"
    current_period_end: Optional[str] = None
    cancel_at_period_end: bool = False
    cancel_at: Optional[str] = None
    canceled_at: Optional[str] = None
    stripe_account_ref: Optional[str] = None
    stripe_migration_state: Optional[str] = None


class PortalSessionResponse(BaseModel):
    portal_url: str


class CreatePortalRequest(BaseModel):
    return_path: Optional[str] = None
    product: Optional[str] = None
    billing_interval: str = "monthly"
