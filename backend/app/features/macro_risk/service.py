"""
Macro Risk Dashboard - Core Service

Fetches FRED data, yfinance AI basket quotes, and computes risk scores.
"""

import asyncio
import time
from app.features.liquidity.fred_service import (
    get_latest_value,
    get_all_liquidity_metrics,
)
from app.shared.yfinance_service import get_yfinance_service
from app.features.macro_risk.models import (
    RiskIndicator,
    CategoryRiskScore,
    AIStockInfo,
    MacroRiskDashboard,
    SubDimension,
    EconomicFundamentals,
)
from app.utils.timezone import now_iso

MACRO_RISK_FRED_SERIES = {
    # Economic Deterioration
    "yield_curve": "T10Y2Y",
    "recession_prob": "RECPROUSM156N",
    "cfnai": "CFNAI",
    "consumer_sentiment": "UMCSENT",
    # Credit / Default Risk
    "hy_oas": "BAMLH0A0HYM2",
    "bbb_spread": "BAMLC0A4CBBB",
    "cre_delinquency": "DRCRELEXFACBS",
    "business_delinquency": "DRBLACBS",
    # Employment
    "unemployment": "UNRATE",
    "initial_claims": "ICSA",
    "continued_claims": "CCSA",
    "nonfarm_payrolls": "PAYEMS",
    "sahm_rule": "SAHMREALTIME",
    # Economic Fundamentals - Growth
    "gdp_growth": "A191RL1Q225SBEA",
    "retail_sales": "RSAFS",
    "industrial_production": "INDPRO",
    # Economic Fundamentals - Inflation
    "cpi": "CPIAUCSL",
    "core_pce": "PCEPILFE",
    "inflation_expectations_5y": "T5YIE",
    "michigan_inflation": "MICH",
    # Inflation & Rates - Interest Rates
    "fed_funds_rate": "FEDFUNDS",
    "treasury_10y": "DGS10",
    "real_rate_10y": "DFII10",
}

AI_STOCK_BASKET = [
    "NVDA", "MSFT", "GOOGL", "META", "AMD",
    "AVGO", "TSM", "SMCI", "ARM", "PLTR",
]

_CACHE_TTL = 600  # 10 minutes
_dashboard_cache: dict = {}
_economy_cache: dict = {}

_inflation_cache: dict = {}

_dashboard_lock: asyncio.Lock | None = None
_economy_lock: asyncio.Lock | None = None
_inflation_lock: asyncio.Lock | None = None


def _get_lock(name: str) -> asyncio.Lock:
    global _dashboard_lock, _economy_lock, _inflation_lock
    if name == "dashboard":
        if _dashboard_lock is None:
            _dashboard_lock = asyncio.Lock()
        return _dashboard_lock
    elif name == "inflation":
        if _inflation_lock is None:
            _inflation_lock = asyncio.Lock()
        return _inflation_lock
    else:
        if _economy_lock is None:
            _economy_lock = asyncio.Lock()
        return _economy_lock


def _get_cached(store: dict):
    if "data" in store and time.time() - store["ts"] < _CACHE_TTL:
        return store["data"]
    return None


def _set_cached(store: dict, data):
    store["data"] = data
    store["ts"] = time.time()


def _score_indicator(value: float | None, low_max: float, mid_max: float, invert: bool = False) -> float:
    """
    Score a single indicator on 0-10 scale.
    low_max: upper bound for low risk (score 0-3)
    mid_max: upper bound for medium risk (score 4-6)
    Above mid_max: high risk (score 7-10)
    invert: if True, higher values = lower risk
      e.g. yield_curve(0.5, -0.5): >0.5 low risk, <-0.5 high risk
      e.g. sentiment(80, 60): >80 low risk, <60 high risk
    """
    if value is None:
        return 5.0  # neutral when data missing

    # Use the span between thresholds for safe scaling (avoids division by zero
    # and sign issues when low_max or mid_max are zero or negative)
    span = abs(low_max - mid_max) if low_max != mid_max else 1.0

    if invert:
        # Higher value = lower risk
        if value >= low_max:
            # Low risk zone (score 0-3): decreases as value rises above low_max
            excess = (value - low_max) / (span * 0.5)
            return max(0.0, 3.0 - excess * 3.0)
        elif value >= mid_max:
            # Medium risk zone (score 3-6)
            ratio = (low_max - value) / span
            return 3.0 + ratio * 3.0
        else:
            # High risk zone (score 6-10): increases as value drops below mid_max
            ratio = min(1.0, (mid_max - value) / (span * 0.5))
            return 6.0 + ratio * 4.0
    else:
        # Higher value = higher risk
        if value <= low_max:
            ratio = value / low_max if low_max != 0 else 0
            return ratio * 3.0
        elif value <= mid_max:
            ratio = (value - low_max) / span
            return 3.0 + ratio * 3.0
        else:
            excess = (value - mid_max) / (span * 0.5)
            return min(10.0, 6.0 + excess * 4.0)


def _compute_economic_deterioration(indicators: dict) -> CategoryRiskScore:
    """Category 1: Economic Deterioration (weight 25%)"""
    recession_prob = indicators.get("recession_prob", {}).get("value")
    yield_curve = indicators.get("yield_curve", {}).get("value")
    cfnai = indicators.get("cfnai", {}).get("value")
    sentiment = indicators.get("consumer_sentiment", {}).get("value")

    s_recession = _score_indicator(recession_prob, 10, 30)
    s_yield = _score_indicator(yield_curve, 0.5, -0.5, invert=True)
    s_cfnai = _score_indicator(cfnai, 0, -0.5, invert=True)
    s_sentiment = _score_indicator(sentiment, 80, 60, invert=True)

    score = s_recession * 0.35 + s_yield * 0.30 + s_cfnai * 0.20 + s_sentiment * 0.15
    score = round(min(10.0, max(0.0, score)), 1)

    risk_level = "low" if score < 4 else ("medium" if score < 7 else "high")

    risk_indicators = []
    for key, series_id in [
        ("recession_prob", "RECPROUSM156N"),
        ("yield_curve", "T10Y2Y"),
        ("cfnai", "CFNAI"),
        ("consumer_sentiment", "UMCSENT"),
    ]:
        data = indicators.get(key, {})
        risk_indicators.append(RiskIndicator(
            series_id=series_id,
            name=_indicator_name(key),
            value=data.get("value"),
            date=data.get("date"),
            units=data.get("units", ""),
            change=data.get("change"),
            source="fred",
        ))

    headline = _economic_headline(score, recession_prob, yield_curve)

    return CategoryRiskScore(
        category_id=1,
        category_name="Economic Deterioration",
        risk_score=score,
        risk_level=risk_level,
        headline=headline,
        indicators=risk_indicators,
    )


def _compute_credit_risk(indicators: dict) -> CategoryRiskScore:
    """Category 2: Credit / Default Risk (weight 25%)"""
    hy_oas = indicators.get("hy_oas", {}).get("value")
    bbb_spread = indicators.get("bbb_spread", {}).get("value")
    cre_delinq = indicators.get("cre_delinquency", {}).get("value")
    biz_delinq = indicators.get("business_delinquency", {}).get("value")

    s_hy = _score_indicator(hy_oas, 3.5, 5.0) if hy_oas else 5.0
    s_bbb = _score_indicator(bbb_spread, 1.5, 2.5) if bbb_spread else 5.0
    s_cre = _score_indicator(cre_delinq, 2, 4) if cre_delinq else 5.0
    s_biz = _score_indicator(biz_delinq, 1.5, 3) if biz_delinq else 5.0

    score = s_hy * 0.40 + s_bbb * 0.25 + s_cre * 0.20 + s_biz * 0.15
    score = round(min(10.0, max(0.0, score)), 1)

    risk_level = "low" if score < 4 else ("medium" if score < 7 else "high")

    risk_indicators = []
    for key, series_id in [
        ("hy_oas", "BAMLH0A0HYM2"),
        ("bbb_spread", "BAMLC0A4CBBB"),
        ("cre_delinquency", "DRCRELEXFACBS"),
        ("business_delinquency", "DRBLACBS"),
    ]:
        data = indicators.get(key, {})
        risk_indicators.append(RiskIndicator(
            series_id=series_id,
            name=_indicator_name(key),
            value=data.get("value"),
            date=data.get("date"),
            units=data.get("units", ""),
            change=data.get("change"),
            source="fred",
        ))

    headline = _credit_headline(score, hy_oas)

    return CategoryRiskScore(
        category_id=2,
        category_name="Credit / Default Risk",
        risk_score=score,
        risk_level=risk_level,
        headline=headline,
        indicators=risk_indicators,
    )


def _compute_employment_risk(indicators: dict) -> CategoryRiskScore:
    """Category 3: Employment Risk (weight 25%)"""
    sahm = indicators.get("sahm_rule", {}).get("value")
    unemp = indicators.get("unemployment", {}).get("value")
    claims = indicators.get("initial_claims", {}).get("value")

    s_sahm = _score_indicator(sahm, 0.3, 0.5) if sahm is not None else 5.0
    s_unemp = _score_indicator(unemp, 4, 5) if unemp is not None else 5.0
    claims_k = claims / 1000 if claims and claims > 1000 else claims
    s_claims = _score_indicator(claims_k, 225, 300) if claims_k is not None else 5.0
    nf_change = indicators.get("nonfarm_payrolls", {}).get("change")
    s_nonfarm = 5.0
    if nf_change is not None:
        if nf_change > 0.1:
            s_nonfarm = 2.0
        elif nf_change > 0:
            s_nonfarm = 4.0
        elif nf_change > -0.1:
            s_nonfarm = 6.0
        else:
            s_nonfarm = 8.0

    score = s_sahm * 0.35 + s_unemp * 0.25 + s_claims * 0.25 + s_nonfarm * 0.15
    score = round(min(10.0, max(0.0, score)), 1)

    risk_level = "low" if score < 4 else ("medium" if score < 7 else "high")

    risk_indicators = []
    for key, series_id in [
        ("sahm_rule", "SAHMREALTIME"),
        ("unemployment", "UNRATE"),
        ("initial_claims", "ICSA"),
        ("nonfarm_payrolls", "PAYEMS"),
    ]:
        data = indicators.get(key, {})
        risk_indicators.append(RiskIndicator(
            series_id=series_id,
            name=_indicator_name(key),
            value=data.get("value"),
            date=data.get("date"),
            units=data.get("units", ""),
            change=data.get("change"),
            source="fred",
        ))

    headline = _employment_headline(score, sahm, unemp)

    return CategoryRiskScore(
        category_id=3,
        category_name="Employment",
        risk_score=score,
        risk_level=risk_level,
        headline=headline,
        indicators=risk_indicators,
    )


def _compute_ai_health(quotes: list[dict]) -> tuple[CategoryRiskScore, list[AIStockInfo]]:
    """Category 4: AI Company Health (weight 25%)"""
    ai_stocks = []
    daily_changes = []

    for q in quotes:
        change = q.get("daily_change", 0)
        daily_changes.append(change)
        ai_stocks.append(AIStockInfo(
            symbol=q.get("symbol", ""),
            price=q.get("price"),
            daily_change=change,
            name=q.get("name", ""),
        ))

    avg_daily = sum(daily_changes) / len(daily_changes) if daily_changes else 0

    if avg_daily > 1:
        s_daily = 1.5
    elif avg_daily > 0:
        s_daily = 3.0
    elif avg_daily > -1:
        s_daily = 5.0
    elif avg_daily > -3:
        s_daily = 7.0
    else:
        s_daily = 9.0

    negative_count = sum(1 for c in daily_changes if c < 0)
    neg_ratio = negative_count / len(daily_changes) if daily_changes else 0.5

    if neg_ratio < 0.3:
        s_breadth = 2.0
    elif neg_ratio < 0.5:
        s_breadth = 4.0
    elif neg_ratio < 0.7:
        s_breadth = 6.0
    else:
        s_breadth = 8.0

    score = s_daily * 0.6 + s_breadth * 0.4
    score = round(min(10.0, max(0.0, score)), 1)

    risk_level = "low" if score < 4 else ("medium" if score < 7 else "high")

    risk_indicators = [
        RiskIndicator(
            series_id="AI_BASKET_DAILY",
            name="AI 篮子日均涨跌",
            value=round(avg_daily, 2),
            units="Percent",
            source="yfinance",
        ),
        RiskIndicator(
            series_id="AI_BASKET_BREADTH",
            name="AI 篮子下跌比例",
            value=round(neg_ratio * 100, 1),
            units="Percent",
            source="yfinance",
        ),
    ]

    headline = _ai_headline(score, avg_daily, negative_count, len(daily_changes))

    category = CategoryRiskScore(
        category_id=4,
        category_name="AI Company Health",
        risk_score=score,
        risk_level=risk_level,
        headline=headline,
        indicators=risk_indicators,
    )

    return category, ai_stocks


def _economic_headline(score: float, recession_prob: float | None, yield_curve: float | None) -> str:
    if score >= 7:
        return "多项衰退指标发出警告信号"
    elif score >= 4:
        parts = []
        if recession_prob and recession_prob > 10:
            parts.append(f"衰退概率 {recession_prob:.0f}%")
        if yield_curve and yield_curve < 0:
            parts.append("收益率曲线倒挂")
        return "信号混合: " + (", ".join(parts) if parts else "密切关注中")
    else:
        return "经济指标整体健康"


def _credit_headline(score: float, hy_oas: float | None) -> str:
    if score >= 7:
        return "信用利差显著扩大，违约风险升高"
    elif score >= 4:
        hy_str = f"高收益债利差 {hy_oas:.0f}bps" if hy_oas else "信用条件收紧"
        return f"信用条件适度偏紧: {hy_str}"
    else:
        return "信用市场稳定，利差可控"


def _employment_headline(score: float, sahm: float | None, unemp: float | None) -> str:
    if score >= 7:
        parts = []
        if sahm and sahm > 0.5:
            parts.append("Sahm 规则已触发")
        if unemp and unemp > 5:
            parts.append(f"失业率 {unemp:.1f}%")
        return "劳动力市场恶化: " + (", ".join(parts) if parts else "显著走弱")
    elif score >= 4:
        return f"劳动力市场走软，失业率 {unemp:.1f}%" if unemp else "劳动力市场信号混合"
    else:
        return "劳动力市场保持韧性"


def _ai_headline(score: float, avg_daily: float, neg_count: int, total: int) -> str:
    if score >= 7:
        return f"AI 板块承压: {neg_count}/{total} 只下跌，均值 {avg_daily:+.1f}%"
    elif score >= 4:
        return f"AI 板块分化: 均值 {avg_daily:+.1f}%，{neg_count}/{total} 只下跌"
    else:
        return f"AI 板块健康: 均值 {avg_daily:+.1f}%"


_INDICATOR_NAMES = {
    "yield_curve": "10Y-2Y 收益率曲线",
    "recession_prob": "衰退概率",
    "cfnai": "芝加哥联储活动指数",
    "consumer_sentiment": "消费者信心",
    "hy_oas": "高收益债利差",
    "bbb_spread": "BBB 公司债利差",
    "cre_delinquency": "商业地产违约率",
    "business_delinquency": "商业贷款违约率",
    "unemployment": "失业率",
    "initial_claims": "初请失业金",
    "continued_claims": "续请失业金",
    "nonfarm_payrolls": "非农就业",
    "sahm_rule": "Sahm 规则指标",
    "gdp_growth": "GDP 实际增长率",
    "retail_sales": "零售销售",
    "industrial_production": "工业产出",
    "cpi": "CPI 消费者价格指数",
    "core_pce": "核心 PCE 物价指数",
    "inflation_expectations_5y": "5年期通胀预期",
    "michigan_inflation": "密歇根通胀预期",
    "fed_funds_rate": "联邦基金利率",
    "treasury_10y": "10年期国债收益率",
    "real_rate_10y": "10年期实际利率",
}


def _indicator_name(key: str) -> str:
    return _INDICATOR_NAMES.get(key, key)


async def get_macro_risk_dashboard() -> MacroRiskDashboard:
    """
    Main function: fetch all data, compute risk scores, return dashboard.
    Results cached for 10 minutes. Uses request coalescing to avoid
    duplicate FRED fetches when multiple requests arrive at cache expiry.
    """
    cached = _get_cached(_dashboard_cache)
    if cached:
        print("[MacroRisk] Returning cached dashboard")
        return cached

    async with _get_lock("dashboard"):
        cached = _get_cached(_dashboard_cache)
        if cached:
            print("[MacroRisk] Returning cached dashboard (coalesced)")
            return cached

        print("[MacroRisk] Fetching fresh dashboard data...")

        async def fetch_indicator(key: str, series_id: str):
            try:
                return key, await get_latest_value(series_id)
            except Exception as e:
                print(f"[MacroRisk] Error fetching {series_id}: {e}")
                return key, {"value": None, "error": str(e)}

        fred_tasks = [
            fetch_indicator(key, series_id)
            for key, series_id in MACRO_RISK_FRED_SERIES.items()
        ]

        yf_service = get_yfinance_service()

        fred_results_raw, yf_result = await asyncio.gather(
            asyncio.gather(*fred_tasks),
            asyncio.to_thread(yf_service.get_stock_quotes, AI_STOCK_BASKET),
        )

        indicators = {key: data for key, data in fred_results_raw}
        cat1 = _compute_economic_deterioration(indicators)
        cat2 = _compute_credit_risk(indicators)
        cat3 = _compute_employment_risk(indicators)
        cat4, ai_stocks = _compute_ai_health(yf_result.get("quotes", []))

        categories = [cat1, cat2, cat3, cat4]

        composite = sum(c.risk_score for c in categories) / len(categories)
        composite = round(composite, 1)
        composite_level = "low" if composite < 4 else ("medium" if composite < 7 else "high")

        liquidity_summary = None
        try:
            liq_metrics = await get_all_liquidity_metrics()
            nfci = liq_metrics.get("nfci", {})
            net_liq = liq_metrics.get("net_liquidity", {})
            liquidity_summary = {
                "nfci": {
                    "value": nfci.get("value"),
                    "date": nfci.get("date"),
                    "change": nfci.get("change"),
                },
                "net_liquidity": {
                    "value": net_liq.get("value"),
                    "date": net_liq.get("date"),
                    "units": net_liq.get("units", "Billions of Dollars"),
                    "change": net_liq.get("change"),
                },
            }
        except Exception as e:
            print(f"[MacroRisk] Error fetching liquidity summary: {e}")

        dashboard = MacroRiskDashboard(
            timestamp=now_iso(),
            composite_score=composite,
            composite_level=composite_level,
            categories=categories,
            ai_stocks=ai_stocks,
            liquidity_summary=liquidity_summary,
        )

        _set_cached(_dashboard_cache, dashboard)
        print(f"[MacroRisk] Dashboard ready: composite={composite} ({composite_level})")

        return dashboard


# Sub-dimension indicator definitions: (key, series_id, low_max, mid_max, invert, weight)
_GROWTH_INDICATORS = [
    ("gdp_growth", "A191RL1Q225SBEA", 2.0, 0.0, True, 0.25),
    ("recession_prob", "RECPROUSM156N", 10, 30, False, 0.20),
    ("cfnai", "CFNAI", 0, -0.5, True, 0.15),
    ("retail_sales", "RSAFS", None, None, None, 0.15),            # change-based
    ("industrial_production", "INDPRO", None, None, None, 0.15),   # change-based
    ("consumer_sentiment", "UMCSENT", 80, 60, True, 0.10),
]

_EMPLOYMENT_INDICATORS = [
    ("unemployment", "UNRATE", 4, 5, False, 0.25),                # 10/40 -> normalized
    ("nonfarm_payrolls", "PAYEMS", None, None, None, 0.25),       # 10/40 (special scoring)
    ("initial_claims", "ICSA", 225, 300, False, 0.20),            # 8/40 -> normalized (claims in K)
    ("sahm_rule", "SAHMREALTIME", 0.3, 0.5, False, 0.175),       # 7/40
    ("continued_claims", "CCSA", 1800, 2200, False, 0.125),       # 5/40
]

_INFLATION_INDICATORS = [
    ("cpi", "CPIAUCSL", None, None, None, 0.30),                  # change-based (MoM annualized)
    ("core_pce", "PCEPILFE", None, None, None, 0.30),              # change-based (MoM annualized)
    ("inflation_expectations_5y", "T5YIE", 2.5, 3.5, False, 0.25), # value-based (%)
    ("michigan_inflation", "MICH", 3.0, 4.5, False, 0.15),         # value-based (%)
]

_CREDIT_INDICATORS = [
    ("hy_oas", "BAMLH0A0HYM2", 3.5, 5.0, False, 0.32),          # 8/25
    ("yield_curve", "T10Y2Y", 0.5, -0.5, True, 0.20),            # 5/25
    ("cre_delinquency", "DRCRELEXFACBS", 2, 4, False, 0.20),     # 5/25
    ("bbb_spread", "BAMLC0A4CBBB", 1.5, 2.5, False, 0.16),       # 4/25
    ("business_delinquency", "DRBLACBS", 1.5, 3, False, 0.12),   # 3/25
]

# Inflation & Rates page: 2 sub-dimensions (inflation 60%, rates 40%)
_INFLATION_RATES_INFLATION = [
    ("cpi", "CPIAUCSL", None, None, None, 0.30),
    ("core_pce", "PCEPILFE", None, None, None, 0.35),
    ("inflation_expectations_5y", "T5YIE", 2.5, 3.5, False, 0.20),
    ("michigan_inflation", "MICH", 3.0, 4.5, False, 0.15),
]

_INFLATION_RATES_RATES = [
    ("fed_funds_rate", "FEDFUNDS", 3.0, 5.0, False, 0.375),
    ("treasury_10y", "DGS10", 3.5, 5.0, False, 0.375),
    ("real_rate_10y", "DFII10", 1.0, 2.0, False, 0.25),
]


def _score_change_based(indicators: dict, key: str, thresholds: tuple[float, float, float, float], risk_direction: str = "higher") -> float:
    """
    Score indicators based on MoM change percentage.
    thresholds: (strong, moderate, weak, very_weak) boundaries.
    risk_direction: 'higher' = higher change means higher risk,
                    'lower' = lower change means higher risk.
    """
    change = indicators.get(key, {}).get("change")
    if change is None:
        return 5.0
    t1, t2, t3, t4 = thresholds
    if risk_direction == "higher":
        if change <= t1:
            return 1.5
        elif change <= t2:
            return 3.5
        elif change <= t3:
            return 6.0
        else:
            return 8.5
    else:
        if change > t1:
            return 1.5
        elif change > t2:
            return 3.5
        elif change > t3:
            return 6.0
        else:
            return 8.0


def _score_nonfarm(indicators: dict) -> float:
    nf_change = indicators.get("nonfarm_payrolls", {}).get("change")
    if nf_change is None:
        return 5.0
    if nf_change > 0.1:
        return 2.0
    elif nf_change > 0:
        return 4.0
    elif nf_change > -0.1:
        return 6.0
    else:
        return 8.0


def _compute_subdimension(
    name: str,
    name_zh: str,
    weight: float,
    indicator_defs: list,
    indicators: dict,
) -> SubDimension:
    scores = []
    weights = []
    risk_indicators = []

    for defn in indicator_defs:
        key, series_id = defn[0], defn[1]
        w = defn[5]
        data = indicators.get(key, {})
        value = data.get("value")

        if key == "nonfarm_payrolls":
            s = _score_nonfarm(indicators)
        elif key == "initial_claims":
            claims_k = value / 1000 if value and value > 1000 else value
            s = _score_indicator(claims_k, defn[2], defn[3], invert=defn[4]) if claims_k is not None else 5.0
        elif key == "continued_claims":
            ccsa_k = value / 1000 if value and value > 1000 else value
            s = _score_indicator(ccsa_k, defn[2], defn[3], invert=defn[4]) if ccsa_k is not None else 5.0
        elif key == "cpi":
            s = _score_change_based(indicators, key, (0.15, 0.25, 0.35, 0.50), "higher")
        elif key == "core_pce":
            s = _score_change_based(indicators, key, (0.15, 0.20, 0.30, 0.40), "higher")
        elif key == "retail_sales":
            s = _score_change_based(indicators, key, (0.5, 0.0, -0.3, -1.0), "lower")
        elif key == "industrial_production":
            s = _score_change_based(indicators, key, (0.3, 0.0, -0.2, -0.5), "lower")
        else:
            low_max, mid_max, invert = defn[2], defn[3], defn[4]
            s = _score_indicator(value, low_max, mid_max, invert=invert) if value is not None else 5.0

        scores.append(s)
        weights.append(w)

        risk_indicators.append(RiskIndicator(
            series_id=series_id,
            name=_indicator_name(key),
            value=data.get("value"),
            date=data.get("date"),
            units=data.get("units", ""),
            change=data.get("change"),
            source="fred",
        ))

    total_w = sum(weights)
    if total_w > 0:
        score = sum(s * w for s, w in zip(scores, weights)) / total_w
    else:
        score = 5.0
    score = round(min(10.0, max(0.0, score)), 1)

    risk_level = "low" if score < 4 else ("medium" if score < 7 else "high")
    headline = _subdimension_headline(name, score, indicators)

    return SubDimension(
        name=name,
        name_zh=name_zh,
        score=score,
        risk_level=risk_level,
        weight=weight,
        headline=headline,
        indicators=risk_indicators,
    )


def _subdimension_headline(name: str, score: float, indicators: dict) -> str:
    if name == "growth":
        gdp = indicators.get("gdp_growth", {}).get("value")
        recession_prob = indicators.get("recession_prob", {}).get("value")
        if score >= 7:
            return "多项增长指标发出衰退警告"
        elif score >= 4:
            parts = []
            if gdp is not None and gdp < 1:
                parts.append(f"GDP 增速 {gdp:.1f}%")
            if recession_prob and recession_prob > 10:
                parts.append(f"衰退概率 {recession_prob:.0f}%")
            return "增长动能减弱: " + (", ".join(parts) if parts else "需密切关注")
        else:
            return "经济增长保持稳健"

    elif name == "employment":
        sahm = indicators.get("sahm_rule", {}).get("value")
        unemp = indicators.get("unemployment", {}).get("value")
        if score >= 7:
            parts = []
            if sahm and sahm > 0.5:
                parts.append("Sahm 规则已触发")
            if unemp and unemp > 5:
                parts.append(f"失业率 {unemp:.1f}%")
            return "劳动力市场恶化: " + (", ".join(parts) if parts else "显著走弱")
        elif score >= 4:
            return f"劳动力市场走软，失业率 {unemp:.1f}%" if unemp else "劳动力市场信号混合"
        else:
            return "劳动力市场保持韧性"

    elif name == "inflation":
        t5yie = indicators.get("inflation_expectations_5y", {}).get("value")
        cpi_change = indicators.get("cpi", {}).get("change")
        if score >= 7:
            return "通胀压力显著上升，可能迫使美联储进一步紧缩"
        elif score >= 4:
            parts = []
            if t5yie and t5yie > 2.5:
                parts.append(f"通胀预期 {t5yie:.1f}%")
            if cpi_change and cpi_change > 0.3:
                parts.append(f"CPI 月环比 {cpi_change:.1f}%")
            return "通胀粘性仍存: " + (", ".join(parts) if parts else "高于目标水平")
        else:
            return "通胀趋势可控，接近美联储 2% 目标"

    elif name == "credit":
        hy_oas = indicators.get("hy_oas", {}).get("value")
        if score >= 7:
            return "信用利差显著扩大，违约风险升高"
        elif score >= 4:
            hy_str = f"高收益债利差 {hy_oas:.0f}bps" if hy_oas else "信用条件收紧"
            return f"信用条件适度偏紧: {hy_str}"
        else:
            return "信用市场稳定，利差可控"

    elif name == "rates":
        ffr = indicators.get("fed_funds_rate", {}).get("value")
        t10y = indicators.get("treasury_10y", {}).get("value")
        if score >= 7:
            parts = []
            if ffr and ffr >= 5:
                parts.append(f"联邦基金利率 {ffr:.2f}%")
            if t10y and t10y >= 5:
                parts.append(f"10Y 收益率 {t10y:.2f}%")
            return "利率水平显著偏高: " + (", ".join(parts) if parts else "融资条件紧缩")
        elif score >= 4:
            parts = []
            if ffr:
                parts.append(f"联邦基金利率 {ffr:.2f}%")
            if t10y:
                parts.append(f"10Y {t10y:.2f}%")
            return "利率处于限制性水平: " + (", ".join(parts) if parts else "密切关注")
        else:
            return "利率水平温和，融资条件宽松"

    return "数据加载中"


def _overall_economy_headline(score: float, sub_dims: list[SubDimension]) -> str:
    if score >= 7:
        return "经济基本面多项指标恶化，衰退风险上升"
    elif score >= 4:
        weak_dims = [d.name_zh for d in sub_dims if d.score >= 5]
        if weak_dims:
            return f"经济基本面信号混合，{'/'.join(weak_dims)}偏弱"
        return "经济基本面出现分化信号"
    else:
        return "经济基本面整体健康，风险可控"


async def get_economic_fundamentals() -> EconomicFundamentals:
    """
    Compute economic fundamentals with 4 sub-dimensions:
    growth (30%), employment (30%), inflation (20%), credit (20%).
    Cached independently for 10 minutes. Uses request coalescing.
    """
    cached = _get_cached(_economy_cache)
    if cached:
        print("[Economy] Returning cached data")
        return cached

    async with _get_lock("economy"):
        cached = _get_cached(_economy_cache)
        if cached:
            print("[Economy] Returning cached data (coalesced)")
            return cached

        print("[Economy] Fetching fresh economic fundamentals data...")

        needed_keys = {
            defn[0]
            for defs in [_GROWTH_INDICATORS, _EMPLOYMENT_INDICATORS, _INFLATION_INDICATORS, _CREDIT_INDICATORS]
            for defn in defs
        }

        async def fetch_indicator(key: str):
            series_id = MACRO_RISK_FRED_SERIES.get(key)
            if not series_id:
                return key, {"value": None, "error": f"Unknown series key: {key}"}
            try:
                return key, await get_latest_value(series_id)
            except Exception as e:
                print(f"[Economy] Error fetching {series_id}: {e}")
                return key, {"value": None, "error": str(e)}

        results_raw = await asyncio.gather(
            *[fetch_indicator(key) for key in needed_keys]
        )

        indicators = {key: data for key, data in results_raw}

        growth = _compute_subdimension("growth", "增长", 0.30, _GROWTH_INDICATORS, indicators)
        employment = _compute_subdimension("employment", "就业", 0.30, _EMPLOYMENT_INDICATORS, indicators)
        inflation = _compute_subdimension("inflation", "通胀", 0.20, _INFLATION_INDICATORS, indicators)
        credit = _compute_subdimension("credit", "信用", 0.20, _CREDIT_INDICATORS, indicators)

        sub_dims = [growth, employment, inflation, credit]

        overall = sum(d.score * d.weight for d in sub_dims)
        overall = round(min(10.0, max(0.0, overall)), 1)
        overall_level = "low" if overall < 4 else ("medium" if overall < 7 else "high")

        result = EconomicFundamentals(
            timestamp=now_iso(),
            overall_score=overall,
            overall_level=overall_level,
            overall_headline=_overall_economy_headline(overall, sub_dims),
            sub_dimensions=sub_dims,
        )

        _set_cached(_economy_cache, result)
        print(f"[Economy] Ready: overall={overall} ({overall_level})")

        return result


def _overall_inflation_rates_headline(score: float, sub_dims: list[SubDimension]) -> str:
    if score >= 7:
        return "通胀与利率双重承压，紧缩环境显著"
    elif score >= 4:
        weak_dims = [d.name_zh for d in sub_dims if d.score >= 5]
        if weak_dims:
            return f"通胀利率信号混合，{'/'.join(weak_dims)}偏紧"
        return "通胀与利率处于过渡期"
    else:
        return "通胀温和，利率环境友好"


async def get_inflation_rates() -> EconomicFundamentals:
    """
    Compute inflation & rates with 2 sub-dimensions:
    inflation (60%), rates (40%).
    Cached independently for 10 minutes. Uses request coalescing.
    """
    cached = _get_cached(_inflation_cache)
    if cached:
        print("[InflationRates] Returning cached data")
        return cached

    async with _get_lock("inflation"):
        cached = _get_cached(_inflation_cache)
        if cached:
            print("[InflationRates] Returning cached data (coalesced)")
            return cached

        print("[InflationRates] Fetching fresh data...")

        needed_keys = {
            defn[0]
            for defs in [_INFLATION_RATES_INFLATION, _INFLATION_RATES_RATES]
            for defn in defs
        }

        async def fetch_indicator(key: str):
            series_id = MACRO_RISK_FRED_SERIES.get(key)
            if not series_id:
                return key, {"value": None, "error": f"Unknown series key: {key}"}
            try:
                return key, await get_latest_value(series_id)
            except Exception as e:
                print(f"[InflationRates] Error fetching {series_id}: {e}")
                return key, {"value": None, "error": str(e)}

        results_raw = await asyncio.gather(
            *[fetch_indicator(key) for key in needed_keys]
        )

        indicators = {key: data for key, data in results_raw}

        inflation = _compute_subdimension("inflation", "通胀", 0.60, _INFLATION_RATES_INFLATION, indicators)
        rates = _compute_subdimension("rates", "利率", 0.40, _INFLATION_RATES_RATES, indicators)

        sub_dims = [inflation, rates]

        overall = sum(d.score * d.weight for d in sub_dims)
        overall = round(min(10.0, max(0.0, overall)), 1)
        overall_level = "low" if overall < 4 else ("medium" if overall < 7 else "high")

        result = EconomicFundamentals(
            timestamp=now_iso(),
            overall_score=overall,
            overall_level=overall_level,
            overall_headline=_overall_inflation_rates_headline(overall, sub_dims),
            sub_dimensions=sub_dims,
        )

        _set_cached(_inflation_cache, result)
        print(f"[InflationRates] Ready: overall={overall} ({overall_level})")

        return result
