"""CORS config should cover production and Vercel preview frontends."""

import re

from app.core.config import ALLOWED_ORIGINS, CORS_ALLOWED_ORIGIN_REGEX


def test_cors_allows_production_frontend_domains():
    assert "https://themarketbrew.com" in ALLOWED_ORIGINS
    assert "https://www.themarketbrew.com" in ALLOWED_ORIGINS


def test_cors_regex_allows_the_market_brew_vercel_previews():
    preview_url = "https://stock-agent-lovu6t7hr-the-market-brew.vercel.app"
    assert re.fullmatch(CORS_ALLOWED_ORIGIN_REGEX, preview_url)
