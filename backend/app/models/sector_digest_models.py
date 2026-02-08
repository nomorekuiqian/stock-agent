"""
Sector Digest Models - Schema definitions for sector-based daily reports
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class SectorStockAnalysis(BaseModel):
    """Analysis for a single stock within a sector"""
    symbol: str = Field(description="Stock ticker symbol")
    name: str = Field(description="Company name in Chinese")
    change_percent: float = Field(description="Daily price change percentage")
    analysis: str = Field(description="Brief analysis of the stock's movement")


class SectorNews(BaseModel):
    """News item related to the sector"""
    title: str = Field(description="News headline")
    summary: str = Field(description="Brief summary of the news")
    url: Optional[str] = Field(default=None, description="Link to the full article")


class SectorEvent(BaseModel):
    """Upcoming event related to the sector"""
    date: str = Field(description="Event date in YYYY-MM-DD format")
    title: str = Field(description="Event title")
    description: Optional[str] = Field(default=None, description="Brief description")


class SectorDigestOutput(BaseModel):
    """Complete sector digest output schema"""
    # Sector info
    sector_id: str = Field(description="Sector identifier")
    sector_name: str = Field(description="Sector display name in Chinese")

    # Content sections
    greeting: str = Field(description="Opening greeting for the digest")
    intro: str = Field(description="Sector trend overview and introduction")
    stocks: List[SectorStockAnalysis] = Field(description="Key stocks analysis")
    news: List[SectorNews] = Field(description="Important sector news")
    events: List[SectorEvent] = Field(description="Upcoming sector events")
    summary: str = Field(description="Deep insights and outlook in Markdown format")


class SectorConfig(BaseModel):
    """Sector configuration"""
    id: str = Field(description="Unique sector identifier")
    name_en: str = Field(description="English name")
    name_zh: str = Field(description="Chinese name")
    description: Optional[str] = Field(default=None, description="Sector description")
    symbols: List[str] = Field(description="List of stock symbols in this sector")
    enabled: bool = Field(default=True, description="Whether the sector is enabled")
    order: int = Field(default=0, description="Display order")


# Predefined sectors
SECTORS: List[SectorConfig] = [
    SectorConfig(
        id="mag7",
        name_en="Magnificent 7",
        name_zh="科技七巨头",
        description="美股市值最大的七家科技公司",
        symbols=["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"],
        order=1,
    ),
    SectorConfig(
        id="chips",
        name_en="Semiconductors",
        name_zh="芯片股",
        description="半导体和芯片制造公司",
        symbols=["NVDA", "AMD", "INTC", "AVGO", "TSM", "ARM", "QCOM", "MU"],
        order=2,
    ),
    SectorConfig(
        id="china",
        name_en="China ADRs",
        name_zh="中概股",
        description="在美上市的中国公司",
        symbols=["BABA", "JD", "PDD", "BIDU", "NIO", "LI", "XPEV", "TME"],
        order=3,
    ),
    SectorConfig(
        id="finance",
        name_en="Financials",
        name_zh="金融股",
        description="银行和金融服务公司",
        symbols=["JPM", "BAC", "GS", "MS", "WFC", "C", "BLK"],
        order=4,
    ),
    SectorConfig(
        id="ev",
        name_en="Electric Vehicles",
        name_zh="新能源车",
        description="电动汽车制造商",
        symbols=["TSLA", "NIO", "LI", "XPEV", "RIVN", "LCID"],
        order=5,
    ),
    SectorConfig(
        id="software",
        name_en="Software & SaaS",
        name_zh="软件 SaaS",
        description="企业软件和云服务公司",
        symbols=["CRM", "ORCL", "ADBE", "NOW", "SNOW", "PLTR", "MDB"],
        order=6,
    ),
    SectorConfig(
        id="consumer",
        name_en="Consumer",
        name_zh="消费龙头",
        description="消费品和零售巨头",
        symbols=["COST", "WMT", "HD", "MCD", "SBUX", "NKE", "TGT"],
        order=7,
    ),
    SectorConfig(
        id="healthcare",
        name_en="Healthcare",
        name_zh="医药健康",
        description="医药和医疗健康公司",
        symbols=["UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO"],
        order=8,
    ),
    SectorConfig(
        id="energy",
        name_en="Energy",
        name_zh="能源石油",
        description="石油和传统能源公司",
        symbols=["XOM", "CVX", "COP", "SLB", "EOG", "OXY"],
        order=9,
    ),
    SectorConfig(
        id="crypto",
        name_en="Crypto-related",
        name_zh="加密概念",
        description="加密货币相关公司",
        symbols=["COIN", "MSTR", "MARA", "RIOT", "HUT"],
        order=10,
    ),
    SectorConfig(
        id="streaming",
        name_en="Streaming & Media",
        name_zh="流媒体",
        description="流媒体和娱乐内容公司",
        symbols=["NFLX", "DIS", "SPOT", "WBD", "PARA"],
        order=11,
    ),
    SectorConfig(
        id="payments",
        name_en="Payments",
        name_zh="支付网络",
        description="支付和金融科技公司",
        symbols=["V", "MA", "PYPL", "SQ", "AFRM"],
        order=12,
    ),
]


def get_sector_by_id(sector_id: str) -> Optional[SectorConfig]:
    """Get sector config by ID"""
    for sector in SECTORS:
        if sector.id == sector_id:
            return sector
    return None


def get_enabled_sectors() -> List[SectorConfig]:
    """Get all enabled sectors sorted by order"""
    return sorted(
        [s for s in SECTORS if s.enabled],
        key=lambda x: x.order
    )
