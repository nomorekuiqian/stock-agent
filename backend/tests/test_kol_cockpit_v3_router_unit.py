"""Router regressions for v3 KOL cockpit endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient


class _FakeFmp:
    def get_stock_quotes(self, symbols: list[str]) -> dict:
        return {
            "quotes": [
                {"symbol": "SIVE", "price": 89.4, "daily_change": 13.45},
            ]
        }


def test_high_conviction_endpoint_returns_v3_groups_with_prices(monkeypatch):
    from app.features.kol_research import router as kol_router
    from app.main import app

    monkeypatch.setattr(
        kol_router.cockpit_v3,
        "list_high_conviction",
        lambda username: {
            "groups": [
                {
                    "sector_key": "photonics-and-cpo",
                    "sector_label": "光子学 · CPO",
                    "sector_eyebrow": "PHOTONICS",
                    "sector_short": "AI 资本开支下游物理瓶颈",
                    "tickers": [
                        {
                            "ticker": "SIVE",
                            "mentions": 206,
                            "coverage": "high",
                            "region": "SE",
                            "thesis": "CW DFB 激光器客户导入",
                            "priceable": True,
                        },
                        {
                            "ticker": "HPS.A",
                            "mentions": 17,
                            "coverage": "medium",
                            "region": "CA",
                            "thesis": "电力设备链条",
                            "priceable": False,
                        },
                    ],
                }
            ]
        },
    )
    monkeypatch.setattr(kol_router, "get_fmp_service", lambda: _FakeFmp())

    resp = TestClient(app).get(
        "/api/kol_research/personas/aleabitoreddit/high-conviction"
    )

    assert resp.status_code == 200
    body = resp.json()
    tickers = body["groups"][0]["tickers"]
    assert tickers[0]["ticker"] == "SIVE"
    assert tickers[0]["price"] == 89.4
    assert tickers[0]["daily_change"] == 13.45
    assert tickers[1]["ticker"] == "HPS.A"
    assert tickers[1]["price"] is None
    assert tickers[1]["daily_change"] is None


def test_high_conviction_endpoint_returns_empty_groups_for_legacy_frank():
    from app.main import app

    resp = TestClient(app).get(
        "/api/kol_research/personas/qinbafrank/high-conviction"
    )

    assert resp.status_code == 200
    assert resp.json() == {"groups": []}
