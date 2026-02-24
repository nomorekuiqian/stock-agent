"""
Shared rate limiter instance for all routers.

All routers must import `limiter` from this module instead of creating
their own Limiter instances, so that slowapi's app.state.limiter
correctly tracks all rate-limited endpoints.
"""

from fastapi import Request
from slowapi import Limiter


def _get_real_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For behind reverse proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=_get_real_ip)
