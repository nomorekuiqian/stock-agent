"""
Technical Analysis Data Tools

Fetches technical indicators from two sources:
1. tvscreener (primary) - TradingView pre-computed indicators + buy/sell ratings
2. pandas-ta (secondary) - Historical indicator trends computed from yfinance OHLCV

Usage:
    from app.shared.data_tools.technical import get_technical_data
    data = get_technical_data("AAPL")
"""

import math
import threading
from datetime import datetime, timedelta
from typing import Any, Optional

import pandas as pd
import yfinance as yf

from app.core.logging import get_logger
from app.shared.data_tools.market_data import safe_float

logger = get_logger(__name__)


_tv_snapshot_cache: dict = {}
_tv_snapshot_lock = threading.Lock()
TV_SNAPSHOT_TTL_MINUTES = 15

_trends_cache: dict = {}
_trends_lock = threading.Lock()
TRENDS_TTL_MINUTES = 30


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


_EXCHANGE_OVERRIDES = {
    # NYSE blue chips
    "JPM": "NYSE", "GS": "NYSE", "BAC": "NYSE", "WFC": "NYSE",
    "JNJ": "NYSE", "PG": "NYSE", "UNH": "NYSE", "V": "NYSE",
    "MA": "NYSE", "DIS": "NYSE", "KO": "NYSE", "PEP": "NYSE",
    "WMT": "NYSE", "HD": "NYSE", "CRM": "NYSE", "BA": "NYSE",
    "CAT": "NYSE", "GE": "NYSE", "XOM": "NYSE", "CVX": "NYSE",
    "BRK.B": "NYSE", "BRK.A": "NYSE", "NKE": "NYSE", "MCD": "NYSE",
    "IBM": "NYSE", "ABBV": "NYSE", "LLY": "NYSE", "MRK": "NYSE",
    "PFE": "NYSE", "ABT": "NYSE", "TMO": "NYSE", "DHR": "NYSE",
    "PM": "NYSE", "RTX": "NYSE", "LMT": "NYSE", "NOC": "NYSE",
    "MMM": "NYSE", "SQ": "NYSE", "UBER": "NYSE", "SNAP": "NYSE",
    "BABA": "NYSE", "NIO": "NYSE", "LI": "NYSE", "RIVN": "NASDAQ",
    # NASDAQ tech
    "AAPL": "NASDAQ", "MSFT": "NASDAQ", "GOOGL": "NASDAQ", "GOOG": "NASDAQ",
    "AMZN": "NASDAQ", "META": "NASDAQ", "NVDA": "NASDAQ", "TSLA": "NASDAQ",
    "AMD": "NASDAQ", "INTC": "NASDAQ", "AVGO": "NASDAQ", "QCOM": "NASDAQ",
    "NFLX": "NASDAQ", "ADBE": "NASDAQ", "PYPL": "NASDAQ", "COIN": "NASDAQ",
    "PLTR": "NASDAQ", "SNOW": "NASDAQ", "DDOG": "NASDAQ", "ZS": "NASDAQ",
    "CRWD": "NASDAQ", "NET": "NASDAQ", "MDB": "NASDAQ", "PANW": "NASDAQ",
    "MRVL": "NASDAQ", "MU": "NASDAQ", "SMCI": "NASDAQ", "ARM": "NASDAQ",
    "PDD": "NASDAQ", "BIDU": "NASDAQ", "JD": "NASDAQ",
}


def detect_exchange(symbol: str) -> str:
    """
    Detect TradingView exchange prefix for a US stock symbol.
    Returns 'NASDAQ' or 'NYSE'. Falls back to trying both.
    """
    symbol = symbol.upper()
    if symbol in _EXCHANGE_OVERRIDES:
        return _EXCHANGE_OVERRIDES[symbol]
    # Default: try NASDAQ first (more tech stocks)
    return "NASDAQ"



def _rating_to_label(value: float) -> str:
    """Convert TradingView numeric rating (-1 to 1) to human label."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "NEUTRAL"
    if value >= 0.5:
        return "STRONG_BUY"
    if value >= 0.1:
        return "BUY"
    if value <= -0.5:
        return "STRONG_SELL"
    if value <= -0.1:
        return "SELL"
    return "NEUTRAL"


def get_technical_snapshot(symbol: str, exchange: Optional[str] = None) -> dict:
    """
    Fetch current technical indicator values from TradingView via tvscreener.

    Returns dict with ratings, moving averages, oscillators, volatility,
    trend indicators, and price/volume for both daily and weekly timeframes.
    """
    symbol = symbol.upper()
    cache_key = symbol
    cached = _get_cached(_tv_snapshot_cache, _tv_snapshot_lock, cache_key)
    if cached:
        logger.info("tvscreener cache HIT for %s", symbol)
        return cached

    try:
        from tvscreener import StockScreener
        from tvscreener.field.stock import StockField
        from tvscreener.core.stock import Market

        screener = StockScreener()
        screener.set_markets(Market.AMERICA)
        screener.select(
            # --- Daily Ratings ---
            StockField.TECHNICAL_RATING,
            StockField.MOVING_AVERAGES_RATING,
            StockField.OSCILLATORS_RATING,
            # --- Weekly Ratings ---
            StockField.RECOMMEND_ALL_1W,
            StockField.RECOMMEND_MA_1W,
            StockField.RECOMMEND_OTHER_1W,
            # --- Daily Moving Averages ---
            StockField.SIMPLE_MOVING_AVERAGE_20,
            StockField.SIMPLE_MOVING_AVERAGE_50,
            StockField.SIMPLE_MOVING_AVERAGE_200,
            StockField.EMA12,
            StockField.EMA26,
            # --- Daily Oscillators ---
            StockField.RELATIVE_STRENGTH_INDEX_14,
            StockField.MACD_LEVEL_12_26,
            StockField.MACD_SIGNAL_12_26,
            StockField.MACD_HIST,
            StockField.STOCHASTIC_PERCENTK_14_3_3,
            StockField.STOCHASTIC_PERCENTD_14_3_3,
            StockField.COMMODITY_CHANNEL_INDEX_20,
            StockField.AWESOME_OSCILLATOR,
            StockField.MOMENTUM_10,
            StockField.WILLIAMS_PERCENT_RANGE_14,
            # --- Weekly Oscillators ---
            StockField.RSI_1W,
            StockField.MACD_MACD_1W,
            StockField.MACD_SIGNAL_1W,
            StockField.MACD_HIST_1W,
            # --- Daily Volatility ---
            StockField.AVERAGE_TRUE_RANGE_14,
            StockField.BOLLINGER_UPPER_BAND_20,
            StockField.BOLLINGER_LOWER_BAND_20,
            # --- Daily Trend ---
            StockField.AVERAGE_DIRECTIONAL_INDEX_14,
            StockField.POSITIVE_DIRECTIONAL_INDICATOR_14,
            StockField.NEGATIVE_DIRECTIONAL_INDICATOR_14,
            StockField.PARABOLIC_SAR,
            StockField.ICHIMOKU_BASE_LINE_9_26_52_26,
            StockField.ICHIMOKU_CONVERSION_LINE_9_26_52_26,
            # --- Weekly Trend ---
            StockField.ADX_1W,
            # --- Price & Volume ---
            StockField.PRICE,
            StockField.VOLUME,
            StockField.AVERAGE_VOLUME,
        )

        df = screener.get()

        # Try to find the symbol with exchange prefix
        if exchange is None:
            exchange = detect_exchange(symbol)

        tv_symbol = f"{exchange}:{symbol}"
        row_df = df[df["Symbol"] == tv_symbol]

        # If not found, try the other exchange
        if row_df.empty and exchange == "NASDAQ":
            tv_symbol = f"NYSE:{symbol}"
            row_df = df[df["Symbol"] == tv_symbol]
        elif row_df.empty and exchange == "NYSE":
            tv_symbol = f"NASDAQ:{symbol}"
            row_df = df[df["Symbol"] == tv_symbol]

        # Still not found, try AMEX
        if row_df.empty:
            tv_symbol = f"AMEX:{symbol}"
            row_df = df[df["Symbol"] == tv_symbol]

        if row_df.empty:
            logger.warning("tvscreener: %s not found in any exchange", symbol)
            return {"source": "tvscreener", "error": "symbol_not_found", "symbol": symbol}

        row = row_df.iloc[0]

        def val(col_name: str) -> Optional[float]:
            try:
                v = row[col_name]
                if v is None or (isinstance(v, float) and math.isnan(v)):
                    return None
                return round(float(v), 4)
            except (KeyError, TypeError, ValueError):
                return None

        price = val("Price")

        # Build structured result
        result = {
            "source": "tvscreener",
            "symbol": symbol,
            "tv_symbol": tv_symbol,
            "ratings": {
                "daily": {
                    "overall": _rating_to_label(val("Technical Rating")),
                    "overall_score": val("Technical Rating"),
                    "moving_averages": _rating_to_label(val("Moving Averages Rating")),
                    "ma_score": val("Moving Averages Rating"),
                    "oscillators": _rating_to_label(val("Oscillators Rating")),
                    "osc_score": val("Oscillators Rating"),
                },
                "weekly": {
                    "overall": _rating_to_label(val("Recommend All|1w")),
                    "overall_score": val("Recommend All|1w"),
                    "moving_averages": _rating_to_label(val("Recommend Ma|1w")),
                    "ma_score": val("Recommend Ma|1w"),
                    "oscillators": _rating_to_label(val("Recommend Other|1w")),
                    "osc_score": val("Recommend Other|1w"),
                },
            },
            "moving_averages": {
                "sma_20": val("Simple Moving Average (20)"),
                "sma_50": val("Simple Moving Average (50)"),
                "sma_200": val("Simple Moving Average (200)"),
                "ema_12": val("Ema12"),
                "ema_26": val("Ema26"),
            },
            "oscillators": {
                "rsi_14": val("Relative Strength Index (14)"),
                "rsi_14_weekly": val("Rsi|1w"),
                "macd_level": val("MACD Level (12, 26)"),
                "macd_signal": val("MACD Signal (12, 26)"),
                "macd_histogram": val("MACD Hist"),
                "macd_level_weekly": val("MACD Macd|1w"),
                "macd_signal_weekly": val("MACD Signal|1w"),
                "macd_histogram_weekly": val("MACD Hist|1w"),
                "stochastic_k": val("Stochastic %K (14, 3, 3)"),
                "stochastic_d": val("Stochastic %D (14, 3, 3)"),
                "cci_20": val("Commodity Channel Index (20)"),
                "awesome_oscillator": val("Awesome Oscillator"),
                "momentum_10": val("Momentum (10)"),
                "williams_r": val("Williams Percent Range (14)"),
            },
            "volatility": {
                "atr_14": val("Average True Range (14)"),
                "bb_upper": val("Bollinger Upper Band (20)"),
                "bb_lower": val("Bollinger Lower Band (20)"),
            },
            "trend": {
                "adx_14": val("Average Directional Index (14)"),
                "adx_14_weekly": val("Adx|1w"),
                "adx_plus_di": val("Positive Directional Indicator (14)"),
                "adx_minus_di": val("Negative Directional Indicator (14)"),
                "parabolic_sar": val("Parabolic SAR"),
                "ichimoku_base": val("Ichimoku Base Line (9, 26, 52, 26)"),
                "ichimoku_conversion": val("Ichimoku Conversion Line (9, 26, 52, 26)"),
            },
            "price_volume": {
                "price": price,
                "volume": val("Volume"),
                "avg_volume": val("Average Volume"),
            },
        }

        # Derived signals
        sma_20 = result["moving_averages"]["sma_20"]
        sma_50 = result["moving_averages"]["sma_50"]
        sma_200 = result["moving_averages"]["sma_200"]

        result["derived"] = {}

        if price and sma_20 and sma_50 and sma_200:
            result["derived"]["above_sma_20"] = price > sma_20
            result["derived"]["above_sma_50"] = price > sma_50
            result["derived"]["above_sma_200"] = price > sma_200

            # MA alignment
            if price > sma_20 > sma_50 > sma_200:
                result["derived"]["ma_alignment"] = "bullish"
            elif price < sma_20 < sma_50 < sma_200:
                result["derived"]["ma_alignment"] = "bearish"
            else:
                result["derived"]["ma_alignment"] = "mixed"

        # RSI zone
        rsi = result["oscillators"]["rsi_14"]
        if rsi is not None:
            if rsi > 70:
                result["derived"]["rsi_zone"] = "overbought"
            elif rsi < 30:
                result["derived"]["rsi_zone"] = "oversold"
            else:
                result["derived"]["rsi_zone"] = "neutral"

        # BB position
        bb_upper = result["volatility"]["bb_upper"]
        bb_lower = result["volatility"]["bb_lower"]
        if price and bb_upper and bb_lower:
            bb_mid = (bb_upper + bb_lower) / 2
            if price > bb_upper:
                result["derived"]["bb_position"] = "above_upper"
            elif price < bb_lower:
                result["derived"]["bb_position"] = "below_lower"
            elif price > bb_mid:
                result["derived"]["bb_position"] = "upper_half"
            else:
                result["derived"]["bb_position"] = "lower_half"

        _set_cached(_tv_snapshot_cache, _tv_snapshot_lock, cache_key, result, TV_SNAPSHOT_TTL_MINUTES)
        logger.info("tvscreener OK for %s: price=%s, RSI=%s", tv_symbol, price, rsi)
        return result

    except Exception as e:
        logger.exception("tvscreener error for %s: %s", symbol, e)
        return {"source": "tvscreener", "error": str(e), "symbol": symbol}



def _direction(current: float, previous: float, threshold: float = 0.02) -> str:
    """Determine trend direction between two values."""
    if previous == 0:
        return "flat"
    pct_change = (current - previous) / abs(previous)
    if pct_change > threshold:
        return "rising"
    if pct_change < -threshold:
        return "declining"
    return "flat"


def _find_support_resistance(df: pd.DataFrame, window: int = 10) -> dict:
    """Find support/resistance levels from recent swing highs/lows."""
    try:
        if len(df) < window * 2:
            return {}

        # Use rolling window to find local highs and lows
        highs = df["High"].rolling(window=window, center=True).max()
        lows = df["Low"].rolling(window=window, center=True).min()

        # Swing highs: where High equals the rolling max
        swing_high_mask = df["High"] == highs
        swing_highs = df.loc[swing_high_mask, "High"].dropna()

        # Swing lows: where Low equals the rolling min
        swing_low_mask = df["Low"] == lows
        swing_lows = df.loc[swing_low_mask, "Low"].dropna()

        current_price = safe_float(df["Close"].iloc[-1])
        if current_price <= 0:
            return {}

        # Get unique levels, sorted
        resistances = sorted(set(safe_float(h) for h in swing_highs if safe_float(h) > current_price))
        supports = sorted(set(safe_float(l) for l in swing_lows if safe_float(l) < current_price), reverse=True)

        result = {"current_price": round(current_price, 2)}
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


def get_technical_trends(symbol: str, days: int = 180) -> dict:
    """
    Compute historical indicator trends using pandas-ta + yfinance.
    Provides directional context that tvscreener snapshot cannot.

    Returns trend directions, signal conditions, support/resistance,
    and volume analysis.
    """
    symbol = symbol.upper()
    cache_key = f"{symbol}_{days}"
    cached = _get_cached(_trends_cache, _trends_lock, cache_key)
    if cached:
        logger.info("trends cache HIT for %s", symbol)
        return cached

    try:
        import pandas_ta as ta

        # Download OHLCV data
        period = "1y" if days > 180 else "6mo"
        df = yf.download(symbol, period=period, progress=False)

        if df.empty or len(df) < 30:
            logger.warning("Insufficient data for %s: %d rows", symbol, len(df))
            return {"source": "pandas-ta", "error": "insufficient_data", "symbol": symbol}

        # Flatten MultiIndex columns if present (yfinance sometimes returns multi-level)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        # Compute indicators
        df.ta.rsi(length=14, append=True)
        df.ta.macd(fast=12, slow=26, signal=9, append=True)
        df.ta.bbands(length=20, std=2, append=True)
        df.ta.sma(length=20, append=True)
        df.ta.sma(length=50, append=True)
        df.ta.sma(length=200, append=True)
        df.ta.adx(length=14, append=True)
        df.ta.atr(length=14, append=True)
        df.ta.stoch(k=14, d=3, append=True)

        # Get latest, 5-day ago, and 20-day ago values
        latest = df.iloc[-1]
        d5 = df.iloc[-6] if len(df) > 5 else df.iloc[0]
        d20 = df.iloc[-21] if len(df) > 20 else df.iloc[0]

        def sf(val):
            return safe_float(val, None)

        # RSI trend
        rsi_current = sf(latest.get("RSI_14"))
        rsi_5d = sf(d5.get("RSI_14"))
        rsi_20d = sf(d20.get("RSI_14"))
        rsi_trend = {}
        if rsi_current is not None:
            rsi_trend = {
                "current": round(rsi_current, 1),
                "5d_ago": round(rsi_5d, 1) if rsi_5d else None,
                "20d_ago": round(rsi_20d, 1) if rsi_20d else None,
                "direction": _direction(rsi_current, rsi_5d) if rsi_5d else "unknown",
                "zone": "overbought" if rsi_current > 70 else ("oversold" if rsi_current < 30 else "neutral"),
            }
            # Check if recently overbought/oversold (last 5 days)
            recent_rsi = df["RSI_14"].iloc[-6:].dropna()
            if not recent_rsi.empty:
                rsi_trend["recently_overbought"] = bool((recent_rsi > 70).any())
                rsi_trend["recently_oversold"] = bool((recent_rsi < 30).any())

        # MACD trend
        macd_col = "MACD_12_26_9"
        signal_col = "MACDs_12_26_9"
        hist_col = "MACDh_12_26_9"
        macd_current = sf(latest.get(macd_col))
        macd_signal_current = sf(latest.get(signal_col))
        macd_hist_current = sf(latest.get(hist_col))
        macd_hist_5d = sf(d5.get(hist_col))
        macd_trend = {}
        if macd_current is not None:
            macd_trend = {
                "current": round(macd_current, 4),
                "signal": round(macd_signal_current, 4) if macd_signal_current else None,
                "histogram": round(macd_hist_current, 4) if macd_hist_current else None,
                "histogram_direction": _direction(macd_hist_current, macd_hist_5d) if macd_hist_5d and macd_hist_current else "unknown",
            }
            # Detect MACD cross in last 5 days
            recent_macd = df[[macd_col, signal_col]].iloc[-6:].dropna()
            if len(recent_macd) >= 2:
                diff = recent_macd[macd_col] - recent_macd[signal_col]
                crosses = diff.iloc[:-1].values * diff.iloc[1:].values
                if (crosses < 0).any():
                    # A cross happened
                    latest_diff = diff.iloc[-1]
                    macd_trend["cross"] = "bullish_cross" if latest_diff > 0 else "bearish_cross"
                else:
                    macd_trend["cross"] = "none"

        # Volume trend
        vol_current = sf(latest.get("Volume"))
        volume_trend = {}
        if vol_current is not None:
            vol_20d_avg = sf(df["Volume"].iloc[-21:].mean()) if len(df) > 20 else None
            volume_trend = {
                "current": int(vol_current) if vol_current else None,
                "avg_20d": int(vol_20d_avg) if vol_20d_avg else None,
            }
            if vol_current and vol_20d_avg and vol_20d_avg > 0:
                ratio = vol_current / vol_20d_avg
                volume_trend["ratio"] = round(ratio, 2)
                volume_trend["trend"] = "above_average" if ratio > 1.1 else ("below_average" if ratio < 0.9 else "average")

        # Support / Resistance
        sr_levels = _find_support_resistance(df)

        # MA alignment signal
        price = sf(latest.get("Close"))
        sma_20 = sf(latest.get("SMA_20"))
        sma_50 = sf(latest.get("SMA_50"))
        pattern_signals = {}
        if price and sma_20 and sma_50:
            if price > sma_20 > sma_50:
                pattern_signals["ma_alignment"] = "bullish"
            elif price < sma_20 < sma_50:
                pattern_signals["ma_alignment"] = "bearish"
            else:
                pattern_signals["ma_alignment"] = "mixed"

        # BB position
        bb_upper = sf(latest.get("BBU_20_2.0"))
        bb_lower = sf(latest.get("BBL_20_2.0"))
        if price and bb_upper and bb_lower:
            bb_mid = (bb_upper + bb_lower) / 2
            if price > bb_upper:
                pattern_signals["bb_position"] = "above_upper"
            elif price < bb_lower:
                pattern_signals["bb_position"] = "below_lower"
            elif price > bb_mid:
                pattern_signals["bb_position"] = "upper_half"
            else:
                pattern_signals["bb_position"] = "lower_half"

            # BB width (squeeze detection)
            bb_width = (bb_upper - bb_lower) / bb_mid if bb_mid > 0 else 0
            bb_width_20d = None
            if len(df) > 20:
                bbu_series = df.get("BBU_20_2.0")
                bbl_series = df.get("BBL_20_2.0")
                if bbu_series is not None and bbl_series is not None:
                    widths = (bbu_series - bbl_series) / ((bbu_series + bbl_series) / 2)
                    bb_width_20d = sf(widths.iloc[-21:].mean())
            if bb_width_20d and bb_width_20d > 0:
                pattern_signals["bb_squeeze"] = bb_width < bb_width_20d * 0.8

        # Volume confirmation
        if vol_current and vol_20d_avg and vol_20d_avg > 0:
            pattern_signals["volume_confirmation"] = vol_current > vol_20d_avg

        # SMA50/200 cross detection (golden cross / death cross)
        sma50_series = df.get("SMA_50")
        sma200_series = df.get("SMA_200")
        if sma50_series is not None and sma200_series is not None:
            recent_sma = pd.DataFrame({
                "sma50": sma50_series, "sma200": sma200_series
            }).iloc[-11:].dropna()
            if len(recent_sma) >= 2:
                diff = recent_sma["sma50"] - recent_sma["sma200"]
                crosses = diff.iloc[:-1].values * diff.iloc[1:].values
                if (crosses < 0).any():
                    latest_diff = diff.iloc[-1]
                    pattern_signals["sma_cross"] = "golden_cross" if latest_diff > 0 else "death_cross"
                else:
                    pattern_signals["sma_cross"] = "none"

        result = {
            "source": "pandas-ta",
            "symbol": symbol,
            "period": period,
            "data_points": len(df),
            "trends": {
                "rsi_14": rsi_trend,
                "macd": macd_trend,
                "volume": volume_trend,
            },
            "support_resistance": sr_levels,
            "pattern_signals": pattern_signals,
        }

        _set_cached(_trends_cache, _trends_lock, cache_key, result, TRENDS_TTL_MINUTES)
        logger.info("pandas-ta OK for %s: %d data points", symbol, len(df))
        return result

    except Exception as e:
        logger.exception("pandas-ta error for %s: %s", symbol, e)
        return {"source": "pandas-ta", "error": str(e), "symbol": symbol}



def get_technical_data(symbol: str, exchange: Optional[str] = None) -> dict:
    """
    Main entry point: Combines tvscreener snapshot + pandas-ta trends.
    Handles fallback if tvscreener fails.

    Returns merged dict with all data needed for the Technical Agent.
    """
    symbol = symbol.upper()
    logger.info("Fetching technical data for %s", symbol)

    # 1. tvscreener snapshot (current indicators + ratings)
    snapshot = get_technical_snapshot(symbol, exchange)
    tv_ok = "error" not in snapshot

    # 2. pandas-ta trends (historical context)
    trends = get_technical_trends(symbol)
    trends_ok = "error" not in trends

    if not tv_ok and not trends_ok:
        return {
            "symbol": symbol,
            "error": "Both tvscreener and pandas-ta failed",
            "tv_error": snapshot.get("error"),
            "trends_error": trends.get("error"),
        }

    result: dict[str, Any] = {
        "symbol": symbol,
        "sources": [],
    }

    if tv_ok:
        result["sources"].append("tvscreener")
        result["ratings"] = snapshot.get("ratings", {})
        result["moving_averages"] = snapshot.get("moving_averages", {})
        result["oscillators"] = snapshot.get("oscillators", {})
        result["volatility"] = snapshot.get("volatility", {})
        result["trend"] = snapshot.get("trend", {})
        result["price_volume"] = snapshot.get("price_volume", {})
        result["derived"] = snapshot.get("derived", {})

    if trends_ok:
        result["sources"].append("pandas-ta")
        result["trends"] = trends.get("trends", {})
        result["support_resistance"] = trends.get("support_resistance", {})
        result["pattern_signals"] = trends.get("pattern_signals", {})

    # If tvscreener failed, fill core fields from pandas-ta
    if not tv_ok and trends_ok:
        rsi = trends.get("trends", {}).get("rsi_14", {})
        macd = trends.get("trends", {}).get("macd", {})
        result["oscillators"] = {
            "rsi_14": rsi.get("current"),
            "macd_level": macd.get("current"),
            "macd_signal": macd.get("signal"),
            "macd_histogram": macd.get("histogram"),
        }
        result["derived"] = {
            "rsi_zone": rsi.get("zone"),
            "ma_alignment": trends.get("pattern_signals", {}).get("ma_alignment"),
            "bb_position": trends.get("pattern_signals", {}).get("bb_position"),
        }

    return result
