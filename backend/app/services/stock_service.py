import yfinance as yf
import pandas as pd
from typing import Dict, Any, Optional

class StockDataService:
    @staticmethod
    def get_stock_info(ticker: str) -> Dict[str, Any]:
        """
        Fetches basic information about a stock.
        """
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            return info
        except Exception as e:
            print(f"Error fetching stock info for {ticker}: {e}")
            return {}

    @staticmethod
    def get_stock_history(ticker: str, period: str = "1mo") -> pd.DataFrame:
        """
        Fetches historical stock data.
        """
        try:
            stock = yf.Ticker(ticker)
            history = stock.history(period=period)
            return history
        except Exception as e:
            print(f"Error fetching stock history for {ticker}: {e}")
            return pd.DataFrame()
    
    @staticmethod
    def get_stock_price(ticker: str) -> Optional[float]:
        """
        Fetches the current stock price.
        """
        try:
            stock = yf.Ticker(ticker)
            # Try to get fast info first, then regular info
            if hasattr(stock, 'fast_info'):
                return stock.fast_info.last_price
            
            # Fallback to history
            history = stock.history(period="1d")
            if not history.empty:
                return history['Close'].iloc[-1]
            
            return None
        except Exception as e:
            print(f"Error fetching stock price for {ticker}: {e}")
            return None

    @staticmethod
    def get_trending_stocks():
        # MVP: Return hardcoded popular stocks
        # In production, this would fetch from an API or database
        trending = [
            {"ticker": "NVDA", "name": "NVIDIA Corp.", "change": 2.5},
            {"ticker": "TSLA", "name": "Tesla, Inc.", "change": -1.2},
            {"ticker": "AAPL", "name": "Apple Inc.", "change": 0.8},
            {"ticker": "AMD", "name": "Adv. Micro Devices", "change": 1.5}
        ]
        return trending
