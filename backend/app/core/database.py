"""
Core database service - Insforge HTTP client base.

Each feature module has its own db.py that uses this base service
to make feature-specific API calls.
"""

import asyncio
from typing import Optional

import httpx

from app.core.config import INSFORGE_BASE_URL


class InsforgeService:
    """Base service for interacting with Insforge database via Edge Functions."""

    def __init__(self):
        self.base_url = INSFORGE_BASE_URL
        self.headers = {
            "Content-Type": "application/json",
        }
        # One pooled client PER event loop. httpx.AsyncClient (and its connection
        # pool) is bound to the loop it was created on, but this service is a
        # process-wide singleton reused across the main request loop AND the
        # worker-thread loop that zsxq ingest spins up via ``asyncio.run``.
        # Sharing one client across loops raised
        # "RuntimeError: <...> is bound to a different event loop" on the first
        # Insforge call from the worker loop. Keying by the running loop gives
        # each loop its own pool.
        self._clients: "dict[asyncio.AbstractEventLoop, httpx.AsyncClient]" = {}

    def _new_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            headers=self.headers,
            timeout=30.0,
            limits=httpx.Limits(
                max_connections=20,
                max_keepalive_connections=5,
                keepalive_expiry=30,  # Drop idle connections after 30s
            ),
        )

    async def _get_client(self) -> httpx.AsyncClient:
        """Return a pooled HTTP client bound to the CURRENT running event loop."""
        loop = asyncio.get_running_loop()
        client = self._clients.get(loop)
        if client is not None and not client.is_closed:
            return client
        client = self._new_client()
        self._clients[loop] = client
        # Drop entries for loops that have since closed (e.g. finished
        # ``asyncio.run`` loops) so the map can't grow without bound.
        for dead in [lp for lp in list(self._clients) if lp is not loop and lp.is_closed()]:
            self._clients.pop(dead, None)
        return client

    async def aclose_current_loop(self) -> None:
        """Close and forget the client bound to the current loop.

        Call at the end of a one-off ``asyncio.run`` (e.g. the zsxq ingest worker
        thread) so its client is released with the loop instead of lingering
        bound to a dead loop.
        """
        loop = asyncio.get_running_loop()
        client = self._clients.pop(loop, None)
        if client is not None and not client.is_closed:
            await client.aclose()

    async def close(self):
        """Close the HTTP client for the current loop (call on shutdown).

        Stray clients bound to other (already-finished) loops can't be awaited
        from here, so they are simply dropped.
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop is not None:
            client = self._clients.pop(loop, None)
            if client is not None and not client.is_closed:
                await client.aclose()
        self._clients.clear()

    def function_url(self, function_name: str) -> str:
        """Build full URL for an Insforge Edge Function."""
        return f"{self.base_url}/functions/{function_name}"

    async def call_function(
        self,
        function_name: str,
        method: str = "GET",
        params: Optional[dict] = None,
        json_body: Optional[dict] = None,
        timeout: float = 30.0,
        extra_headers: Optional[dict] = None,
    ) -> dict:
        """
        Generic helper to call an Insforge Edge Function.

        Args:
            function_name: Edge function name (e.g., 'market-reports')
            method: HTTP method (GET, POST, DELETE)
            params: Query parameters dict (automatically URL-encoded)
            json_body: JSON request body
            timeout: Request timeout in seconds
            extra_headers: Optional per-request headers merged on top of the
                client defaults. Used for internal-only edge functions that
                require ``X-Internal-Secret``.

        Returns:
            Parsed JSON response dict
        """
        url = self.function_url(function_name)
        client = await self._get_client()

        # Filter out None values from params
        clean_params = {k: v for k, v in (params or {}).items() if v is not None} or None

        try:
            if method == "GET":
                response = await client.get(url, params=clean_params, headers=extra_headers, timeout=timeout)
            elif method == "POST":
                response = await client.post(
                    url, params=clean_params, json=json_body, headers=extra_headers, timeout=timeout
                )
            elif method == "DELETE":
                response = await client.delete(url, params=clean_params, headers=extra_headers, timeout=timeout)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            # Parse JSON safely
            try:
                data = response.json() if response.status_code in (200, 201) else {}
            except Exception:
                data = {}

            return {
                "status_code": response.status_code,
                "data": data,
                "text": response.text,
            }
        except httpx.TimeoutException as e:
            return {
                "status_code": 408,
                "data": {},
                "text": f"Request timeout: {e}",
            }


# Singleton instance
_insforge_service: Optional[InsforgeService] = None


def get_insforge_service() -> InsforgeService:
    """Get or create the Insforge service singleton."""
    global _insforge_service
    if _insforge_service is None:
        _insforge_service = InsforgeService()
    return _insforge_service
