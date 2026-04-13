"""
WeChat Mini Program models — request/response schemas.
"""

from typing import Optional, List
from pydantic import BaseModel


class WechatLoginRequest(BaseModel):
    code: str


class WechatBindRequest(BaseModel):
    openid: str
    email: str
    password: str


class WechatLoginResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user_id: Optional[str] = None
    openid: Optional[str] = None
    is_bound: bool = False
    account_state: Optional[str] = None   # "unbound" | "email_only" | "bound"
    error: Optional[str] = None


class WechatBindResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user_id: Optional[str] = None
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


class WechatRegisterRequestBody(BaseModel):
    email: str

class WechatRegisterRequestResponse(BaseModel):
    success: bool
    action: Optional[str] = None   # "bind_existing" | "create_new"
    error: Optional[str] = None

class WechatRegisterConfirmBody(BaseModel):
    otp_token: str

class WechatRegisterConfirmResponse(BaseModel):
    success: bool
    account_state: Optional[str] = None
    error: Optional[str] = None

class WechatMeResponse(BaseModel):
    success: bool
    account_state: str
    email: Optional[str] = None
    user_id: Optional[str] = None
    error: Optional[str] = None
