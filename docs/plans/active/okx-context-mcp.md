# OKX Context MCP Engineering Plan

> Status: In Progress
> Related: backend/app/features/okx_mcp/.context.md, mcp/themarketbrew/.context.md
> Vision: Put TheMarketBrew context/data capabilities on OKX without changing production web UX or spending our LLM tokens.

## 目标

Create a dedicated OKX-facing MCP/context service that exposes TheMarketBrew
persona context and market data through three tools, protected by OKX x402
payment at the HTTP boundary.

## 现状

The existing TheMarketBrew MCP package is a backend-first thin adapter, but it
requires TheMarketBrew account/device authorization and exposes 20+ raw
`market_lens_*` tools. That is too noisy for OKX and forces users into our
website account flow.

The useful existing capabilities are already in the backend:

- `kol_research.mcp_materials` for persona methodology/lens material.
- `kol_research.mcp_data` for stock, macro, report, calendar, and news data.
- `kol_research.cockpit` and `vector` for historical evidence.

## 设计

Add an isolated backend entry point:

```text
uvicorn app.okx_main:app
```

This app includes only:

```text
GET  /api/okx-mcp/discovery
POST /api/okx-mcp/persona-context
POST /api/okx-mcp/market-data
```

It is not imported by `app.main`, so current production web behavior does not
change. Payment middleware is optional and lazy-loaded:

```text
OKX_MCP_PAYMENT_ENABLED=false by default
OKX_MCP_PAYMENT_MODE=sdk or external proxy
```

MCP package changes:

- Keep package name/bin as `themarketbrew`.
- Remove local TheMarketBrew login/token tools.
- Expose only:
  - `themarketbrew_discovery`
  - `themarketbrew_persona_context`
  - `themarketbrew_market_data`

Data flow:

```text
OKX/user agent
  -> OKX x402 payment boundary
  -> app.okx_main
  -> okx_mcp.service
  -> existing mcp_materials / mcp_data / cockpit / vector
  -> context/data envelope
  -> external agent synthesizes final answer
```

## 实施步骤

1. [x] Create isolated backend feature and `app.okx_main`.
2. [x] Add optional OKX x402 SDK middleware with lazy imports.
3. [x] Aggregate persona/material/evidence context into one endpoint.
4. [x] Aggregate stock/market/news data into one endpoint.
5. [x] Rewrite NPM MCP package to three tools.
6. [x] Add backend and MCP smoke tests.
7. [x] Write deployment and verification guide.
8. [ ] Run full verification commands after dependencies are installed.

## 待定问题

- Final per-call prices for OKX marketplace launch.
- Whether OKX wants SDK middleware inside our Railway service or an OKX-managed
  reverse proxy in front of the service.
- Which wallet receives paid settlement in production.
- Whether discovery should remain free forever or be gated later.

