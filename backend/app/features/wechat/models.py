"""
WeChat Mini Program models — request/response schemas.
"""

from typing import Optional, List
from pydantic import BaseModel


class WechatLoginRequest(BaseModel):
    code: str


class WechatLoginResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user_id: Optional[str] = None
    openid: Optional[str] = None
    is_bound: bool = False
    account_state: Optional[str] = None   # "unbound" | "email_only" | "bound"
    error: Optional[str] = None


class HomeCard(BaseModel):
    id: str
    title: str
    subtitle: str
    url: str
    icon: str
    order: int


class HomeCardsResponse(BaseModel):
    success: bool
    cards: List[HomeCard]


class WechatMeResponse(BaseModel):
    success: bool
    account_state: str
    email: Optional[str] = None
    user_id: Optional[str] = None
    error: Optional[str] = None


class WechatOtpSendRequest(BaseModel):
    email: str

class WechatOtpSendResponse(BaseModel):
    success: bool
    action: Optional[str] = None   # "bind_existing" | "create_new"
    error: Optional[str] = None

class WechatOtpVerifyRequest(BaseModel):
    email: str
    code: str

class WechatOtpVerifyResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    account_state: Optional[str] = None  # "email_only" | "bound"
    error: Optional[str] = None
