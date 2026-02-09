"""
Macro Risk Dashboard - Core Service

Fetches FRED data, yfinance AI basket quotes, and computes risk scores.
"""

import asyncio
import time
import httpx
from app.features.liquidity.fred_service import (
    get_latest_value,
    get_all_liquidity_metrics,
    fetch_fred_series,
)
from app.shared.yfinance_service import get_yfinance_service
from app.shared.fmp_service import get_fmp_service
from app.features.macro_risk.models import (
    RiskIndicator,
    CategoryRiskScore,
    AIStockInfo,
    MacroRiskDashboard,
    SubDimension,
    EconomicFundamentals,
    CpiComponent,
    CpiBreakdown,
)
from app.utils.timezone import now_iso
from app.features.macro_cache.db import try_db_cache

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

_CACHE_TTL = 600
_CACHE_TTL_REALTIME = 120  # 2 min for intraday data (commodities, dollar)

_caches: dict[str, dict] = {
    "dashboard": {},
    "economy": {},
    "inflation": {},
    "sentiment": {},
    "treasury_rates": {},
    "commodities_realtime": {},
}

_locks: dict[str, asyncio.Lock] = {}


def _get_lock(name: str) -> asyncio.Lock:
    if name not in _locks:
        _locks[name] = asyncio.Lock()
    return _locks[name]


def _get_cache(name: str) -> dict:
    return _caches.setdefault(name, {})


def _get_cached(store: dict, ttl: int = _CACHE_TTL):
    if "data" in store and time.time() - store["ts"] < ttl:
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


async def get_macro_risk_dashboard(
    *, skip_db_cache: bool = False,
) -> MacroRiskDashboard:
    """
    Main function: fetch all data, compute risk scores, return dashboard.
    Results cached for 10 minutes. Uses request coalescing to avoid
    duplicate FRED fetches when multiple requests arrive at cache expiry.
    """
    cached = _get_cached(_get_cache("dashboard"))
    if cached:
        print("[MacroRisk] Returning cached dashboard")
        return cached

    async with _get_lock("dashboard"):
        cached = _get_cached(_get_cache("dashboard"))
        if cached:
            print("[MacroRisk] Returning cached dashboard (coalesced)")
            return cached

        # DB cache layer
        if not skip_db_cache:
            db_data, db_valid = await try_db_cache("macro:dashboard")
            if db_valid and db_data:
                print("[MacroRisk] Returning DB-cached dashboard")
                dashboard = MacroRiskDashboard(**db_data)
                _set_cached(_get_cache("dashboard"), dashboard)
                return dashboard

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

        _set_cached(_get_cache("dashboard"), dashboard)
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


async def get_economic_fundamentals(
    *, skip_db_cache: bool = False,
) -> EconomicFundamentals:
    """
    Compute economic fundamentals with 4 sub-dimensions:
    growth (30%), employment (30%), inflation (20%), credit (20%).
    Cached independently for 10 minutes. Uses request coalescing.
    """
    cached = _get_cached(_get_cache("economy"))
    if cached:
        print("[Economy] Returning cached data")
        return cached

    async with _get_lock("economy"):
        cached = _get_cached(_get_cache("economy"))
        if cached:
            print("[Economy] Returning cached data (coalesced)")
            return cached

        # DB cache layer
        if not skip_db_cache:
            db_data, db_valid = await try_db_cache("macro:economy")
            if db_valid and db_data:
                print("[Economy] Returning DB-cached data")
                result = EconomicFundamentals(**db_data)
                _set_cached(_get_cache("economy"), result)
                return result

        print("[Economy] Fetching fresh economic fundamentals data...")

        needed_keys = {
            defn[0]
            for defs in [_GROWTH_INDICATORS, _EMPLOYMENT_INDICATORS, _CREDIT_INDICATORS]
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

        growth = _compute_subdimension("growth", "增长", 0.35, _GROWTH_INDICATORS, indicators)
        employment = _compute_subdimension("employment", "就业", 0.35, _EMPLOYMENT_INDICATORS, indicators)
        credit = _compute_subdimension("credit", "信用", 0.30, _CREDIT_INDICATORS, indicators)

        sub_dims = [growth, employment, credit]

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

        _set_cached(_get_cache("economy"), result)
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


async def get_inflation_rates(
    *, skip_db_cache: bool = False,
) -> EconomicFundamentals:
    """
    Compute inflation & rates with 2 sub-dimensions:
    inflation (60%), rates (40%).
    Cached independently for 10 minutes. Uses request coalescing.
    """
    cached = _get_cached(_get_cache("inflation"))
    if cached:
        print("[InflationRates] Returning cached data")
        return cached

    async with _get_lock("inflation"):
        cached = _get_cached(_get_cache("inflation"))
        if cached:
            print("[InflationRates] Returning cached data (coalesced)")
            return cached

        # DB cache layer
        if not skip_db_cache:
            db_data, db_valid = await try_db_cache("macro:inflation_rates")
            if db_valid and db_data:
                print("[InflationRates] Returning DB-cached data")
                result = EconomicFundamentals(**db_data)
                _set_cached(_get_cache("inflation"), result)
                return result

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

        _set_cached(_get_cache("inflation"), result)
        print(f"[InflationRates] Ready: overall={overall} ({overall_level})")

        return result


# ============================================================================
# CPI Breakdown (YoY% + MoM% for key CPI components)
# ============================================================================

_CPI_COMPONENTS = [
    ("CPIAUCSL", "CPI All Items", "CPI 总体"),
    ("CPILFESL", "Core CPI", "核心 CPI"),
    ("CUSR0000SAH1", "Shelter", "住房"),
    ("CPIUFDSL", "Food", "食品"),
    ("CPIENGSL", "Energy", "能源"),
]



async def get_cpi_breakdown(
    *, skip_db_cache: bool = False,
) -> CpiBreakdown:
    """
    Fetch YoY% and MoM% for key CPI components using FRED's
    built-in units transformation (pc1 / pch).
    Cached for 10 minutes with request coalescing.
    """
    cached = _get_cached(_get_cache("cpi"))
    if cached:
        print("[CPI] Returning cached data")
        return cached

    async with _get_lock("cpi"):
        cached = _get_cached(_get_cache("cpi"))
        if cached:
            print("[CPI] Returning cached data (coalesced)")
            return cached

        # DB cache layer
        if not skip_db_cache:
            db_data, db_valid = await try_db_cache("fred:cpi_breakdown")
            if db_valid and db_data:
                print("[CPI] Returning DB-cached data")
                result = CpiBreakdown(**db_data)
                _set_cached(_get_cache("cpi"), result)
                return result

        print("[CPI] Fetching fresh CPI breakdown data...")

        async def fetch_one(series_id: str, units: str):
            try:
                data = await fetch_fred_series(
                    series_id, limit=1, units=units,
                )
                obs = data.get("observations", [])
                if obs:
                    raw_val = obs[0].get("value")
                    try:
                        parsed_val = float(raw_val) if raw_val not in (None, ".", "") else None
                    except (ValueError, TypeError):
                        parsed_val = None
                    return series_id, units, obs[0]["date"], parsed_val
                return series_id, units, None, None
            except Exception as e:
                print(f"[CPI] Error fetching {series_id} ({units}): {e}")
                return series_id, units, None, None

        tasks = []
        for sid, _, _ in _CPI_COMPONENTS:
            tasks.append(fetch_one(sid, "pc1"))   # YoY%
            tasks.append(fetch_one(sid, "pch"))   # MoM%

        results = await asyncio.gather(*tasks)

        lookup: dict[str, dict] = {}
        for sid, units, date, value in results:
            if sid not in lookup:
                lookup[sid] = {}
            lookup[sid][units] = {"date": date, "value": value}

        components = []
        for series_id, name_en, name_zh in _CPI_COMPONENTS:
            info = lookup.get(series_id, {})
            yoy = info.get("pc1", {})
            mom = info.get("pch", {})

            yoy_val = yoy.get("value")
            mom_val = mom.get("value")

            components.append(CpiComponent(
                series_id=series_id,
                name=name_en,
                name_zh=name_zh,
                date=yoy.get("date") or mom.get("date"),
                yoy_pct=round(yoy_val, 1) if yoy_val is not None else None,
                mom_pct=round(mom_val, 2) if mom_val is not None else None,
            ))

        result = CpiBreakdown(
            timestamp=now_iso(),
            components=components,
        )

        _set_cached(_get_cache("cpi"), result)
        print(f"[CPI] Ready: {len(components)} components")

        return result


# ============================================================================
# Market Sentiment (CNN Fear & Greed + VIX/Put-Call/Breadth/Credit)
# ============================================================================

_CNN_FG_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
_CNN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.cnn.com/",
    "Origin": "https://www.cnn.com",
    "Accept": "application/json",
}

_CNN_COMPONENTS = [
    "stock_price_strength",
    "stock_price_breadth",
    "put_call_options",
    "market_momentum",
    "junk_bond_demand",
    "market_volatility",
    "safe_haven_demand",
]

_CNN_COMPONENT_NAMES_ZH = {
    "stock_price_strength": "股价强度",
    "stock_price_breadth": "股价宽度",
    "put_call_options": "看跌/看涨期权",
    "market_momentum": "市场动能",
    "junk_bond_demand": "垃圾债需求",
    "market_volatility": "市场波动率 (VIX)",
    "safe_haven_demand": "避险资产需求",
}

_BREADTH_BASKET = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "JPM", "V",
    "UNH", "XOM", "JNJ", "WMT", "PG", "MA", "HD", "CVX", "MRK", "ABBV",
    "KO", "PEP", "COST", "LLY", "AVGO", "TMO", "MCD", "CSCO", "ACN", "ABT",
    "CRM", "DHR", "TXN", "NEE", "LIN", "PM", "UNP", "RTX", "AMGN", "CMCSA",
    "LOW", "HON", "IBM", "QCOM", "CAT", "BA", "GE", "INTC", "AMAT", "ISRG",
    "MDLZ", "ADI", "BKNG", "ADP", "PLD", "GILD", "SYK", "MMC", "CB", "BDX",
    "VRTX", "CI", "DE", "AMT", "SO", "DUK", "ZTS", "MO", "PGR", "CL",
    "SHW", "BSX", "REGN", "AON", "CME", "FIS", "NSC", "ICE", "TGT", "WM",
    "APD", "EMR", "FCX", "SLB", "ETN", "PH", "ORLY", "ECL", "ADSK", "KLAC",
    "PSA", "AEP", "D", "GIS", "SRE", "FTNT", "CTAS", "AZO", "WELL", "MNST",
]


async def _fetch_cnn_fear_greed() -> dict | None:
    """Fetch CNN Fear & Greed Index data."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(_CNN_FG_URL, headers=_CNN_HEADERS)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        print(f"[Sentiment] Error fetching CNN Fear & Greed: {e}")
        return None


async def _fetch_sentiment_market_data() -> dict[str, list[RiskIndicator]]:
    """Fetch volatility (VIX/VVIX/SKEW) and breadth indicators.
    Credit spreads (HY OAS/BBB) are covered in Economic Fundamentals."""
    yf_service = get_yfinance_service()

    symbols = ["^VIX", "^VVIX", "^SKEW"] + _BREADTH_BASKET
    yf_result = await asyncio.to_thread(yf_service.get_stock_quotes, symbols)

    quotes = yf_result.get("quotes", [])
    quotes_by_symbol = {q["symbol"]: q for q in quotes}

    # -- Volatility --
    volatility = []
    for sym, sid, name in [
        ("^VIX", "VIX", "VIX 波动率指数"),
        ("^VVIX", "VVIX", "VVIX (VIX 的波动率)"),
        ("^SKEW", "SKEW", "SKEW 尾部风险指数"),
    ]:
        q = quotes_by_symbol.get(sym)
        volatility.append(RiskIndicator(
            series_id=sid,
            name=name,
            value=q.get("price") if q else None,
            units="Index",
            change=q.get("daily_change") if q else None,
            source="yfinance",
        ))

    # -- Breadth & Options --
    breadth_options = []

    breadth_quotes = [quotes_by_symbol.get(s) for s in _BREADTH_BASKET if s in quotes_by_symbol]
    if breadth_quotes:
        up_count = sum(1 for q in breadth_quotes if q and q.get("daily_change", 0) > 0)
        breadth_pct = round(up_count / len(breadth_quotes) * 100, 1)
    else:
        breadth_pct = None
    breadth_options.append(RiskIndicator(
        series_id="BREADTH",
        name="S&P 500 市场宽度",
        value=breadth_pct,
        units="Percent",
        source="yfinance",
    ))
    # Put/Call: yfinance ^PCCE delisted, use CNN score as reference
    breadth_options.append(RiskIndicator(
        series_id="PCCE",
        name="看跌/看涨比率 (CBOE)",
        value=None,
        units="Ratio",
        source="cnn",
    ))

    return {
        "volatility": volatility,
        "breadth_options": breadth_options,
    }


def _sentiment_headline(rating: str | None, score: float | None) -> str:
    if not rating or score is None:
        return "市场情绪数据获取中"
    r = rating.lower()
    if "extreme fear" in r:
        return f"极度恐慌 ({score:.0f}/100) - 市场恐慌情绪蔓延，可能出现超卖机会"
    elif "extreme greed" in r:
        return f"极度贪婪 ({score:.0f}/100) - 市场过度乐观，注意回调风险"
    elif "fear" in r:
        return f"恐慌 ({score:.0f}/100) - 市场情绪偏悲观，风险偏好下降"
    elif "greed" in r:
        return f"贪婪 ({score:.0f}/100) - 市场情绪乐观，风险偏好上升"
    else:
        return f"中性 ({score:.0f}/100) - 市场情绪平稳，观望为主"


async def get_market_sentiment(
    *, skip_db_cache: bool = False,
) -> EconomicFundamentals:
    """
    Get market sentiment: CNN Fear & Greed (7 components) + 2 market dimensions.
    3 sub-dimensions: cnn_indicators, volatility, breadth_options.
    Credit spreads are covered in Economic Fundamentals.
    overall_score = CNN composite (0-100 scale).
    Cached independently for 10 minutes. Uses request coalescing.
    """
    cached = _get_cached(_get_cache("sentiment"))
    if cached:
        print("[Sentiment] Returning cached data")
        return cached

    async with _get_lock("sentiment"):
        cached = _get_cached(_get_cache("sentiment"))
        if cached:
            print("[Sentiment] Returning cached data (coalesced)")
            return cached

        # DB cache layer
        if not skip_db_cache:
            db_data, db_valid = await try_db_cache("macro:sentiment")
            if db_valid and db_data:
                print("[Sentiment] Returning DB-cached data")
                result = EconomicFundamentals(**db_data)
                _set_cached(_get_cache("sentiment"), result)
                return result

        print("[Sentiment] Fetching fresh sentiment data...")

        cnn_data, market_groups = await asyncio.gather(
            _fetch_cnn_fear_greed(),
            _fetch_sentiment_market_data(),
        )

        # -- 1. CNN sub-dimension --
        cnn_indicators = []
        overall_score = 50.0
        overall_rating = "Neutral"

        if cnn_data:
            fg = cnn_data.get("fear_and_greed", {})
            overall_score = fg.get("score") or 50.0
            overall_rating = fg.get("rating") or "Neutral"

            for comp_key in _CNN_COMPONENTS:
                comp = cnn_data.get(comp_key, {})
                ts_raw = comp.get("timestamp")
                ts_str = None
                if ts_raw is not None:
                    try:
                        from datetime import datetime, timezone
                        ts_str = datetime.fromtimestamp(ts_raw / 1000, tz=timezone.utc).isoformat()
                    except Exception:
                        ts_str = str(ts_raw)
                cnn_indicators.append(RiskIndicator(
                    series_id=f"CNN_{comp_key.upper()}",
                    name=_CNN_COMPONENT_NAMES_ZH.get(comp_key, comp_key),
                    value=comp.get("score"),
                    date=ts_str,
                    units="Score (0-100)",
                    source="cnn",
                ))

        cnn_score_0_10 = round(overall_score / 10, 1) if overall_score is not None else 5.0
        cnn_risk_level = "low" if cnn_score_0_10 >= 6 else ("medium" if cnn_score_0_10 >= 4 else "high")

        cnn_dim = SubDimension(
            name="cnn_indicators",
            name_zh="CNN 恐慌贪婪指数",
            score=cnn_score_0_10,
            risk_level=cnn_risk_level,
            weight=0.0,
            headline=_sentiment_headline(overall_rating, overall_score),
            indicators=cnn_indicators,
        )

        # -- 2. Volatility sub-dimension --
        vol_indicators = market_groups.get("volatility", [])
        vix_val = next((i.value for i in vol_indicators if i.series_id == "VIX"), None)
        vol_headline = "VIX / VVIX / SKEW 波动率实时数据"
        if vix_val is not None:
            if vix_val >= 30:
                vol_headline = f"VIX {vix_val:.1f} - 市场恐慌情绪升温，波动率显著偏高"
            elif vix_val >= 20:
                vol_headline = f"VIX {vix_val:.1f} - 波动率适中，市场保持警惕"
            else:
                vol_headline = f"VIX {vix_val:.1f} - 波动率偏低，市场相对平静"

        vol_dim = SubDimension(
            name="volatility",
            name_zh="波动率",
            score=5.0,
            risk_level="medium",
            weight=0.0,
            headline=vol_headline,
            indicators=vol_indicators,
        )

        # -- 3. Breadth & Options sub-dimension --
        bo_indicators = market_groups.get("breadth_options", [])
        breadth_val = next((i.value for i in bo_indicators if i.series_id == "BREADTH"), None)
        bo_headline = "市场宽度与期权情绪"
        if breadth_val is not None:
            if breadth_val >= 70:
                bo_headline = f"上涨比例 {breadth_val:.0f}% - 多数股票参与上涨，市场广度健康"
            elif breadth_val >= 40:
                bo_headline = f"上涨比例 {breadth_val:.0f}% - 市场涨跌分化，广度一般"
            else:
                bo_headline = f"上涨比例 {breadth_val:.0f}% - 多数股票下跌，市场广度疲弱"

        bo_dim = SubDimension(
            name="breadth_options",
            name_zh="市场宽度与期权",
            score=5.0,
            risk_level="medium",
            weight=0.0,
            headline=bo_headline,
            indicators=bo_indicators,
        )

        sub_dims = [cnn_dim, vol_dim, bo_dim]

        overall_level = (
            "low" if overall_score >= 60
            else ("medium" if overall_score >= 40 else "high")
        )

        result = EconomicFundamentals(
            timestamp=now_iso(),
            overall_score=round(overall_score, 1),
            overall_level=overall_level,
            overall_headline=_sentiment_headline(overall_rating, overall_score),
            sub_dimensions=sub_dims,
        )

        _set_cached(_get_cache("sentiment"), result)
        print(f"[Sentiment] Ready: overall={overall_score:.0f} ({overall_rating})")

        return result


# ============================================================================
# Treasury & Commodities (Yield Curve + Gold/Oil/Dollar)
# ============================================================================


def _fetch_dollar_index() -> dict:
    """Synchronous yfinance fetch for DX-Y.NYB (US Dollar Index)."""
    import warnings as _warnings
    import yfinance as yf

    with _warnings.catch_warnings():
        _warnings.simplefilter("ignore")
        ticker = yf.Ticker("DX-Y.NYB")
        hist = ticker.history(period="2d")

    if hist.empty:
        return {"price": None, "daily_change": None}

    today_close = float(hist["Close"].iloc[-1])
    if today_close != today_close:
        return {"price": None, "daily_change": None}

    prev_close = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else None
    daily_change = None
    if prev_close and prev_close == prev_close and prev_close > 0:
        daily_change = round(((today_close - prev_close) / prev_close) * 100, 2)

    return {
        "price": round(today_close, 2),
        "daily_change": daily_change,
    }


async def get_treasury_and_commodities() -> dict:
    """
    Get treasury yield curve (12 tenors with daily change) + commodity quotes + dollar index.

    Caching strategy:
    - Treasury rates: 3-layer cache (memory 10min -> DB -> FMP API)
      Rates change once daily, safe to cache.
    - Commodities & Dollar: short memory cache only (2min -> FMP/yfinance API)
      Prices change intraday, always fetch near real-time.
    """
    # --- Treasury rates (3-layer: memory -> DB -> API) ---
    treasury_result = _get_cached(_get_cache("treasury_rates"))
    if treasury_result:
        print("[Treasury] Returning memory-cached data")
    else:
        async with _get_lock("treasury_rates"):
            treasury_result = _get_cached(_get_cache("treasury_rates"))
            if treasury_result:
                print("[Treasury] Returning memory-cached data (coalesced)")
            else:
                db_data, db_valid = await try_db_cache("macro:treasury_rates")
                if db_valid and db_data:
                    treasury_result = db_data
                    _set_cached(_get_cache("treasury_rates"), treasury_result)
                    print("[Treasury] Returning DB-cached data")
                else:
                    fmp = get_fmp_service()
                    treasury_result = await asyncio.to_thread(fmp.get_treasury_rates_with_change)
                    _set_cached(_get_cache("treasury_rates"), treasury_result)
                    print(f"[Treasury] Fetched fresh: {len(treasury_result.get('rates', {}))} tenors")

    # --- Commodities & Dollar (short memory cache -> API, no DB cache) ---
    realtime_cache = _get_cached(
        _get_cache("commodities_realtime"), ttl=_CACHE_TTL_REALTIME
    )
    if realtime_cache:
        commodities_map = realtime_cache["commodities"]
        dollar_result = realtime_cache["dollar"]
        print("[Commodities] Returning short-cached real-time data")
    else:
        async with _get_lock("commodities_realtime"):
            realtime_cache = _get_cached(
                _get_cache("commodities_realtime"), ttl=_CACHE_TTL_REALTIME
            )
            if realtime_cache:
                commodities_map = realtime_cache["commodities"]
                dollar_result = realtime_cache["dollar"]
            else:
                fmp = get_fmp_service()
                commodities_result, dollar_result = await asyncio.gather(
                    asyncio.to_thread(
                        fmp.get_commodity_quotes,
                        ["GCUSD", "BZUSD", "HGUSD", "SIUSD"],
                    ),
                    asyncio.to_thread(_fetch_dollar_index),
                )
                commodities_map = commodities_result.get("commodities", {})
                _set_cached(
                    _get_cache("commodities_realtime"),
                    {"commodities": commodities_map, "dollar": dollar_result},
                )
                print("[Commodities] Fetched real-time data")

    return {
        "treasury": treasury_result,
        "commodities": commodities_map,
        "dollar": dollar_result,
        "timestamp": now_iso(),
    }
