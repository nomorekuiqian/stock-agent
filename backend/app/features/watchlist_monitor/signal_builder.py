"""Input collection and compaction for ticker daily briefs."""

from __future__ import annotations

import hashlib
from datetime import date, timedelta
from typing import Any

from app.core.logging import get_logger
from app.features.twitter_digest.models import DailyDigest
from app.features.watchlist_monitor.models import (
    EventCandidate,
    SourceRef,
    TechnicalMonitor,
    TechnicalMonitorSignal,
    TechnicalView,
    TechnicalViewDimension,
)
from app.shared.data_tools.fundamentals import get_company_profile
from app.shared.data_tools.news import get_fmp_news
from app.shared.data_tools.technical import get_technical_data

logger = get_logger(__name__)

NEWS_ITEM_LIMIT = 15
NEWS_LOOKBACK_DAYS = 7
EVENT_LOOKAHEAD_DAYS = 14
RECENT_PRICE_PATH_LIMIT = 8
MARKET_CONTEXT_SYMBOLS = [
    "SPY",
    "QQQ",
    "IWM",
    "DIA",
    "XLK",
    "XLC",
    "XLY",
    "XLP",
    "XLF",
    "XLV",
    "XLI",
    "XLE",
    "XLU",
    "XLRE",
    "XLB",
    "SMH",
    "TLT",
    "USO",
]

_MARKET_LABELS = {
    "SPY": "S&P 500 proxy",
    "QQQ": "Nasdaq 100 proxy",
    "IWM": "Small-cap proxy",
    "DIA": "Dow proxy",
    "XLK": "Technology sector proxy",
    "XLC": "Communication services sector proxy",
    "XLY": "Consumer discretionary sector proxy",
    "XLP": "Consumer staples sector proxy",
    "XLF": "Financials sector proxy",
    "XLV": "Health care sector proxy",
    "XLI": "Industrials sector proxy",
    "XLE": "Energy sector proxy",
    "XLU": "Utilities sector proxy",
    "XLRE": "Real estate sector proxy",
    "XLB": "Materials sector proxy",
    "SMH": "Semiconductor theme proxy",
    "TLT": "Long-duration Treasury proxy",
    "USO": "Oil proxy",
}

_SECTOR_PROXY_BY_FMP_SECTOR = {
    "Technology": "XLK",
    "Communication Services": "XLC",
    "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP",
    "Financial Services": "XLF",
    "Healthcare": "XLV",
    "Industrials": "XLI",
    "Energy": "XLE",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Basic Materials": "XLB",
}


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _round(value: Any, digits: int = 2) -> float | None:
    number = _safe_float(value)
    if number is None:
        return None
    return round(number, digits)


def _pct_change(current: float | None, reference: float | None) -> float | None:
    if current is None or reference is None or reference == 0:
        return None
    return (current - reference) / reference * 100


def _format_price(value: float | None) -> str:
    if value is None:
        return "-"
    return "$%.2f" % value


def _indicator_value(indicators: dict[str, Any], key: str, offset: int = 1) -> float | None:
    series = indicators.get(key) or []
    if not isinstance(series, list) or len(series) < offset:
        return None
    item = series[-offset]
    if not isinstance(item, dict):
        return None
    return _round(item.get("value"), 2)


def _ohlcv_float(candle: dict[str, Any], key: str) -> float | None:
    return _round(candle.get(key), 2)


def _compact_recent_price_path(ohlcv: Any, limit: int = RECENT_PRICE_PATH_LIMIT) -> dict[str, Any]:
    if not isinstance(ohlcv, list) or not ohlcv:
        return {"available": False, "sessions": []}

    candles = [candle for candle in ohlcv if isinstance(candle, dict)]
    if not candles:
        return {"available": False, "sessions": []}

    start_index = max(0, len(candles) - limit)
    sessions = []
    for index in range(start_index, len(candles)):
        candle = candles[index]
        close = _ohlcv_float(candle, "close")
        if close is None:
            continue
        previous_close = _ohlcv_float(candles[index - 1], "close") if index > 0 else None
        sessions.append(
            {
                "date": candle.get("date"),
                "close": close,
                "daily_change_pct": _round(_pct_change(close, previous_close), 1),
                "high": _ohlcv_float(candle, "high"),
                "low": _ohlcv_float(candle, "low"),
            }
        )

    if not sessions:
        return {"available": False, "sessions": []}

    daily_changes = [session.get("daily_change_pct") for session in sessions]
    consecutive_down_days = 0
    for value in reversed(daily_changes):
        if value is not None and value < 0:
            consecutive_down_days += 1
            continue
        break

    consecutive_up_days = 0
    for value in reversed(daily_changes):
        if value is not None and value > 0:
            consecutive_up_days += 1
            continue
        break

    closes = [session["close"] for session in sessions]
    latest_close = closes[-1]
    first_close = closes[0]
    recent_high = max(closes)
    recent_low = min(closes)

    return {
        "available": True,
        "lookback_sessions": len(sessions),
        "sessions": sessions,
        "latest_close": latest_close,
        "latest_daily_change_pct": sessions[-1].get("daily_change_pct"),
        "consecutive_down_days": consecutive_down_days,
        "consecutive_up_days": consecutive_up_days,
        "close_change_from_first_pct": _round(_pct_change(latest_close, first_close), 1),
        "close_change_from_recent_high_pct": _round(_pct_change(latest_close, recent_high), 1),
        "close_change_from_recent_low_pct": _round(_pct_change(latest_close, recent_low), 1),
        "path_usage": (
            "Use sessions to verify sequence wording. Do not infer consecutive "
            "declines/rallies from 5d or 20d aggregate changes alone."
        ),
    }


def _source_ref(ref_id: str, ref_type: str, title: str, url: str = "", published_at: str = "") -> SourceRef:
    return SourceRef(
        id=ref_id,
        type=ref_type,
        title=(title or "")[:220],
        url=url or "",
        published_at=published_at or "",
    )


def _compact_quote(symbol: str, quote: dict[str, Any] | None) -> dict[str, Any]:
    quote = quote or {}
    return {
        "symbol": symbol,
        "name": quote.get("name") or symbol,
        "price": _round(quote.get("price")),
        "daily_change_pct": _round(quote.get("daily_change")),
        "daily_change": _round(quote.get("change")),
        "previous_close": _round(quote.get("previous_close")),
        "day_high": _round(quote.get("day_high")),
        "day_low": _round(quote.get("day_low")),
        "volume": _round(quote.get("volume"), 0),
        "avg_volume": _round(quote.get("avg_volume"), 0),
        "market_cap": _round(quote.get("market_cap"), 0),
    }


def _compact_company_profile(profile: dict[str, Any] | None) -> dict[str, Any]:
    profile = profile or {}
    classification = profile.get("classification") or {}
    return {
        "company_name": profile.get("company_name"),
        "sector": classification.get("sector"),
        "industry": classification.get("industry"),
        "sector_proxy": _SECTOR_PROXY_BY_FMP_SECTOR.get(classification.get("sector")),
        "website": (profile.get("company_details") or {}).get("website"),
    }


def _safe_company_profile(symbol: str) -> dict[str, Any]:
    try:
        return get_company_profile(symbol) or {}
    except Exception as exc:
        logger.warning("company profile fetch failed for %s: %s", symbol, exc)
        return {}


def _compact_market_quote(symbol: str, quote: dict[str, Any] | None) -> dict[str, Any] | None:
    if not quote:
        return None
    daily_change = _round(quote.get("daily_change"), 2)
    price = _round(quote.get("price"), 2)
    if daily_change is None and price is None:
        return None
    return {
        "symbol": symbol,
        "label": _MARKET_LABELS.get(symbol, symbol),
        "price": price,
        "daily_change_pct": daily_change,
    }


def _market_tone(benchmarks: list[dict[str, Any]]) -> str:
    change_by_symbol = {
        item.get("symbol"): _safe_float(item.get("daily_change_pct"))
        for item in benchmarks
        if item.get("symbol")
    }
    spy = change_by_symbol.get("SPY")
    qqq = change_by_symbol.get("QQQ")
    iwm = change_by_symbol.get("IWM")
    positive_count = sum(1 for value in (spy, qqq, iwm) if value is not None and value >= 0.5)
    negative_count = sum(1 for value in (spy, qqq, iwm) if value is not None and value <= -0.5)
    if qqq is not None and qqq >= 1.5 and (spy is None or spy >= 0.5):
        return "risk_on_tech_led"
    if positive_count >= 2:
        return "risk_on_broad"
    if qqq is not None and qqq <= -1.5 and (spy is None or spy <= -0.5):
        return "risk_off_tech_led"
    if negative_count >= 2:
        return "risk_off_broad"
    return "mixed_or_muted"


def _compact_sector_snapshot(
    sector: str | None,
    sector_performance: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not sector or not isinstance(sector_performance, dict):
        return None
    sectors = sector_performance.get("sectors") or []
    if not isinstance(sectors, list):
        return None
    for item in sectors:
        if not isinstance(item, dict) or item.get("sector") != sector:
            continue
        return {
            "sector": sector,
            "average_change_pct": _round(item.get("averageChange"), 2),
            "exchange": item.get("exchange"),
            "date": item.get("date") or sector_performance.get("date"),
        }
    return None


def _compact_market_context(
    symbol: str,
    *,
    quote: dict[str, Any] | None,
    profile: dict[str, Any] | None,
    market_quotes: dict[str, dict[str, Any]],
    sector_performance: dict[str, Any] | None,
) -> dict[str, Any]:
    compact_profile = _compact_company_profile(profile)
    benchmark_order = ["SPY", "QQQ", "IWM", "DIA", "TLT", "USO"]
    sector_proxy = compact_profile.get("sector_proxy")
    relevant_order = [s for s in [sector_proxy, "SMH" if symbol in {"NVDA", "AMD", "AVGO", "MRVL", "MU", "TSM", "ASML", "INTC"} else None] if s]
    ordered_symbols = list(dict.fromkeys(benchmark_order + relevant_order))

    benchmarks = [
        compact
        for market_symbol in ordered_symbols
        if (compact := _compact_market_quote(market_symbol, market_quotes.get(market_symbol)))
    ]

    stock_change = _round((quote or {}).get("daily_change"), 2)
    change_by_symbol = {
        item["symbol"]: item.get("daily_change_pct")
        for item in benchmarks
        if item.get("symbol")
    }
    relative_move = {
        "ticker_daily_change_pct": stock_change,
        "vs_spy_pct": _round(stock_change - change_by_symbol["SPY"], 2)
        if stock_change is not None and change_by_symbol.get("SPY") is not None
        else None,
        "vs_qqq_pct": _round(stock_change - change_by_symbol["QQQ"], 2)
        if stock_change is not None and change_by_symbol.get("QQQ") is not None
        else None,
        "vs_sector_proxy_pct": _round(stock_change - change_by_symbol[sector_proxy], 2)
        if stock_change is not None and sector_proxy and change_by_symbol.get(sector_proxy) is not None
        else None,
    }

    sector_snapshot = _compact_sector_snapshot(compact_profile.get("sector"), sector_performance)

    return {
        "available": bool(benchmarks or sector_snapshot),
        "usage": (
            "Use as background context only. Mention market or sector backdrop naturally when relevant; "
            "do not expose as a standalone section and do not imply precise move attribution."
        ),
        "market_tone": _market_tone(benchmarks),
        "company_profile": compact_profile,
        "benchmarks": benchmarks,
        "sector_snapshot": sector_snapshot,
        "relative_move": relative_move,
    }


def _compact_technical(technical: dict[str, Any]) -> dict[str, Any]:
    if not technical or technical.get("error"):
        return {
            "available": False,
            "error": technical.get("error") if isinstance(technical, dict) else "missing",
        }

    current = technical.get("current") or {}
    derived = technical.get("derived") or {}
    sr = technical.get("support_resistance") or {}
    trend = technical.get("trend_summary") or {}
    return {
        "available": True,
        "price": _round(current.get("price")),
        "rsi_14": _round(current.get("rsi_14"), 1),
        "sma_20": _round(current.get("sma_20")),
        "sma_50": _round(current.get("sma_50")),
        "sma_200": _round(current.get("sma_200")),
        "ma_alignment": derived.get("ma_alignment"),
        "trend_direction": derived.get("trend_direction"),
        "trend_strength": derived.get("trend_strength"),
        "rsi_zone": derived.get("rsi_zone"),
        "macd_cross": derived.get("macd_cross"),
        "volume_ratio": derived.get("volume_ratio"),
        "volume_trend": derived.get("volume_trend"),
        "price_change_5d": trend.get("price_change_5d"),
        "price_change_20d": trend.get("price_change_20d"),
        "support_1": sr.get("support_1"),
        "resistance_1": sr.get("resistance_1"),
        "recent_price_path": _compact_recent_price_path(technical.get("ohlcv")),
    }


def _technical_bias_text(derived: dict[str, Any]) -> str:
    ma_alignment = derived.get("ma_alignment")
    trend_direction = derived.get("trend_direction")
    if ma_alignment == "bullish":
        return "偏强"
    if ma_alignment == "bearish":
        return "偏弱"
    if trend_direction == "up":
        return "偏强"
    if trend_direction == "down":
        return "偏弱"
    return "震荡"


def _ma_state_text(derived: dict[str, Any]) -> str:
    ma_alignment = derived.get("ma_alignment")
    trend_direction = derived.get("trend_direction")
    if ma_alignment == "bullish":
        return "价格与 20/50/200 日均线呈多头排列"
    if ma_alignment == "bearish":
        return "价格与 20/50/200 日均线呈空头排列"
    if trend_direction == "up":
        return "价格位于短期均线上方，趋势有修复迹象"
    if trend_direction == "down":
        return "价格仍在短期均线下方，趋势承压"
    return "价格围绕主要均线震荡，方向还不明确"


def _rsi_state_text(rsi: float | None, rsi_zone: str | None) -> str:
    if rsi is None:
        return "RSI 暂无可用读数"
    if rsi_zone == "overbought" or rsi >= 70:
        zone = "偏热"
    elif rsi_zone == "oversold" or rsi <= 30:
        zone = "偏冷"
    else:
        zone = "中性"
    return "RSI 14 为 %.1f，处于%s区间" % (rsi, zone)


def _macd_state_text(
    current: dict[str, Any],
    derived: dict[str, Any],
    trend: dict[str, Any],
) -> str:
    macd_cross = derived.get("macd_cross") or trend.get("macd_recent_cross")
    histogram = _round(current.get("macd_histogram"), 4)
    if macd_cross == "bullish_cross":
        return "MACD 近期出现金叉"
    if macd_cross == "bearish_cross":
        return "MACD 近期出现死叉"
    direction = trend.get("macd_histogram_direction")
    if direction == "expanding":
        return "MACD 柱体扩张，动能变化需要继续观察"
    if direction == "contracting":
        return "MACD 柱体收敛，短线动能有所降温"
    if histogram is not None:
        return "MACD 暂无明确交叉，柱体为 %.2f" % histogram
    return "MACD 暂无可用读数"


def _build_technical_summary(
    current: dict[str, Any],
    derived: dict[str, Any],
    trend: dict[str, Any],
    key_levels: dict[str, float | None],
    signals: list[TechnicalMonitorSignal],
) -> str:
    bias = _technical_bias_text(derived)
    price = key_levels.get("current_price")
    support = key_levels.get("support_1")
    resistance = key_levels.get("resistance_1")
    rsi = _round(current.get("rsi_14"), 1)
    volume_ratio = _safe_float(derived.get("volume_ratio"))
    if volume_ratio is None:
        volume_ratio = _safe_float(trend.get("volume_vs_avg"))

    parts = [
        "技术面整体%s：%s" % (bias, _ma_state_text(derived)),
        "动能上，%s，%s" % (_rsi_state_text(rsi, derived.get("rsi_zone")), _macd_state_text(current, derived, trend)),
    ]

    level_bits = []
    if price is not None:
        level_bits.append("当前价 %s" % _format_price(price))
    if support is not None:
        level_bits.append("最近支撑 %s" % _format_price(support))
    if resistance is not None:
        level_bits.append("最近阻力 %s" % _format_price(resistance))
    if level_bits:
        parts.append("价位上，%s" % "，".join(level_bits))

    if volume_ratio is not None and (volume_ratio >= 1.3 or volume_ratio <= 0.75):
        parts.append("成交量约为 20 日均量的 %.1f 倍" % volume_ratio)

    if signals:
        titles = "、".join(signal.title for signal in signals[:3])
        parts.append("今日硬信号包括 %s" % titles)

    summary = "；".join(parts)
    if not summary.endswith("。"):
        summary += "。"
    return summary[:500]


def _find_signal(signals: list[TechnicalMonitorSignal], *signal_ids: str) -> TechnicalMonitorSignal | None:
    wanted = set(signal_ids)
    for signal in signals:
        if signal.id in wanted:
            return signal
    return None


def _build_trend_dimension(
    derived: dict[str, Any],
    key_levels: dict[str, float | None],
) -> TechnicalViewDimension:
    ma_alignment = derived.get("ma_alignment")
    trend_direction = derived.get("trend_direction")
    price = key_levels.get("current_price")
    ma20 = key_levels.get("sma_20")
    ma50 = key_levels.get("sma_50")
    ma200 = key_levels.get("sma_200")

    if ma_alignment == "bullish":
        state = "偏强"
        explanation = "价格位于 20/50/200 日均线上方，短中长期均线方向一致，说明趋势结构仍由买盘主导。"
    elif ma_alignment == "bearish":
        state = "偏弱"
        explanation = "价格位于主要均线下方，短中长期趋势同时承压，反弹需要先收复短期均线。"
    elif trend_direction == "up":
        state = "修复"
        explanation = "价格正在向短期均线上方修复，但均线结构还没有形成清晰多头排列。"
    elif trend_direction == "down":
        state = "承压"
        explanation = "价格仍在短期均线下方运行，说明趋势尚未摆脱下行压力。"
    else:
        state = "震荡"
        explanation = "价格围绕主要均线波动，当前趋势方向还不够清晰。"

    level_bits = []
    if price is not None:
        level_bits.append("当前价 %s" % _format_price(price))
    if ma20 is not None:
        level_bits.append("MA20 %s" % _format_price(ma20))
    if ma50 is not None:
        level_bits.append("MA50 %s" % _format_price(ma50))
    if ma200 is not None:
        level_bits.append("MA200 %s" % _format_price(ma200))
    if level_bits:
        explanation = "%s。关键均线：%s。" % (explanation.rstrip("。"), " / ".join(level_bits))

    return TechnicalViewDimension(label="趋势", state=state, explanation=explanation[:260])


def _build_momentum_dimension(
    current: dict[str, Any],
    derived: dict[str, Any],
    trend: dict[str, Any],
) -> TechnicalViewDimension:
    rsi = _round(current.get("rsi_14"), 1)
    rsi_zone = derived.get("rsi_zone")
    macd_cross = derived.get("macd_cross") or trend.get("macd_recent_cross")
    price_change_5d = _safe_float(trend.get("price_change_5d"))
    macd_text = _macd_state_text(current, derived, trend)

    if rsi is not None and rsi >= 70:
        state = "偏热"
        explanation = "RSI 14 已到 %.1f，短线情绪偏热，继续上冲时更容易出现回踩验证。" % rsi
    elif rsi is not None and rsi <= 30:
        state = "偏冷"
        explanation = "RSI 14 已到 %.1f，抛压偏极端，后续重点看是否出现止跌修复。" % rsi
    elif price_change_5d is not None and price_change_5d >= 8:
        state = "升温过快"
        explanation = "近 5 个交易日上涨 %.1f%%，短线动能很强，但追涨资金也更容易带来获利回吐。" % price_change_5d
    elif price_change_5d is not None and price_change_5d <= -8:
        state = "降温过快"
        explanation = "近 5 个交易日下跌 %.1f%%，短线抛压较重，需要先观察是否止跌。" % abs(price_change_5d)
    elif macd_cross == "bullish_cross":
        state = "转强"
        explanation = "MACD 近期出现金叉，说明短线动能开始从弱转强。"
    elif macd_cross == "bearish_cross":
        state = "转弱"
        explanation = "MACD 近期出现死叉，说明短线动能正在降温。"
    elif rsi_zone == "overbought":
        state = "偏热"
        explanation = "RSI 处在偏热区间，后续需要关注涨速是否放缓。"
    elif rsi_zone == "oversold":
        state = "偏冷"
        explanation = "RSI 处在偏冷区间，后续需要关注是否出现修复。"
    else:
        state = "中性"
        explanation = "动能没有进入明显过热或过冷区间，方向更多取决于价格能否突破或跌破关键位。"

    indicator_bits = []
    if rsi is not None:
        indicator_bits.append("RSI 14 为 %.1f" % rsi)
    if macd_text:
        indicator_bits.append(macd_text)
    if indicator_bits:
        explanation = "%s。指标读数：%s。" % (explanation.rstrip("。"), "；".join(indicator_bits))

    return TechnicalViewDimension(label="动能", state=state, explanation=explanation[:360])


def _build_location_dimension(
    signals: list[TechnicalMonitorSignal],
    key_levels: dict[str, float | None],
) -> TechnicalViewDimension:
    price = key_levels.get("current_price")
    support = key_levels.get("support_1")
    resistance = key_levels.get("resistance_1")
    breakout = _find_signal(signals, "price_breakout_20d")
    breakdown = _find_signal(signals, "price_breakdown_20d")
    false_breakout = _find_signal(signals, "false_breakout_20d")
    false_breakdown = _find_signal(signals, "false_breakdown_20d")
    near_support = _find_signal(signals, "near_support_1")
    near_resistance = _find_signal(signals, "near_resistance_1")

    if breakout and breakout.reference is not None:
        state = "突破区"
        explanation = "收盘价站上前 20 日高点 %s，当前位置的关键不是继续追高，而是看突破位能否守住。" % _format_price(breakout.reference)
    elif breakdown and breakdown.reference is not None:
        state = "破位区"
        explanation = "收盘价跌破前 20 日低点 %s，结构已经转弱，后续重点看能否快速收回。" % _format_price(breakdown.reference)
    elif false_breakout:
        state = "压力区"
        explanation = "盘中冲高后未能收在前高上方，说明上方抛压仍然需要消化。"
    elif false_breakdown:
        state = "支撑区"
        explanation = "盘中跌破后收回，说明下方可能存在承接，但还需要后续确认。"
    elif near_resistance and resistance is not None:
        state = "接近压力"
        explanation = "价格距离最近阻力位 %s 不到 2%%，后续看能否放量突破。" % _format_price(resistance)
    elif near_support and support is not None:
        state = "接近支撑"
        explanation = "价格距离最近支撑位 %s 不到 2%%，后续看能否守住。" % _format_price(support)
    elif support is not None and resistance is not None:
        state = "区间中部"
        explanation = "价格位于支撑 %s 与阻力 %s 之间，短线还在等待方向选择。" % (
            _format_price(support),
            _format_price(resistance),
        )
    elif price is not None:
        state = "待确认"
        explanation = "当前价 %s 附近缺少清晰支撑/阻力参照，需要结合均线和成交量继续观察。" % _format_price(price)
    else:
        state = "数据不足"
        explanation = "缺少足够价格位置数据，暂时无法判断当前处在突破、支撑还是压力区。"

    return TechnicalViewDimension(label="位置", state=state, explanation=explanation[:260])


def _build_volatility_dimension(
    derived: dict[str, Any],
    trend: dict[str, Any],
) -> TechnicalViewDimension:
    bb_position = derived.get("bb_position")
    volume_ratio = _safe_float(derived.get("volume_ratio"))
    if volume_ratio is None:
        volume_ratio = _safe_float(trend.get("volume_vs_avg"))

    if derived.get("bb_squeeze"):
        state = "收敛"
        explanation = "布林带宽度低于近 20 日均值，说明波动正在压缩，后续一旦突破或跌破，波动可能放大。"
    elif bb_position == "above_upper":
        state = "扩张向上"
        explanation = "价格站上布林上轨，说明短线波动向上扩张，但也需要防范冲高后的回落。"
    elif bb_position == "below_lower":
        state = "扩张向下"
        explanation = "价格跌破布林下轨，说明短线波动向下扩张，结构偏弱。"
    elif volume_ratio is not None and volume_ratio >= 1.5:
        state = "放量"
        explanation = "成交量约为 20 日均量的 %.1f 倍，说明今天的价格变化有较强参与度。" % volume_ratio
    elif volume_ratio is not None and volume_ratio <= 0.7:
        state = "缩量"
        explanation = "成交量只有 20 日均量的 %.1f 倍，价格变化的确认度需要打折。" % volume_ratio
    else:
        state = "正常"
        explanation = "波动和成交量暂时没有明显异常，仍以关键价位的得失作为主要观察线索。"

    if volume_ratio is not None:
        volume_text = "成交量约为 20 日均量的 %.1f 倍。" % volume_ratio
        if volume_ratio >= 1.5:
            volume_text = "成交量约为 20 日均量的 %.1f 倍，参与度偏高。" % volume_ratio
        elif volume_ratio <= 0.7:
            volume_text = "成交量只有 20 日均量的 %.1f 倍，价格变化确认度需要打折。" % volume_ratio
        if volume_text not in explanation:
            explanation = "%s。%s" % (explanation.rstrip("。"), volume_text)

    return TechnicalViewDimension(label="波动", state=state, explanation=explanation[:360])


def _technical_view_regime(
    signals: list[TechnicalMonitorSignal],
    derived: dict[str, Any],
    trend: dict[str, Any],
) -> str:
    price_change_5d = _safe_float(trend.get("price_change_5d"))
    if _find_signal(signals, "price_breakout_20d", "reclaim_sma_20", "reclaim_sma_50"):
        return "breakout_confirmation"
    if _find_signal(signals, "price_breakdown_20d", "lose_sma_20", "lose_sma_50"):
        return "breakdown"
    if price_change_5d is not None and abs(price_change_5d) >= 12:
        return "overextended"
    if derived.get("ma_alignment") == "bullish":
        return "uptrend"
    if derived.get("ma_alignment") == "bearish":
        return "downtrend"
    if derived.get("trend_direction") == "down":
        return "pullback"
    return "range_bound"


def _technical_view_verdict(
    regime: str,
    trend_dimension: TechnicalViewDimension,
    momentum_dimension: TechnicalViewDimension,
    location_dimension: TechnicalViewDimension,
    volatility_dimension: TechnicalViewDimension,
) -> str:
    if regime == "breakout_confirmation":
        first = "当前技术面偏强，但核心不在追高，而在确认突破后的承接质量。"
    elif regime == "uptrend":
        first = "当前技术面处在上升趋势延续阶段，主要均线和价格结构仍偏多头。"
    elif regime == "overextended":
        first = "当前技术面进入涨跌过快后的消化阶段，趋势可能延续，但短线波动和回踩概率上升。"
    elif regime == "breakdown":
        first = "当前技术面已经转弱，价格跌破关键结构后需要先看能否修复。"
    elif regime == "downtrend":
        first = "当前技术面仍处在下降趋势承压阶段，反弹需要先收复短期均线。"
    elif regime == "pullback":
        first = "当前技术面处在回调观察阶段，趋势尚未完全扭转，但短期均线和支撑位的得失会决定后续方向。"
    else:
        first = "当前技术面处在区间震荡阶段，趋势、动能和价格位置还没有形成一致方向。"

    def dimension_sentence(prefix: str, dimension: TechnicalViewDimension, limit: int = 116) -> str:
        state = dimension.state or "待确认"
        explanation = (dimension.explanation or "").strip()
        if len(explanation) > limit:
            explanation = explanation[:limit].rstrip("，。； ") + "。"
        if explanation:
            return "%s，当前为%s，%s" % (prefix, state, explanation)
        return "%s，当前为%s。" % (prefix, state)

    paragraph = "".join(
        [
            first,
            dimension_sentence("趋势上", trend_dimension),
            dimension_sentence("动能上", momentum_dimension),
            dimension_sentence("位置上", location_dimension),
            dimension_sentence("波动上", volatility_dimension),
        ]
    )
    return paragraph[:650]


def _build_technical_view(
    current: dict[str, Any],
    derived: dict[str, Any],
    trend: dict[str, Any],
    key_levels: dict[str, float | None],
    signals: list[TechnicalMonitorSignal],
) -> TechnicalView:
    if not current and not key_levels and not signals:
        return TechnicalView()

    trend_dimension = _build_trend_dimension(derived, key_levels)
    momentum_dimension = _build_momentum_dimension(current, derived, trend)
    location_dimension = _build_location_dimension(signals, key_levels)
    volatility_dimension = _build_volatility_dimension(derived, trend)
    regime = _technical_view_regime(signals, derived, trend)

    return TechnicalView(
        regime=regime,  # type: ignore[arg-type]
        verdict=_technical_view_verdict(
            regime,
            trend_dimension,
            momentum_dimension,
            location_dimension,
            volatility_dimension,
        ),
        trend=trend_dimension,
        momentum=momentum_dimension,
        location=location_dimension,
        volatility=volatility_dimension,
    )


def _build_technical_monitor(technical: dict[str, Any]) -> TechnicalMonitor:
    if not technical or technical.get("error"):
        return TechnicalMonitor()

    ohlcv = [item for item in (technical.get("ohlcv") or []) if isinstance(item, dict)]
    current = technical.get("current") or {}
    derived = technical.get("derived") or {}
    sr = technical.get("support_resistance") or {}
    trend = technical.get("trend_summary") or {}
    indicators = technical.get("indicators") or {}

    current_price = _round(current.get("price"))
    if current_price is None and ohlcv:
        current_price = _round(ohlcv[-1].get("close"))

    key_levels = {
        "current_price": current_price,
        "support_1": _round(sr.get("support_1")),
        "support_2": _round(sr.get("support_2")),
        "resistance_1": _round(sr.get("resistance_1")),
        "resistance_2": _round(sr.get("resistance_2")),
        "sma_20": _round(current.get("sma_20")),
        "sma_50": _round(current.get("sma_50")),
        "sma_200": _round(current.get("sma_200")),
        "bb_upper": _round(current.get("bb_upper")),
        "bb_lower": _round(current.get("bb_lower")),
    }

    signals: list[TechnicalMonitorSignal] = []
    seen_ids: set[str] = set()

    def add_signal(
        signal_id: str,
        category: str,
        title: str,
        detail: str,
        *,
        price: float | None = None,
        reference: float | None = None,
    ) -> None:
        if signal_id in seen_ids or len(signals) >= 12:
            return
        seen_ids.add(signal_id)
        signals.append(
            TechnicalMonitorSignal(
                id=signal_id,
                category=category,  # type: ignore[arg-type]
                title=title,
                detail=detail[:260],
                price=price,
                reference=reference,
            )
        )

    last = ohlcv[-1] if ohlcv else {}
    previous = ohlcv[-2] if len(ohlcv) >= 2 else {}
    close = _ohlcv_float(last, "close")
    high = _ohlcv_float(last, "high")
    low = _ohlcv_float(last, "low")
    previous_close = _ohlcv_float(previous, "close")

    if len(ohlcv) >= 21 and close is not None:
        previous_20 = ohlcv[-21:-1]
        previous_highs = [_safe_float(item.get("high")) for item in previous_20]
        previous_lows = [_safe_float(item.get("low")) for item in previous_20]
        previous_highs = [value for value in previous_highs if value is not None]
        previous_lows = [value for value in previous_lows if value is not None]
        previous_20_high = round(max(previous_highs), 2) if previous_highs else None
        previous_20_low = round(min(previous_lows), 2) if previous_lows else None

        if previous_20_high is not None:
            if close > previous_20_high:
                add_signal(
                    "price_breakout_20d",
                    "price",
                    "20 日高点突破",
                    "收盘价 %s 站上前 20 日高点 %s，接下来重点看突破位能否守住。"
                    % (_format_price(close), _format_price(previous_20_high)),
                    price=close,
                    reference=previous_20_high,
                )
            elif high is not None and high > previous_20_high and close < previous_20_high:
                add_signal(
                    "false_breakout_20d",
                    "structure",
                    "假突破",
                    "盘中冲过前 20 日高点 %s，但收盘回到其下方，说明上方抛压需要继续观察。"
                    % _format_price(previous_20_high),
                    price=close,
                    reference=previous_20_high,
                )

        if previous_20_low is not None:
            if close < previous_20_low:
                add_signal(
                    "price_breakdown_20d",
                    "price",
                    "20 日低点跌破",
                    "收盘价 %s 跌破前 20 日低点 %s，短线结构转弱。"
                    % (_format_price(close), _format_price(previous_20_low)),
                    price=close,
                    reference=previous_20_low,
                )
            elif low is not None and low < previous_20_low and close > previous_20_low:
                add_signal(
                    "false_breakdown_20d",
                    "structure",
                    "假跌破",
                    "盘中跌破前 20 日低点 %s，但收盘收回其上方，需要观察是否形成反抽。"
                    % _format_price(previous_20_low),
                    price=close,
                    reference=previous_20_low,
                )

    if close is not None and previous_close is not None:
        for period, key in [(20, "sma_20"), (50, "sma_50"), (200, "sma_200")]:
            sma_now = key_levels.get(key)
            sma_prev = _indicator_value(indicators, key, offset=2)
            if sma_now is None or sma_prev is None:
                continue
            if previous_close <= sma_prev and close > sma_now:
                add_signal(
                    "reclaim_%s" % key,
                    "moving_average",
                    "站回 %s 日均线" % period,
                    "收盘价 %s 重新站上 %s 日均线 %s，短线趋势有修复迹象。"
                    % (_format_price(close), period, _format_price(sma_now)),
                    price=close,
                    reference=sma_now,
                )
            elif previous_close >= sma_prev and close < sma_now:
                add_signal(
                    "lose_%s" % key,
                    "moving_average",
                    "跌破 %s 日均线" % period,
                    "收盘价 %s 跌破 %s 日均线 %s，趋势支撑被测试。"
                    % (_format_price(close), period, _format_price(sma_now)),
                    price=close,
                    reference=sma_now,
                )

    sma_cross = derived.get("sma_50_200_cross")
    if sma_cross == "golden_cross":
        add_signal(
            "golden_cross_50_200",
            "moving_average",
            "50/200 日均线金叉",
            "50 日均线向上穿越 200 日均线，中期趋势结构转强。",
            price=key_levels.get("sma_50"),
            reference=key_levels.get("sma_200"),
        )
    elif sma_cross == "death_cross":
        add_signal(
            "death_cross_50_200",
            "moving_average",
            "50/200 日均线死叉",
            "50 日均线向下穿越 200 日均线，中期趋势结构转弱。",
            price=key_levels.get("sma_50"),
            reference=key_levels.get("sma_200"),
        )

    ma_alignment = derived.get("ma_alignment")
    if ma_alignment == "bullish":
        add_signal(
            "ma_alignment_bullish",
            "moving_average",
            "均线多头排列",
            "价格、20 日、50 日、200 日均线呈多头排列，趋势结构仍偏强。",
            price=close,
            reference=key_levels.get("sma_20"),
        )
    elif ma_alignment == "bearish":
        add_signal(
            "ma_alignment_bearish",
            "moving_average",
            "均线空头排列",
            "价格、20 日、50 日、200 日均线呈空头排列，趋势结构仍偏弱。",
            price=close,
            reference=key_levels.get("sma_20"),
        )

    volume_ratio = _safe_float(derived.get("volume_ratio"))
    if volume_ratio is None:
        volume_ratio = _safe_float(trend.get("volume_vs_avg"))
    if volume_ratio is not None and close is not None and previous_close is not None:
        change = _pct_change(close, previous_close) or 0
        if volume_ratio >= 1.5 and change > 0:
            add_signal(
                "high_volume_up",
                "volume",
                "放量上涨",
                "成交量约为 20 日均量的 %.1f 倍，且收盘上涨 %.1f%%。" % (volume_ratio, change),
                price=close,
                reference=previous_close,
            )
        elif volume_ratio >= 1.5 and change < 0:
            add_signal(
                "high_volume_down",
                "volume",
                "放量下跌",
                "成交量约为 20 日均量的 %.1f 倍，且收盘下跌 %.1f%%。" % (volume_ratio, abs(change)),
                price=close,
                reference=previous_close,
            )
        elif volume_ratio <= 0.7 and change > 0:
            add_signal(
                "low_volume_up",
                "volume",
                "缩量上涨",
                "成交量只有 20 日均量的 %.1f 倍，反弹确认度需要继续观察。" % volume_ratio,
                price=close,
                reference=previous_close,
            )

    rsi_now = _round(current.get("rsi_14"), 1)
    if rsi_now is None:
        rsi_now = _round(_indicator_value(indicators, "rsi_14"), 1)
    rsi_prev = _round(_indicator_value(indicators, "rsi_14", offset=2), 1)
    if rsi_now is not None:
        if rsi_now >= 70:
            add_signal(
                "rsi_overbought",
                "momentum",
                "RSI 超买",
                "RSI 14 已到 %.1f，短线动能偏热，注意追高后的回撤风险。" % rsi_now,
                price=rsi_now,
                reference=70,
            )
        elif rsi_now <= 30:
            add_signal(
                "rsi_oversold",
                "momentum",
                "RSI 超卖",
                "RSI 14 已到 %.1f，短线抛压偏极端，注意是否出现修复。" % rsi_now,
                price=rsi_now,
                reference=30,
            )
        elif rsi_prev is not None and rsi_prev < 30 <= rsi_now:
            add_signal(
                "rsi_reclaim_30",
                "momentum",
                "RSI 收回 30",
                "RSI 从超卖区回到 %.1f，短线动能开始修复。" % rsi_now,
                price=rsi_now,
                reference=30,
            )
        elif rsi_prev is not None and rsi_prev < 50 <= rsi_now:
            add_signal(
                "rsi_reclaim_50",
                "momentum",
                "RSI 重回中线",
                "RSI 回到 %.1f，动能从弱势区间修复到中性以上。" % rsi_now,
                price=rsi_now,
                reference=50,
            )

    macd_cross = derived.get("macd_cross") or trend.get("macd_recent_cross")
    if macd_cross == "bullish_cross":
        add_signal(
            "macd_bullish_cross",
            "momentum",
            "MACD 金叉",
            "MACD 线向上穿越信号线，短线动能转强。",
            price=_round(current.get("macd_level"), 4),
            reference=_round(current.get("macd_signal"), 4),
        )
    elif macd_cross == "bearish_cross":
        add_signal(
            "macd_bearish_cross",
            "momentum",
            "MACD 死叉",
            "MACD 线向下穿越信号线，短线动能转弱。",
            price=_round(current.get("macd_level"), 4),
            reference=_round(current.get("macd_signal"), 4),
        )

    bb_position = derived.get("bb_position")
    if bb_position == "above_upper":
        add_signal(
            "bb_above_upper",
            "volatility",
            "站上布林上轨",
            "收盘价高于布林上轨 %s，短线波动扩张。"
            % _format_price(key_levels.get("bb_upper")),
            price=close,
            reference=key_levels.get("bb_upper"),
        )
    elif bb_position == "below_lower":
        add_signal(
            "bb_below_lower",
            "volatility",
            "跌破布林下轨",
            "收盘价低于布林下轨 %s，短线波动扩张且价格偏弱。"
            % _format_price(key_levels.get("bb_lower")),
            price=close,
            reference=key_levels.get("bb_lower"),
        )
    if derived.get("bb_squeeze"):
        add_signal(
            "bb_squeeze",
            "volatility",
            "布林带收窄",
            "布林带宽度低于近 20 日均值，后续可能出现波动放大。",
            price=close,
            reference=None,
        )

    price_change_5d = _safe_float(trend.get("price_change_5d"))
    if price_change_5d is not None:
        if price_change_5d >= 8:
            add_signal(
                "fast_rally_5d",
                "price",
                "5 日涨幅过快",
                "近 5 个交易日上涨 %.1f%%，短线获利盘压力可能上升。" % price_change_5d,
                price=close,
                reference=None,
            )
        elif price_change_5d <= -8:
            add_signal(
                "fast_selloff_5d",
                "price",
                "5 日跌幅过快",
                "近 5 个交易日下跌 %.1f%%，需要观察是否止跌或继续破位。" % abs(price_change_5d),
                price=close,
                reference=None,
            )

    support_1 = key_levels.get("support_1")
    resistance_1 = key_levels.get("resistance_1")
    if close is not None and close > 0 and resistance_1 is not None and 0 <= (resistance_1 - close) / close <= 0.02:
        add_signal(
            "near_resistance_1",
            "price",
            "接近阻力位",
            "价格距离最近阻力位 %s 不到 2%%，需要观察能否放量突破。"
            % _format_price(resistance_1),
            price=close,
            reference=resistance_1,
        )
    if close is not None and close > 0 and support_1 is not None and 0 <= (close - support_1) / close <= 0.02:
        add_signal(
            "near_support_1",
            "price",
            "接近支撑位",
            "价格距离最近支撑位 %s 不到 2%%，需要观察是否守住。"
            % _format_price(support_1),
            price=close,
            reference=support_1,
        )

    return TechnicalMonitor(
        summary=_build_technical_summary(current, derived, trend, key_levels, signals),
        technical_view=_build_technical_view(current, derived, trend, key_levels, signals),
        signals=signals,
        key_levels=key_levels,
        updated_at=str(last.get("date") or ""),
    )


def _company_keywords(profile: dict[str, Any] | None) -> list[str]:
    compact = _compact_company_profile(profile)
    company_name = str(compact.get("company_name") or "")
    tokens = []
    for raw in company_name.replace(",", " ").replace(".", " ").split():
        token = raw.strip().lower()
        if len(token) >= 4 and token not in {"inc", "corp", "corporation", "company", "limited", "plc"}:
            tokens.append(token)
    return list(dict.fromkeys(tokens[:4]))


def _is_relevant_ticker_news(symbol: str, item: dict[str, Any], profile: dict[str, Any] | None) -> bool:
    text = " ".join(
        str(item.get(key) or "")
        for key in ("title", "text", "url", "symbol")
    ).lower()
    lower_symbol = symbol.lower()
    exact_symbol_markers = (
        "$%s" % lower_symbol,
        "(%s)" % lower_symbol,
        "%s's" % lower_symbol,
        "nasdaq:%s" % lower_symbol,
        "nyse:%s" % lower_symbol,
        "symbol=%s" % lower_symbol,
    )
    if any(marker in text for marker in exact_symbol_markers):
        return True
    if any(keyword in text for keyword in _company_keywords(profile)):
        return True

    # Some FMP ticker tags are keyword-like for common English symbols such as
    # TEAM. Avoid polluting company news with unrelated "team up" press releases.
    return symbol not in {"TEAM"}


def _relevant_news_items(
    symbol: str,
    result: dict[str, Any],
    profile: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    return [
        item
        for item in (result.get("news") or [])
        if isinstance(item, dict) and _is_relevant_ticker_news(symbol, item, profile)
    ]


def _news_sort_key(item: dict[str, Any]) -> str:
    return str(item.get("publishedDate") or "")


def _compact_news(symbol: str, source_refs: list[SourceRef], profile: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    result = get_fmp_news(days=NEWS_LOOKBACK_DAYS, symbols=[symbol])
    if result.get("status") == "error":
        logger.warning("news fetch failed for %s: %s", symbol, result.get("error"))
        return []

    raw_news = _relevant_news_items(symbol, result, profile)
    raw_news = sorted(raw_news, key=_news_sort_key, reverse=True)

    compact: list[dict[str, Any]] = []
    for idx, item in enumerate(raw_news[:NEWS_ITEM_LIMIT], start=1):
        ref_id = "news_%d" % idx
        source_refs.append(
            _source_ref(
                ref_id,
                "news",
                item.get("title", ""),
                item.get("url", ""),
                item.get("publishedDate", ""),
            )
        )
        compact.append({
            "id": ref_id,
            "title": item.get("title", ""),
            "summary": (item.get("text") or "")[:260],
            "source": item.get("source", ""),
            "published_at": item.get("publishedDate", ""),
        })
    return compact


def _compact_earnings(symbol: str, earnings: list[dict[str, Any]], source_refs: list[SourceRef]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for idx, item in enumerate([e for e in earnings if (e.get("symbol") or "").upper() == symbol][:3], start=1):
        ref_id = "earnings_%d" % idx
        source_refs.append(
            _source_ref(
                ref_id,
                "event",
                "%s earnings calendar" % symbol,
                "",
                item.get("date", ""),
            )
        )
        out.append({
            "id": ref_id,
            "date": item.get("date", ""),
            "time": item.get("time", ""),
            "eps_estimated": item.get("epsEstimated"),
            "revenue_estimated": item.get("revenueEstimated"),
        })
    return out


def _compact_macro_events(events: list[dict[str, Any]], source_refs: list[SourceRef]) -> list[dict[str, Any]]:
    key_events = [e for e in events if e.get("is_key_event")][:5]
    out: list[dict[str, Any]] = []
    for idx, item in enumerate(key_events, start=1):
        ref_id = "macro_%d" % idx
        source_refs.append(
            _source_ref(
                ref_id,
                "macro_event",
                item.get("event", ""),
                "",
                item.get("date", ""),
            )
        )
        out.append({
            "id": ref_id,
            "date": item.get("date", ""),
            "event": item.get("event", ""),
            "estimate": item.get("estimate"),
            "previous": item.get("previous"),
            "impact": item.get("impact", ""),
        })
    return out


def _compact_social(symbol: str, digest: DailyDigest | None, source_refs: list[SourceRef]) -> dict[str, Any]:
    if not digest:
        return {"available": False}

    thesis = None
    for item in digest.ticker_theses:
        if item.ticker.upper() == symbol:
            thesis = item
            break

    watchpoints = [
        w for w in digest.watchpoints
        if symbol in {s.upper() for s in w.related_tickers}
    ][:3]

    if not thesis and not watchpoints:
        return {
            "available": True,
            "digest_date": digest.date,
            "discussion_level": "low",
            "summary": "",
            "watchpoints": [],
        }

    ref_id = "social_1"
    source_refs.append(
        _source_ref(
            ref_id,
            "social",
            "Twitter/KOL digest %s" % digest.date,
            "",
            digest.generated_at,
        )
    )

    return {
        "available": True,
        "digest_date": digest.date,
        "discussion_level": "high" if thesis and thesis.tweet_count >= 4 else "medium",
        "side": thesis.side if thesis else "",
        "tweet_count": thesis.tweet_count if thesis else 0,
        "primary_kols": thesis.primary_kols if thesis else [],
        "stance_summary": thesis.stance_summary if thesis else "",
        "synthesis_zh": thesis.synthesis_zh if thesis else "",
        "buy_count": thesis.buy_count if thesis else 0,
        "sell_count": thesis.sell_count if thesis else 0,
        "observation_count": thesis.observation_count if thesis else 0,
        "watchpoints": [
            {
                "title": w.title,
                "date_hint": w.date_hint,
                "why_it_matters_zh": w.why_it_matters_zh,
                "kols_watching": w.kols_watching,
            }
            for w in watchpoints
        ],
        "source_ref_id": ref_id,
    }


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    raw = str(value)[:10]
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _within_future_window(event_date: str | None, report_date: str, days: int = EVENT_LOOKAHEAD_DAYS) -> bool:
    parsed = _parse_date(event_date)
    start = _parse_date(report_date)
    if parsed is None or start is None:
        return True
    return start <= parsed <= start + timedelta(days=days)


def _slug(value: str) -> str:
    chars = [ch.lower() if ch.isalnum() else "-" for ch in value]
    return "-".join(part for part in "".join(chars).split("-") if part)


def _is_fomc_related(title: str) -> bool:
    upper = title.upper()
    return (
        "FOMC" in upper
        or "FED INTEREST RATE" in upper
        or "FED PRESS CONFERENCE" in upper
        or "FEDERAL RESERVE" in upper
    )


def _is_core_macro_event(title: str) -> bool:
    upper = title.upper()
    keywords = (
        "FOMC",
        "FED INTEREST RATE",
        "FED PRESS CONFERENCE",
        "FEDERAL RESERVE",
        "CPI",
        "PCE",
        "NONFARM",
        "PAYROLL",
        "UNEMPLOYMENT",
        "GDP",
        "ISM",
        "JOLTS",
    )
    return any(keyword in upper for keyword in keywords)


def _candidate_key(candidate: EventCandidate) -> str:
    if candidate.event_type == "macro" and candidate.event_date and _is_fomc_related(candidate.title):
        return "%s:macro:%s:fomc-meeting" % (candidate.symbol, candidate.event_date)
    if candidate.dedupe_key:
        return candidate.dedupe_key
    return "%s:%s:%s:%s" % (
        candidate.symbol,
        candidate.event_type,
        candidate.event_date or candidate.date_precision,
        _slug(candidate.title)[:80],
    )


def _stable_candidate_id(symbol: str, dedupe_key: str) -> str:
    digest = hashlib.sha1(dedupe_key.encode("utf-8")).hexdigest()[:10]
    return "%s_%s" % (symbol.lower(), digest)


def _normalize_event_candidate(
    candidate: EventCandidate,
    *,
    symbol: str,
    report_date: str,
) -> EventCandidate | None:
    if not candidate.title.strip():
        return None
    event_date = candidate.event_date[:10] if candidate.event_date else None
    if event_date and not _parse_date(event_date):
        event_date = None
    if not _within_future_window(event_date, report_date):
        return None

    normalized = candidate.model_copy(
        update={
            "symbol": candidate.symbol or symbol,
            "event_date": event_date,
            "source_ref_ids": list(dict.fromkeys(candidate.source_ref_ids)),
        }
    )
    dedupe_key = _candidate_key(normalized)
    if normalized.dedupe_key != dedupe_key:
        normalized = normalized.model_copy(update={"dedupe_key": dedupe_key})
    if not normalized.id:
        normalized = normalized.model_copy(update={"id": _stable_candidate_id(symbol, dedupe_key)})
    return normalized


def merge_event_candidates(
    candidates: list[EventCandidate],
    *,
    symbol: str,
    report_date: str,
    limit: int = 12,
) -> list[EventCandidate]:
    """Normalize, filter to the event window, dedupe, and sort candidates."""
    confidence_rank = {"high": 3, "medium": 2, "low": 1}
    precision_rank = {"exact": 3, "week": 2, "month": 1, "unknown": 0}
    merged: dict[str, EventCandidate] = {}

    for raw in candidates:
        candidate = _normalize_event_candidate(raw, symbol=symbol, report_date=report_date)
        if candidate is None:
            continue
        key = _candidate_key(candidate)
        existing = merged.get(key)
        if existing is None:
            merged[key] = candidate
            continue
        existing_score = (
            confidence_rank.get(existing.confidence, 0),
            precision_rank.get(existing.date_precision, 0),
            len(existing.source_ref_ids),
        )
        candidate_score = (
            confidence_rank.get(candidate.confidence, 0),
            precision_rank.get(candidate.date_precision, 0),
            len(candidate.source_ref_ids),
        )
        if candidate_score > existing_score:
            merged[key] = candidate

    def sort_key(item: EventCandidate) -> tuple[int, str, int, str]:
        parsed = _parse_date(item.event_date)
        date_bucket = 0 if parsed else 1
        date_value = item.event_date or "9999-99-99"
        priority = confidence_rank.get(item.confidence, 0)
        return (date_bucket, date_value, -priority, item.title)

    return sorted(merged.values(), key=sort_key)[:limit]


def _event_candidate(
    *,
    symbol: str,
    event_type: str,
    title: str,
    summary: str,
    why_it_matters: str,
    report_date: str,
    event_date: str | None = None,
    date_precision: str = "unknown",
    status: str = "scheduled",
    confidence: str = "medium",
    source_ref_ids: list[str] | None = None,
    source_type: str = "",
    metadata: dict[str, Any] | None = None,
) -> EventCandidate | None:
    try:
        candidate = EventCandidate(
            symbol=symbol,
            event_type=event_type,  # type: ignore[arg-type]
            event_date=event_date,
            date_precision=date_precision,  # type: ignore[arg-type]
            title=title,
            summary=summary,
            why_it_matters=why_it_matters,
            status=status,  # type: ignore[arg-type]
            confidence=confidence,  # type: ignore[arg-type]
            source_ref_ids=source_ref_ids or [],
            source_type=source_type,
            metadata=metadata or {},
        )
    except Exception:
        logger.warning("invalid event candidate generated for %s", symbol, exc_info=True)
        return None
    return _normalize_event_candidate(candidate, symbol=symbol, report_date=report_date)


def _earnings_event_candidates(
    symbol: str,
    earnings_events: list[dict[str, Any]],
    report_date: str,
) -> list[EventCandidate]:
    candidates: list[EventCandidate] = []
    for item in earnings_events:
        event_date = item.get("date") or None
        if not _within_future_window(event_date, report_date):
            continue
        title = "%s 财报日程" % symbol
        time_hint = item.get("time") or ""
        summary = "FMP 财报日历显示 %s 接下来有财报事件%s。" % (
            symbol,
            "，时段为 %s" % time_hint if time_hint else "",
        )
        why = "财报通常会更新收入、利润、指引和管理层表述，是短期波动和中期预期重估的重要节点。"
        candidate = _event_candidate(
            symbol=symbol,
            event_type="earnings",
            event_date=event_date,
            date_precision="exact" if event_date else "unknown",
            title=title,
            summary=summary,
            why_it_matters=why,
            report_date=report_date,
            confidence="high",
            source_ref_ids=[item.get("id", "")] if item.get("id") else [],
            source_type="fmp_earnings_calendar",
            metadata={
                "time": time_hint,
                "eps_estimated": item.get("eps_estimated"),
                "revenue_estimated": item.get("revenue_estimated"),
            },
        )
        if candidate:
            candidates.append(candidate)
    return candidates


def _macro_event_candidates(
    symbol: str,
    macro_events: list[dict[str, Any]],
    report_date: str,
) -> list[EventCandidate]:
    candidates: list[EventCandidate] = []
    fomc_items: list[dict[str, Any]] = []
    other_items: list[dict[str, Any]] = []

    for item in macro_events:
        event_date = item.get("date") or None
        if not _within_future_window(event_date, report_date):
            continue
        title = item.get("event") or "宏观日历事件"
        if not _is_core_macro_event(title):
            continue
        if _is_fomc_related(title):
            fomc_items.append(item)
        else:
            other_items.append(item)

    if fomc_items:
        first_date = fomc_items[0].get("date") or None
        source_ref_ids = [item.get("id", "") for item in fomc_items if item.get("id")]
        titles = [item.get("event") for item in fomc_items if item.get("event")]
        candidate = _event_candidate(
            symbol=symbol,
            event_type="macro",
            event_date=first_date,
            date_precision="exact" if first_date else "unknown",
            title="FOMC 利率决议与经济预测",
            summary="美联储同日公布利率决议、经济预测并召开新闻发布会，需要合并视为一个宏观事件包。",
            why_it_matters="它不是公司自身事件，但会直接影响高估值成长股的折现率、风险偏好和半导体板块估值环境。",
            report_date=report_date,
            confidence="high",
            source_ref_ids=source_ref_ids,
            source_type="macro_calendar",
            metadata={
                "events": titles,
            },
        )
        if candidate:
            candidates.append(candidate)

    for item in other_items[:2]:
        event_date = item.get("date") or None
        title = item.get("event") or "核心宏观事件"
        candidate = _event_candidate(
            symbol=symbol,
            event_type="macro",
            event_date=event_date,
            date_precision="exact" if event_date else "unknown",
            title=title,
            summary="宏观日历显示未来两周有 %s，可能影响指数、利率或风险偏好。" % title,
            why_it_matters="它不是公司自身事件，但可能改变持仓股票的市场背景和估值折现环境。",
            report_date=report_date,
            confidence="medium",
            source_ref_ids=[item.get("id", "")] if item.get("id") else [],
            source_type="macro_calendar",
            metadata={
                "estimate": item.get("estimate"),
                "previous": item.get("previous"),
                "impact": item.get("impact"),
            },
        )
        if candidate:
            candidates.append(candidate)
    return candidates


def _social_event_candidates(symbol: str, social: dict[str, Any], report_date: str) -> list[EventCandidate]:
    if not social.get("available"):
        return []
    ref_id = social.get("source_ref_id") or ""
    candidates: list[EventCandidate] = []
    for item in social.get("watchpoints") or []:
        title = item.get("title") or ""
        if not title:
            continue
        candidate = _event_candidate(
            symbol=symbol,
            event_type="social_watchpoint",
            title=title,
            summary=item.get("why_it_matters_zh") or "社交平台上有人在持续关注这个话题。",
            why_it_matters="这不是已确认日程，但代表当前投资者正在等待验证的公司相关叙事。",
            report_date=report_date,
            date_precision="unknown",
            status="tentative",
            confidence="medium",
            source_ref_ids=[ref_id] if ref_id else [],
            source_type="twitter_digest",
            metadata={
                "date_hint": item.get("date_hint"),
                "kols_watching": item.get("kols_watching") or [],
            },
        )
        if candidate:
            candidates.append(candidate)
    return candidates


def build_ticker_context(
    symbol: str,
    *,
    quote: dict[str, Any] | None,
    market_quotes: dict[str, dict[str, Any]],
    sector_performance: dict[str, Any] | None,
    earnings: list[dict[str, Any]],
    macro_events: list[dict[str, Any]],
    twitter_digest: DailyDigest | None,
    report_date: str,
) -> dict[str, Any]:
    """Collect and compact all V0 inputs for a ticker."""
    symbol = symbol.upper()
    source_refs: list[SourceRef] = [
        _source_ref("quote_1", "quote", "%s quote snapshot" % symbol),
        _source_ref("technical_1", "technical", "%s technical snapshot" % symbol),
        _source_ref("market_1", "market", "Market benchmark quote snapshot"),
    ]

    profile = _safe_company_profile(symbol)
    technical = get_technical_data(symbol)
    technical_monitor = _build_technical_monitor(technical)
    news_items = _compact_news(symbol, source_refs, profile)
    earnings_events = _compact_earnings(symbol, earnings, source_refs)
    compact_macro_events = _compact_macro_events(macro_events, source_refs)
    social = _compact_social(symbol, twitter_digest, source_refs)
    deterministic_events = merge_event_candidates(
        [
            *_earnings_event_candidates(symbol, earnings_events, report_date),
            *_macro_event_candidates(symbol, compact_macro_events, report_date),
            *_social_event_candidates(symbol, social, report_date),
        ],
        symbol=symbol,
        report_date=report_date,
    )
    report_start = _parse_date(report_date)

    context = {
        "symbol": symbol,
        "report_date": report_date,
        "quote": _compact_quote(symbol, quote),
        "market_context": _compact_market_context(
            symbol,
            quote=quote,
            profile=profile,
            market_quotes=market_quotes,
            sector_performance=sector_performance,
        ),
        "technical": _compact_technical(technical),
        "technical_monitor": technical_monitor.model_dump(mode="json"),
        "news_items": news_items,
        "earnings_events": earnings_events,
        "macro_events": compact_macro_events,
        "social": social,
        "event_candidates": [item.model_dump(mode="json") for item in deterministic_events],
        "event_window": {
            "start": report_date,
            "end": (report_start + timedelta(days=EVENT_LOOKAHEAD_DAYS)).isoformat() if report_start else "",
            "days": EVENT_LOOKAHEAD_DAYS,
            "intent": "Any company-related future event or monitoring trigger within the next 14 days.",
        },
    }

    context["source_refs"] = [s.model_dump(mode="json") for s in source_refs]
    return context
