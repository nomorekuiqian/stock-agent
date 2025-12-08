"""
FMP (Financial Modeling Prep) API Service
"""

import os
import httpx
from typing import Optional
from datetime import datetime


class FMPService:
    """Financial Modeling Prep API"""

    BASE_URL = "https://financialmodelingprep.com"

    def __init__(self):
        self.api_key = os.getenv("FMP_API_KEY")
        if not self.api_key:
            raise ValueError("FMP_API_KEY environment variable is required")

    def _request(self, endpoint: str, params: dict = None) -> dict | list | None:
        """Send synchronous API request"""
        params = params or {}
        params["apikey"] = self.api_key

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.get(f"{self.BASE_URL}{endpoint}", params=params)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            print(f"FMP API HTTP error: {e.response.status_code} - {e.response.text}")
            return None
        except httpx.RequestError as e:
            print(f"FMP API request error: {e}")
            return None
        except Exception as e:
            print(f"FMP API unexpected error: {e}")
            return None

    def get_treasury_rates(self, date: Optional[str] = None) -> dict:
        """
        Get complete treasury yield curve (12 maturities)

        Args:
            date: Optional, specify date (YYYY-MM-DD), defaults to latest

        Returns:
            {
                "date": "2024-02-29",
                "rates": {
                    "1M": 5.53, "2M": 5.5, "3M": 5.45, "6M": 5.3,
                    "1Y": 5.01, "2Y": 4.64, "3Y": 4.43,
                    "5Y": 4.26, "7Y": 4.28,
                    "10Y": 4.25, "20Y": 4.51, "30Y": 4.38
                },
                "spreads": {
                    "10y_3m": -0.2,
                    "10y_2y": -0.39,
                    "30y_10y": 0.13
                },
                "yield_curve_shape": "inverted",
                "source": "fmp"
            }
        """
        print("[FMP] get_treasury_rates()")

        params = {}
        if date:
            params["date"] = date

        data = self._request("/stable/treasury-rates", params)

        if not data or not isinstance(data, list) or len(data) == 0:
            print("FMP Treasury Rates API returned empty data")
            return self._empty_treasury_response()

        raw = data[0]

        rates = {
            "1M": self._safe_float(raw.get("month1")),
            "2M": self._safe_float(raw.get("month2")),
            "3M": self._safe_float(raw.get("month3")),
            "6M": self._safe_float(raw.get("month6")),
            "1Y": self._safe_float(raw.get("year1")),
            "2Y": self._safe_float(raw.get("year2")),
            "3Y": self._safe_float(raw.get("year3")),
            "5Y": self._safe_float(raw.get("year5")),
            "7Y": self._safe_float(raw.get("year7")),
            "10Y": self._safe_float(raw.get("year10")),
            "20Y": self._safe_float(raw.get("year20")),
            "30Y": self._safe_float(raw.get("year30")),
        }

        spreads = self._calculate_spreads(rates)
        yield_curve_shape = self._analyze_yield_curve_shape(rates)

        return {
            "date": raw.get("date", datetime.now().strftime("%Y-%m-%d")),
            "rates": rates,
            "spreads": spreads,
            "yield_curve_shape": yield_curve_shape,
            "source": "fmp",
        }

    def _calculate_spreads(self, rates: dict) -> dict:
        """Calculate key spreads"""
        spreads = {}

        # 10Y - 3M (most important recession indicator)
        if rates.get("10Y") and rates.get("3M"):
            spreads["10y_3m"] = round(rates["10Y"] - rates["3M"], 3)

        # 10Y - 2Y (another important recession indicator)
        if rates.get("10Y") and rates.get("2Y"):
            spreads["10y_2y"] = round(rates["10Y"] - rates["2Y"], 3)

        # 30Y - 10Y (long-end slope)
        if rates.get("30Y") and rates.get("10Y"):
            spreads["30y_10y"] = round(rates["30Y"] - rates["10Y"], 3)

        # 5Y - 3M (mid-short end)
        if rates.get("5Y") and rates.get("3M"):
            spreads["5y_3m"] = round(rates["5Y"] - rates["3M"], 3)

        return spreads

    def _analyze_yield_curve_shape(self, rates: dict) -> str:
        """
        Analyze yield curve shape

        Returns:
            "normal": Normal (short < long)
            "flat": Flat (short ~ long)
            "inverted": Inverted (short > long)
        """
        short = rates.get("3M", 0) or 0
        long = rates.get("10Y", 0) or 0

        if short == 0 or long == 0:
            return "unknown"

        diff = long - short

        if diff < -0.1:  # 10Y more than 10bp below 3M
            return "inverted"
        elif diff < 0.5:  # Spread less than 50bp
            return "flat"
        else:
            return "normal"

    def _safe_float(self, value, default=None) -> float | None:
        """Safely convert to float"""
        if value is None:
            return default
        try:
            result = float(value)
            return result if result == result else default  # NaN check
        except (ValueError, TypeError):
            return default

    def _empty_treasury_response(self) -> dict:
        """Return empty treasury response structure"""
        return {
            "date": None,
            "rates": {},
            "spreads": {},
            "yield_curve_shape": "unknown",
            "source": "fmp",
            "error": "No data available",
        }


_fmp_service_instance = None


def get_fmp_service() -> FMPService:
    """Get FMP Service singleton"""
    global _fmp_service_instance
    if _fmp_service_instance is None:
        _fmp_service_instance = FMPService()
    return _fmp_service_instance
