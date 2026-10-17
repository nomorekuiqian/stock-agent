"""Validate MCP startup in fresh processes without external calls."""

import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize("paused", [True, False])
def test_mcp_startup_obeys_pause_and_preserves_app_lifecycle(paused):
    # Keep the flag separate from production constant names in the script.
    script = ("PAUSED = %s\n" % paused) + _SCRIPT
    env = os.environ | {
        "PYTHON_DOTENV_DISABLED": "1", "LANGFUSE_ENABLED": "false",
        "OTEL_SDK_DISABLED": "true", "ENVIRONMENT": "test",
        "GOOGLE_API_KEY": "offline-test-key",
    }
    result = subprocess.run(
        [sys.executable, "-c", script], cwd=Path(__file__).resolve().parents[1],
        env=env, capture_output=True, text=True, timeout=45,
    )
    assert result.returncode == 0, result.stderr


_SCRIPT = '''
import asyncio
from contextlib import asynccontextmanager
import socket
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock
from starlette.applications import Starlette
from app.core import feature_pause

def blocked_connect(*args, **kwargs):
    raise AssertionError("Unexpected network call")
socket.socket.connect = blocked_connect
events = []
class FakeMCPApp(Starlette):
    @asynccontextmanager
    async def lifespan(self, app):
        events.append("mcp_start")
        try:
            yield
        finally:
            events.append("mcp_stop")

if not PAUSED:
    feature_pause.PAUSED_FEATURES = feature_pause.PAUSED_FEATURES - {"mcp"}
    sys.modules["app.frank_mcp.server"] = SimpleNamespace(
        mcp=SimpleNamespace(http_app=lambda **kwargs: FakeMCPApp())
    )
from app import main
if PAUSED:
    assert main.market_mcp_app is None
    assert "app.frank_mcp.server" not in sys.modules
    assert not any(getattr(route, "path", None) == "/frank" for route in main.app.routes)
else:
    assert main.market_mcp_app is not None
    assert any(getattr(route, "path", None) == "/frank" for route in main.app.routes)
main._startup = AsyncMock()
main._shutdown = AsyncMock()
async def check():
    async with main.lifespan(main.app):
        main._startup.assert_awaited_once()
    main._shutdown.assert_awaited_once()
asyncio.run(check())
assert events == ([] if PAUSED else ["mcp_start", "mcp_stop"])
'''
