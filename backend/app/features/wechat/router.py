"""
WeChat Mini Program router — login, account binding, and home cards.
"""

from fastapi import APIRouter, HTTPException

from app.core.logging import get_logger
from app.features.wechat.models import (
    WechatLoginRequest,
    WechatLoginResponse,
    WechatBindRequest,
    WechatBindResponse,
    HomeCard,
    HomeCardsResponse,
)
from app.features.wechat import service

logger = get_logger(__name__)

router = APIRouter(prefix="/api/wechat", tags=["wechat"])


# ---------------------------------------------------------------------------
# Home cards configuration (dynamic, modify here to add new pages)
# ---------------------------------------------------------------------------

HOME_CARDS = [
    HomeCard(id="today", title="今日市场日报", subtitle="AI 驱动的每日行情分析", url="/today", icon="chart", order=1),
    HomeCard(id="morning", title="盘前早报", subtitle="开盘前必看要闻", url="/morning", icon="sun", order=2),
    HomeCard(id="for-you", title="专属 Brew", subtitle="个性化投资摘要", url="/for-you", icon="brew", order=3),
    HomeCard(id="stock", title="个股投研", subtitle="深度个股分析", url="/stock", icon="search", order=4),
    HomeCard(id="macro", title="宏观仪表盘", subtitle="流动性、风险、周报", url="/macro", icon="globe", order=5),
]


@router.post("/login", response_model=WechatLoginResponse)
async def wechat_login(request: WechatLoginRequest):
    """
    WeChat Mini Program login.
    Accepts a temporary code from wx.login(), exchanges it for openid,
    and checks if the user has an existing bound account.
    """
    try:
        result = await service.login_with_code(request.code)
        return WechatLoginResponse(**result)
    except Exception as e:
        logger.exception("wechat_login failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bind", response_model=WechatBindResponse)
async def wechat_bind(request: WechatBindRequest):
    """
    Bind a WeChat openid to an existing email account.
    Verifies email/password via Insforge, then links the openid to that user.
    """
    try:
        result = await service.bind_account(
            openid=request.openid,
            email=request.email,
            password=request.password,
        )
        return WechatBindResponse(**result)
    except Exception as e:
        logger.exception("wechat_bind failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/home-cards", response_model=HomeCardsResponse)
async def get_home_cards():
    """
    Return the list of content cards for the mini program home page.
    Cards are sorted by order. To add a new page to the mini program,
    add a HomeCard entry to HOME_CARDS in this file.
    """
    return HomeCardsResponse(success=True, cards=sorted(HOME_CARDS, key=lambda c: c.order))
