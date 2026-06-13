"""In-process TTL cache for expensive admin edge-function reads.

The ``subscriptions`` edge function ``action=list_all`` aggregates the entire
user base (six RPCs) and is called by the admin dashboard (and the user-detail
page's defensive fallback). Without caching, each admin navigation re-pays its
full cost (seconds). This module memoizes that one payload for a short TTL with
request coalescing, so concurrent loads share a single upstream call.

Scope is deliberately tiny: one key, short TTL, per-process (not shared across
workers — that is fine, each worker just warms its own copy). Subscription
mutations on the admin path call :func:`invalidate` for read-after-write
correctness; everything else tolerates up to ``_TTL_SECONDS`` of staleness,
which is acceptable for operational CRM data.
"""

import asyncio
import time
from typing import Any, Awaitable, Callable, Optional

# Operational CRM data changes slowly; 20s bounds staleness while still
# collapsing the bursty "open dashboard, click through a few users" pattern
# into a single upstream list_all per window.
_TTL_SECONDS = 20.0

_lock = asyncio.Lock()
# (expires_at_monotonic, value)
_entry: Optional[tuple[float, Any]] = None


async def get_list_all(loader: Callable[[], Awaitable[dict]]) -> dict:
    """Return the cached ``list_all`` result, or call ``loader()`` and cache it.

    Concurrent callers coalesce behind a single lock, so only one upstream
    fetch runs per TTL window. Only successful payloads are cached; failures
    fall through uncached so the next request retries instead of pinning an
    error for the whole TTL.
    """
    global _entry

    entry = _entry
    if entry is not None and entry[0] > time.monotonic():
        return entry[1]

    async with _lock:
        # Re-check: another coroutine may have filled the cache while we waited.
        entry = _entry
        if entry is not None and entry[0] > time.monotonic():
            return entry[1]

        result = await loader()
        if isinstance(result, dict) and result.get("data", {}).get("success"):
            _entry = (time.monotonic() + _TTL_SECONDS, result)
        return result


def invalidate() -> None:
    """Drop the cached ``list_all`` result (call after subscription mutations)."""
    global _entry
    _entry = None
