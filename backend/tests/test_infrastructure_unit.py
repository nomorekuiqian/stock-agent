"""
Infrastructure Unit Tests -- generated from git diff

Tests for:
  - app.core.rate_limit._get_real_ip (IP extraction from request headers)
  - app.core.logging.setup_logging / get_logger (structured logging setup)

No network, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_infrastructure_unit.py -v
"""

import logging
from unittest.mock import MagicMock

import pytest

from app.core.rate_limit import _get_real_ip
from app.core.logging import setup_logging, get_logger


# ============================================================
# _get_real_ip
# ============================================================


class TestGetRealIp:
    """Tests for _get_real_ip: extract client IP respecting X-Forwarded-For."""

    def _make_request(self, forwarded_for: str | None = None, client_host: str = "10.0.0.1") -> MagicMock:
        """Build a minimal mock FastAPI Request."""
        from starlette.datastructures import Headers

        raw_headers: list[tuple[bytes, bytes]] = []
        if forwarded_for is not None:
            raw_headers.append((b"x-forwarded-for", forwarded_for.encode()))

        req = MagicMock()
        req.headers = Headers(raw=raw_headers)
        client = MagicMock()
        client.host = client_host
        req.client = client
        return req

    def test_no_forwarded_header_returns_client_host(self):
        """Direct connection without proxy returns request.client.host."""
        req = self._make_request(forwarded_for=None, client_host="192.168.1.42")
        assert _get_real_ip(req) == "192.168.1.42"

    def test_single_forwarded_ip(self):
        """Single X-Forwarded-For value is returned as-is."""
        req = self._make_request(forwarded_for="203.0.113.50")
        assert _get_real_ip(req) == "203.0.113.50"

    def test_multiple_forwarded_ips_returns_first(self):
        """Chained proxies: the first IP (original client) is returned."""
        req = self._make_request(forwarded_for="203.0.113.50, 70.41.3.18, 150.172.238.178")
        assert _get_real_ip(req) == "203.0.113.50"

    def test_forwarded_with_whitespace(self):
        """Leading/trailing spaces around the first IP are stripped."""
        req = self._make_request(forwarded_for="  203.0.113.50 , 70.41.3.18")
        assert _get_real_ip(req) == "203.0.113.50"

    def test_no_client_returns_fallback(self):
        """If request.client is None (e.g., test transport), return 127.0.0.1."""
        from starlette.datastructures import Headers

        req = MagicMock()
        req.headers = Headers(raw=[])
        req.client = None
        assert _get_real_ip(req) == "127.0.0.1"

    def test_empty_forwarded_header(self):
        """Empty X-Forwarded-For string falls through to client.host."""
        req = self._make_request(forwarded_for="", client_host="10.0.0.5")
        # Empty string is falsy, so should fall through
        assert _get_real_ip(req) == "10.0.0.5"


# ============================================================
# Logging setup
# ============================================================


class TestSetupLogging:
    """Tests for setup_logging and get_logger."""

    def test_get_logger_returns_named_logger(self):
        """get_logger returns a Logger with the given name."""
        lg = get_logger("app.features.brew.agent")
        assert isinstance(lg, logging.Logger)
        assert lg.name == "app.features.brew.agent"

    def test_get_logger_same_name_returns_same_instance(self):
        """Calling get_logger twice with the same name returns the same object."""
        a = get_logger("test.same.name")
        b = get_logger("test.same.name")
        assert a is b

    def test_setup_logging_sets_level(self):
        """setup_logging(level=...) sets root logger level."""
        setup_logging(level="WARNING")
        root = logging.getLogger()
        assert root.level == logging.WARNING
        # Reset
        setup_logging(level="INFO")

    def test_setup_logging_quiets_third_party(self):
        """Third-party loggers are set to WARNING after setup."""
        setup_logging(level="DEBUG")
        for name in ("httpx", "httpcore", "google", "openai", "stripe"):
            assert logging.getLogger(name).level == logging.WARNING
        # Reset
        setup_logging(level="INFO")

    def test_setup_logging_default_level(self, monkeypatch):
        """Without args or env var, defaults to INFO."""
        monkeypatch.delenv("LOG_LEVEL", raising=False)
        setup_logging()
        root = logging.getLogger()
        assert root.level == logging.INFO

    def test_setup_logging_env_override(self, monkeypatch):
        """LOG_LEVEL env var controls default level."""
        monkeypatch.setenv("LOG_LEVEL", "ERROR")
        setup_logging()
        root = logging.getLogger()
        assert root.level == logging.ERROR
        # Reset
        setup_logging(level="INFO")
