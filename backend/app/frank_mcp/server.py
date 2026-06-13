"""Market Lens MCP - v1 (FastMCP, Streamable HTTP), co-located in the backend.

v1 "slim live": offline methodology lenses reuse skill_cockpit for the current
qinbafrank beta persona; the single live tool reuses kol_research vector search
over qinbafrank's own tweets. No FMP market data, no auth, no payment in v1.

Mounted into the FastAPI app in app/main.py:
    mcp_app = mcp.http_app(path="/mcp"); app.mount("/frank", mcp_app)  -> /frank/mcp/
Run standalone (dev), from backend/:
    python -m app.frank_mcp.server          # http://127.0.0.1:9000/mcp/
"""
from __future__ import annotations

from typing import Any

from fastmcp import FastMCP
from fastmcp.server.middleware.rate_limiting import RateLimitingMiddleware

from app.features.kol_research import skill_cockpit
from app.frank_mcp.middleware import AccessGateMiddleware, ToolCallLogMiddleware

PERSONA = "qinbafrank"

mcp = FastMCP(
    name="market-lens-mcp",
    instructions=(
        "Market Lens exposes qinbafrank methodology lenses and tweet evidence as "
        "agent-readable context. Output is distilled methodology context for the "
        "caller's own agent - not investment advice, and not qinbafrank speaking. "
        "Separate historical tweet evidence from methodology inference."
    ),
)

# v1 guardrails: log every tool call (the validation signal), an optional access
# gate (set FRANK_MCP_ACCESS_TOKEN to lock to invited users), and a global
# rate-limit ceiling so a runaway agent can't drain embedding spend.
mcp.add_middleware(ToolCallLogMiddleware())
mcp.add_middleware(AccessGateMiddleware())
mcp.add_middleware(RateLimitingMiddleware(max_requests_per_second=10.0, burst_capacity=20))


@mcp.tool
def frank_list_sectors() -> list[dict[str, Any]]:
    """List qinbafrank sector lenses (key, label, stance, representative tickers).

    Use this to discover coverage, then call frank_get_sector_lens or
    frank_get_ticker_lens to go deeper.
    """
    return skill_cockpit.list_sectors()


@mcp.tool
def frank_get_sector_lens(sector_key: str) -> dict[str, Any]:
    """Detailed Frank sector lens: stance, core questions, signals watched, triggers.

    sector_key comes from frank_list_sectors, e.g. ai-infrastructure.
    """
    key = sector_key.strip()
    lens = skill_cockpit.get_sector(key)
    if not lens:
        return {"sector_key": key, "covered": False, "note": "No Frank sector lens for this key."}
    return lens


@mcp.tool
def frank_get_ticker_lens(ticker: str) -> dict[str, Any]:
    """Structured Frank lens for a ticker: stance, thesis, signals, bull/bear triggers.

    Example tickers: NVDA, MU, HOOD, COIN, PLTR.
    """
    symbol = ticker.strip().upper()
    summary = skill_cockpit.get_ticker_summary(symbol)
    if not summary:
        return {"ticker": symbol, "covered": False, "note": "No Frank ticker lens for this symbol."}
    return summary


@mcp.tool
async def frank_search_evidence(query: str, k: int = 6) -> dict[str, Any]:
    """Live semantic search over qinbafrank's own tweets (his historical evidence).

    Returns matching tweet chunks with citations. This is historical evidence of
    what Frank actually said - not live market data and not investment advice.
    """
    from app.features.kol_research.router import _mcp_search_chunks

    bounded_k = max(1, min(int(k), 20))
    chunks = await _mcp_search_chunks(
        username=PERSONA, query=query, k=bounded_k, threshold=0.45
    )
    return {
        "persona": PERSONA,
        "query": query,
        "count": len(chunks),
        "chunks": [c.model_dump() for c in chunks],
    }


if __name__ == "__main__":
    mcp.run(transport="http", host="127.0.0.1", port=9000)
