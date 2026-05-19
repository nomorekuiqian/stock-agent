"""holdings_sync symbol resolver — lands in M2 (design §2 / §2bis).

5-step resolve_identifier + literal-ticker short-circuit + two-tier cache
(L1 process / L2 symbol-cache EF) + quote round-trip + EC3 variant probe +
fallback network budget + bounded concurrency + 12s overall deadline.

Reuses shared/data_tools/search.py::search_stocks which is SYNCHRONOUS — must
be wrapped in `await asyncio.to_thread(...)` in the async path. Final symbol
must pass portfolio.models._SYMBOL_RE before any EF interpolation.
"""
