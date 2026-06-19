# OKX Marketplace Runbook

## Current Production Service

Base URL:

```text
https://okx-mcp.themarketbrew.com
```

Pricing remains unchanged:

```text
market-data: 0.03 USDT per call
persona-context: 0.05 USDT per call
discovery: free
```

## Real Payment Test

Run these prompts inside an OKX Onchain OS-enabled Agent with Agentic Wallet logged in and funded on X Layer.

### Market Data

```text
I’d like to use this A2MCP service:

Service: TheMarketBrew Market Data Context
Service type: A2MCP
Endpoint: https://okx-mcp.themarketbrew.com/api/okx-mcp/market-data

Please send a POST request with this JSON payload:
{"data_type":"brief","brief_type":"stock","symbol":"NVDA"}
```

Expected result:

1. Initial request receives HTTP 402.
2. Agentic Wallet signs/pays.
3. Retry returns HTTP 200 JSON context/data.

### Persona Evidence

```text
I’d like to use this A2MCP service:

Service: TheMarketBrew Persona Evidence Context
Service type: A2MCP
Endpoint: https://okx-mcp.themarketbrew.com/api/okx-mcp/persona-context

Please send a POST request with this JSON payload:
{"question":"NVDA 最近的AI投资逻辑应该怎么看？","persona":"qinbafrank","ticker":"NVDA","lens_limit":2,"evidence_limit":2}
```

Expected result:

1. Initial request receives HTTP 402.
2. Agentic Wallet signs/pays.
3. Retry returns HTTP 200 JSON persona/lens/evidence context.

## Marketplace Registration

Use `docs/guides/okx-marketplace-services.json` as the service list.

Prompt:

```text
Here's my live service list services.json — please use Onchain OS to batch-register them all as A2MCP Providers.
```

After registration succeeds, submit listing review:

```text
Please list my ASP on OKX Agent Marketplace using Onchain OS.
```

## Acceptance Checklist

- [ ] Market Data real payment test returns 200 after wallet retry.
- [ ] Persona Evidence real payment test returns 200 after wallet retry.
- [ ] Marketplace services registered with prices `0.03 USDT` and `0.05 USDT`.
- [ ] ASP submitted for OKX Marketplace review.
- [ ] OKX review outcome recorded.
