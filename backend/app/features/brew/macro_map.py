"""
Static mapping of macro events to affected sectors and severity.

Pure data module: no I/O, no logging, no LLM calls.
Used by event_selector.py to score macro events against user portfolios.

~30 entries covering major US/global economic indicators and central bank decisions.
"""

from typing import Literal

from pydantic import BaseModel


class MacroRule(BaseModel):
    title_zh: str
    sectors: list[str]
    impact: Literal["low", "mid", "high", "critical"]


MACRO_MAP: dict[str, MacroRule] = {
    "CPI": MacroRule(
        title_zh="美国 CPI",
        sectors=["Technology", "Consumer Discretionary", "Real Estate"],
        impact="high",
    ),
    "FOMC": MacroRule(
        title_zh="美联储决议",
        sectors=["All"],
        impact="critical",
    ),
    "NFP": MacroRule(
        title_zh="非农就业",
        sectors=["All"],
        impact="high",
    ),
    "GDP": MacroRule(
        title_zh="美国 GDP",
        sectors=["All"],
        impact="high",
    ),
    "PPI": MacroRule(
        title_zh="美国 PPI",
        sectors=["Industrials", "Energy", "Materials"],
        impact="mid",
    ),
    "retail_sales": MacroRule(
        title_zh="零售销售",
        sectors=["Consumer Discretionary", "Consumer Staples"],
        impact="mid",
    ),
    "ISM_PMI": MacroRule(
        title_zh="ISM 制造业 PMI",
        sectors=["Industrials", "Materials", "Technology"],
        impact="mid",
    ),
    "ISM_services": MacroRule(
        title_zh="ISM 非制造业 PMI",
        sectors=["Technology", "Communication Services", "Healthcare"],
        impact="mid",
    ),
    "ECB": MacroRule(
        title_zh="欧央行决议",
        sectors=["All"],
        impact="high",
    ),
    "BoJ": MacroRule(
        title_zh="日央行决议",
        sectors=["All"],
        impact="high",
    ),
    "jobless_claims": MacroRule(
        title_zh="初请失业金",
        sectors=["All"],
        impact="low",
    ),
    "consumer_confidence": MacroRule(
        title_zh="消费者信心指数",
        sectors=["Consumer Discretionary", "Consumer Staples"],
        impact="mid",
    ),
    "housing_starts": MacroRule(
        title_zh="新屋开工",
        sectors=["Real Estate", "Financials"],
        impact="low",
    ),
    "industrial_production": MacroRule(
        title_zh="工业产出",
        sectors=["Industrials", "Energy"],
        impact="low",
    ),
    "PCE": MacroRule(
        title_zh="PCE 物价指数",
        sectors=["All"],
        impact="high",
    ),
    "Michigan_sentiment": MacroRule(
        title_zh="密歇根消费者信心",
        sectors=["Consumer Discretionary"],
        impact="low",
    ),
    "durable_goods": MacroRule(
        title_zh="耐用品订单",
        sectors=["Industrials", "Technology"],
        impact="mid",
    ),
    "trade_balance": MacroRule(
        title_zh="贸易差额",
        sectors=["Industrials", "Technology"],
        impact="low",
    ),
    "new_home_sales": MacroRule(
        title_zh="新屋销售",
        sectors=["Real Estate", "Financials"],
        impact="low",
    ),
    "existing_home_sales": MacroRule(
        title_zh="成屋销售",
        sectors=["Real Estate", "Financials"],
        impact="low",
    ),
    "Treasury_auction": MacroRule(
        title_zh="美债拍卖",
        sectors=["Financials", "Real Estate"],
        impact="mid",
    ),
    "JOLTS": MacroRule(
        title_zh="职位空缺报告",
        sectors=["All"],
        impact="mid",
    ),
    "CPI_core": MacroRule(
        title_zh="核心 CPI",
        sectors=["Technology", "Consumer Discretionary", "Real Estate"],
        impact="high",
    ),
    "bank_earnings": MacroRule(
        title_zh="银行财报季",
        sectors=["Financials"],
        impact="mid",
    ),
    "crude_inventory": MacroRule(
        title_zh="原油库存",
        sectors=["Energy"],
        impact="low",
    ),
    "BoE": MacroRule(
        title_zh="英央行决议",
        sectors=["All"],
        impact="mid",
    ),
    "China_PMI": MacroRule(
        title_zh="中国 PMI",
        sectors=["Technology", "Consumer Discretionary", "Industrials"],
        impact="mid",
    ),
    "unemployment_rate": MacroRule(
        title_zh="失业率",
        sectors=["All"],
        impact="high",
    ),
    "ADP_employment": MacroRule(
        title_zh="ADP 就业",
        sectors=["All"],
        impact="mid",
    ),
    "fed_minutes": MacroRule(
        title_zh="美联储会议纪要",
        sectors=["All"],
        impact="mid",
    ),
}


def sectors_for(key: str) -> list[str]:
    """Return affected sectors for a macro key, or empty list if unknown."""
    rule = MACRO_MAP.get(key)
    return rule.sectors if rule else []


def impact_for(key: str) -> Literal["low", "mid", "high", "critical"]:
    """Return impact level for a macro key, or 'low' if unknown."""
    rule = MACRO_MAP.get(key)
    return rule.impact if rule else "low"


def match_macro_key(event_text: str) -> str | None:
    """Try to match an event description text to a MACRO_MAP key.

    Uses keyword matching against the uppercased event text.
    Returns the macro key string or None if no match.
    """
    text = event_text.upper().strip()

    # Order by specificity: check more specific patterns first to avoid
    # false matches (e.g. "FOMC MINUTES" should match fed_minutes, not FOMC).
    PATTERNS: list[tuple[str, list[str]]] = [
        ("fed_minutes", ["FED MINUTES", "FOMC MINUTES"]),
        ("PCE", ["PCE", "PERSONAL CONSUMPTION"]),
        ("FOMC", ["FOMC", "FED RATE", "FEDERAL RESERVE", "FED DECISION"]),
        ("NFP", ["NONFARM", "NON-FARM", "NFP"]),
        ("GDP", ["GDP", "GROSS DOMESTIC"]),
        ("PPI", ["PPI", "PRODUCER PRICE"]),
        ("ISM_PMI", ["ISM MANUFACTURING", "ISM PMI"]),
        ("ISM_services", ["ISM NON-MANUFACTURING", "ISM SERVICES"]),
        ("ECB", ["ECB", "EUROPEAN CENTRAL"]),
        ("BoJ", ["BOJ", "BANK OF JAPAN"]),
        ("BoE", ["BOE", "BANK OF ENGLAND"]),
        ("jobless_claims", ["JOBLESS CLAIMS", "INITIAL CLAIMS"]),
        ("consumer_confidence", ["CONSUMER CONFIDENCE", "CB CONSUMER"]),
        ("housing_starts", ["HOUSING STARTS"]),
        ("retail_sales", ["RETAIL SALES"]),
        ("industrial_production", ["INDUSTRIAL PRODUCTION"]),
        ("Michigan_sentiment", ["MICHIGAN", "UMICH"]),
        ("durable_goods", ["DURABLE GOODS"]),
        ("trade_balance", ["TRADE BALANCE", "TRADE DEFICIT"]),
        ("new_home_sales", ["NEW HOME SALES"]),
        ("existing_home_sales", ["EXISTING HOME"]),
        ("JOLTS", ["JOLTS", "JOB OPENINGS"]),
        ("unemployment_rate", ["UNEMPLOYMENT RATE"]),
        ("ADP_employment", ["ADP"]),
        ("China_PMI", ["CHINA PMI", "CAIXIN"]),
        ("crude_inventory", ["CRUDE", "EIA"]),
    ]

    # CPI / CPI_core: must be checked carefully since "CPI" appears in both.
    if any(kw in text for kw in ("CORE CPI", "CPI CORE")):
        return "CPI_core"
    if "CPI" in text:
        return "CPI"

    for key_name, keywords in PATTERNS:
        for kw in keywords:
            if kw in text:
                return key_name

    return None
