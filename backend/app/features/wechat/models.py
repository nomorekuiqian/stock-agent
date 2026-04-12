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
