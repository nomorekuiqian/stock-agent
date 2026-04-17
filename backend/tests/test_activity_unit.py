"""
Unit tests for the activity tracker feature map.

Tests _resolve_feature() mapping from API paths to human-readable feature names.
Verifies that macro paths map to "macro" (not the old "macro_dashboard" entitlement key)
after the macro dashboard was opened to all users.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_activity_unit.py -v
"""

from app.core.activity import _resolve_feature


class TestResolveFeature:
    """_resolve_feature maps API paths to analytics feature names."""

    def test_macro_path_maps_to_macro(self):
        """Macro paths use 'macro' (not 'macro_dashboard' which was an entitlement key)."""
        assert _resolve_feature("/api/macro/dashboard") == "macro"
        assert _resolve_feature("/api/macro/economy") == "macro"
        assert _resolve_feature("/api/macro/sentiment") == "macro"

    def test_known_paths(self):
        assert _resolve_feature("/api/research/chat") == "ai_research"
        assert _resolve_feature("/api/stock/AAPL") == "stock_research"
        assert _resolve_feature("/api/market/daily") == "daily_report"
        assert _resolve_feature("/api/morning/latest") == "morning_report"
        assert _resolve_feature("/api/screener/run") == "screener"

    def test_unknown_path_returns_other(self):
        assert _resolve_feature("/api/unknown/endpoint") == "other"
        assert _resolve_feature("/health") == "other"

    def test_payment_paths(self):
        assert _resolve_feature("/api/payment/subscription-status") == "subscription_check"
        assert _resolve_feature("/api/payment/me/entitlements") == "entitlements_check"
