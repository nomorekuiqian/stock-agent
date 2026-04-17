"""
Technical Analysis Data Tools

Fetches technical indicators from FMP (Financial Modeling Prep) API service.
Computes derived signals (MACD, Bollinger Bands, support/resistance, crossovers)
locally using pandas + numpy.

Usage:
    from app.shared.data_tools.technical import get_technical_data
    data = get_technical_data("AAPL")
"""

import threading
from datetime import datetime, timedelta
from typing import Any, Optional

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.shared.data_tools.market_data import safe_float
from app.shared.fmp_service import get_fmp_service

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Thread-safe cache helpers
# ---------------------------------------------------------------------------

_technical_cache: dict = {}
_technical_lock = threading.Lock()
CACHE_TTL_MINUTES = 15


def _get_cached(cache: dict, lock: threading.Lock, key: str) -> Optional[dict]:
    with lock:
        entry = cache.get(key)
        if entry and datetime.now() < entry["expires"]:
            return entry["data"]
    return None


def _set_cached(cache: dict, lock: threading.Lock, key: str, data: dict, ttl_min: int):
    with lock:
        cache[key] = {
            "data": data,
            "expires": datetime.now() + timedelta(minutes=ttl_min),
        }


# ---------------------------------------------------------------------------
# Local computation helpers (pandas + numpy, NO pandas-ta)
# ---------------------------------------------------------------------------

def _ema(series: pd.Series, span: int) -> pd.Series:
    """Compute exponential moving average."""
    return series.ewm(span=span, adjust=False).mean()


def _compute_macd(ema_12_series: list[dict], ema_26_series: list[dict]) -> list[dict]:
    """
    Compute MACD from EMA(12) and EMA(26) time series.

    MACD line = EMA(12) - EMA(26)
    Signal line = EMA(9) of MACD line
    Histogram = MACD - Signal
    """
    if not ema_12_series or not ema_26_series:
        return []

    df_12 = pd.DataFrame(ema_12_series).rename(columns={"value": "ema_12"})
    df_26 = pd.DataFrame(ema_26_series).rename(columns={"value": "ema_26"})

    merged = pd.merge(df_12, df_26, on="date", how="inner")
    if merged.empty:
        return []

    merged["macd"] = merged["ema_12"] - merged["ema_26"]
    merged["signal"] = _ema(merged["macd"], 9)
    merged["histogram"] = merged["macd"] - merged["signal"]

    result = []
    for _, row in merged.iterrows():
        result.append({
            "date": row["date"],
            "macd": round(float(row["macd"]), 4),
            "signal": round(float(row["signal"]), 4),
            "histogram": round(float(row["histogram"]), 4),
        })
    return result


def _compute_bollinger_bands(
    ohlcv: list[dict], period: int = 20, std_mult: float = 2.0
) -> list[dict]:
    """
    Compute Bollinger Bands from OHLCV close prices.

    Middle = SMA(period)
    Upper = Middle + std_mult * StdDev(period)
    Lower = Middle - std_mult * StdDev(period)
    """
    if len(ohlcv) < period:
        return []

    df = pd.DataFrame(ohlcv)
    close = df["close"].astype(float)

    middle = close.rolling(window=period).mean()
    std = close.rolling(window=period).std(ddof=0)
    upper = middle + std_mult * std
    lower = middle - std_mult * std

    result = []
    for i in range(len(df)):
        if pd.notna(middle.iloc[i]):
            result.append({
                "date": df["date"].iloc[i],
                "upper": round(float(upper.iloc[i]), 2),
                "middle": round(float(middle.iloc[i]), 2),
                "lower": round(float(lower.iloc[i]), 2),
            })
    return result


def _find_support_resistance(ohlcv: list[dict], window: int = 10) -> dict:
    """
    Find support/resistance levels from recent swing highs/lows.

    Input: list of {"date", "open", "high", "low", "close", "volume"} dicts.
    """
    try:
        if len(ohlcv) < window * 2:
            return {}

        df = pd.DataFrame(ohlcv)
        df["high"] = df["high"].astype(float)
        df["low"] = df["low"].astype(float)
        df["close"] = df["close"].astype(float)

        highs = df["high"].rolling(window=window, center=True).max()
        lows = df["low"].rolling(window=window, center=True).min()

        swing_high_mask = df["high"] == highs
        swing_highs = df.loc[swing_high_mask, "high"].dropna()

        swing_low_mask = df["low"] == lows
        swing_lows = df.loc[swing_low_mask, "low"].dropna()

        current_price = safe_float(df["close"].iloc[-1])
        if current_price <= 0:
            return {}

        resistances = sorted(
            set(safe_float(h) for h in swing_highs if safe_float(h) > current_price)
        )
        supports = sorted(
            set(safe_float(l) for l in swing_lows if safe_float(l) < current_price),
            reverse=True,
        )

        result: dict[str, Any] = {"current_price": round(current_price, 2)}
        if len(supports) > 0:
            result["support_1"] = round(supports[0], 2)
        if len(supports) > 1:
            result["support_2"] = round(supports[1], 2)
        if len(resistances) > 0:
            result["resistance_1"] = round(resistances[0], 2)
        if len(resistances) > 1:
            result["resistance_2"] = round(resistances[1], 2)

        return result
    except Exception as e:
        logger.error("Support/resistance error: %s", e)
        return {}


def _compute_derived_signals(
    current_values: dict, ohlcv: list[dict], indicators: dict, bb_series: list[dict]
) -> dict:
    """
    Compute derived analysis signals from current indicator values and OHLCV.

    Signals: MA alignment, RSI zone, MACD cross, SMA 50/200 cross,
    BB position, BB squeeze, trend direction/strength, volume trend.
    """
    derived: dict[str, Any] = {}
    price = current_values.get("price")
    sma_20 = current_values.get("sma_20")
    sma_50 = current_values.get("sma_50")
    sma_200 = current_values.get("sma_200")

    # --- MA alignment ---
    if price and sma_20 and sma_50 and sma_200:
        if price > sma_20 > sma_50 > sma_200:
            derived["ma_alignment"] = "bullish"
        elif price < sma_20 < sma_50 < sma_200:
            derived["ma_alignment"] = "bearish"
        else:
            derived["ma_alignment"] = "mixed"
    else:
        derived["ma_alignment"] = "mixed"

    # --- RSI zone ---
    rsi = current_values.get("rsi_14")
    if rsi is not None:
        if rsi > 70:
            derived["rsi_zone"] = "overbought"
        elif rsi < 30:
            derived["rsi_zone"] = "oversold"
        else:
            derived["rsi_zone"] = "neutral"
    else:
        derived["rsi_zone"] = "neutral"

    # --- MACD cross (last 5 days) ---
    macd_series = indicators.get("macd", [])
    derived["macd_cross"] = "none"
    if len(macd_series) >= 5:
        recent = macd_series[-5:]
        for i in range(1, len(recent)):
            prev_diff = recent[i - 1]["macd"] - recent[i - 1]["signal"]
            curr_diff = recent[i]["macd"] - recent[i]["signal"]
            if prev_diff <= 0 < curr_diff:
                derived["macd_cross"] = "bullish_cross"
            elif prev_diff >= 0 > curr_diff:
                derived["macd_cross"] = "bearish_cross"

    # --- SMA 50/200 cross (last 10 days) ---
    sma_50_series = indicators.get("sma_50", [])
    sma_200_series = indicators.get("sma_200", [])
    derived["sma_50_200_cross"] = "none"
    if len(sma_50_series) >= 10 and len(sma_200_series) >= 10:
        sma50_df = pd.DataFrame(sma_50_series[-10:]).rename(columns={"value": "sma50"})
        sma200_df = pd.DataFrame(sma_200_series[-10:]).rename(columns={"value": "sma200"})
        merged = pd.merge(sma50_df, sma200_df, on="date", how="inner")
        if len(merged) >= 2:
            diff = merged["sma50"] - merged["sma200"]
            crosses = diff.iloc[:-1].values * diff.iloc[1:].values
            if (crosses < 0).any():
                latest_diff = diff.iloc[-1]
                derived["sma_50_200_cross"] = (
                    "golden_cross" if latest_diff > 0 else "death_cross"
                )

    # --- BB position ---
    bb_upper = current_values.get("bb_upper")
    bb_lower = current_values.get("bb_lower")
    if price and bb_upper and bb_lower:
        bb_mid = (bb_upper + bb_lower) / 2
        if price > bb_upper:
            derived["bb_position"] = "above_upper"
        elif price < bb_lower:
            derived["bb_position"] = "below_lower"
        elif price > bb_mid:
            derived["bb_position"] = "upper_half"
        else:
            derived["bb_position"] = "lower_half"
    else:
        derived["bb_position"] = "upper_half"

    # --- BB squeeze ---
    derived["bb_squeeze"] = False
    if len(bb_series) >= 20:
        widths = []
        for entry in bb_series[-20:]:
            mid = entry.get("middle", 0)
            if mid and mid > 0:
                widths.append((entry["upper"] - entry["lower"]) / mid)
        if len(widths) >= 2:
            current_width = widths[-1]
            avg_width = np.mean(widths)
            derived["bb_squeeze"] = bool(current_width < avg_width * 0.8)

    # --- Trend direction and strength (ADX) ---
    adx = current_values.get("adx_14")
    if adx is not None:
        derived["trend_strength"] = min(int(round(adx)), 100)
    else:
        derived["trend_strength"] = 0

    # Determine trend direction from price vs SMA 20
    if price and sma_20:
        pct = (price - sma_20) / sma_20
        if pct > 0.02:
            derived["trend_direction"] = "up"
        elif pct < -0.02:
            derived["trend_direction"] = "down"
        else:
            derived["trend_direction"] = "sideways"
    else:
        derived["trend_direction"] = "sideways"

    # --- Volume trend ---
    derived["volume_trend"] = "average"
    derived["volume_ratio"] = 1.0
    if len(ohlcv) >= 20:
        recent_vol = ohlcv[-1].get("volume")
        vol_values = [
            safe_float(d.get("volume", 0))
            for d in ohlcv[-21:-1]
            if safe_float(d.get("volume", 0)) > 0
        ]
        if recent_vol and vol_values:
            avg_vol = np.mean(vol_values)
            if avg_vol > 0:
                ratio = float(recent_vol) / avg_vol
                derived["volume_ratio"] = round(ratio, 2)
                if ratio > 1.1:
                    derived["volume_trend"] = "above_average"
                elif ratio < 0.9:
                    derived["volume_trend"] = "below_average"
                else:
                    derived["volume_trend"] = "average"

    return derived


def _aggregate_to_weekly(daily_ohlcv: list[dict]) -> list[dict]:
    """
    Aggregate daily OHLCV into weekly candles.

    Groups by ISO week. Open = first day's open, High = max high,
    Low = min low, Close = last day's close, Volume = sum.
    """
    if not daily_ohlcv:
        return []

    df = pd.DataFrame(daily_ohlcv)
    df["date_parsed"] = pd.to_datetime(df["date"])
    df = df.sort_values("date_parsed")

    # Group by ISO year + week number
    df["iso_year_week"] = df["date_parsed"].dt.isocalendar().year.astype(str) + "-" + (
        df["date_parsed"].dt.isocalendar().week.astype(str).str.zfill(2)
    )

    weekly = []
    for _, group in df.groupby("iso_year_week", sort=True):
        weekly.append({
            "date": str(group["date"].iloc[-1]),
            "open": safe_float(group["open"].iloc[0]),
            "high": safe_float(group["high"].max()),
            "low": safe_float(group["low"].min()),
            "close": safe_float(group["close"].iloc[-1]),
            "volume": int(group["volume"].sum()) if group["volume"].notna().any() else 0,
        })

    return weekly


def _compute_trend_summary(
    indicators: dict, ohlcv: list[dict], lookback: int = 20
) -> dict:
    """
    Summarize recent indicator changes for AI agent context.

    Provides a condensed view of the last `lookback` days of indicator changes.
    """
    summary: dict[str, Any] = {}

    # --- RSI trend ---
    rsi_series = indicators.get("rsi_14", [])
    if len(rsi_series) >= lookback:
        rsi_now = rsi_series[-1]["value"]
        rsi_ago = rsi_series[-lookback]["value"]
        summary["rsi_20d_ago"] = round(rsi_ago, 1)
        if rsi_now > rsi_ago + 2:
            summary["rsi_direction"] = "rising"
        elif rsi_now < rsi_ago - 2:
            summary["rsi_direction"] = "declining"
        else:
            summary["rsi_direction"] = "flat"
        # Check if recently overbought/oversold (last 5 days)
        recent_rsi = [r["value"] for r in rsi_series[-5:]]
        summary["rsi_recently_overbought"] = any(v > 70 for v in recent_rsi)
        summary["rsi_recently_oversold"] = any(v < 30 for v in recent_rsi)
    else:
        summary["rsi_20d_ago"] = None
        summary["rsi_direction"] = "unknown"
        summary["rsi_recently_overbought"] = False
        summary["rsi_recently_oversold"] = False

    # --- MACD histogram direction ---
    macd_series = indicators.get("macd", [])
    summary["macd_histogram_direction"] = "unknown"
    summary["macd_recent_cross"] = "none"
    if len(macd_series) >= 5:
        recent_hist = [m["histogram"] for m in macd_series[-5:]]
        if len(recent_hist) >= 2:
            if abs(recent_hist[-1]) > abs(recent_hist[-2]):
                summary["macd_histogram_direction"] = "expanding"
            else:
                summary["macd_histogram_direction"] = "contracting"
        # Check for recent cross
        for i in range(1, len(macd_series[-5:])):
            prev = macd_series[-5 + i - 1]
            curr = macd_series[-5 + i]
            prev_diff = prev["macd"] - prev["signal"]
            curr_diff = curr["macd"] - curr["signal"]
            if prev_diff <= 0 < curr_diff:
                summary["macd_recent_cross"] = "bullish_cross"
            elif prev_diff >= 0 > curr_diff:
                summary["macd_recent_cross"] = "bearish_cross"

    # --- Price change ---
    if len(ohlcv) >= lookback:
        close_now = safe_float(ohlcv[-1]["close"])
        close_5d = safe_float(ohlcv[-5]["close"]) if len(ohlcv) >= 5 else close_now
        close_20d = safe_float(ohlcv[-lookback]["close"])
        if close_5d and close_5d > 0:
            summary["price_change_5d"] = round((close_now - close_5d) / close_5d * 100, 1)
        else:
            summary["price_change_5d"] = 0.0
        if close_20d and close_20d > 0:
            summary["price_change_20d"] = round((close_now - close_20d) / close_20d * 100, 1)
        else:
            summary["price_change_20d"] = 0.0
    else:
        summary["price_change_5d"] = 0.0
        summary["price_change_20d"] = 0.0

    # --- Volume vs average ---
    if len(ohlcv) >= lookback:
        vol_values = [
            safe_float(d.get("volume", 0))
            for d in ohlcv[-lookback:-1]
            if safe_float(d.get("volume", 0)) > 0
        ]
        current_vol = safe_float(ohlcv[-1].get("volume", 0))
        if vol_values and current_vol > 0:
            avg_vol = np.mean(vol_values)
            summary["volume_vs_avg"] = round(current_vol / avg_vol, 1) if avg_vol > 0 else 1.0
        else:
            summary["volume_vs_avg"] = 1.0
    else:
        summary["volume_vs_avg"] = 1.0

    return summary


def _latest_value(series: list[dict]) -> Optional[float]:
    """Get the latest value from an indicator series."""
    if series:
        return series[-1].get("value")
    return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def get_technical_data(
    symbol: str, timeframe: str = "daily", limit: int = 200
) -> dict:
    """
    Main entry point: fetch OHLCV + indicators from FMP, compute local
    derived signals, and return a comprehensive technical analysis dict.

    Args:
        symbol: Stock ticker (e.g. "AAPL")
        timeframe: "daily" or "weekly"
        limit: Number of data points to fetch (default 200)

    Returns:
        Comprehensive technical data dict with ohlcv, indicators,
        current snapshot, derived signals, support/resistance, and
        trend summary. On error returns {"symbol": ..., "error": ...}.
    """
    symbol = symbol.upper()
    cache_key = "%s_%s" % (symbol, timeframe)

    cached = _get_cached(_technical_cache, _technical_lock, cache_key)
    if cached:
        logger.info("Technical cache HIT for %s (%s)", symbol, timeframe)
        return cached

    logger.info("Fetching technical data for %s (%s)", symbol, timeframe)

    try:
        fmp = get_fmp_service()

        # 1. Fetch daily OHLCV from FMP
        price_resp = fmp.get_historical_price(symbol, limit=limit)
        if price_resp.get("status") != "success" or not price_resp.get("data"):
            return {
                "symbol": symbol,
                "error": "Failed to fetch OHLCV data: %s" % price_resp.get("error", "no data"),
                "source": "fmp",
            }

        daily_ohlcv = price_resp["data"]  # oldest-first

        # 2. Fetch indicator time series from FMP
        ind_resp = fmp.get_technical_indicators(
            symbol, timeframe="1day", limit=limit
        )
        raw_indicators = ind_resp.get("indicators", {}) if ind_resp.get("status") == "success" else {}

        # 3. For weekly timeframe: aggregate daily into weekly candles
        if timeframe == "weekly":
            ohlcv = _aggregate_to_weekly(daily_ohlcv)
        else:
            ohlcv = daily_ohlcv

        # 4. Compute MACD locally from EMA 12 and EMA 26 series
        macd_series = _compute_macd(
            raw_indicators.get("ema_12", []),
            raw_indicators.get("ema_26", []),
        )

        # 5. Compute Bollinger Bands locally from OHLCV
        bb_series = _compute_bollinger_bands(ohlcv, period=20, std_mult=2.0)

        # If weekly timeframe, also compute indicators locally from weekly OHLCV
        # because FMP indicators are daily-only
        if timeframe == "weekly" and ohlcv:
            df_w = pd.DataFrame(ohlcv)
            close_w = df_w["close"].astype(float)

            # SMA
            for period, key in [(20, "sma_20"), (50, "sma_50"), (200, "sma_200")]:
                if len(close_w) >= period:
                    sma_vals = close_w.rolling(window=period).mean()
                    series_data = []
                    for i in range(len(df_w)):
                        if pd.notna(sma_vals.iloc[i]):
                            series_data.append({
                                "date": df_w["date"].iloc[i],
                                "value": round(float(sma_vals.iloc[i]), 4),
                            })
                    raw_indicators[key] = series_data

            # EMA
            for span, key in [(12, "ema_12"), (26, "ema_26")]:
                ema_vals = _ema(close_w, span)
                series_data = []
                for i in range(len(df_w)):
                    if pd.notna(ema_vals.iloc[i]):
                        series_data.append({
                            "date": df_w["date"].iloc[i],
                            "value": round(float(ema_vals.iloc[i]), 4),
                        })
                raw_indicators[key] = series_data

            # Recompute MACD and BB for weekly
            macd_series = _compute_macd(
                raw_indicators.get("ema_12", []),
                raw_indicators.get("ema_26", []),
            )
            bb_series = _compute_bollinger_bands(ohlcv, period=20, std_mult=2.0)

        # 6. Build indicator dict (include FMP series + locally computed)
        ind: dict[str, Any] = {}
        for key in ["rsi_14", "sma_20", "sma_50", "sma_200", "ema_12", "ema_26", "adx_14"]:
            ind[key] = raw_indicators.get(key, [])
        ind["macd"] = macd_series
        ind["bb"] = bb_series

        # 7. Support/Resistance
        sr_levels = _find_support_resistance(ohlcv)

        # 8. Current snapshot (latest values)
        latest_close = safe_float(ohlcv[-1]["close"]) if ohlcv else 0
        latest_vol = ohlcv[-1].get("volume") if ohlcv else 0

        latest_macd = macd_series[-1] if macd_series else {}
        latest_bb = bb_series[-1] if bb_series else {}

        # Williams %R from FMP (if available via raw_indicators)
        williams_series = raw_indicators.get("williams_r", [])
        williams_val = _latest_value(williams_series) if williams_series else None

        current = {
            "price": safe_float(latest_close),
            "volume": latest_vol,
            "rsi_14": _latest_value(ind.get("rsi_14", [])),
            "macd_histogram": safe_float(latest_macd.get("histogram")),
            "macd_level": safe_float(latest_macd.get("macd")),
            "macd_signal": safe_float(latest_macd.get("signal")),
            "adx_14": _latest_value(ind.get("adx_14", [])),
            "sma_20": _latest_value(ind.get("sma_20", [])),
            "sma_50": _latest_value(ind.get("sma_50", [])),
            "sma_200": _latest_value(ind.get("sma_200", [])),
            "bb_upper": safe_float(latest_bb.get("upper")),
            "bb_lower": safe_float(latest_bb.get("lower")),
            "williams_r": safe_float(williams_val),
        }

        # 9. Derived signals
        derived = _compute_derived_signals(current, ohlcv, ind, bb_series)

        # 10. Trend summary (for AI agent context)
        trend_summary = _compute_trend_summary(ind, ohlcv, lookback=20)

        result = {
            "symbol": symbol,
            "timeframe": timeframe,
            "source": "fmp",
            # For chart rendering (frontend)
            "ohlcv": ohlcv,
            # Indicator series (frontend chart overlays + AI context)
            "indicators": ind,
            # Current snapshot (latest values)
            "current": current,
            # Derived analysis signals
            "derived": derived,
            # Support/resistance levels
            "support_resistance": sr_levels,
            # Recent trend context (for AI agent)
            "trend_summary": trend_summary,

            # ------------------------------------------------------------------
            # Backward-compatible keys used by router / research_tools callers
            # ------------------------------------------------------------------
            "sources": ["fmp"],
            "ratings": {},  # tvscreener ratings removed
            "moving_averages": {
                "sma_20": current.get("sma_20"),
                "sma_50": current.get("sma_50"),
                "sma_200": current.get("sma_200"),
                "ema_12": _latest_value(ind.get("ema_12", [])),
                "ema_26": _latest_value(ind.get("ema_26", [])),
            },
            "oscillators": {
                "rsi_14": current.get("rsi_14"),
                "macd_level": current.get("macd_level"),
                "macd_signal": current.get("macd_signal"),
                "macd_histogram": current.get("macd_histogram"),
                "williams_r": current.get("williams_r"),
            },
            "volatility": {
                "bb_upper": current.get("bb_upper"),
                "bb_lower": current.get("bb_lower"),
            },
            "trend": {
                "adx_14": current.get("adx_14"),
            },
            "price_volume": {
                "price": current.get("price"),
                "volume": current.get("volume"),
            },
            "trends": {
                "rsi_14": {
                    "current": current.get("rsi_14"),
                    "direction": trend_summary.get("rsi_direction", "unknown"),
                    "zone": derived.get("rsi_zone", "neutral"),
                    "recently_overbought": trend_summary.get("rsi_recently_overbought", False),
                    "recently_oversold": trend_summary.get("rsi_recently_oversold", False),
                },
                "macd": {
                    "current": current.get("macd_level"),
                    "signal": current.get("macd_signal"),
                    "histogram": current.get("macd_histogram"),
                    "histogram_direction": trend_summary.get("macd_histogram_direction", "unknown"),
                    "cross": derived.get("macd_cross", "none"),
                },
                "volume": {
                    "current": current.get("volume"),
                    "ratio": derived.get("volume_ratio", 1.0),
                    "trend": derived.get("volume_trend", "average"),
                },
            },
            "pattern_signals": {
                "ma_alignment": derived.get("ma_alignment", "mixed"),
                "bb_position": derived.get("bb_position"),
                "bb_squeeze": derived.get("bb_squeeze", False),
                "sma_cross": derived.get("sma_50_200_cross", "none"),
                "volume_confirmation": derived.get("volume_trend") == "above_average",
            },
        }

        _set_cached(_technical_cache, _technical_lock, cache_key, result, CACHE_TTL_MINUTES)
        logger.info(
            "Technical data OK for %s (%s): price=%s, RSI=%s",
            symbol, timeframe, current.get("price"), current.get("rsi_14"),
        )
        return result

    except Exception as e:
        logger.exception("Technical data error for %s: %s", symbol, e)
        return {"symbol": symbol, "error": str(e), "source": "fmp"}


# ---------------------------------------------------------------------------
# Backward-compatible entry points used by router.py
# ---------------------------------------------------------------------------

def get_technical_trends(symbol: str, days: int = 180) -> dict:  # noqa: ARG001
    """
    Deprecated: redirects to get_technical_data() and returns a
    backward-compatible trends dict.
    """
    data = get_technical_data(symbol)

    if data.get("error"):
        return {"source": "fmp", "error": data["error"], "symbol": symbol}

    return {
        "source": "fmp",
        "symbol": symbol,
        "trends": data.get("trends", {}),
        "support_resistance": data.get("support_resistance", {}),
        "pattern_signals": data.get("pattern_signals", {}),
    }
