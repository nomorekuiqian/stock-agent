"""
FMP (Financial Modeling Prep) API Service
提供宏观经济数据接口
"""

import os
import httpx
from typing import Optional
from datetime import datetime, timedelta


class FMPService:
    """Financial Modeling Prep API 服务"""

    BASE_URL = "https://financialmodelingprep.com"

    def __init__(self):
        self.api_key = os.getenv("FMP_API_KEY")
        if not self.api_key:
            raise ValueError("FMP_API_KEY environment variable is required")

    def _request(self, endpoint: str, params: dict = None) -> dict | list | None:
        """发送同步 API 请求"""
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

    # =========================================================================
    # Treasury Rates
    # =========================================================================

    def get_treasury_rates(self, date: Optional[str] = None) -> dict:
        """
        获取完整国债收益率曲线 (12 个期限)

        Args:
            date: 可选，指定日期 (YYYY-MM-DD)，默认最新

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
        print("🔧 [FMP] get_treasury_rates()")

        params = {}
        if date:
            params["date"] = date

        data = self._request("/stable/treasury-rates", params)

        if not data or not isinstance(data, list) or len(data) == 0:
            print("⚠️ FMP Treasury Rates API 返回空数据")
            return self._empty_treasury_response()

        raw = data[0]

        # 标准化字段映射
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

        # 计算利差
        spreads = self._calculate_spreads(rates)

        # 判断曲线形态
        yield_curve_shape = self._analyze_yield_curve_shape(rates)

        return {
            "date": raw.get("date", datetime.now().strftime("%Y-%m-%d")),
            "rates": rates,
            "spreads": spreads,
            "yield_curve_shape": yield_curve_shape,
            "source": "fmp",
        }

    def _calculate_spreads(self, rates: dict) -> dict:
        """计算关键利差"""
        spreads = {}

        # 10Y - 3M (最重要的衰退指标)
        if rates.get("10Y") and rates.get("3M"):
            spreads["10y_3m"] = round(rates["10Y"] - rates["3M"], 3)

        # 10Y - 2Y (另一个重要衰退指标)
        if rates.get("10Y") and rates.get("2Y"):
            spreads["10y_2y"] = round(rates["10Y"] - rates["2Y"], 3)

        # 30Y - 10Y (长端斜率)
        if rates.get("30Y") and rates.get("10Y"):
            spreads["30y_10y"] = round(rates["30Y"] - rates["10Y"], 3)

        # 5Y - 3M (中短端)
        if rates.get("5Y") and rates.get("3M"):
            spreads["5y_3m"] = round(rates["5Y"] - rates["3M"], 3)

        return spreads

    def _analyze_yield_curve_shape(self, rates: dict) -> str:
        """
        分析收益率曲线形态

        Returns:
            "normal": 正常 (短端 < 长端)
            "flat": 平坦 (短端 ≈ 长端)
            "inverted": 倒挂 (短端 > 长端)
        """
        short = rates.get("3M", 0) or 0
        medium = rates.get("2Y", 0) or 0
        long = rates.get("10Y", 0) or 0

        if short == 0 or long == 0:
            return "unknown"

        diff = long - short

        if diff < -0.1:  # 10Y 比 3M 低 10bp 以上
            return "inverted"
        elif diff < 0.5:  # 差值小于 50bp
            return "flat"
        else:
            return "normal"

    def _safe_float(self, value, default=None) -> float | None:
        """安全转换为 float"""
        if value is None:
            return default
        try:
            result = float(value)
            return result if result == result else default  # NaN check
        except (ValueError, TypeError):
            return default

    def _empty_treasury_response(self) -> dict:
        """返回空的 treasury 响应结构"""
        return {
            "date": None,
            "rates": {},
            "spreads": {},
            "yield_curve_shape": "unknown",
            "source": "fmp",
            "error": "No data available",
        }

    # =========================================================================
    # News
    # =========================================================================

    def get_general_news(self, limit: int = 10) -> list[dict]:
        """
        获取最新的综合财经新闻

        Args:
            limit: 返回新闻数量，默认 10 条

        Returns:
            [
                {
                    "title": "标题",
                    "text": "摘要",
                    "url": "链接",
                    "site": "来源",
                    "publishedDate": "发布时间",
                    "image": "图片链接"
                }
            ]
        """
        print(f"🔧 [FMP] get_general_news(limit={limit})")

        data = self._request("/stable/news/general-latest", {"limit": limit})

        if not data or not isinstance(data, list):
            print("⚠️ FMP General News API 返回空数据")
            return []

        return [
            {
                "title": item.get("title", ""),
                "text": item.get("text", ""),
                "url": item.get("url", ""),
                "site": item.get("site", ""),
                "publishedDate": item.get("publishedDate", ""),
                "image": item.get("image", ""),
            }
            for item in data
        ]

    def get_stock_news(self, symbols: str = "SPY,QQQ,DIA", limit: int = 10) -> list[dict]:
        """
        获取特定股票/ETF 相关新闻

        Args:
            symbols: 股票代码，逗号分隔 (如 "AAPL,MSFT,GOOG")
            limit: 返回新闻数量，默认 10 条

        Returns:
            [
                {
                    "symbol": "代码",
                    "title": "标题",
                    "text": "摘要",
                    "url": "链接",
                    "publisher": "发布者",
                    "site": "来源网站",
                    "publishedDate": "发布时间",
                    "image": "图片链接"
                }
            ]
        """
        print(f"🔧 [FMP] get_stock_news(symbols={symbols}, limit={limit})")

        data = self._request("/stable/news/stock", {"symbols": symbols, "limit": limit})

        if not data or not isinstance(data, list):
            print("⚠️ FMP Stock News API 返回空数据")
            return []

        return [
            {
                "symbol": item.get("symbol", ""),
                "title": item.get("title", ""),
                "text": item.get("text", ""),
                "url": item.get("url", ""),
                "publisher": item.get("publisher", ""),
                "site": item.get("site", ""),
                "publishedDate": item.get("publishedDate", ""),
                "image": item.get("image", ""),
            }
            for item in data
        ]


# 创建单例实例
_fmp_service_instance = None


def get_fmp_service() -> FMPService:
    """获取 FMP Service 单例"""
    global _fmp_service_instance
    if _fmp_service_instance is None:
        _fmp_service_instance = FMPService()
    return _fmp_service_instance
