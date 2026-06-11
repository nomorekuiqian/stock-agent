"""
Invite code module Pydantic models.
"""

from typing import Optional
from pydantic import BaseModel


class RedeemInviteRequest(BaseModel):
    code: str


class RedeemInviteResponse(BaseModel):
    success: bool
    access_expires_at: Optional[str] = None
    error: Optional[str] = None


class AccessRequestInput(BaseModel):
    name: str
    email: str
    reason: str


class AccessRequestResponse(BaseModel):
    success: bool
    message: str


class QualifyInput(BaseModel):
    background: str
    markets: list[str] = []
    trading_style: list[str] = []
    pain_points: list[str] = []
    feedback: str = ""
    source: Optional[str] = None


class QualifyResponse(BaseModel):
    success: bool
    invite_code: str


class AutoTrialResponse(BaseModel):
    success: bool
    access_expires_at: Optional[str] = None
    already_active: bool = False
