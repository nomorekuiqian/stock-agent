"""
Core database service - Insforge HTTP client base.

Each feature module has its own db.py that uses this base service
to make feature-specific API calls.
"""

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
        # Reusable client for connection pooling
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the reusable HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                headers=self.headers,
                timeout=30.0,
                limits=httpx.Limits(
                    max_connections=20,
                    max_keepalive_connections=5,
                    keepalive_expiry=30,  # Drop idle connections after 30s
                ),
            )
        return self._client

    async def close(self):
        """Close the HTTP client. Call on shutdown."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

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
