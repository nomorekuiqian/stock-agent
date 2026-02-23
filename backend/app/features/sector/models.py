"""
Sector Digest Models - Schema definitions for sector-based daily reports
"""

from pydantic import BaseModel, Field
from typing import List, Optional


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
    # --- Core Tech ---
    SectorConfig(
        id="mag7",
        name_en="Magnificent 7",
        name_zh="科技七巨头",
        description="美股市值最大的七家科技公司，主导大盘走势",
        symbols=["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"],
        order=1,
    ),
    SectorConfig(
        id="ai",
        name_en="AI & Infrastructure",
        name_zh="AI 人工智能",
        description="人工智能基础设施、模型开发和应用落地公司",
        symbols=["NVDA", "MSFT", "GOOGL", "META", "AMD", "AVGO", "PLTR", "SNOW", "AI", "SMCI"],
        order=2,
    ),
    SectorConfig(
        id="chips",
        name_en="Semiconductors",
        name_zh="芯片半导体",
        description="芯片设计、制造、设备和封测全产业链",
        symbols=["NVDA", "AMD", "INTC", "AVGO", "TSM", "ARM", "QCOM", "MU", "MRVL", "ASML", "LRCX", "KLAC"],
        order=3,
    ),
    SectorConfig(
        id="software",
        name_en="Software & SaaS",
        name_zh="软件 SaaS",
        description="企业软件、云服务和网络安全公司",
        symbols=["CRM", "ORCL", "ADBE", "NOW", "SNOW", "PLTR", "MDB", "PANW", "CRWD", "ZS", "DDOG", "NET"],
        order=4,
    ),
    # --- Finance & Consumer ---
    SectorConfig(
        id="finance",
        name_en="Financials",
        name_zh="金融股",
        description="银行、投行、资管和保险巨头",
        symbols=["JPM", "BAC", "GS", "MS", "WFC", "C", "BLK", "SCHW", "AXP", "BRK.B"],
        order=5,
    ),
    SectorConfig(
        id="payments",
        name_en="Payments & Fintech",
        name_zh="支付网络",
        description="支付网络、金融科技和数字支付平台",
        symbols=["V", "MA", "PYPL", "SQ", "AFRM", "FI", "GPN"],
        order=6,
    ),
    SectorConfig(
        id="consumer",
        name_en="Consumer Staples",
        name_zh="消费龙头",
        description="零售、餐饮、日用消费品巨头",
        symbols=["COST", "WMT", "HD", "MCD", "SBUX", "NKE", "TGT", "PG", "KO", "PEP"],
        order=7,
    ),
    # --- Industry Themes ---
    SectorConfig(
        id="ev",
        name_en="Electric Vehicles",
        name_zh="新能源车",
        description="电动汽车整车制造和供应链核心公司",
        symbols=["TSLA", "NIO", "LI", "XPEV", "RIVN", "GM", "F", "BYDDY"],
        order=8,
    ),
    SectorConfig(
        id="healthcare",
        name_en="Healthcare & Pharma",
        name_zh="医药健康",
        description="制药、医疗器械、生物科技和医疗服务",
        symbols=["UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "AMGN", "GILD", "ISRG", "BMY"],
        order=9,
    ),
    SectorConfig(
        id="energy",
        name_en="Energy & Oil",
        name_zh="能源石油",
        description="石油开采、炼化和综合能源巨头",
        symbols=["XOM", "CVX", "COP", "SLB", "EOG", "OXY", "MPC", "PSX", "VLO"],
        order=10,
    ),
    SectorConfig(
        id="defense",
        name_en="Defense & Aerospace",
        name_zh="国防军工",
        description="国防承包商、航空航天和军事技术公司",
        symbols=["LMT", "RTX", "NOC", "GD", "BA", "LHX", "HII", "TDG"],
        order=11,
    ),
    # --- Hot Themes ---
    SectorConfig(
        id="china",
        name_en="China ADRs",
        name_zh="中概股",
        description="在美上市的中国互联网、电商和新能源公司",
        symbols=["BABA", "JD", "PDD", "BIDU", "NIO", "LI", "XPEV", "TME", "NTES", "BILI", "FUTU", "TIGR"],
        order=12,
    ),
    SectorConfig(
        id="crypto",
        name_en="Crypto & Blockchain",
        name_zh="加密概念",
        description="加密货币交易所、持仓公司和矿业",
        symbols=["COIN", "MSTR", "MARA", "RIOT", "HUT", "CLSK", "BITF", "HOOD"],
        order=13,
    ),
    SectorConfig(
        id="streaming",
        name_en="Streaming & Media",
        name_zh="流媒体娱乐",
        description="流媒体平台、社交媒体和互动娱乐",
        symbols=["NFLX", "DIS", "SPOT", "WBD", "ROKU", "RBLX", "TTWO", "EA"],
        order=14,
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
