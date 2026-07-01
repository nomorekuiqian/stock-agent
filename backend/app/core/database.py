"""
Core database service - Insforge HTTP client base.

Each feature module has its own db.py that uses this base service
to make feature-specific API calls.
"""

import asyncio
from typing import Optional

import httpx

from app.core.config import INSFORGE_BASE_URL
from app.core.logging import get_logger


logger = get_logger(__name__)


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

    async def _send(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        *,
        params: Optional[dict],
        json_body: Optional[dict],
        timeout: float,
        extra_headers: Optional[dict],
    ) -> httpx.Response:
        if method == "GET":
            return await client.get(
                url,
                params=params,
                headers=extra_headers,
                timeout=timeout,
            )
        if method == "POST":
            return await client.post(
                url,
                params=params,
                json=json_body,
                headers=extra_headers,
                timeout=timeout,
            )
        if method == "DELETE":
            return await client.delete(
                url,
                params=params,
                headers=extra_headers,
                timeout=timeout,
            )
        raise ValueError(f"Unsupported HTTP method: {method}")

    @staticmethod
    def _result_from_response(response: httpx.Response) -> dict:
        try:
            data = response.json() if response.status_code in (200, 201) else {}
        except Exception:
            data = {}

        return {
            "status_code": response.status_code,
            "data": data,
            "text": response.text,
        }

    async def call_function(
        self,
        function_name: str,
        method: str = "GET",
        params: Optional[dict] = None,
        json_body: Optional[dict] = None,
        timeout: float = 30.0,
        extra_headers: Optional[dict] = None,
        use_pool: bool = True,
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
            use_pool: Whether to use the per-event-loop shared httpx client.
                Set to False for paths where a fresh connection is preferable
                to connection reuse.

        Returns:
            Parsed JSON response dict
        """
        url = self.function_url(function_name)

        # Filter out None values from params
        clean_params = {k: v for k, v in (params or {}).items() if v is not None} or None

        if not use_pool:
            try:
                async with self._new_client() as client:
                    response = await self._send(
                        client,
                        method,
                        url,
                        params=clean_params,
                        json_body=json_body,
                        timeout=timeout,
                        extra_headers=extra_headers,
                    )
                return self._result_from_response(response)
            except httpx.TimeoutException as e:
                return {
                    "status_code": 408,
                    "data": {},
                    "text": f"Request timeout: {e}",
                }
            except httpx.RequestError as e:
                return {
                    "status_code": 502,
                    "data": {},
                    "text": f"Request error: {e}",
                }

        client = await self._get_client()
        try:
            response = await self._send(
                client,
                method,
                url,
                params=clean_params,
                json_body=json_body,
                timeout=timeout,
                extra_headers=extra_headers,
            )
            return self._result_from_response(response)
        except httpx.TimeoutException as e:
            logger.warning(
                "Insforge function timeout: function=%s method=%s timeout=%.1fs; retrying with a fresh client",
                function_name,
                method,
                timeout,
            )
            await self.aclose_current_loop()
            try:
                async with self._new_client() as retry_client:
                    response = await self._send(
                        retry_client,
                        method,
                        url,
                        params=clean_params,
                        json_body=json_body,
                        timeout=min(timeout, 5.0),
                        extra_headers=extra_headers,
                    )
                return self._result_from_response(response)
            except httpx.TimeoutException as retry_error:
                return {
                    "status_code": 408,
                    "data": {},
                    "text": f"Request timeout: {retry_error or e}",
                }
            except httpx.RequestError as retry_error:
                return {
                    "status_code": 502,
                    "data": {},
                    "text": f"Request error: {retry_error}",
                }
        except httpx.RequestError as e:
            return {
                "status_code": 502,
                "data": {},
                "text": f"Request error: {e}",
            }


# Singleton instance
_insforge_service: Optional[InsforgeService] = None


def get_insforge_service() -> InsforgeService:
    """Get or create the Insforge service singleton."""
    global _insforge_service
    if _insforge_service is None:
        _insforge_service = InsforgeService()
    return _insforge_service
