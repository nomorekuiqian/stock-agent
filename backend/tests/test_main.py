from fastapi.testclient import TestClient
from app.main import app
from unittest.mock import patch, AsyncMock

client = TestClient(app)

def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Stock Research Agent API is running"}

@patch('app.services.stock_service.StockDataService.get_stock_info')
def test_get_stock_info(mock_get_info):
    mock_get_info.return_value = {"symbol": "AAPL", "longName": "Apple Inc."}
    response = client.get("/api/stock/AAPL")
    assert response.status_code == 200
    assert response.json()["symbol"] == "AAPL"

@patch('app.services.agent_service.AgentService.analyze_multidimensional')
def test_analyze_stock(mock_analyze):
    mock_analyze.return_value = {
        "ticker": "AAPL",
        "current_price": 150.0,
        "overall_score": 8,
        "signal": "Bullish",
        "fundamental": {
            "valuation_score": 7,
            "growth_score": 8,
            "summary": "Strong fundamentals.",
            "details": ["High revenue growth"]
        },
        "technical": {
            "trend": "Bullish",
            "support": "145",
            "resistance": "155",
            "summary": "Upward trend."
        },
        "sentiment": {
            "score": 75,
            "label": "Greed",
            "news_summary": ["Positive earnings"]
        },
        "skeptic": {
            "bear_case": "Market correction risk",
            "risks": ["Inflation"]
        }
    }
    response = client.post("/api/analyze", json={"ticker": "AAPL", "query": "Analyze AAPL"})
    assert response.status_code == 200
    data = response.json()
    assert data["ticker"] == "AAPL"
    assert data["signal"] == "Bullish"
    assert data["fundamental"]["valuation_score"] == 7
